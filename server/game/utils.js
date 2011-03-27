
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
		var card = p.game_.kingdom[i].card;
		if(cardPred(card)) {
			options.push(new dom.Option('card['+i+']', '('+ card.cost +') ' + card.name));
		}
	}
	options.push(new dom.Option('done', done));
	var dec = new dom.Decision(p, options, message, info);

	var repeat = function() {
		p.game_.decision(dec, decisionFunc(repeat));
	};

	repeat();
};
