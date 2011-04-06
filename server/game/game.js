
var dom = {};

dom = require('./decision');
dom.player = require('./player').player;
dom.cards = require('./cards').cards;
dom.card = require('./cards').card;
dom.utils = require('./utils');

dom.game = function(host) {
	this.players = [];
	this.turn_ = -1; // gets bumped by nextPlayer before starting.
	this.kingdom = [];

	this.host = host; // host's name
	this.log_ = [];
};


dom.game.prototype.isStarted = function() {
	return this.turn_ >= 0;
}

dom.game.prototype.addPlayer = function(client, name) {
	var p = new dom.player(this, client, name);
	this.players.push(p);
	return p;
};


dom.game.prototype.decision = function(dec, cb) {
	dec.player.decisions.push(dec);
	dec.player.handlers.push(function(p, key) {
		if(!key) {
			return false; // cause a retry
		}
		cb(key);
		return true;
	});

	console.log('sending decision to player');
	dec.player.client.send({ decision: dec.show(), log: this.log_ });
};


dom.game.prototype.startGame = function() {
	var cards = dom.cards.drawKingdom();
	console.log('Kingdom:');
	for(var i = 0; i < cards.length; i++) {
		this.kingdom.push({ card: cards[i], count: 10 }); //TODO: Should be variable depending on number of players, etc.
		console.log(cards[i].name + ', ' + cards[i].cost + ': ' + cards[i].text);
	}

	this.kingdom.push({ card: dom.cards['Copper'], count: 1000 });
	this.kingdom.push({ card: dom.cards['Silver'], count: 1000 });
	this.kingdom.push({ card: dom.cards['Gold'], count: 1000 });
	this.kingdom.push({ card: dom.cards['Estate'], count: 24-3*this.players.length });
	this.kingdom.push({ card: dom.cards['Duchy'], count: 12 });
	this.kingdom.push({ card: dom.cards['Province'], count: 12 });
	this.kingdom.push({ card: dom.cards['Curse'], count: 30 });

	this.nextPlayer();
};

dom.game.prototype.sendToAll = function(msg) {
	for(var i = 0; i < this.players.length; i++) {
		this.players[i].client.send(msg);
	}
};

dom.game.prototype.stackSizes = function() {
	var ret = [];
	for(var i = 0; i < this.players.length; i++){
		var p = this.players[i];
		ret.push({ id: p.id_, deck: p.deck_.length, hand: p.hand_.length, discards: p.discards_.length });
	}
	return ret;
}

dom.game.prototype.nextPlayer = function() {
	if(this.turn_ >= 0) { // not first turn
		this.players[this.turn_].client.send({ turn_over: 1 });
	}
	this.sendToAll(this.showKingdom());

	this.turn_++;
	if(this.turn_ >= this.players.length) {
		this.turn_ = 0;
	}
	this.players[this.turn_].turnStart();

	this.checkEndOfGame();
};

dom.game.prototype.showKingdom = function() {
	return { kingdom: dom.cards.wireCards(this.kingdom), stacks: this.stackSizes() };
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
	this.log('Game over');

	var scores = [];
	for(var i = 0; i < this.players.length; i++) {
		scores.push({ id: this.players[i].id_, score: this.players[i].calculateScore() });
	}

	scores.sort(function(a,b) { return b.score - a.score });

	var msg = { game_over: scores };

	for(var i = 0; i < this.players.length; i++) {
		this.players[i].client.send(msg);
	}

	this.gameOver = true;

};


dom.game.prototype.indexInKingdom = function(name) {
	for(var i = 0; i < this.kingdom.length; i++) {
		if(this.kingdom[i].card.name == name) {
			return i;
		}
	}
};


// LOGGING FUNCTIONS
// A thought about logging: what's the cost of sending the complete log? Over
// a game with 40 decisions and 100 bytes average per turn and 4 players, sending
// the complete log every time totals up to 1.2MB sent total to each player.
// I'm not concerned about my bandwidth, but rather the total downloaded by the clients.
// But 1.2MB each is not too much, so I'll run with this for now.
//
// Conclusion: Carry on sending the complete log with every decision until I have a need to do otherwise.

// logs a string with no parameters.
dom.game.prototype.log = function(str) {
	this.log_.push(str);
};

// logs a string with the given player's name at the beginning
// counterpart function dom.player.logMe is a helper for this.
dom.game.prototype.logPlayer = function(str, p) { 
	this.log_.push(p.name + ' ' + str);
};


exports.game = dom.game;

