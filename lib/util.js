
var _ = require('underscore');
var crypto = require('crypto');

var parseArgs = module.exports.parseArgs = function(args, callback) {
    args = Array.prototype.slice.call(arguments, 0);

    var optionsArg = null;
    var callbackArg = function() {};
    if (_(args).last().isFunction()) {
        callbackArg = args.pop();
    }

    if (_(args).last().isObject() && !_(args).last().isArray()) {
        optionsArg = args.pop();
    } else {
        optionsArg = {};
    }

    args.push(optionsArg, callbackArg);
    return callback.apply(this, args);
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
var rnd = module.exports.rnd = function(callback) {
    crypto.randomBytes(8, function(err, buffer) {
        if (err) {
            return callback(err);
        }

        return callback(null, buffer.toString('hex'));
    });
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