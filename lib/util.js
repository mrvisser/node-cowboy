
var _ = require('underscore');
var crypto = require('crypto');

/**
 * Pass the process argv to determine if the supplied filter parameters are valid
 */
var validateFilterArgs = module.exports.validateFilterArgs = function(argv) {
    if (argv['H']) {
        return require('./filters/hosts').validate(argv['H']);
    }
};

/**
 * Parse the argv into a filters object for the cowboy command
 */
var parseFilterArgs = module.exports.parseFilterArgs = function(argv) {
    var args = [];
    if (argv['H']) {
        args.push({
            'type': 'hosts',
            'args': argv['H']
        });
    }
    return args;
};

/**
 * Get the home directory of the current user
 */
var getHomeDirectory = module.exports.getHomeDirectory = function() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
};

/**
 * If the `val` is parseable to an integer, return its integer value. Otherwise return the `defaultVal`.
 */
var getIntParam = module.exports.getIntParam = function(val, defaultVal) {
    val = parseInt(val, 10);
    if (!isNaN(val)) {
        return val;
    } else {
        return defaultVal;
    }
};

/*!
 * Generate a random message id
 */
var rnd = module.exports.rnd = function(length) {
    length = length || 8;
    return crypto.randomBytes(length).toString('hex');
};

var invokeIfNecessary = module.exports.invokeIfNecessary = function(/* necessary, method, [args...], callback */) {
    var args = Array.prototype.slice.call(arguments, 0);
    var necessary = args.shift();
    if (!necessary) {
        return args.pop()();
    }

    var method = args.shift();
    return method.apply(method, args);
};
