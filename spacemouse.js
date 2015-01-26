var events = require('events');
var ffi = require('ffi');
var Carbon = null;
var IOKit = null;

function framework(path, functions) {
  var binary = ffi.DynamicLibrary(path, ffi.DynamicLibrary.FLAGS.RTLD_NOW);
  var library = {};
  Object.keys(functions).forEach(function(name) {
    var info = functions[name];
    library[name] = ffi.ForeignFunction(binary.get(name), info[0], info[1]);
  });
  return library;
}

function preventGarbageCollection(value) {
  (global.leakedObjects || (global.leakedObjects = [])).push(value);
  return value;
}

function autorelease(object) {
  process.nextTick(function() {
    Carbon.CFRelease(object);
  });
  return object;
}

function CFSTR(text) {
  var kCFStringEncodingUTF8 = 0x08000100;
  return Carbon.CFStringCreateWithCString(null, text, kCFStringEncodingUTF8);
}

function handleErrorsInsideCallback(callback) {
  try {
    callback();
  } catch (e) {
    process.nextTick(function() {
      throw e;
    });
  }
}

function listen(options) {
  options = options || {};
  var rate = options.rate || 1 / 60;

  Carbon = framework('/System/Library/Frameworks/Carbon.framework/Carbon', {
    CFDictionaryCreateMutable: ['pointer', ['pointer', 'int', 'pointer', 'pointer']],
    CFDictionarySetValue: ['void', ['pointer', 'pointer', 'pointer']],
    CFRelease: ['void', ['pointer']],
    CFRunLoopGetCurrent: ['pointer', []],
    CFRunLoopRunInMode: ['int', ['pointer', 'double', 'int']],
    CFStringCreateWithCString: ['pointer', ['pointer', 'string', 'int']],
  });

  IOKit = framework('/System/Library/Frameworks/IOKit.framework/IOKit', {
    IOHIDDeviceOpen: ['int', ['pointer', 'int']],
    IOHIDDeviceRegisterInputValueCallback: ['void', ['pointer', 'pointer', 'pointer']],
    IOHIDElementGetPhysicalMax: ['long', ['pointer']],
    IOHIDElementGetPhysicalMin: ['long', ['pointer']],
    IOHIDElementGetUsage: ['int', ['pointer']],
    IOHIDElementGetUsagePage: ['int', ['pointer']],
    IOHIDManagerCreate: ['pointer', ['pointer', 'int']],
    IOHIDManagerOpen: ['int', ['pointer', 'int']],
    IOHIDManagerRegisterDeviceMatchingCallback: ['void', ['pointer', 'pointer', 'pointer']],
    IOHIDManagerRegisterDeviceRemovalCallback: ['void', ['pointer', 'pointer', 'pointer']],
    IOHIDManagerScheduleWithRunLoop: ['void', ['pointer', 'pointer', 'pointer']],
    IOHIDManagerSetDeviceMatching: ['void', ['pointer', 'pointer']],
    IOHIDValueGetElement: ['pointer', ['pointer']],
    IOHIDValueGetScaledValue: ['double', ['pointer', 'int']],
  });

  var handleInput = preventGarbageCollection(ffi.Callback('void', ['pointer', 'int', 'pointer', 'pointer'], function(context, result, sender, value) {
    handleErrorsInsideCallback(function() {
      var element = IOKit.IOHIDValueGetElement(value);
      var usagePage = IOKit.IOHIDElementGetUsagePage(element);
      var usage = IOKit.IOHIDElementGetUsage(element);
      if (usagePage === 1 && usage in usages) {
        var kIOHIDValueScaleTypePhysical = 1;
        var physicalMin = IOKit.IOHIDElementGetPhysicalMin(element);
        var physicalMax = IOKit.IOHIDElementGetPhysicalMax(element);
        var physicalValue = IOKit.IOHIDValueGetScaledValue(value, kIOHIDValueScaleTypePhysical);
        if (update === null) update = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };
        update[usages[usage]] = 2 * (physicalValue - physicalMin) / (physicalMax - physicalMin) - 1;
        sendUpdate = true;
      }
    });
  }));

  var handleAdd = preventGarbageCollection(ffi.Callback('void', ['pointer', 'int', 'pointer', 'pointer'], function(context, result, sender, device) {
    handleErrorsInsideCallback(function() {
      emitter.emit('connect');
      IOKit.IOHIDDeviceOpen(device, kIOHIDOptionsTypeNone);
      IOKit.IOHIDDeviceRegisterInputValueCallback(device, handleInput, null);
    });
  }));

  var handleRemove = preventGarbageCollection(ffi.Callback('void', ['pointer', 'int', 'pointer', 'pointer'], function(context, result, sender, device) {
    handleErrorsInsideCallback(function() {
      emitter.emit('disconnect');
    });
  }));

  var dictionary = autorelease(Carbon.CFDictionaryCreateMutable(null, 0, null, null));
  Carbon.CFDictionarySetValue(dictionary, autorelease(CFSTR('Manufacturer')), autorelease(CFSTR('3Dconnexion')));
  Carbon.CFDictionarySetValue(dictionary, autorelease(CFSTR('Product')), autorelease(CFSTR('SpaceTraveler USB')));

  var kIOHIDOptionsTypeNone = 0;
  var kCFRunLoopDefaultMode = CFSTR('kCFRunLoopDefaultMode');
  var manager = IOKit.IOHIDManagerCreate(null, kIOHIDOptionsTypeNone);
  IOKit.IOHIDManagerSetDeviceMatching(manager, dictionary);
  IOKit.IOHIDManagerScheduleWithRunLoop(manager, Carbon.CFRunLoopGetCurrent(), kCFRunLoopDefaultMode);
  IOKit.IOHIDManagerOpen(manager, kIOHIDOptionsTypeNone);
  IOKit.IOHIDManagerRegisterDeviceMatchingCallback(manager, handleAdd, null);
  IOKit.IOHIDManagerRegisterDeviceRemovalCallback(manager, handleRemove, null);

  setInterval(function() {
    update = null;
    Carbon.CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0, false);
    if (update) emitter.emit('update', update);
  }, rate);

  var emitter = new events.EventEmitter();
  var update = null;
  var usages = { 0x30: 'tx', 0x31: 'ty', 0x32: 'tz', 0x33: 'rx', 0x34: 'ry', 0x35: 'rz' };
  return emitter;
}

exports.listen = listen;
