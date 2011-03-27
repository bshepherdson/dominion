
var dom = {};

dom = require('./decision');
dom.player = require('./player');
dom.cards = require('./cards');
dom.decision = require('./decision');


dom.game = function(app) {
	this.app_ = app;
	this.players = [];
};


dom.game.prototype.addPlayer = function() {
	var p = new dom.Player(this);
	this.players.push(p);
};


dom.game.prototype.decision = function(dec, cb) {
	var str = 'Player ' + dec.player.id_ + ':\n';
	for(var i = 0; i < dec.info.length; i++) {
		str += dec.info[i] + "\n";
	}
	str += '\n';
	str += dec.message + '\n';
	for(var i = 0; i < dec.options.length; i++) {
		str += (i+1) + ') ' + dec.options.text + '\n';
	}
	str += 'Choice: ';

	send(str, function(x) {
		return res && (res+0) && res+0 > 0 && res+0 <= dec.options.length;
	}, function(res) {
		res--;
		cb(dec.options[res].key);
	}, dom.bind(this.decision, this, dec, cb));

};


var stdin = process.openStdin();
stdin.setEncoding('utf8');

var inputSuccess;
var inputFailure;
var inputPredicate;
stdin.on('data', function(chunk) {
	if(!inputPredicate || !inputSuccess || !inputFailure) return;
	if(inputPredicate(chunk)) {
		inputSuccess(chunk);
	} else {
		inputFailure();
	}
});

stdin.on('end', function() {
	process.exit();
});


function send(str, p, s, f) {
	inputPredicate = p;
	inputSuccess = s;
	inputFailure = f;
	process.stdout.write(str);
}

process.stdout.write("Hello, World!\n");


