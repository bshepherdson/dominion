
var dom = {};

dom = require('./decision');
dom.player = require('./player').player;
dom.cards = require('./cards').cards;
dom.card = require('./cards').card;
dom.utils = require('./utils');

dom.game = function(app) {
	this.app_ = app;
	this.players = [];
	this.turn_ = -1; // gets bumped by nextPlayer before starting.
};


dom.game.prototype.addPlayer = function() {
	var p = new dom.player(this);
	this.players.push(p);
};


dom.game.prototype.decision = function(dec, cb) {
	var str = 'Player ' + dec.player.id_ + ':\n';
	for(var i = 0; i < dec.info.length; i++) {
		str += dec.info[i] + "\n";
	}
	str += '\n';
	str += dec.message + '\n';
	for(var i = 0; i < dec.options.length; i++) {
		str += (i+1) + ') ' + dec.options[i].text + '\n';
	}
	str += 'Choice: ';

	send(str, function(res) {
		res = +res; // coerce to number
		return res && res > 0 && res <= dec.options.length;
	}, function(res) {
		res--;
		cb(dec.options[res].key);
	}, dom.utils.bind(this.decision, this, dec, cb));

};


dom.game.prototype.nextPlayer = function() {
	this.turn_++;
	if(this.turn_ >= this.players.length) {
		this.turn_ = 0;
	}
	this.players[this.turn_].turnStart();
};


// MAIN


var stdin = process.openStdin();
stdin.setEncoding('utf8');

var inputSuccess;
var inputFailure;
var inputPredicate;
stdin.on('data', function(chunk) {
	if(!inputPredicate || !inputSuccess || !inputFailure) return;
	if(inputPredicate(chunk)) {
		inputSuccess(chunk);
	} else {
		inputFailure();
	}
});

stdin.on('end', function() {
	process.exit();
});


function send(str, p, s, f) {
	inputPredicate = p;
	inputSuccess = s;
	inputFailure = f;
	process.stdout.write(str);
}



// MAIN

//var test = dom.utils.bind(function(x) {
//	console.log(x);
//}, this);
//
//test(3);
//
//process.exit();



var thegame = new dom.game(null);
thegame.addPlayer();
thegame.addPlayer();

thegame.nextPlayer();


exports.game = dom.game;

