# node-spacemouse

This is an OS X driver for the 3dconnexion SpaceMouse in JavaScript. It also contains a daemon that proxies orientation data over WebSockets.

Library usage:

```
var spacemouse = require('./spacemouse').listen();
spacemouse.on('connect', function() {
  console.log('connect');
});
spacemouse.on('disconnect', function() {
  console.log('disconnect');
});
spacemouse.on('update', function(data) {
  console.log('update', data.tx, data.ty, data.tz, data.rx, data.ry, data.rz);
});
```

Daemon usage:

```
$ npm install -g spacemouse
$ spacemouse
[SpaceMouse] server listening at http://localhost:8123/
[SpaceMouse] connected to device
```
