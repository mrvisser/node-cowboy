
var cowboy = require('../index');

module.exports.broadcast = require('./conversations/broadcast');

var init = module.exports.init = function(config, callback) {
    return callback();
};

var destroy = module.exports.destroy = function(callback) {
    return callback();
};
