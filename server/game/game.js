
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
	this.kingdom = [];
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


dom.game.prototype.startGame = function() {
	var cards = dom.cards.drawKingdom();
	for(var i = 0; i < cards.length; i++) {
		this.kingdom.push({ card: cards[i], count: 1 }); //TODO: Should be variable depending on number of players, etc.
	}

	this.kingdom.push({ card: dom.cards['Copper'], count: 1000 });
	this.kingdom.push({ card: dom.cards['Silver'], count: 1000 });
	this.kingdom.push({ card: dom.cards['Gold'], count: 1000 });
	this.kingdom.push({ card: dom.cards['Estate'], count: 24-3*this.players.length });
	this.kingdom.push({ card: dom.cards['Dutchy'], count: 12 });
	this.kingdom.push({ card: dom.cards['Province'], count: 12 });
	this.kingdom.push({ card: dom.cards['Curse'], count: 30 });

	this.nextPlayer();
};


dom.game.prototype.nextPlayer = function() {
	this.turn_++;
	if(this.turn_ >= this.players.length) {
		this.turn_ = 0;
	}
	this.players[this.turn_].turnStart();

	this.checkEndOfGame();
};


dom.game.prototype.checkEndOfGame = function() {
	var ixProvince = this.indexInKingdom('Province');

	var emptyPiles = 0;
	for(var i = 0; i < this.kingdom.length; i++) {
		if(this.kingdom[i].count <= 0) {
			emptyPiles++;
		}
	}

	if(this.kingdom[ixProvince].count <= 0 || emptyPiles >= 3) {
		this.endGame();
	}
};


dom.game.prototype.endGame = function() {
	// count victory points for each player
	var maxScore = -10000;
	var maxIndexes = [];
	for(var i = 0; i < this.players.length; i++) {
		var score = this.players[i].calculateScore();
		console.log('Player ' + this.players[i].id_ + ' scored ' + score);
		if(score == maxScore) {
			maxIndexes.push(i);
		} else if(score > maxScore) {
			maxScore = score;
			maxIndexes = [i];
		}
	}

	console.log('\n\nGame over.');
	var str = 'Player';
	if(maxIndexes.length > 1) {
		str += 's ';
		for(var i = 0; i < maxIndexes.length; i++) {
			str += this.players[maxIndexes[i]].id_;
			if(i+1 < maxIndexes.length) {
				str += ', ';
			}
		}
		str += ' tied for the win.';
	} else {
		str += ' ' + this.players[maxIndexes[0]].id_ + ' wins.'
	}

	console.log(str);
	process.exit(0);
};


dom.game.prototype.indexInKingdom = function(name) {
	for(var i = 0; i < this.kingdom.length; i++) {
		if(this.kingdom[i].card.name == name) {
			return i;
		}
	}
};


// MAIN


var stdin = process.openStdin();
stdin.setEncoding('utf8');

var inputSuccess = [];
var inputFailure = [];
var inputPredicate = [];
var inputStrings = [];
var inputDebug;
stdin.on('data', function(chunk) {
	if(chunk == 'debug\n') {
		inputDebug();
		return;
	}

	if(inputPredicate.length == 0 || inputSuccess.length == 0 || inputFailure == 0) return;
	if(inputPredicate[0](chunk)) {
		inputSuccess[0](chunk);

		inputPredicate.shift();
		inputSuccess.shift();
		inputFailure.shift();
	} else {
		inputFailure[0]();

	}

	if(inputStrings.length > 0) {
		process.stdout.write(inputStrings.shift());
	}
});

stdin.on('end', function() {
	process.exit();
});


function send(str, p, s, f) {
	inputPredicate.push(p);
	inputSuccess.push(s);
	inputFailure.push(f);
	if(inputSuccess.length == 1) {
		process.stdout.write('\n\n' + str);
	} else {
		inputStrings.push('\n\n' + str);
	}
}



// MAIN

/*
var test = dom.utils.bind(function(x,y,z) {
	console.log(x);
	console.log(y);
	console.log(z);
}, this, 4);

test(3, 2);
test(7, 1);

process.exit();
*/



var thegame = new dom.game(null);
thegame.addPlayer();
thegame.addPlayer();

thegame.startGame();

inputDebug = function() {
	console.log(thegame);
	for(var i=0; i < thegame.players.length; i++) {
		console.log('=======================================');
		console.log(thegame.players[i]);
	}
};

exports.game = dom.game;

