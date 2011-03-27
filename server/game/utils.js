

dom.bind = function(fn, selfObj, var_args) {
  var context = selfObj || goog.global;

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
dom.cardsToOptions = function(cards) {
	var options = [];
	for(var i = 0; i < cards.length; i++) {
		options.push(new Option('card['+i+']', cards[i].name));
	}
	return options;
};



