/**
 * Important note: this application is not suitable for benchmarks!
 */

var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , io = require('socket.io')
  , sys = require(process.binding('natives').util ? 'util' : 'sys')
  , server;
    
server = http.createServer(function(req, res){
  // your normal server code
  var path = url.parse(req.url).pathname;
  switch (path){
    case '/':
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write('<h1>Welcome. Try the <a href="/chat.html">chat</a> example.</h1>');
      res.end();
      break;
      
    case '/json.js':
    case '/chat.html':
      fs.readFile(__dirname + path, function(err, data){
        if (err) return send404(res);
        res.writeHead(200, {'Content-Type': path == 'json.js' ? 'text/javascript' : 'text/html'})
        res.write(data, 'utf8');
        res.end();
      });
      break;
      
    default: send404(res);
  }
}),

send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

server.listen(8080);

// socket.io, I choose you
// simplest chat application evar
var io = io.listen(server)
  , buffer = [];
  

var clients = {};


io.on('connection', function(client){
  client.send({ buffer: buffer });
  client.broadcast({ announcement: client.sessionId + ' connected' });
  clients[client.sessionId] = client;
  
  client.on('message', function(message){
	if(message[0] == '/') {
		var match = /^\/(\S+?)\b/.exec(message);
		command(client, match[1], message);
	} else {
		var msg = { message: [client.sessionId, message] };
		buffer.push(msg);
		if (buffer.length > 15) buffer.shift();
		client.broadcast(msg);
	}
  });

  client.on('disconnect', function(){
    client.broadcast({ announcement: client.sessionId + ' disconnected' });
  });
});


function command(c, cmd, msg) {
	if(cmd == 'whisper') {
		var split = firstRestSplit(msg);
		var target = clients[split.first];
		if(target) {
			target.send({ whisper: [ c.sessionId, split.rest ] });
		} else {
			c.send({ message: [ 'System', 'No such user ' + split.first]});
		}
	}

	else {
		c.send({ message: [ 'System', 'No such command \'' + cmd + '\'' ]});
	}
}

function firstRestSplit(s) {
	var match = /^\/.*?\s+(\S+)\s+(.*)$/.exec(s);
	return { first: match[1], rest: match[2] };
}



