
var dom = {};

dom.Decision = function(player, options, message, info) {
	this.player = player;
	this.options = options;
	this.message = message;
	this.info = info;
};


dom.Option = function(key, text) {
	this.key = key;
	this.text = text;
};

exports.Decision = dom.Decision;
exports.Option = dom.Option;

