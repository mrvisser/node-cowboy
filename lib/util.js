
var _ = require('underscore');

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
 * Pass the arguments to the lasso plugin's validate method to determine if the supplied arguments are
 * valid
 */
var validateCommandArgs = module.exports.validateCommandArgs = function(lasso, args, callback) {
    if (_.isFunction(lasso.validate)) {
        return lasso.validate(args, callback);
    } else {
        return callback();
    }
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