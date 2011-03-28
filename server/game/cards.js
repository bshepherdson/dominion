
// some general thoughts on cards
// * there are a number of crossover cards that are multiple types. May as well plan for that now.
//   * for cards that name a specific type they apply to, a mixed card counts as either type.
//   * so the types are a set rather than a scalar
//   * types: Victory, Treasure, Action, Attack, Reaction, Curse, (Duration (not in Base))
// * each player has a hand, deck, discards. the board has the kingdom, victory and curse cards. coins are not counted, since they're infinite.
// * it can be a player's turn, or players can have decisions to make. the game state includes a queue (stack?) of decisions to be made.
//   * does a decision always consist of choosing (a) card(s)? No, there are also "may" instructions on cards.
// * how to represent the rules? There are some basic patterns: + Cards, Actions, Buys and Coin.
//   * then I think there's three kinds of ones implemented as functions on players: me, everyone, everyone but me.
//   * those functions transform the player state in some way mid-turn. I need to think how that interacts with the API model and asking questions of the user.
//   * maybe anywhere in the JS code I can define a callback and say "ask this user this question, and hit this code with his response."
//     * I think that's a workable, nicely JSful approach.

var dom = {};
dom.cards = {};

dom.Decision = require('./decision').Decision;
dom.Option = require('./decision').Option;
dom.utils = require('./utils');

dom.card = function(name, types, cost, text, rules) {
	this.name = name;
	this.types = types;
	this.cost = cost;
	this.text = text;
	this.rules = rules;
};


// common card rules
rules = {};
function basicRule(field) {
	return function(amount) {
		return function(p,c) { p[field] += amount; c(); };
	};
}

/** @param {number} */
rules.plusCoin = basicRule('coin');
/** @param {number} */
rules.plusBuys = basicRule('buys');
/** @param {number} */
rules.plusActions = basicRule('actions');
/** @param {number} */
rules.plusCards = function(amount) {
	return function(p,c) {
		for(var i=0; i < amount; i++) {
			p.draw();
		}
		c();
	};
};
rules.nullRule = function(p, c) { c(); };


rules.discardMany = function(callback) {
	var internal = function(p, c) {
		if(!p.temp.discarded) {
			p.temp.discarded = [];
		}

		var opts = dom.utils.cardsToOptions(p.hand_);
		opts.push(new dom.Option('done', 'Done discarding'));
		var dec = new dom.Decision(p, opts, 'Choose the next card to discard, or stop discarding.', []);
		p.game_.decision(dec, dom.utils.decisionHelper(function() {
			var discarded = p.temp.discarded;
			p.temp.discarded = [];
			callback(p, c, discarded);
		}, function(index) {
			var card = p.discard(index);
			p.temp.discarded.push(card);
			internal(p, c);
		}, function() {
			internal(p, c);
		}));
	};

	return internal;
};


rules.gainCard = function(name, f) {
	return function(p,c) {
		var inKingdom;
		for(var i = 0; i < p.game_.kingdom.length; i++) {
			if(p.game_.kingdom[i].card.name == name) {
				inKingdom = p.game_.kingdom[i];
				break;
			}
		}

		if(!inKingdom || inKingdom.count <= 0) {
			c(); // fail to gain the card
		} else {
			f(p, inKingdom.card);
			inKingdom.count--;
			c();
		}
	};
};

/**
 * @param {number} times The maximum number of times to repeat this function.
 * @param {string} message The message displayed for each Decision.
 * @param {string} done The 'done' message.
 * @param {function} getOpts A function taking a player and returning an array of options.
 * @param {function} f The function taking a player object and index called when a non-done decision is made.
 */
rules.repeatUpTo = function(times, message, done, getOpts, f) {
	var internal = function(n, p, c) {
		if(n <= 0) c(); // end

		var opts = getOpts(p);
		opts.push(new dom.Option('done', done));
		var dec = new dom.Decision(p, opts, message, []);
		p.game_.decision(dec, dom.utils.decisionHelper(
			function() { c(); },
			function(index) { f(p, index); internal(n-1, p,c); },
			function() { internal(n, p, c); }
		));
	};

	return dom.utils.bind(internal, null, times);
};


rules.yesNo = function(message, yes, no) {
	return function(p, c) {
		var opts = [
			new dom.Option('yes', 'Yes'),
			new dom.Option('no', 'No')
		];
		var dec = new dom.Decision(p, opts, message, []);
		p.game_.decision(dec, function(key) {
			if(key == 'yes') {
				yes(p);
			} else {
				no(p);
			}
			c();
		});
	};
};


rules.maybe = function(pred, when) {
	return function(p,c) {
		if(pred(p)) {
			when(p,c);
		} else {
			c();
		}
	};
};


rules.everyOtherPlayer = function(f) {
	return function(p, c) {
		var responses = {};
		var sent = 0;
		var completed = 0;
		var doneSending = false;

		var cont = function() {
			completed++;
			if(doneSending && completed >= sent) {
				c();
			}
		};

		for(var i = 0; i < p.game_.players.length; i++) {
			if(p.id_ != p.game_.players[i].id_) {
				sent++;
				f(p, p.game_.players[i], cont);
			}
		}

		doneSending = true;
		if(completed >= sent) {
			c(); // they've all returned already
		}

		// otherwise I just return and wait for the continuations to do their thing.
	};
};


// trying to work out the process.
// 1. rule needs to ask a user something and make a decision on the result.
// 2. it calls a framework function with the Option array and a callback.
// 3. framework function returns that data to the user.
// 4. player's response arrives as a new request to the server.
// 5. the callback provided is called with the result.
// 6. the callback will either ask more questions or call a continuation when it's done.
// 7. that continuation ends up back in the player's turn, signaling the end of that rule.
// - the player object keeps track of the turn state: working its way through the rules on each card, the phases of the turn and so on.

// first the common cards
dom.cards['Gold']   = new dom.card('Gold',   { 'Treasure': 1 }, 6, '', rules.plusCoin(3));
dom.cards['Silver'] = new dom.card('Silver', { 'Treasure': 1 }, 3, '', rules.plusCoin(2));
dom.cards['Copper'] = new dom.card('Copper', { 'Treasure': 1 }, 0, '', rules.plusCoin(1));

dom.cards['Province'] = new dom.card('Province', { 'Victory': 1 }, 8, '', rules.nullRule);
dom.cards['Dutchy']   = new dom.card('Dutchy',   { 'Victory': 1 }, 5, '', rules.nullRule);
dom.cards['Estate']   = new dom.card('Estate',   { 'Victory': 1 }, 2, '', rules.nullRule);
dom.cards['Curse']    = new dom.card('Curse',    { 'Curse': 1 },   0, '', rules.nullRule);


// and now the kingdom cards
dom.cards['Cellar'] = new dom.card('Cellar', { 'Action': 1 }, 2, '+1 Action. Discard any number of cards. +1 Card per card discarded.', [
	rules.plusActions(1),
	rules.discardMany(function(p, c, discarded) {
		p.draw(discarded.length);
		c();
	})
]);

dom.cards['Chapel'] = new dom.card('Chapel', { 'Action': 1 }, 2, 'Trash up to 4 cards from your hand.', [
	rules.repeatUpTo(4, 'Choose a card to trash.', 'Done trashing', function(p) {
		return dom.utils.cardsToOptions(p.hand_);
	}, function(p, index) {
		p.removeFromHand(index); // remove it and don't put it anywhere
	})
]);

dom.cards['Chancellor'] = new dom.card('Chancellor', { 'Action': 1}, 3, '+2 Coins. You may immediately put your deck into your discard pile.', [
	rules.plusCoin(2),
	rules.yesNo('Do you want to move your deck to your discard pile?', function(p) {
		dom.utils.append(p.discards_, p.deck_);
		p.deck_ = [];
	}, function(p) { })
]);

dom.cards['Village'] = new dom.card('Village', { 'Action': 1 }, 3, '+1 Card. +2 Actions.', [ rules.plusCards(1), rules.plusActions(2) ]);

dom.cards['Woodcutter'] = new dom.card('Woodcutter', { 'Action': 1 }, 3, '+1 Buy. +2 Coin.', [ rules.plusBuys(1), rules.plusCoin(2) ]);

//dom.cards['Workshop'] = new dom.card('Workshop', { 'Action': 1 }, 3, 


dom.cards['Gardens'] = new dom.card('Gardens', { 'Victory': 1 }, 4, 'Worth 1 Victory for every 10 cards in your deck (rounded down).', []);

dom.cards['Moneylender'] = new dom.card('Moneylender', { 'Action': 1 }, 4, 'Trash a Copper from your hand. If you do, +3 Coin.', [
	rules.maybe(function(p) {
		for(var i = 0; i < p.hand_.length; i++) {
			if(p.hand_[i].name == 'Copper') {
				return true;
			}
		}
		return false;
	}, rules.yesNo('Do you want to trash a Copper for +3 Coin?', function(p) {
		for(var i = 0; i < p.hand_.length; i++) {
			if(p.hand_[i].name == 'Copper') {
				p.removeFromHand(i);
				p.coin += 3;
			}
		}
	}, function(p){ }))
]);

dom.cards['Workshop'] = new dom.card('Workshop', { 'Action': 1 }, 3, 'Gain a card costing up to 4 Coin.', [
	function(p, c) {
		dom.utils.gainCardDecision(p, 'Gain a card costing up to 4 Coin', 'Gain nothing', [], function(card) { return card.cost <= 4; },
			function(repeat) { 
				return dom.utils.decisionHelper(
					function() { c(); },
					function(index) {
						p.buyCard(index, true);
						c();
					}, repeat);
			});
	}]);

dom.cards['Bureaucrat'] = new dom.card('Bureaucrat', { 'Action': 1, 'Attack': 1 }, 4, 'Gain a Silver card; put it on top of your deck. Each other player reveals a Victory card from his hand and puts it on his deck (or reveals a hand with no Victory cards).', [
	rules.gainCard('Silver', function(p,card) { p.deck_.push(card); }),
	rules.everyOtherPlayer(function(active, p, c) {
		var victoryCards = p.hand_.filter(function(card) { return card.types['Victory']; });
		if(victoryCards.length == 0) {
			console.log('Player ' + p.id_ + ' reveals a hand with no victory cards.');
			c();
		} else if(victoryCards.length == 1) {
			console.log('Player ' + p.id_ + ' has only one Victory card, a ' + victoryCards[0].name + ', and is forced to put it on his deck.');
			for(var i = 0; i < p.hand_.length; i++) {
				if(p.hand_[i].types['Victory']) {
					var card = p.hand_[i];
					p.removeFromHand(i);
					p.deck_.push(card); // on top
					break;
				}
			}
			c();
		} else {
			// have to ask that player to decide which one to discard
			console.log('Asking Player ' + p.id_ + ' for a decision.');
			dom.utils.handDecision(p, 'Player ' + active.id_ + ' has played a Bureaucrat. Choose a Victory card from your hand to put on top of your deck.', null,
				function(c) { return c.types['Victory']; },
				function(index) {
					var card = p.hand_[index];
					console.log('He chose ' + card.name);
					p.removeFromHand(index);
					p.deck_.push(card);
					c();
				}, c);
		}
	})
]);

dom.cards.starterDeck = function() {
	return [
		dom.cards['Bureaucrat'],
		dom.cards['Copper'],
		dom.cards['Copper'],
		dom.cards['Copper'],
		dom.cards['Copper'],
		dom.cards['Copper'],
		dom.cards['Copper'],
		dom.cards['Copper'],
		dom.cards['Estate'],
		dom.cards['Estate'],
		dom.cards['Estate']
	];
};


dom.cards.drawKingdom = function() {
	return [
		dom.cards['Cellar'],
		dom.cards['Chapel'],
		dom.cards['Chancellor'],
		dom.cards['Village'],
		dom.cards['Woodcutter'],
		dom.cards['Gardens'],
		dom.cards['Moneylender'],
		dom.cards['Workshop'],
		dom.cards['Bureaucrat']
	];
};

dom.cards.treasureValues = {
	'Gold': 3,
	'Silver': 2,
	'Copper': 1
};


// the kingdom cards

//#		Card			Set	Card Type				Cost	Rules
//1		*Cellar			Base	Action				$2	+1 Action, Discard any number of cards. +1 Card per card discarded.
//2		*Chapel			Base	Action				$2	Trash up to 4 cards from your hand.
//3		Moat			Base	Action - Reaction	$2	+2 Cards, When another player plays an Attack card, you may reveal this from your hand. If you do, you are unaffected by that Attack.
//4		*Chancellor		Base	Action				$3	+2 Coins, You may immediately put your deck into your discard pile.
//5		*Village		Base	Action				$3	+1 Card, +2 Actions.
//6		*Woodcutter		Base	Action				$3	+1 Buy, +2 Coins.
//7		*Workshop		Base	Action				$3	Gain a card costing up to 4 Coins.
//8		*Bureaucrat		Base	Action - Attack		$4	Gain a silver card; put it on top of your deck. Each other player reveals a Victory card from his hand and puts it on his deck (or reveals a hand with no Victory cards).
//9		Feast			Base	Action				$4	Trash this card. Gain a card costing up to 5 Coins.
//10	*Gardens		Base	Victory				$4	Variable, Worth 1 Victory for every 10 cards in your deck (rounded down).
//11	Militia			Base	Action - Attack		$4	+2 Coins, Each other player discards down to 3 cards in his hand.
//12	*Moneylender	Base	Action				$4	Trash a Copper from your hand. If you do, +3 Coins.
//13	Remodel			Base	Action				$4	Trash a card from your hand. Gain a card costing up to 2 Coins more than the trashed card.
//14	Smithy			Base	Action				$4	+3 Cards.
//15	Spy				Base	Action - Attack		$4	+1 Card, +1 Action, Each player (including you) reveals the top card of his deck and either discards it or puts it back, your chouce.
//16	Thief			Base	Action - Attack		$4	Each other player reveals the top 2 cards of his deck. If they revealed any Treasure cards, they trash one of them that you choose. You may gain any or all of these trashed cards. They discard the other revealed cards.
//17	Throne Room		Base	Action				$4	Choose an Action card in your hand. Play it twice.
//18	Council Room	Base	Action				$5	+4 Cards, +1 Buy, Each other player draws a card.
//19	Festival		Base	Action				$5	+2 Actions, +1 Buy, +2 Coins.
//20	Laboratory		Base	Action				$5	+2 Cards, +1 Action.
//21	Library			Base	Action				$5	Draw until you have 7 cards in hand. You may set aside any Action cards drawn this way, as you draw them; discard the set aside cards after you finish drawing.
//22	Market			Base	Action				$5	+1 Card, +1 Action, +1 Buy, +1 Coin.
//23	Mine			Base	Action				$5	Trash a Treasure card from your hand. Gain a Treasure card costing up to 3 Coins more; put it into your hand.
//24	Witch			Base	Action - Attack		$5	+2 Cards, Each other player gains a Curse card.
//25	Adventurer		Base	Action				$6	Reveal cards from your deck until you reveal 2 Treasure cards. Put those Treasure cards in your hand and discard the other revealed cards.

exports.cards = dom.cards;
exports.card = dom.card;


