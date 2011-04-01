/**
 * Important note: this application is not suitable for benchmarks!
 */

var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , io = require('socket.io')
  , sys = require(process.binding('natives').util ? 'util' : 'sys')
  , server;

var dom = {};
dom.game = require('./game/game').game

    
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
var io = io.listen(server);
  
var thegame = new dom.game();

io.on('connection', function(client){
  var player = thegame.addPlayer(client);
  client.broadcast({ announcement: client.sessionId + ' connected' });
  
  client.on('message', function(message){
	if('chat' in message) {
		if(message.chat[0] == '/') {
			var match = /^\/(\S+?)\b/.exec(message.chat);
			command(client, match[1], message.chat);
		} else {
			var msg = { message: [client.sessionId, message] };
			client.broadcast(msg);
		}
	} else if('decision' in message) {
		if(player.handlers.length > 0) {
			var h = player.handlers[0];
			if(h(player, message.decision)) {
				player.handlers.shift();
			} else {
				client.send({ retry: 1 });
			}
		}
	}
  });

  client.on('disconnect', function(){
    client.broadcast({ announcement: client.sessionId + ' disconnected' });
  });

  // DEBUG
  if(thegame.players.length == 2) {
	  thegame.startGame();
  }
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



