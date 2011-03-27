
var dom = {};

dom.cards = require('./cards').cards;
dom.card = require('./cards').card;
dom.utils = require('./utils');
dom.Decision = require('./decision').Decision;
dom.Option = require('./decision').Option;

// static variables
var playerCount = 0;

dom.player = function(game) {
	this.id_ = playerCount++;
	this.discards_ = dom.cards.starterDeck(); // start them in the discards
	this.deck_ = [];                          // and an empty deck
	this.inPlay_ = [];

	this.shuffleDiscards_();                  // shuffle them into the deck
	this.hand_ = [];
	this.draw(5);                             // and draw

	this.game_ = game;

	// turn data
	this.phase_ = dom.player.TurnPhases.NOT_PLAYING;
	this.actions = 0;
	this.buys = 0;
	this.coin = 0;

	// used as a scratchpad to store things between callbacks
	this.temp = {};
	// used for the async rules handling
	this.rules_ = [];
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

	this.turnActionPhase();
};


dom.player.prototype.turnActionPhase = function() {
	if(this.actions <= 0) {
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
			this.turnBuyPhase();
			return;
		}

		var match = /\[(\d+)\]/.exec(key);
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


/** @param {number} index The index of the card in my hand. */
dom.player.prototype.playAction = function(index) {
	if(index < 0 || index >= this.hand_.length) {
		return;
	}

	var card = this.hand_[index];
	if(!card.types['Action']) return;

	this.removeFromHand(index);
	this.inPlay_.push(card);

	var rulesList;
	if(typeof card.rules == 'object') { // array 
		rulesList = card.rules;
	} else {
		rulesList = [ card.rules ]; // just a function
	}

	if(!rulesList) return;

	this.rules_ = rulesList;
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
	// TODO: implement me properly
	this.phase_ = dom.player.TurnPhases.BUY;
	this.turnCleanupPhase();
};


dom.player.prototype.turnCleanupPhase = function() {
	this.phase_ = dom.player.TurnPhases.CLEANUP;
	for(var i = 0; i < this.inPlay_.length; i++) {
		this.discards_.push(this.inPlay_[i]);
	}
	for(var i = 0; i < this.hand_.length; i++) {
		this.discards_.push(this.hand_[i]);
	}
	this.inPlay_ = [];
	this.hand_ = [];
	this.draw(5);

	this.turnEnd();
};


dom.player.prototype.turnEnd = function() {
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


exports.player = dom.player;

