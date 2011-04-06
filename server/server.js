/**
 * Important note: this application is not suitable for benchmarks!
 */

var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , io = require('socket.io')
  , sys = require(process.binding('natives').util ? 'util' : 'sys')
  , sqlite3 = require('sqlite3')
  , vsprintf = require('sprintf').vsprintf
  , server;

require('joose');
require('joosex-namespace-depended');
var Cookies = require('cookies');
var hash = require('hash');


var dom = {};
dom.game = require('./game/game').game;

var db = new sqlite3.Database('storage.db3');

var games = {}; // dom.game objects indexed by game name
var gamesByPlayer = {}; // game names indexed by player email

server = http.createServer(function(req, res){
  var cookies = new Cookies(req, res);
  // your normal server code
  var path = url.parse(req.url).pathname;
  switch (path){
    case '/':
	  if(checkAuth(req, cookies)) {
          var email = cookies.get('email');
          if(gamesByPlayer[email]) {
              sendGame(res, cookies);
          } else {
              sendFile(res, '/menu.html');
          }
	  } else {
		  sendFile(res, '/login.html');
	  }
      break;
      
	case '/login':
  	    // process: get params, check they exist. check DB. reject page or accept. on accept, generate opaque uid cookie via salt+SHA1, set cookie, redirect to /dominion.html
  	    var query = url.parse(req.url, true).query;
  	    if(!query || !query.email || !query.dompwd) { // improper request
  	        sendRedirect(res, '/login.html');
  	        break;
  	    }
  
  	    var hashedpwd = Hash.sha256(query.dompwd);
  	    var sql = db.get('SELECT * FROM User WHERE email = ? AND password = ? LIMIT 1', { 1: query.email, 2: hashedpwd }, function(err, row) {
  		    if(err || !row) { // query failed
  		        sendRedirect(res, '/login.html');
  		        return;
  		    }

            cookies.set('email', query.email);
            cookies.set('uid', buildUid(query.email, req));

            sendRedirect(res, '/');
        });
        break;

    case '/register':
        var query = url.parse(req.url, true).query;
        if(!query || !query.email || !query.dompwd || !query.dompwd2) { // improper request
            sendRedirect(res, '/register.html');
            break;
        }

        if(query.dompwd != query.dompwd2) {
            sendError(res, '/register.html', 'Passwords do not match.');
            break;
        }

        var hashedpwd = Hash.sha256(query.dompwd);
  	    var sql = db.get('SELECT * FROM User WHERE email = ? LIMIT 1', { 1: query.email }, function(err, row) {
            if(err) {
                sendRedirect(res, '/register.html');
                return;
            }
  		    if(row) {
  		        sendError(res, '/register.html', 'A user with that email address already exists.');
  		        return;
  		    }

            db.run('INSERT INTO User (email,password) VALUES (?,?)', { 1: query.email, 2: hashedpwd }, function(err) {
                if(err) {
                    sendRedirect(res, '/register.html');
                    return;
                }
                
                cookies.set('email', query.email);
                cookies.set('uid', buildUid(query.email, req));

                sendRedirect(res, '/');
            });
        });
        break;

    case '/host':
        // process: get params, check valid, check existence of game. create game, create entry for it, add new player, redirect to game lobby.
        if(!checkAuth(req, cookies)) {
            send404(res);
            break;
        }

        var query = url.parse(req.url, true).query;
        if(!query || !query.name) {
            sendError(res, '/', 'You must supply a game name.');
            break;
        }

        var email = cookies.get('email'); // safe because of checkAuth
        if(gamesByPlayer[email]) {
            sendRedirect(res, '/game');
            break;
        }

        if(games[query.name]) {
            sendError(res, '/', 'A game with that name already exists.');
            break;
        }

        // after all that, we're free to create a game
        games[query.name] = new dom.game(email);
        // the player will be added once the socket is connected
        gamesByPlayer[email] = query.name;

        sendRedirect(res, '/game');
        break;

    case '/join':
        // process: get params, check valid, check existence of game and gamesByPlayer entry. redirect player to game.
        if(!checkAuth(req, cookies)) {
            send404(res);
            break;
        }

        var query = url.parse(req.url, true).query;
        if(!query || !query.name) {
            sendError(res, '/', 'You must supply a game name.');
            break;
        }

        var email = cookies.get('email'); // safe because of checkAuth
        if(gamesByPlayer[email]) {
            sendRedirect(res, '/game');
            break;
        }

        if(!games[query.name]) {
            sendError(res, '/', 'No game with that name exists.');
            break;
        }

        // otherwise add the player to the game
        gamesByPlayer[email] = query.name;

        sendRedirect(res, '/game');
        break;

    case '/game':
        if(!checkAuth(req, cookies)) {
            sendRedirect(res, '/');
            break;
        }

        var email = cookies.get('email'); // safe
        if(!gamesByPlayer[email]) {
            sendRedirect(res, '/');
            break;
        }

		// if the game exists but is over, redirect to the menu and delete the game's entries.
		if(gamesByPlayer[email] && games[gamesByPlayer[email]] && games[gamesByPlayer[email]].gameOver) {
			var g = games[gamesByPlayer[email]];
			for(var i = 0; i < g.players.length; i++) {
				gamesByPlayer[g.players[i].name] = undefined;
			}
			games[gamesByPlayer[email]] = undefined;
			sendRedirect(res, '/');
			break;
		}

        sendGame(res, cookies);

        break;

    case '/jquery.cookie.js':
    case '/register.html':
        sendFile(res, path);
        break;

    default: send404(res);
  }
}),

sendGame = function(res, cookies) {
    sendFile(res, '/dominion.html', [cookies.get('email'), cookies.get('uid')]);
};

send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

sendRedirect = function(res, to) {
	res.writeHead('303', 'Login redirect', { 'Location': to, 'Content-type': 'text/html' });
	res.write('<html><body>Redirecting to <a href="' + to + '">here</a>...</body></html>');
	res.end();
};

buildUid = function(email, req) {
    return Hash.sha256(email + 'a salt value' + req.connection.remoteAddress + ' Dominion v0.1 by Braden Shepherdson');
};

checkAuth = function(req, cookies) {
    var email = cookies.get('email');
    var uid = cookies.get('uid');
    if(!email || !uid) {
        return false;
    }

    return uid == buildUid(email, req);
};

sendError = function(res, link, message) {
    res.write('<html><body>' + message + '<br /><a href="' + link + '">Go back</a></body></html>');
    res.end();
};

server.listen(8080);

// socket.io, I choose you
// simplest chat application evar
var io = io.listen(server);
  
io.on('connection', function(client){
  var game, player;

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
                player.decisions.shift();
                console.log('Decision handled. ' + player.handlers.length + ', ' + player.decisions.length);
			} else {
				client.send({ retry: 1 });
			}
		} else {
            console.log('ERROR: Player ' + player.name + ' sent a response but no handler was available.');
        }
	} else if('connect' in message) {
        if(message.connect.length != 2 || !message.connect[0] || !message.connect[1]) {
            return;
        }

        var email = message.connect[0];
        var uid   = message.connect[1];
        if(uid != buildUid(email, client)) {
            return;
        }

        console.log('New client ' + email);

        if(!game) {
            console.log('Setting game');
            if(!gamesByPlayer[email]) return;
            game = games[gamesByPlayer[email]];
            if(!game) return;
        }

        if(!player) {
            for(var i = 0; i < game.players.length; i++) {
                if(game.players[i].name == email) {
                    console.log('Found player');
                    player = game.players[i];
                    player.client = client;
                }
            }
            if(!player) { // create a new player
                player = game.addPlayer(client, email);
                console.log('Creating new player');
            }
        }

        if(game.isStarted()) {
            console.log('Game already started');
            client.send({ game_started: 1 });
            if(player.id_ == game.players[game.turn_].id_) { // my turn, resend the kingdom and decision
                console.log('My turn');
                client.send(game.showKingdom());
                if(player.decisions.length > 0) {
                    console.log('Sending decision');
                    client.send({ decision: player.decisions[0].show() });
                }
            }
        } else {
            game.sendToAll({ players: game.players.map(function(x) { return x.name }), is_host: game.host == email });
        }
    } else if('start_game' in message) {
        if(game.players.length == 1) {
            return; // ignore click with only one player.
        }

        // otherwise begin the game. first send the start message, then start the game
        game.sendToAll({ game_started: 1 });

        game.startGame();
    }

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


function sendFile(res, path, opt_args) {
    fs.readFile(__dirname + path, 'utf8', function(err, data){
        if (err) return send404(res);
        if(opt_args) data = vsprintf(data, opt_args);
        res.writeHead(200, {'Content-Type': path.substring(path.length-3) == '.js' ? 'text/javascript' : 'text/html'})
        res.write(data);
        res.end();
    });
}

