
var cowboy = require('../index');

module.exports.broadcast = require('./conversations/broadcast');

/**
 * Initialize the conversaion types
 */
var init = module.exports.init = function(config, callback) {
    return callback();
};

/**
 * Destroy the conversation types
 */
var destroy = module.exports.destroy = function(callback) {
    return callback();
};
