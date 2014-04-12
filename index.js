
var _ = require('underscore');
var autoinit = require('autoinit');

module.exports.context = require('./lib/context');
module.exports.conversations = {
    'broadcast': require('./lib/conversations/broadcast')
};
module.exports.data = require('./lib/data');
module.exports.logger = require('./lib/logger');
module.exports.modules = require('./lib/modules');
module.exports.plugins = require('./lib/plugins');
module.exports.presence = require('./lib/presence');
module.exports.redis = require('./lib/redis');
module.exports.util = require('./lib/util');

var _hasInit = false;
var _destroyFunction = null;

/**
 * Initialize the cowboy module
 */
var init = module.exports.init = function(ctx, callback) {
    if (_hasInit) {
        throw new Error('Attempted to initialize twice');
    }
    _hasInit = true;

    var initOptions = {
        'ctx': initializationContext,
        'root': path.join(__dirname, '../lib')
    };

    autoinit.init(initOptions, function(err, cowboy, destroyFunction) {
        if (err) {
            return callback(err);
        }

        _destroyFunction = destroyFunction;
        return callback();
    });
};

/**
 * Destroy the cowboy module such that it can be initialized again
 */
var destroy = module.exports.destroy = function(callback) {
    if (!_hasInit) {
        throw new Error('Attempted to destroy when not initialized');
    } else if (!_.isFunction(_destroyFunction)) {
        throw new Error('Attempted to destroy when either initialization did not complete, destroy is in progress or initialization failed');
    }

    _destroyFunction(function(err) {
        if (err) {
            return callback(err);
        }

        _hasInit = false;
        return callback();
    });

    // Immediately clear the destroy function
    _destroyFunction = null;
};
