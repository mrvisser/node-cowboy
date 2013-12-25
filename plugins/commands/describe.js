
var _ = require('underscore');
var colors = require('colors');
var sprintf = require('sprintf-js').sprintf;

var Command = module.exports = function() {};

/**
 * @see ../command.js
 */
Command.prototype.help = function() {
    return {'description': 'Describe the modules and commands installed on each cattle node.'};
};

/**
 * @see ../command.js
 */
Command.prototype.exec = function(ctx, reply, done) {
};