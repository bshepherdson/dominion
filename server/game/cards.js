
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
		p.game_.decision(dec, function(key) {
			if(key == 'done') {
				var discarded = p.temp.discarded;
				p.temp.discarded = [];
				callback(p, c, discarded);
			} else {
				var match = /\[(\d+)\]/.exec(key);
				if(match) {
					var index = match[1]; // [1] is the first capture group
					var card = p.discard(index);
					p.temp.discarded.push(card);
					internal(p, c);
				} else {
					internal(p, c);
				}
			}
		});
	};

	return internal;
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


dom.cards.starterDeck = function() {
	return [
		dom.cards['Cellar'],
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


// the kingdom cards

//#		Card			Set	Card Type				Cost	Rules
//1		Cellar			Base	Action				$2	+1 Action, Discard any number of cards. +1 Card per card discarded.
//2		Chapel			Base	Action				$2	Trash up to 4 cards from your hand.
//3		Moat			Base	Action - Reaction	$2	+2 Cards, When another player plays an Attack card, you may reveal this from your hand. If you do, you are unaffected by that Attack.
//4		Chancellor		Base	Action				$3	+2 Coins, You may immediately put your deck into your discard pile.
//5		Village			Base	Action				$3	+1 Card, +2 Actions.
//6		Woodcutter		Base	Action				$3	+1 Buy, +2 Coins.
//7		Workshop		Base	Action				$3	Gain a card costing up to 4 Coins.
//8		Bureaucrat		Base	Action - Attack		$4	Gain a silver card; put it on top of your deck. Each other player reveals a Victory card from his hand and puts it on his deck (or reveals a hand with no Victory cards).
//9		Feast			Base	Action				$4	Trash this card. Gain a card costing up to 5 Coins.
//10	Gardens			Base	Victory				$4	Variable, Worth 1 Victory for every 10 cards in your deck (rounded down).
//11	Militia			Base	Action - Attack		$4	+2 Coins, Each other player discards down to 3 cards in his hand.
//12	Moneylender		Base	Action				$4	Trash a Copper from your hand. If you do, +3 Coins.
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


