
var global = this;
var dom = {};
dom.Option = require('./decision').Option;
dom.Decision = require('./decision').Decision;

exports.bind = function(fn, selfObj, var_args) {
  var context = selfObj || global;

  if (arguments.length > 2) {
    var boundArgs = Array.prototype.slice.call(arguments, 2);
    return function() {
      // Prepend the bound arguments to the current arguments.
      var newArgs = Array.prototype.slice.call(arguments);
      Array.prototype.unshift.apply(newArgs, boundArgs);
      return fn.apply(context, newArgs);
    };

  } else {
    return function() {
      return fn.apply(context, arguments);
    };
  }
};


/** @param {Array.<Card>} */
exports.cardsToOptions = function(cards) {
	var options = [];
	for(var i = 0; i < cards.length; i++) {
		options.push(new dom.Option('card['+i+']', cards[i].name));
	}
	return options;
};

exports.append = function(to, from) {
	for(var i = 0; i < from.length; i++) {
		to.push(from[i]);
	}
};


exports.decisionHelper = function(done, match, failedMatch) {
	return function(key) {
		if(key == 'done') {
			done();
		} else {
			var m = /\[(\d+)\]/.exec(key);
			if(m) {
				var index = m[1]; // [1] is the first capture group
				match(index);
			} else {
				failedMatch();
			}
		}
	};
};


/**
 * Note that this only handles a single iteration of gaining a card.
 *
 * @param {dom.player} p The player object.
 * @param {string} message The decision message.
 * @param {?string} done The done message. Null for no choice.
 * @param {Array.string} info The decision info.
 * @param {Card -> boolean} cardPred The predicate for deciding whether to show a given card.
 * @param {???} decisionFunc A function that takes a function which repeats the question, and returns a key -> action decision handler.
 */
exports.gainCardDecision = function(p, message, done, info, cardPred, decisionFunc) {
	var options = [];
	for(var i = 0; i < p.game_.kingdom.length; i++) {
		var inKingdom = p.game_.kingdom[i];
		var card = inKingdom.card;
		if(inKingdom.count > 0 && cardPred(card)) {
			options.push(new dom.Option('card['+i+']', '('+ card.cost +') ' + card.name));
		}
	}
	options.push(new dom.Option('done', done));
	var dec = new dom.Decision(p, options, message, info);

	var repeat = function() {
		p.game_.decision(dec, decisionFunc(repeat));
	};

	console.log('calling repeat()');
	repeat();
};


/**
 * Chooses a card from (a subset of) the hand.
 *
 * @param {dom.player} p The player in question.
 * @param {string} message The decision message.
 * @param {?string} done The done message. null for no option.
 * @param {dom.card -> boolean} cardPred Predicate to decide which cards to show.
 * @param {index -> action} matchFunc Function to take the selected index and take action.
 * @param {cont} cont Continuation to call when user selects 'done' (not on a match)
 */
exports.handDecision = function(p, message, done, cardPred, matchFunc, cont) {
	var options = [];
	for(var i = 0; i < p.hand_.length; i++) {
		var card = p.hand_[i];
		if(cardPred(card)){
			options.push(new dom.Option('card['+i+']', card.name));
		}
	}
	if(done){
		options.push(new dom.Option('done', done));
	}
	var dec = new dom.Decision(p, options, message, []);

	var repeat = function() {
		p.game_.decision(dec, exports.decisionHelper(cont, matchFunc, repeat));
	};
	repeat();
};

exports.const = function(x) {
	return function(y) { return x; };
};

