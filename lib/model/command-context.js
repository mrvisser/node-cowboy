
var cowboy = require('../../index');

var CommandContext = module.exports = function(args) {
    this._cowboy = cowboy;
    this._args = args;
};

CommandContext.prototype.cowboy = function() {
    return this._cowboy;
};

CommandContext.prototype.args = function() {
    return this._args;
};

