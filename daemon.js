var spacemouse = require('./spacemouse');
var ws = require('ws');

function serve(options) {
  options = options || {};
  var port = options.port || 8123;
  var rate = options.rate || 1 / 10;
  var server = new ws.Server({ port: port });
  var updates = spacemouse.listen({ rate: rate });
  var clients = [];

  updates.on('connect', function() {
    console.log('[SpaceMouse] connected to device');
  });
  updates.on('disconnect', function() {
    console.log('[SpaceMouse] disconnected from device');
  });
  updates.on('update', function(values) {
    var message = JSON.stringify(values);
    clients.map(function(client) {
      client.send(message);
    });
  });

  server.on('connection', function connection(client) {
    console.log('[SpaceMouse] connected to socket');
    client.on('close', function() {
      console.log('[SpaceMouse] disconnected from socket');
      clients.splice(clients.indexOf(client), 1);
    });
    clients.push(client);
  });
  console.log('[SpaceMouse] server listening at http://localhost:' + port + '/');
}

exports.serve = serve;

if (require.main === module) {
  serve(8123);
}
