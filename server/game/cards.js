
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
rules.plusCoin = function(amount) {
	return function(p,c) {
		p.coin += amount;
		p.logMe('gains +' + amount + ' Coin.');
		if(c) c();
	};
};
/** @param {number} */
rules.plusBuys = function(amount) {
	return function(p,c) {
		p.buys += amount;
		p.logMe('gains +' + amount + ' Buy' + (amount > 1 ? 's' : '') + '.');
		if(c) c();
	};
};
/** @param {number} */
rules.plusActions = function(amount) {
	return function(p,c) {
		p.actions += amount;
		p.logMe('gains +' + amount + ' Action' + (amount > 1 ? 's' : '') + '.');
		if(c) c();
	};
};
/** @param {number} */
rules.plusCards = function(amount) {
	return function(p,c) {
		for(var i=0; i < amount; i++) {
			p.draw();
		}
		p.logMe('draws ' + amount + ' card' + (amount > 1 ? 's' : '') + '.');
		if(c) c();
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

// f has type (player whose turn it is, target player, continuation)

rules.everyOtherPlayer = function(inParallel, isAttack, f) {
	return rules.everyPlayer(false, inParallel, isAttack, f);
};

rules.everyPlayer = function(includeMe, inParallel, isAttack, f) {
	if(inParallel) {
		return function(p, c) {
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
				var savedBy = p.game_.players[i].safeFromAttack();
				if((includeMe && p.id_ == p.game_.players[i].id_)
				|| (p.id_ != p.game_.players[i].id_ && 
					 (!isAttack || !savedBy))){
					sent++;
					f(p, p.game_.players[i], cont);
				} else if(isAttack && savedBy) {
					p.game_.players[i].logMe('is protected by ' + savedBy + '.');
				}
			}

			doneSending = true;
			if(completed >= sent) {
				c(); // they've all returned already
			}

			// otherwise I just return and wait for the continuations to do their thing.
		};
	} else {
		return function(p, c) {
			var repeat = function(index) {
				if(index >= p.game_.players.length) {
					c();
					return;
				}

				if(!includeMe && p.game_.players[index].id_ == p.id_) {
					repeat(index+1);
					return;
				}

				var savedBy = p.game_.players[index].safeFromAttack();
				if(isAttack && savedBy) {
					p.game_.players[index].logMe('is protected by ' + savedBy + '.');
				} else {
					f(p, p.game_.players[index], function() {
						repeat(index+1);
					});
				}
			};

			repeat(0);
		};
	}
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
dom.cards['Duchy']    = new dom.card('Duchy',    { 'Victory': 1 }, 5, '', rules.nullRule);
dom.cards['Estate']   = new dom.card('Estate',   { 'Victory': 1 }, 2, '', rules.nullRule);
dom.cards['Curse']    = new dom.card('Curse',    { 'Curse': 1 },   0, '', rules.nullRule);


// and now the kingdom cards
dom.cards['Cellar'] = new dom.card('Cellar', { 'Action': 1 }, 2, '+1 Action. Discard any number of cards. +1 Card per card discarded.', [
	rules.plusActions(1),
	rules.discardMany(function(p, c, discarded) {
		p.logMe('draws ' + discarded.length + ' card' + (discarded.length == 1 ? '' : 's') + '.');
		p.draw(discarded.length);
		c();
	})
]);

dom.cards['Chapel'] = new dom.card('Chapel', { 'Action': 1 }, 2, 'Trash up to 4 cards from your hand.', [
	rules.repeatUpTo(4, 'Choose a card to trash.', 'Done trashing', function(p) {
		return dom.utils.cardsToOptions(p.hand_);
	}, function(p, index) {
		var card = p.hand_[index];
		p.logMe('trashes ' + card.name + '.');
		p.removeFromHand(index); // remove it and don't put it anywhere
	})
]);

dom.cards['Chancellor'] = new dom.card('Chancellor', { 'Action': 1}, 3, '+2 Coins. You may immediately put your deck into your discard pile.', [
	rules.plusCoin(2),
	rules.yesNo('Do you want to move your deck to your discard pile?', function(p) {
		dom.utils.append(p.discards_, p.deck_);
		p.deck_ = [];
		p.logMe('moves their deck to their discard pile.');
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
				p.logMe('trashes a Copper for +3 Coin.');
				p.removeFromHand(i);
				p.coin += 3;
				break;
			}
		}
	}, function(p){ }))
]);

dom.cards['Workshop'] = new dom.card('Workshop', { 'Action': 1 }, 3, 'Gain a card costing up to 4 Coin.', [
	function(p, c) {
		dom.utils.gainCardDecision(p, 'Gain a card costing up to 4 Coin', 'Gain nothing', [], function(card) { return card.cost <= 4; },
			function(repeat) { 
				return dom.utils.decisionHelper(
					function() {
						p.logMe('chooses to gain nothing.');
						c();
					},
					function(index) {
						p.buyCard(index, true);
						c();
					}, repeat);
			});
	}]);

dom.cards['Bureaucrat'] = new dom.card('Bureaucrat', { 'Action': 1, 'Attack': 1 }, 4, 'Gain a Silver card; put it on top of your deck. Each other player reveals a Victory card from his hand and puts it on his deck (or reveals a hand with no Victory cards).', [
	rules.gainCard('Silver', function(p,card) { p.deck_.push(card); }),
	rules.everyOtherPlayer(true, true, function(active, p, c) {
		var victoryCards = p.hand_.filter(function(card) { return card.types['Victory']; });
		if(victoryCards.length == 0) {
			var names = [];
			for(var i = 0; i < p.hand_.length; i++) {
				names.push(p.hand_[i].name);
			}
			p.logMe('reveals a hand with no Victory cards: ' + names.join(', '));
			c();
		} else if(victoryCards.length == 1) {
			p.logMe('puts a ' + victoryCards[0].name + ' from their hand on top of their deck.');
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
			// check if there are actually different kinds of Victory cards. Only need to ask if there's variety.
			var types = {};
			var numTypes = 0;
			for(var i = 0; i < victoryCards.length; i++) {
				if(!types[victoryCards[i].name]) {
					numTypes++;
				}
				types[victoryCards[i].name] = 1;
			}

			if(numTypes > 1) {
				// have to ask that player to decide which one to discard
				console.log('Asking Player ' + p.id_ + ' for a decision.');
				dom.utils.handDecision(p, 'Player ' + active.id_ + ' has played a Bureaucrat. Choose a Victory card from your hand to put on top of your deck.', null,
					function(c) { return c.types['Victory']; },
					function(index) {
						var card = p.hand_[index];
						p.logMe('puts a ' + card.name + ' from their hand on top of their deck.');
						p.removeFromHand(index);
						p.deck_.push(card);
						c();
					}, c);
			} else {
				p.logMe('puts a ' + victoryCards[0].name + ' from their hand on top of their deck.');
				for(var i = 0; i < p.hand_.length; i++) {
					if(p.hand_[i].types['Victory']) {
						var card = p.hand_[i];
						p.removeFromHand(i);
						p.deck_.push(card); // on top
						break;
					}
				}
				c();
			}
		}
	})
]);

dom.cards['Feast'] = new dom.card('Feast', { 'Action': 1 }, 4, 'Trash this card. Gain a card costing up to 5 Coin.', [
	function(p,c) {
		var card = p.inPlay_[p.inPlay_.length-1];
		if(card.name == 'Feast') {
			p.logMe('trashes Feast.');
			p.inPlay_.pop();
		} else {
			p.logMe('is unable to trash Feast.');
		}
		c();
	},
	function(p,c) {
		dom.utils.gainCardDecision(p, 'Gain a card costing up to 5 Coin', 'Gain nothing', [], function(card) { return card.cost <= 5; },
			function(repeat) {
				return dom.utils.decisionHelper(
					function() { c(); },
					function(index) {
						p.buyCard(index, true);
						c();
					}, repeat);
			});
	}]);

dom.cards['Moat'] = new dom.card('Moat', { 'Action': 1, 'Reaction': 1 }, 2, '+2 Cards. When another player plays an Attack card, you may reveal this from your hand. If you do, you are unaffected by that Attack.', [
	rules.plusCards(2)
]);

dom.cards['Militia'] = new dom.card('Militia', { 'Action': 1, 'Attack': 1 }, 4, '+2 Coin. Each other player discards down to 3 cards in his hand.', [
	rules.plusCoin(2),
	rules.everyOtherPlayer(true, true, function(active, p, c) {
		var repeat = function() {
			if(p.hand_.length <= 3) {
				c();
				return;
			}

			dom.utils.handDecision(p, 'Player ' + active.id_ + ' has played Militia. Discard down to 3 cards in your hand.', null, dom.utils.const(true),
				function(index) {
					p.discard(index);
					repeat();
				}, null);
		};

		repeat();
	})
]);

dom.cards['Remodel'] = new dom.card('Remodel', { 'Action': 1 }, 4, 'Trash a card from your hand. Gain a card costing up to 2 Coins more than the trashed card.', [
	function(p, c) {
		dom.utils.handDecision(p, 'Choose a card to trash for Remodel.', 'Do not trash anything (and gain no card).', dom.utils.const(true),
			function(index) {
				var card = p.hand_[index];
				p.logMe('trashes ' + card.name + '.');
				p.removeFromHand(index);
				var maxCost = card.cost + 2;

				dom.utils.gainCardDecision(p, 'Choose a card to gain (max value ' + maxCost + ')', 'Do not gain anything.', [], function(c){ return c.cost <= maxCost; },
					function(repeat) {
						return dom.utils.decisionHelper(
							function() {
								p.logMe('chooses to gain nothing.');
								c();
							},
							function(index) {
								p.buyCard(index, true);
								c();
							},
							repeat);
					});
			}, c);
	}
]);

dom.cards['Smithy'] = new dom.card('Smithy', { 'Action': 1 }, 4, '+3 Cards.', [ rules.plusCards(3) ]);

dom.cards['Spy'] = new dom.card('Spy', { 'Action': 1, 'Attack': 1 }, 4, '+1 Card, +1 Action. Each player (including you) reveals the top card of his deck and either discards it or puts it back, your choice.', [
	rules.plusCards(1),
	rules.plusActions(1),
	rules.everyPlayer(true, false, true, function(active, p, c) {
		var options = [
			new dom.Option('back', 'Put it back on the deck'),
			new dom.Option('discard', 'Discard it')
		];

		if(p.deck_.length == 0) {
			p.shuffleDiscards_();
		}
		var card = p.deck_.pop();
		p.logMe('reveals ' + card.name + '.');
		var isMe = active.id_ == p.id_;
		var dec = new dom.Decision(active, options, (isMe ? 'You' : 'Player ' + p.id_) + ' had a ' + card.name + ' on top of ' + (isMe ? 'your' : 'his') + ' deck.', []);
		p.game_.decision(dec, function(key) {
			if(key == 'back') {
				p.deck_.push(card);
				active.logMe('chooses to put it back.');
			} else {
				p.discards_.push(card);
				active.logMe('chooses to discard it.');
			}
			c();
		});
	})
]);

dom.cards['Thief'] = new dom.card('Thief', { 'Action': 1, 'Attack': 1 }, 4, 'Each other player reveals the top 2 cards of his deck. If they revealed any Treasure cards, they trash one of them that you choose. You may gain any or all of these trashed cards. They discard the other revealed cards.', [
	rules.everyOtherPlayer(true, false, function(active, p, c) {
		if(p.deck_.length == 0){
			p.shuffleDiscards_();
		}
		var cards = [];
		cards.push(p.deck_.pop());
		if(p.deck_.length == 0) {
			p.shuffleDiscards_();
		}
		cards.push(p.deck_.pop());

		p.logMe('revealed ' + cards[0].name + ' and ' + cards[1].name + '.');

		var options = [];
		if(cards[0].types['Treasure']) {
			options.push(new dom.Option('trash0', 'Trash ' + cards[0].name));
			options.push(new dom.Option('keep0', 'Take ' + cards[0].name));
		}
		if(cards[1].types['Treasure']) {
			options.push(new dom.Option('trash1', 'Trash ' + cards[1].name));
			options.push(new dom.Option('keep1', 'Take ' + cards[1].name));
		}
		
		if(options.length > 0) {
			var dec = new dom.Decision(active, options, 'Choose what to do with the Player ' + p.id_ + '\'s revealed Treasures.', []);
			active.game_.decision(dec, function(key) {
				if(key == 'trash0') {
					active.logMe('trashes ' + cards[0].name + '.');
					p.discards_.push(cards[1]);
				} else if(key == 'keep0') {
					active.logMe('keeps ' + cards[0].name + '.');
					active.discards_.push(cards[0]);
					p.discards_.push(cards[1]);
				} else if(key == 'trash1') {
					active.logMe('trashes ' + cards[1].name + '.');
					p.discards_.push(cards[0]);
				} else if(key == 'keep1') {
					active.logMe('keeps ' + cards[1].name + '.');
					active.discards_.push(cards[1]);
					p.discards_.push(cards[0]);
				}
				c();
			});
		} else {
			c();
		}
	})
]);


dom.cards['Throne Room'] = new dom.card('Throne Room', { 'Action': 1 }, 4, 'Choose an Action card in your hand. Play it twice.', [
	function(p, c) {
		dom.utils.handDecision(p, 'Choose an Action card from your hand to be played twice.', 'Play nothing', function(card) { return card.types['Action']; },
			function(index) {
				var card = p.hand_[index];
				p.removeFromHand(index);
				p.inPlay_.push(card);

				p.logMe('uses Throne Room on ' + card.name + '.');

				var rulesList;
				if(typeof card.rules == 'object') { // array 
					rulesList = card.rules;
				} else {
					rulesList = [ card.rules ]; // just a function
				}

				if(!rulesList) {
					c();
					return;
				}

				// gotta copy since we're going to consume them
				for(var i = 0; i < rulesList.length; i++) {
					p.rules_.push(rulesList[i]);
				}
				for(var i = 0; i < rulesList.length; i++) {
					p.rules_.push(rulesList[i]);
				}
				c(); // returns to runRules
			}, c);
	}
]);


dom.cards['Council Room'] = new dom.card('Council Room', { 'Action': 1 }, 5, '+4 Cards. +1 Buy. Each other player draws a card.', [
	rules.plusCards(4),
	rules.plusBuys(1),
	rules.everyOtherPlayer(false, true, function(active, p, c) {
		var f = rules.plusCards(1);
		f(p,c);
	})
]);


dom.cards['Festival'] = new dom.card('Festival', { 'Action': 1 }, 5, '+2 Actions. +1 Buy. +2 Coin.', [
	rules.plusActions(2),
	rules.plusBuys(1),
	rules.plusCoin(2)
]);


dom.cards['Laboratory'] = new dom.card('Laboratory', { 'Action': 1 }, 5, '+2 Cards. +1 Action.', [
	rules.plusCards(2),
	rules.plusActions(1)
]);


dom.cards['Library'] = new dom.card('Library', { 'Action': 1 }, 5, 'Draw until you have 7 cards in hand. You may set aside any Action cards drawn this way, as you draw them; discard the set aside cards after you finish drawing.', [
	function(p,c) {
		var repeat = function() {
			if(p.hand_.length >= 7) {
				p.logMe('has 7 cards in hand, done drawing for Library.');
				c();
				return;
			}

			if(p.deck_.length == 0) {
				p.shuffleDiscards_();
			}
			if(p.deck_.length == 0) { // they've run out of cards, so stop trying to draw.
				p.logMe('is out of cards in their deck.');
				c();
				return;
			}

			var card = p.deck_.pop();
			if(card.types['Action']) {
				var options = [
					new dom.Option('take', 'Take into your hand'),
					new dom.Option('discard', 'Discard')
				];

				var dec = new dom.Decision(p, options, 'You drew an Action, ' + card.name + '. You can either draw it into your hand or discard it.', []);
				p.game_.decision(dec, function(key) {
					if(key == 'take') {
						p.logMe('draws a card.');
						p.hand_.push(card);
					} else {
						p.logMe('sets aside ' + card.name + '.');
						p.discards_.push(card);
					}
					repeat();
				});
			} else {
				p.logMe('draws a card.');
				p.hand_.push(card);
				repeat();
			}
		};
		repeat();
	}
]);


dom.cards['Mine'] = new dom.card('Mine', { 'Action': 1 }, 5, 'Trash a Treasure card from your hand. Gain a Treasure card costing up to 3 Coin more; put it into your hand.', [
	function(p,c) {
		dom.utils.handDecision(p, 'Choose a Treasure card from your hand to trash.', 'Trash nothing', function(card){ return card.types['Treasure']; },
			function(index) {
				var card = p.hand_[index];
				p.removeFromHand(index);
				if(card.name == 'Copper') {
					p.logMe('trashes Copper for Silver.');
					p.hand_.push(dom.cards['Silver']);
				} else if(card.name == 'Silver') {
					p.logMe('trashes Silver for Gold.');
					p.hand_.push(dom.cards['Gold']);
				} else {
					p.logMe('trashes Gold for Gold.');
					p.hand_.push(dom.cards['Gold']);
				}
				c();
			}, c);
	}
]);

dom.cards['Market'] = new dom.card('Market', { 'Action': 1 }, 5, '+1 Card, +1 Action, +1 Buy, +1 Coin.', [
	rules.plusCards(1),
	rules.plusActions(1),
	rules.plusBuys(1),
	rules.plusCoin(1)
]);


dom.cards['Witch'] = new dom.card('Witch', { 'Action': 1, 'Attack': 1 }, 5, '+2 Cards. Each other player gains a Curse card.', [
	rules.plusCards(2),
	rules.everyOtherPlayer(true, true, function(active, p, c) {
		p.buyCard(p.game_.indexInKingdom('Curse'), true);
		c();
	})
]);

dom.cards['Adventurer'] = new dom.card('Adventurer', { 'Action': 1 }, 6, 'Reveal cards from your deck until you reveal 2 Treasure cards. Put those Treasure cards in your hand and discard the other revealed cards.', [
	function(p, c) {
		if(p.deck_.length == 0) {
			p.shuffleDiscards_();
		}

		var toGo = 2;
		while(toGo > 0 && p.deck_.length > 0) {
			var card = p.deck_.pop();
			p.logMe('reveals ' + card.name + '.');
			if(card.types['Treasure']) {
				toGo--;
				p.hand_.push(card);
			} else {
				p.discards_.push(card);
			}

			if(p.deck_.length == 0) {
				p.shuffleDiscards_();
			}
		}
		
		p.logMe('is done drawing for Adventurer.');
		c();
	}
]);


// Seaside

dom.cards['Embargo'] = new dom.card('Embargo', { 'Action': 1 }, 2, '+2 Coin. Trash this card. Put an Embargo token on top of a Supply pile. When a player buys a card, he gains a Curse card per Embargo token on that pile.', [
	rules.plusCoin(2),
	function(p,c) {
		if(p.inPlay_.length > 0 && p.inPlay_[p.inPlay_.length-1].name == 'Embargo') {
			p.inPlay_.pop(); // trash
		}

		var options = [];
		for(var i = 0; i < p.game_.kingdom.length; i++) {
			var inKingdom = p.game_.kingdom[i];
			if(inKingdom.count > 0) {
				options.push(new dom.Option('card[' + i + ']', inKingdom.card.name + 
					(inKingdom.embargoTokens ? ' (' + inKingdom.embargoTokens + ' Embargo token' + (inKingdom.embargoTokens > 1 ? 's' : '') + ')' : '')));
			}
		}

		var dec = new dom.Decision(p, options, 'Choose a Supply pile to place an Embargo token on.', []);
		p.game_.decision(dec, dom.utils.decisionHelper(dom.utils.nullFunction, function(index) {
			var inKingdom = p.game_.kingdom[index];
			if(inKingdom.embargoTokens) {
				inKingdom.embargoTokens++;
			} else {
				inKingdom.embargoTokens = 1;
			}

			p.logMe('Embargoes ' + inKingdom.card.name + '. Now ' + inKingdom.embargoTokens + ' Embargo token' + (inKingdom.embargoTokens > 1 ? 's' : '') + ' on that pile.');
			c();
		}, c));
	}
]);


dom.cards['Haven'] = new dom.card('Haven', { 'Action': 1, 'Duration': 1 }, 2, '+1 Card, +1 Action. Set aside a card from your hand face down. At the start of your next turn, put it into your hand.', [
	rules.plusCards(1),
	rules.plusActions(1),
	function(p, c) {
		if(p.hand_.length <= 0) {
			p.logMe('has no cards left to set aside.');
			c();
			return;
		}

		dom.utils.handDecision(p, 'Choose a card from your hand to set aside for next turn.', null, dom.utils.const(true),
			function(index) {
				var card = p.hand_[index];
				if(!p.temp['havenCards']) p.temp['havenCards'] = [];
				p.temp['havenCards'].push(p.hand_[index]);
				p.logMe('sets aside a card.');
				c();
			}, c);

		p.durationRules.push({ name: 'Haven', rules: [ function(p) {
			if(p.temp['havenCards'] && p.temp['havenCards'].length > 0) {
				for(var i = 0; i < p.temp['havenCards'].length; i++) {
					p.hand_.push(p.temp['havenCards'][i]);
				}
				p.logMe('draws ' + p.temp['havenCards'].length + ' card' + (p.temp['havenCards'].length > 1 ? 's' : '') + ' set aside with Haven.');
				p.temp['havenCards'] = [];
			}
		} ]});
	}
]);


dom.cards['Lighthouse'] = new dom.card('Lighthouse', { 'Action': 1, 'Duration': 1 }, 2, '+1 Action, Now and at the start of your next turn: +1 Coin. - While this is in play, when another player plays an Attack card, it doesn\'t affect you.', [
	rules.plusActions(1),
	rules.plusCoin(1),
	function(p, c) {
		p.durationRules.push({ name: 'Lighthouse', rules: [ rules.plusCoin(1) ]});
		c();
	}
]);


dom.cards['Native Village'] = new dom.card('Native Village', { 'Action': 1 }, 2, '+2 Actions. Choose one: Set aside the top card of your deck face down on your Native Village mat; or put all the cards from your mat into your hand. You may look at the cards on your mat at any time; return them to your deck at the end of the game.', [
	rules.plusActions(2),
	function(p, c) {
		// first need to ask what the user wants to do
		var options = [ new dom.Option('setaside', 'Set aside the top card of your deck on your Native Village mat.'),
		                new dom.Option('intohand', 'Put all the cards on your Native Village mat into your hand.') ];

		var dec = new dom.Decision(p, options, 'You have played Native Village. Choose which of its options to take.', []);
		var repeat = function() {
			p.game_.decision(dec, function(key) {
				if(key == 'setaside') {
					p.logMe('sets aside the top card of their deck.');
					if(!p.temp['Native Village mat']) p.temp['Native Village mat'] = [];
					p.draw(); // draws into hand, but deals with the shuffling
					var card = p.hand_.pop();
					p.client.send({ log: ['The top card was ' + card.name + '.' ]});
					p.temp['Native Village mat'].push(card);
					c();
				} else if(key == 'intohand') {
					var mat = p.temp['Native Village mat'];
					p.logMe('puts the ' + mat.length + ' cards from their Native Village mat into their hand.');
					for(var i = 0; i < mat.length; i++) {
						p.hand_.push(mat[i]);
					}

					p.temp['Native Village mat'] = [];
					c();
				} else {
					repeat();
				}
			});
		};

		repeat();
	}
]);


dom.cards['Pearl Diver'] = new dom.card('Pearl Diver', { 'Action': 1 }, 2, '+1 Card, +1 Action. Look at the bottom card of your deck. You may put it on top.', [
	rules.plusCards(1),
	rules.plusActions(1),
	function(p, c) {
		if(p.deck_.length <= 0) {
			p.shuffleDiscards();
		}

		if(p.deck_.length <= 0) {
			p.logMe('has no deck to look at.');
			c();
			return;
		}

		var yn = rules.yesNo('The bottom card of your deck was ' + p.deck_[0].name + '. Place it on top of your deck?',
			function(p) {
				p.deck_.push(p.deck_.shift());
				p.logMe('puts the bottom card of his deck on top.');
			}, function(p) {
				p.logMe('leaves the bottom card of his deck on the bottom.');
			}
		);

		yn(p,c);
	}
]);


dom.cards['Ambassador'] = new dom.card('Ambassador', { 'Action': 1, 'Attack': 1 }, 3, 'Reveal a card from your hand. Return up to 2 copies of it from your hand to the Supply. Then each other player gains a copy of it.', [
	function(p, c) {
		dom.utils.handDecision(p, 'Choose a card to reveal.', null, dom.utils.const(true),
			function(index) {
				var card = p.hand_[index];
				p.logMe('reveals ' + card.name + '.');
				var count = p.hand_.filter(function(c) { return c.name == card.name; }).length;
				
				var options = [
					new dom.Option('0', 'None'),
					new dom.Option('1', 'One') ];
				if(count > 1) {
					options.push(new dom.Option('2', 'Two'));
				}

				var kingdomIndex = p.game_.indexInKingdom(card.name);
				var inKingdom = p.game_.kingdom[kingdomIndex];

				var dec = new dom.Decision(p, options, 'Choose how many copies of ' + card.name + ' to return to the Supply pile.', []);
				p.game_.decision(dec, function(key) {
					var removed = 0;
					console.log('result');
					for(var i = 0; i < p.hand_.length && removed < key; i++) {
						if(p.hand_[i].name == card.name) {
							console.log('removing one');
							p.removeFromHand(i);
							inKingdom.count++;
							removed++;
						}
					}
					console.log('done');

					var strs = {
						0: 'no copies',
						1: 'one copy',
						2: 'two copies'
					};
					p.logMe('removes ' + strs[key] + ' of ' + card.name + ' from their hand.');

					var f = rules.everyOtherPlayer(false, true, function(active, p, c) {
						console.log('other player');
						p.buyCard(kingdomIndex, true);
						c();
					});
					f(p, c);
				});
			}, c);
	}
]);


dom.cards['Fishing Village'] = new dom.card('Fishing Village', { 'Action': 1, 'Duration': 1 }, 3, '+2 Actions, +1 Coin. At the start of your next turn: +1 Action, +1 Coin.', [
	rules.plusActions(2),
	rules.plusCoin(1),
	function(p, c) {
		p.durationRules.push({ name: 'Fishing Village', rules: [ rules.plusActions(1), rules.plusCoin(1) ] });
		c();
	}
]);


dom.cards['Lookout'] = new dom.card('Lookout', { 'Action': 1 }, 3, '+1 Action. Look at the top 3 cards of your deck. Trash one of them. Discard one of them. Put the other one on top of your deck.', [
	rules.plusActions(1),
	function(p,c) {
		// abuse draw() again
		var drawn = p.draw(3);
		var cards = [];
		for(var i = 0; i < drawn; i++) {
			cards.push(p.hand_.pop());
		}

		var options = dom.utils.cardsToOptions(cards);
		var dec = new dom.Decision(p, options, 'You have played Lookout. You must choose one card to trash, one to discard, and one to put back on your deck. Choose first the card to trash.', []);
		p.game_.decision(dec, dom.utils.decisionHelper(c, function(index) {
			p.logMe('trashes ' + cards[index].name + '.');
			var cards2 = [];
			for(var i = 0; i < cards.length; i++) {
				if(i != index) {
					cards2.push(cards[i]);
				}
			}

			if(cards2.length == 0) {
				p.logMe('has no cards remaining for Lookout.');
				c();
				return;
			}

			var options = dom.utils.cardsToOptions(cards2);
			var dec = new dom.Decision(p, options, 'You must now choose a card to discard.', []);
			p.game_.decision(dec, dom.utils.decisionHelper(c, function(index) {
				p.logMe('discards ' + cards2[index].name + '.');
				p.discards_.push(cards2[index]);

				if(cards2.length > 1) {
					var deckIndex = index == 1 ? 0 : 1;
					p.deck_.push(cards2[deckIndex]);
				}

				c();
			}, c));
		}, c));
	}
]);


dom.cards['Smugglers'] = new dom.card('Smugglers', { 'Action': 1 }, 3, 'Gain a copy of a card costing up to 6 Coins that the player to your right gained on his last turn.', [
	function(p, c) {
		var index;
		for(var i = 0; i < p.game_.players.length; i++) {
			if(p.id_ == p.game_.players[i].id_) {
				index = i;
				break;
			}
		}

		index--;
		if(index < 0) {
			index = p.game_.players.length - 1;
		}

		var other = p.game_.players[index];

		var gained = other.temp['gainedLastTurn'];

		gained = gained.unique(function(x,y) { return x.name == y.name; }).filter(function(c) { return c.cost <= 6; });

		if(gained.length == 0) {
			other.logMe('gained no valid cards last turn.');
			c();
			return;
		}

		var map = {};
		for(var i = 0; i < gained.length; i++) {
			map[gained[i].name] = p.game_.indexInKingdom(gained[i].name);
		}

		var options = gained.map(function(c) { return new dom.Option(c.name, c.name); });
		var dec = new dom.Decision(p, options, 'Choose a card to gain from those that ' + other.name + ' gained last turn.', []);
		p.game_.decision(dec, function(key) {
			p.buyCard(map[key], true);
			c();
		});
	}
]);
		

dom.cards['Warehouse'] = new dom.card('Warehouse', { 'Action': 1 }, 3, '+3 Cards, +1 Action. Discard 3 cards.', [
	rules.plusCards(3),
	rules.plusActions(1),
	function(p, c) {
		var discard = function(count) {
			if(count <= 0) {
				c();
				return;
			}

			dom.utils.handDecision(p, 'Choose a card to discard.', null, dom.utils.const(true), function(index) {
				p.logMe('discards ' + p.hand_[index].name + '.');
				p.removeFromHand(index);

				discard(count-1);
			}, c);
		};

		discard(3);
	}
]);


dom.cards['Caravan'] = new dom.card('Caravan', { 'Action': 1, 'Duration': 1 }, 4, '+1 Card, +1 Action. At the start of your next turn, +1 Card.', [
	rules.plusCards(1),
	rules.plusActions(1),
	function(p,c) {
		p.durationRules.push({ name: 'Caravan', rules: [ rules.plusCards(1) ] });
		c();
	}
]);


dom.cards['Cutpurse'] = new dom.card('Cutpurse', { 'Action': 1, 'Attack': 1 }, 4, '+2 Coin. Each other player discards a Copper card (or reveals a hand with no Copper).', [
	rules.plusCoin(2),
	rules.everyOtherPlayer(true, true, function(active, p, c) {
		var coppers = p.hand_.filter(function(c) { return c.name == 'Copper'; });
		if(coppers.length > 0) {
			p.logMe('discards a Copper.');
			for(var i = 0; i < p.hand_.length; i++) {
				if(p.hand_[i].name == 'Copper') {
					p.removeFromHand(i);
					break;
				}
			}
		} else {
			p.logMe('reveals a hand with no Copper: ' + p.hand_.map(function(c) { return c.name; }).join(', '));
		}
		c();
	})
]);


dom.cards['Island'] = new dom.card('Island', { 'Action': 1, 'Victory': 1 }, 4, 'Set aside this and another card from your hand. Return them to your deck at the end of the game. 2 VP.', [
	function(p, c) {
		dom.utils.handDecision(p, 'Choose a card to set aside until the end of the game.', null, dom.utils.const(true),
			function(index) {
				var card = p.hand_[index];
				p.removeFromHand(index);
				if(!p.temp.islandSetAside) p.temp.islandSetAside = [];
				p.temp.islandSetAside.push(card);

				// and the Island too, if it wasn't Throme Room'd or whatever.
				if(p.inPlay_.length > 0 && p.inPlay_[p.inPlay_.length-1].name != 'Island') {
					p.temp.islandSetAside.push(p.inPlay_.pop());
				}

				p.logMe('sets aside Island and another card.');
				c();
			}, c);
	}
]);


dom.cards['Navigator'] = new dom.card('Navigator', { 'Action': 1 }, 4, '+2 Coin. Look at the top 5 cards of your deck. Either discard all of them, or put them back on top of your deck in any order.', [
	rules.plusCoin(2),
	function(p, c) {
		var drawn = p.draw(5);
		var cards = [];
		for(var i = 0; i < drawn; i++) {
			cards.push(p.hand_.pop());
		}

		var opts = [ new dom.Option('discard', 'Discard them all'), new dom.Option('keep', 'Put them back in any order') ];
		var dec = new dom.Decision(p, opts, 'Choose whether to discard or put back the cards below.', [cards.map(function(c) { return c.name; }).join(', ')]);
		var repeat = function() {
			p.game_.decision(dec, function(key) {
				if(key == 'discard') {
					for(var i = 0; i < cards.length; i++) {
						p.discards_.push(cards[i]);
					}
					c();
				} else if(key == 'keep') {
					var putBack = function(time, cards) {
						if(cards.length == 0) {
							c();
							return;
						}

						var opts = dom.utils.cardsToOptions(cards);
						var dec = new dom.Decision(p, opts, 'Choose the card to draw ' + (time == 1 ? 'first' : 'next') + '.', []);
						p.game_.decision(dec, dom.utils.decisionHelper(dom.utils.nullFunction, function(index) {
                            p.deck_.push(cards[index]);
                            var newcards = [];
                            for(var i = 0; i < cards.length; i++) {
                                if(i != index) {
                                    newcards.push(cards[i]);
                                }
                            }
                            putBack(time+1, newcards);
                        }, function() { c(); }));
                    };

                    putBack(1, cards);
                }
            });
        };

        repeat();
    }]);


dom.cards['Pirate Ship'] = new dom.card('Pirate Ship', { 'Action': 1, 'Attack': 1 }, 4, 'Choose one: Each other player reveals the top 2 cards of his deck, trashes a revealed Treasure that you choose, discards the rest, and if anyone trashed a Treasure you take a Coin token; or, +1 Coin per Coin token you\'ve taken with Pirate Ships this game.', [
	function(p, c) {
        if(!p.temp['Pirate Ship coins']) {
            p.temp['Pirate Ship coins'] = 0;
        }
        p.temp['Pirate Ship attack'] = 0;

        console.log(p);
        console.log('Top of Pirate Ship');

        var opts = [new dom.Option('attack', 'Attack the other players'), new dom.Option('coin', 'Gain ' + p.temp['Pirate Ship coins'] + ' Coin')];
        var dec = new dom.Decision(p, opts, 'Choose what to do with your Pirate Ship.', []);
        p.game_.decision(dec, function(key) {
            if(key == 'coin') {
                rules.plusCoin(p.temp['Pirate Ship coins'])(p,c);
            } else {
                var rule = rules.everyOtherPlayer(true, true, function(p, o, c) {
                    var drawn = o.draw(2);
                    if(!drawn) {
                        o.logMe('has no cards to draw.');
                        c();
                    }

                    var cards = [];
                    for(var i = 0; i < drawn; i++) {
                        cards.push(o.hand_.pop());
                    }

                    var treasure = cards.filter(function(x) { return x.types['Treasure']; });

                    var log = 'reveals ' + cards[0].name + (cards.length > 1 ? ' and ' + cards[1].name : '') + ', ';
                    
                    if(treasure.length == 0) {
                        o.logMe(log + 'discarding ' + (cards.length > 1 ? 'both' : 'it') + '.');
                        cards.map(o.discards_.push);
                        c();
                    } else if(treasure.length == 1) {
                        if(cards.length == 1) {
                            o.logMe(log + 'trashing it.');
                            p.temp['Pirate Ship attack']++;
                            c();
                        } else {
                            for(var i = 0; i < cards.length; i++) {
                                if(cards[i] != treasure[0]) {
                                    o.discards_.push(cards[i]);
                                    log += 'trashing the ' + treasure[0].name + ' and discarding the ' + cards[i].name + '.';
                                    p.temp['Pirate Ship attack']++;
                                }
                            }
                            o.logMe(log);
                            c();
                        }
                    } else {
                        var opts = dom.utils.cardsToOptions(cards);
                        var dec = new dom.Decision(p, opts, 'Choose which of ' + o.name + '\'s Treasures to trash', []);
                        p.game_.decision(dec, dom.utils.decisionHelper(o, function(index) {
                            p.logMe('trashes ' + o.name + '\'s ' + cards[index].name + '.');
                            o.discards_.push(cards[1-index]);
                            p.temp['Pirate Ship attack']++;
                            c();
                        }, c));
                    }
                });
                rule(p, function() {
                    if(p.temp['Pirate Ship attack'] > 0) {
                        p.temp['Pirate Ship coins']++;
                        p.logMe('gains a Pirate Ship token.');
                    }
                    c();
                });
            }
        });
    }
]);


dom.cards['Salvager'] = new dom.card('Salvager', { 'Action': 1 }, 4, '+1 Buy, Trash a card from your hand. +Coins equal to its cost.', [
    rules.plusBuys(1),
    function(p, c) {
        var opts = dom.utils.cardsToOptions(p.hand_);
        var dec = new dom.Decision(p, opts, 'Choose a card to trash. You will gain +Coins equal to its cost.', []);
        p.game_.decision(dec, dom.utils.decisionHelper(dom.utils.nullFunction, function(index) {
            var trashed = p.hand_[index];
            var cards = [];
            for(var i = 0; i < p.hand_.length; i++) {
                if(i != index) {
                    cards.push(p.hand_[i]);
                }
            }
            p.hand_ = cards;
            p.logMe('trashes ' + trashed.name + ', gaining +' + trashed.cost + ' Coins.');
            p.coin += trashed.cost;
            c();
        }, c));
    }
]);


dom.cards['Sea Hag'] = new dom.card('Sea Hag', { 'Action': 1, 'Attack': 1 }, 4, 'Each other player discards the top card of his deck, then gains a Curse card, putting it on top of his deck.', [
    rules.everyOtherPlayer(false, true, function(p, o, c) {
        var iCurse = p.game_.indexInKingdom('Curse');

        var log;
        var drawn = o.draw();
        if(!drawn) {
            log = 'has no top card to discard, ';
        } else {
            var discarded = o.hand_.pop();
            o.discards_.push(discarded);
            log = 'discards the top card of his deck (' + discarded.name + '), ';
        }

        if(p.game_.kingdom[iCurse].count > 0) {
            o.deck_.push(dom.cards['Curse']);
            o.game_.kingdom[iCurse].count--;
            o.logMe(log + 'putting a Curse on top of his deck.');
        } else {
            o.logMe(log + 'but there are no more Curses.');
        }
        c();
    })
]);


dom.cards['Treasure Map'] = new dom.card('Treasure Map', { 'Action': 1 }, 4, 'Trash this and another copy of Treasure Map from your hand. If you do trash two Treasure Maps, gain 4 Gold cards, putting them on top of your deck.', [
    function(p, c) {
        var another = false;
        var newhand = [];
        for(var i = 0; i < p.hand_.length; i++) {
            if(p.hand_[i].name == 'Treasure Map') {
                another = true;
            } else {
                newhand.push(p.hand_[i]);
            }
        }
        p.hand_ = newhand;

        var newInPlay = [];
        for(var i = 0; i < p.inPlay_.length; i++){
            if(p.inPlay_[i].name != 'Treasure Map') {
                newInPlay.push(p.inPlay_[i]);
            }
        }
        p.inPlay_ = newInPlay;

        if(another) {
            p.logMe('trashes two Treasure Maps, putting 4 Gold on top of his deck.');
            for(var i = 0; i < 4; i++) {
                p.deck_.push(dom.cards['Gold']);
            }
        }

        c();
    }
]);


dom.cards['Bazaar'] = new dom.card('Bazaar', { 'Action': 1 }, 5, '+1 Card, +2 Actions, +1 Coin.', [
    rules.plusCards(1),
    rules.plusActions(2),
    rules.plusCoin(1)
]);


dom.cards['Explorer'] = new dom.card('Explorer', { 'Action': 1 }, 5, 'You may reveal a Province card from your hand. If you do, gain a Gold card, putting it into your hand. Otherwise, gain a Silver card, putting it into your hand.', [
    function(p, c) {
        var provinces = p.hand_.filter(function(x) { return x.name == 'Province'; });
        var noProvince = function(p) {
            p.logMe('gains a Silver, putting it in his hand.');
            p.hand_.push(dom.cards['Silver']);
            console.log('noProvince callback');
        };

        if(provinces.length > 0) {
            var yn = rules.yesNo('Do you want to reveal a Province?', function(p) {
                p.logMe('reveals a Province card and gains a Gold, putting it in his hand.');
                p.hand_.push(dom.cards['Gold']);
                console.log('province callback');
            }, noProvince);
            yn(p, c);
        } else {
            noProvince(p);
            c();
        }
    }
]);


dom.cards['Ghost Ship'] = new dom.card('Ghost Ship', { 'Action': 1, 'Attack': 1 }, 5, '+2 Card. Each other player with 4 or more cards in hand puts cards from his hand on top of his deck until he has 3 cards in his hand.', [
    rules.plusCards(2),
    rules.everyOtherPlayer(true, true, function(p, o, c) {
        if(o.hand_.length < 4) {
            o.logMe('has fewer than 4 cards in his hand.');
            c();
            return;
        }

        var repeat = function() {
            if(o.hand_.length <= 3) {
                o.logMe('discards down to 3 cards in hand, putting the cards on top of his deck.');
                c();
                return;
            }

            var opts = dom.utils.cardsToOptions(o.hand_);
            var dec = new dom.Decision(o, opts, 'Choose a card to discard onto the top of your deck. You must discard down to 3 cards in hand.', []);
            o.game_.decision(dec, dom.utils.decisionHelper(dom.utils.nullFunction, function(index) {
                var newcards = [];
                for(var i = 0; i < o.hand_.length; i++) {
                    if(i == index) {
                        o.deck_.push(o.hand_[i]);
                    } else {
                        newcards.push(o.hand_[i]);
                    }
                }
                o.hand_ = newcards;

                repeat();
            }, dom.utils.nullFunction));
        };

        repeat();
    })
]);


dom.cards.starterDeck = function() {
	return [
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
	var all = [
		dom.cards['Cellar'],
		dom.cards['Chapel'],
		dom.cards['Moat'],
		dom.cards['Chancellor'],
		dom.cards['Village'],
		dom.cards['Woodcutter'],
		dom.cards['Workshop'],
		dom.cards['Bureaucrat'],
		dom.cards['Feast'],
		dom.cards['Gardens'],
		dom.cards['Militia'],
		dom.cards['Moneylender'],
		dom.cards['Remodel'],
		dom.cards['Smithy'],
		dom.cards['Spy'],
		dom.cards['Thief'],
		dom.cards['Throne Room'],
		dom.cards['Council Room'],
		dom.cards['Festival'],
		dom.cards['Laboratory'],
		dom.cards['Library'],
		dom.cards['Market'],
		dom.cards['Mine'],
		dom.cards['Witch'],
		dom.cards['Adventurer'],
	];

	var drawn = [];
	while(drawn.length < 10) {
		var n = Math.floor(Math.random() * 25);
		if(drawn.filter(function(c) { return c == n; }).length == 0) {
			drawn.push(n);
		}
	}

	drawn.sort(function(a,b){ return a-b; });
	return drawn.map(function(n) { return all[n]; });
};

dom.cards.treasureValues = {
	'Gold': 3,
	'Silver': 2,
	'Copper': 1
};

dom.cards.victoryValues = {
	'Estate': 1,
	'Duchy': 3,
	'Province': 6,
	'Island': 2
};

dom.cards.cardCount = function(card, players) {
	if(card.types['Victory']) {
		return players == 2 ? 8 : 12;
	} else if(card.name == 'Curse') {
		if(players == 2) return 10;
		else if(players == 3) return 20;
		else return 30;
	}
	return 10;
};

// converts cards to wire format (by removing the rules, basically)
dom.cards.wireCards = function(cards) {
	var ret = [];
	for(var i = 0; i < cards.length; i++) {
		ret.push({ name: cards[i].card.name, types: cards[i].card.types, cost: cards[i].card.cost, text: cards[i].card.text, count: cards[i].count });
	}
	return ret;
}

// the kingdom cards

//#		Card			Set	Card Type				Cost	Rules
//1		*Cellar			Base	Action				$2	+1 Action, Discard any number of cards. +1 Card per card discarded.
//2		*Chapel			Base	Action				$2	Trash up to 4 cards from your hand.
//3		*Moat			Base	Action - Reaction	$2	+2 Cards, When another player plays an Attack card, you may reveal this from your hand. If you do, you are unaffected by that Attack.
//4		*Chancellor		Base	Action				$3	+2 Coins, You may immediately put your deck into your discard pile.
//5		*Village		Base	Action				$3	+1 Card, +2 Actions.
//6		*Woodcutter		Base	Action				$3	+1 Buy, +2 Coins.
//7		*Workshop		Base	Action				$3	Gain a card costing up to 4 Coins.
//8		*Bureaucrat		Base	Action - Attack		$4	Gain a silver card; put it on top of your deck. Each other player reveals a Victory card from his hand and puts it on his deck (or reveals a hand with no Victory cards).
//9		*Feast			Base	Action				$4	Trash this card. Gain a card costing up to 5 Coins.
//10	*Gardens		Base	Victory				$4	Variable, Worth 1 Victory for every 10 cards in your deck (rounded down).
//11	*Militia		Base	Action - Attack		$4	+2 Coins, Each other player discards down to 3 cards in his hand.
//12	*Moneylender	Base	Action				$4	Trash a Copper from your hand. If you do, +3 Coins.
//13	*Remodel		Base	Action				$4	Trash a card from your hand. Gain a card costing up to 2 Coins more than the trashed card.
//14	*Smithy			Base	Action				$4	+3 Cards.
//15	*Spy			Base	Action - Attack		$4	+1 Card, +1 Action, Each player (including you) reveals the top card of his deck and either discards it or puts it back, your chouce.
//16	*Thief			Base	Action - Attack		$4	Each other player reveals the top 2 cards of his deck. If they revealed any Treasure cards, they trash one of them that you choose. You may gain any or all of these trashed cards. They discard the other revealed cards.
//17	*Throne Room	Base	Action				$4	Choose an Action card in your hand. Play it twice.
//18	*Council Room	Base	Action				$5	+4 Cards, +1 Buy, Each other player draws a card.
//19	*Festival		Base	Action				$5	+2 Actions, +1 Buy, +2 Coins.
//20	*Laboratory		Base	Action				$5	+2 Cards, +1 Action.
//21	*Library		Base	Action				$5	Draw until you have 7 cards in hand. You may set aside any Action cards drawn this way, as you draw them; discard the set aside cards after you finish drawing.
//22	*Market			Base	Action				$5	+1 Card, +1 Action, +1 Buy, +1 Coin.
//23	*Mine			Base	Action				$5	Trash a Treasure card from your hand. Gain a Treasure card costing up to 3 Coins more; put it into your hand.
//24	*Witch			Base	Action - Attack		$5	+2 Cards, Each other player gains a Curse card.
//25	*Adventurer		Base	Action				$6	Reveal cards from your deck until you reveal 2 Treasure cards. Put those Treasure cards in your hand and discard the other revealed cards.

// Seaside
//1		*Embargo		Seaside	Action				$2	+2 Coins, Trash this card. Put an Embargo token on top of a Supply pile. - When a player buys a card, he gains a Curse card per Embargo token on that pile.
//2		*Haven			Seaside	Action - Duration	$2	+1 Card, +1 Action, Set aside a card from your hand face down. At the start of your next turn, put it into your hand.
//3		*Lighthouse		Seaside	Action - Duration	$2	+1 Action, Now and at the start of your next turn: +1 Coin. - While this is in play, when another player plays an Attack card, it doesn't affect you.
//4		*Native Village	Seaside	Action				$2	+2 Actions, Choose one: Set aside the top card of your deck face down on your Native Village mat; or put all the cards from your mat into your hand. You may look at the cards on your mat at any time; return them to your deck at the end of the game.
//5		*Pearl Diver	Seaside	Action				$2	+1 Card, +1 Action, Look at the bottom card of your deck. You may put it on top.
//6		*Ambassador		Seaside	Action - Attack		$3	Reveal a card from your hand. Return up to 2 copies of it from your hand to the Supply. Then each other player gains a copy of it.
//7		*Fishing VillageSeaside	Action - Duration	$3	+2 Actions, +1 Coin, At the start of your next turn: +1 Action, +1 Coin.
//8		*Lookout		Seaside	Action				$3	+1 Action, Look at the top 3 cards of your deck. Trash one of them. Discard one of them. Put the other one on top of your deck.
//9		*Smugglers		Seaside	Action				$3	Gain a copy of a card costing up to 6 Coins that the player to your right gained on his last turn.
//10	*Warehouse		Seaside	Action				$3	+3 Card, +1 Action, Discard 3 cards.
//11	*Caravan		Seaside	Action - Duration	$4	+1 Card, +1 Action. At the start of your next turn, +1 Card.
//12	*Cutpurse		Seaside	Action - Attack		$4	+2 Coins, Each other player discards a Copper card (or reveals a hand with no Copper).
//13	*Island			Seaside	Action - Victory	$4	Set aside this and another card from your hand. Return them to your deck at the end of the game. 2 VP.
//14	Navigator		Seaside	Action				$4	+2 Coins, Look at the top 5 cards of your deck. Either discard all of them, or put them back on top of your deck in any order.
//15	Pirate Ship		Seaside	Action - Attack		$4	Choose one: Each other player reveals the top 2 cards of his deck, trashes a revealed Treasure that you choose, discards the rest, and if anyone trashed a Treasure you take a Coin token; or, +1 Coin per Coin token you've taken with Pirate Ships this game.
//16	Salvager		Seaside	Action				$4	+1 Buy, Trash a card from your hand. +Coins equal to its cost.
//17	Sea Hag			Seaside	Action - Attack		$4	Each other player discards the top card of his deck, then gains a Curse card, putting it on top of his deck.
//18	Treasure Map	Seaside	Action				$4	Trash this and another copy of Treasure Map from your hand. If you do trash two Treasure Maps, gain 4 Gold cards, putting them on top of your deck.
//19	Bazaar			Seaside	Action				$5	+1 Card, +2 Actions, +1 Coin.
//20	Explorer		Seaside	Action				$5	You may reveal a Province card from your hand. If you do, gain a Gold card, putting it into your hand. Otherwise, gain a Silver card, putting it into your hand.
//21	Ghost Ship		Seaside	Action - Attack		$5	+2 Card, Each other player with 4 or more cards in hand puts cards from his hand on top of his deck until he has 3 cards in his hand.
//22	Merchant Ship	Seaside	Action - Duration	$5	Now and at the start of your next turn: +2 Coins.
//23	Outpost			Seaside	Action - Duration	$5	You only draw 3 cards (instead of 5) in this turn's Clean-up phase. Take an extra turn after this one. This can't cause you to take more than two consecutive turns.
//24	Tactician		Seaside	Action - Duration	$5	Discard your hand. If you discarded any cards this way, then at the start of your next turn, +5 Cards, +1 Buy, and +1 Action.
//25	Treasury		Seaside	Action				$5	+1 Card, +1 Action, +1 Coin, When you discard this from play, if you didn't buy a Victory card this turn, you may put this on top of your deck.
//26	Wharf			Seaside	Action - Duration	$5	Now and at the start of your next turn: +2 Cards, +1 Buy.


exports.cards = dom.cards;
exports.card = dom.card;


