
var dom = {};
dom.utils = require('./utils');

var nextId = 0;

dom.Decision = function(player, options, message, info) {
	this.player = player;
	this.options = options;
	this.message = message;
	this.info = info;

	if(player.temp['Native Village mat'] && player.temp['Native Village mat'].length > 0) {
		this.info.push('Native Village mat: ' + player.temp['Native Village mat'].map(function(c) { return c.name; }).join(', ') );
	}

    this.info.push('Hand: ' + dom.utils.showCards(player.hand_));

	this.id = nextId++;
};

dom.Decision.prototype.show = function() {
	return { info: this.info, message: this.message, options: this.options };
};


dom.Option = function(key, text) {
	this.key = key;
	this.text = text;
};

exports.Decision = dom.Decision;
exports.Option = dom.Option;

