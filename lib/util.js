
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

/**
 * Generate a random message id
 */
var rnd = module.exports.rnd = function(length) {
    length = length || 8;
    return crypto.randomBytes(length).toString('hex');
};

/**
 * Parse an input command of either "commandName" or "moduleName:commandName" into an object that
 * represents its parts
 */
var parseInputCommand = module.exports.parseInputCommand = function(commandName) {
    var commandNameSplit = commandName.split(':');
    var commandExec = {};
    commandExec.commandName = commandNameSplit.pop();
    commandExec.moduleName = commandNameSplit.join(':');
    return commandExec;
};

/**
 * Invoke the given method with its arguments if a condition is held to be `true`
 *
 * @param   {Boolean}   necessary   Whether or not it is necessary to invoke the provided function
 * @param   {Function}  method      The method to invoke if the `necessary` condition holds true
 * @param   {Args[]}    ...         A number of arbitrary arguments that are passed to the `method` function if the
 *                                  condition holds true
 * @param   {Function}  callback    Invoked directly with no arguments if the `necessary` condition is `false`. If the
 *                                  `necessary` condition is `true`, this callback will be passed in as the final
 *                                  argument of the `method` function with expectation that the method invokes it after
 *                                  completion
 */
var invokeIfNecessary = module.exports.invokeIfNecessary = function(/* necessary, method, [args...], callback */) {
    var args = Array.prototype.slice.call(arguments, 0);
    var necessary = args.shift();
    if (!necessary) {
        return args.pop()();
    }

    var method = args.shift();
    return method.apply(method, args);
};
