
var dom = {};

dom.cards = require('./cards').cards;
dom.card = require('./cards').card;
dom.utils = require('./utils');
dom.Decision = require('./decision').Decision;
dom.Option = require('./decision').Option;

// static variables
var playerCount = 1;

dom.player = function(game, client, name) {
	this.id_ = playerCount++;
	this.name = name;

	this.discards_ = dom.cards.starterDeck(); // start them in the discards
	this.deck_ = [];                          // and an empty deck
	this.inPlay_ = [];
	this.duration_ = [];

	this.shuffleDiscards_();                  // shuffle them into the deck
	this.hand_ = [];
	this.draw(5);                             // and draw

	this.game_ = game;
	this.client = client;
	this.decisions = []; // queue of decisions to be sent
	this.handlers = [];  // parallel queue of response handlers

	// turn data
	this.phase_ = dom.player.TurnPhases.NOT_PLAYING;
	this.actions = 0;
	this.buys = 0;
	this.coin = 0;

	// used as a scratchpad to store things between callbacks
	this.temp = {};
	// used for the async rules handling
	this.rules_ = [];
	this.durationRules = [];
};

dom.player.TurnPhases = {
	NOT_PLAYING: 1,
	ACTION: 2,
	BUY: 3,
	CLEANUP: 4
};
	

// turn handlers
dom.player.prototype.turnStart = function() {
	this.phase_ = dom.player.TurnPhases.ACTION;
	this.actions = 1;
	this.buys = 1;
	this.coin = 0;

	this.logMe('starts turn.');

	for(var i = 0; i < this.durationRules.length; i++) {
		var d = this.durationRules[i];
		this.logMe('gets the delayed effect of ' + d.name + '.');
		for(var j = 0; j < d.rules.length; j++) {
			d.rules[j](this);
		}
	}
	this.durationRules = [];

	this.turnActionPhase();
};


dom.player.prototype.turnActionPhase = function() {
	if(this.actions <= 0) {
		this.logMe('has no Actions left.');
		this.turnBuyPhase();
		return;
	}

	var options = dom.utils.cardsToOptions(this.hand_);
	options.push(new dom.Option('buy', 'Proceed to Buy phase'));
	var dec = new dom.Decision(this, options, 'Play an Action card or proceed to the Buy phase.', [
		'Actions: ' + this.actions,
		'Buys: ' + this.buys,
		'Coin: ' + this.coin
	]);

	this.game_.decision(dec, dom.utils.bind(function(key) {
		if(key == 'buy') {
			this.logMe('ends Action phase.');
			this.turnBuyPhase();
			return;
		}

		var match = /^card\[(\d+)\]/.exec(key);
		if(match) {
			var index = match[1]; // [1] is the first capture group
			this.playAction(index);
			// don't call turnActionPhase. that'll be called by runRules_ when the rules are all done.
		} else {
			this.turnActionPhase(); // just redo it, bad decision
		}
	}, this));
};


/** @param {number} index The index of the card in my hand. */
dom.player.prototype.removeFromHand = function(index) {
	var newHand = [];
	for(var i = 0; i < this.hand_.length; i++) {
		if(index != i) {
			newHand.push(this.hand_[i]);
		}
	}
	this.hand_ = newHand;
};


/**
 * NOTE: If you make changes here make sure to match them in the rules for Throne Room, if applicable.
 *
 * @param {number} index The index of the card in my hand.
 */
dom.player.prototype.playAction = function(index) {
	if(index < 0 || index >= this.hand_.length) {
		this.turnActionPhase();
		return;
	}

	var card = this.hand_[index];
	if(!card.types['Action']) {
		this.turnActionPhase();
		return;
	}

	this.removeFromHand(index);
	this.inPlay_.push(card);
	this.actions--;

	var rulesList;
	if(typeof card.rules == 'object') { // array 
		rulesList = card.rules;
	} else {
		rulesList = [ card.rules ]; // just a function
	}

	if(!rulesList) {
		console.log('ERROR: Can\'t happen. No rules list.');
		return;
	}

	// this card is for real, log it
	this.logMe('plays ' + card.name + '.');

	// gotta copy since we're going to consume them
	this.rules_ = [];
	for(var i = 0; i < rulesList.length; i++) {
		this.rules_.push(rulesList[i]);
	}
	this.runRules_();
};


dom.player.prototype.runRules_ = function() {
	if(this.rules_.length <= 0) {
		this.turnActionPhase();
		return;
	}

	var rule = this.rules_.shift();
	rule(this, dom.utils.bind(this.runRules_, this));
};


dom.player.prototype.turnBuyPhase = function() {
	this.phase_ = dom.player.TurnPhases.BUY;

	if(this.buys <= 0) {
		this.turnCleanupPhase();
		return;
	}

	// first go through the hand and use up any treasure cards
	for(var i = 0; i < this.hand_.length; ){
		var card = this.hand_[i];
		if(card.types['Treasure']) {
			this.removeFromHand(i);
			this.discards_.push(card);
			this.coin += dom.cards.treasureValues[card.name];
		} else {
			i++;
		}
	}

	var p = this;
	dom.utils.gainCardDecision(this, 'Buy cards or end your turn.', 'Done buying. End your turn.', [
		'Buys: ' + this.buys,
		'Coin: ' + this.coin
	], function(card) { return card.cost <= p.coin; },
	function(repeat) {
		return dom.utils.decisionHelper(
			function() { p.turnCleanupPhase(); },
			function(index) {
				p.buyCard(index, false);
				p.turnBuyPhase();
			},
			function() { repeat(); });
	});

};


/** @param {number} index Index into the kingdom.
 *  @param {boolean} free Whether the purchase is free (in terms of Buys and Coin) or not.
 */
dom.player.prototype.buyCard = function(index, free) {
	var inKingdom = this.game_.kingdom[index];
	this.discards_.push(inKingdom.card);
	inKingdom.count--;

	this.logMe( (free ? 'gains' : 'buys') + ' ' + inKingdom.card.name + '.');

	if(inKingdom.count == 1) {
		this.game_.log('There is only one ' + inKingdom.card.name + ' remaining.');
	} else if(inKingdom.count == 0) {
		this.game_.log('The ' + inKingdom.card.name + ' pile is empty.');
	}

	if(!free) {
		this.coin -= inKingdom.card.cost;
		this.buys--;

		if(inKingdom.embargoTokens && inKingdom.embargoTokens > 0) {
			for(var i = 0; i < inKingdom.embargoTokens; i++) {
				this.buyCard(this.game_.indexInKingdom('Curse'), true);
			}
		}
	}
};


dom.player.prototype.turnCleanupPhase = function() {
	this.phase_ = dom.player.TurnPhases.CLEANUP;
	
	// move old Duration cards to discard pile
	for(var i = 0; i < this.duration_.length; i++) {
		this.discards_.push(this.duration_[i]);
	}
	this.duration_ = [];
	// then move cards in play into duration or discards
	for(var i = 0; i < this.inPlay_.length; i++) {
		if(this.inPlay_[i].types['Duration']) {
			this.duration_.push(this.inPlay_[i]);
		} else {
			this.discards_.push(this.inPlay_[i]);
		}
	}
	console.log('Durations');
	console.log(this.duration_);
	// and the hand to the discards
	for(var i = 0; i < this.hand_.length; i++) {
		this.discards_.push(this.hand_[i]);
	}
	this.inPlay_ = [];
	this.hand_ = [];
	this.draw(5);

	this.turnEnd();
};


dom.player.prototype.turnEnd = function() {
	//console.log(this);
	this.logMe(' ends turn.');
	this.phase_ = dom.player.TurnPhases.NOT_PLAYING;
	this.game_.nextPlayer();
};


/** @param {?number} optional number of cards */
dom.player.prototype.draw = function(opt_n) {
	var n = opt_n || 1;
	for(var i = 0; i < n; i++) {
		if(this.deck_.length == 0) {
			this.shuffleDiscards_();
		}

		if(this.deck_.length == 0) {
			return /* undefined */; // nothing to draw. rare but possible case.
		}

		var card = this.deck_.pop();
		this.hand_.push(card);
	}
};


/** @param {number} index The index of the card to discard. */
dom.player.prototype.discard = function(index) {
	var card = this.hand_[index];
	p.logMe('discarded ' + card.name + '.');
	this.removeFromHand(index);
	this.discards_.push(card);
};


dom.player.prototype.shuffleDiscards_ = function() {
	var oldDeck = this.deck_;
	var i = this.discards_.length;
	if ( i == 0 ) return; // deck is unchanged
	while ( --i ) {
		var j = Math.floor( Math.random() * ( i + 1 ) );
		var tempi = this.discards_[i];
		var tempj = this.discards_[j];
		this.discards_[i] = tempj;
		this.discards_[j] = tempi;
	}

	this.deck_ = this.discards_;
	if(oldDeck.length > 0) {
		this.deck_.concat(oldDeck);
	}
	this.discards_ = [];
};

dom.player.prototype.calculateScore = function() {
	var score = 0;
	var gardens = 0;
	var cards = 0;

	var scoreArray = function(arr) {
		for(var i = 0; i < arr.length; i++) {
			var card = arr[i];
			cards++;
			if(card.name == 'Gardens') {
				gardens++;
			} else if(card.types['Victory']) {
				score += dom.cards.victoryValues[card.name];
			} else if(card.types['Curse']) {
				score--;
			}
		}
	};

	scoreArray(this.hand_);
	scoreArray(this.deck_);
	scoreArray(this.discards_);

	score += gardens * Math.floor(cards/10);

	console.log('Score for Player ' + this.id_ + ' = ' + score);

	return score;
};


// returns the name of the card that protected them
dom.player.prototype.safeFromAttack = function() {
	console.log('top of SFA');
	console.log(this.duration_);
	if (this.hand_.filter(function(c) { return c.name == 'Moat' }).length > 0) {
		console.log('SFA: Moat');
		return 'Moat';
	}
	if (this.duration_.filter(function(c) { return c.name == 'Lighthouse' }).length > 0) {
		console.log('SFA: Lighthouse');
		return 'Lighthouse';
	}
	console.log('SFA: undefined');
	return /* undefined */;
};

// logs a message that begins with my name
dom.player.prototype.logMe = function(str) {
	this.game_.logPlayer(str, this);
};


exports.player = dom.player;

