
var global = this;
var dom = {};
dom.Option = require('./decision').Option;

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

