

// static variables
dom.playerCount_ = 0;

dom.player = function() {
	this.id_ = dom.playerCount_++;
	this.deck_ = cards.starterDeck();
	this.discards_ = [];
	this.hand_ = this.draw(5);

	// turn data
	this.phase_ = dom.player.TurnPhases.NOT_PLAYING;
	this.actions = 0;
	this.buys = 0;
	this.coin = 0;
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


/** @param {Array.<Card>} */
dom.options.cardsToOptions = function(cards) {
	var options = [];
	for(var i = 0; i < cards.length; i++) {
		options.push(new Option('card['+i+']', cards[i].name));
	}
	return options;
};


dom.player.prototype.turnActionPhase = function() {
	if(this.actions <= 0) {
		this.turnBuyPhase();
		return;
	}

	var actionCards = this.hand_.filter(function(c){ return c.types['Action'] });
	var options = cardsToOptions(actionsCards);
	options.push(new Option('buy', 'Proceed to Buy phase'));
	var dec = new Decision(p, options, {
		'Actions': this.actions,
		'Buys': this.buys,
		'Coin': this.coin
	});

	app.decision(dec, dom.bind(




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


dom.player.prototype.shuffleDiscards = function() {
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




