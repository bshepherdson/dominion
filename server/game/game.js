
var dom = {};

dom = require('./decision');
dom.player = require('./player').player;
dom.cards = require('./cards').cards;
dom.card = require('./cards').card;
dom.utils = require('./utils');

dom.game = function() {
	this.players = [];
	this.turn_ = -1; // gets bumped by nextPlayer before starting.
	this.kingdom = [];
};


dom.game.prototype.isStarted = function() {
	return turn_ >= 0;
}

dom.game.prototype.addPlayer = function(client) {
	var p = new dom.player(this, client);
	this.players.push(p);
	return p;
};


dom.game.prototype.decision = function(dec, cb) {
	var payload = {
		decision: {
			info: dec.info,
			message: dec.message,
			options: dec.options
		}
	};

	dec.player.handlers.push(function(p, key) {
		if(!key) {
			return false; // cause a retry
		}
		cb(key);
		return true;
	});

	console.log('sending decision to player');
	dec.player.client.send(payload);
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
	this.kingdom.push({ card: dom.cards['Dutchy'], count: 12 });
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
	this.sendToAll({ kingdom: dom.cards.wireCards(this.kingdom), stacks: this.stackSizes() });

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
	var scores = [];
	for(var i = 0; i < this.players.length; i++) {
		scores.push({ id: this.players[i].id_, score: this.players[i].calculateScore() });
	}

	scores.sort(function(a,b) { return b.score - a.score });

	var msg = { game_over: scores };

	for(var i = 0; i < this.players.length; i++) {
		this.players[i].client.send(msg);
	}

};


	//// count victory points for each player
	//var maxScore = -10000;
	//var maxIndexes = [];
	//for(var i = 0; i < this.players.length; i++) {
	//	var score = this.players[i].calculateScore();
	//	console.log('Player ' + this.players[i].id_ + ' scored ' + score);
	//	if(score == maxScore) {
	//		maxIndexes.push(i);
	//	} else if(score > maxScore) {
	//		maxScore = score;
	//		maxIndexes = [i];
	//	}
	//}

	//console.log('\n\nGame over.');
	//var str = 'Player';
	//if(maxIndexes.length > 1) {
	//	str += 's ';
	//	for(var i = 0; i < maxIndexes.length; i++) {
	//		str += this.players[maxIndexes[i]].id_;
	//		if(i+1 < maxIndexes.length) {
	//			str += ', ';
	//		}
	//	}
	//	str += ' tied for the win.';
	//} else if({
	//	str += ' ' + this.players[maxIndexes[0]].id_ + ' wins.'
	//}

	//console.log(str);
	//setTimeout(process.exit, 1000);
//};


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
		inputPredicate.shift();
		inputSuccess.shift();
		var f = inputFailure.shift();
		f();
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


exports.game = dom.game;

