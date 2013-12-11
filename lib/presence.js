
var _ = require('underscore');
var cowboy = require('../index');
var internal = require('./internal/presence');
var events = require('events');

var _broadcasts = false;
var _consumes = false;

var _timeout = null;
var _interval = null;
var _intervalHandle = null;

var _hostMap = {};

/**
 * Initialize the presence component
 */
var init = module.exports.init = function(config, callback) {
    destroy(function() {
        config.presence = config.presence || {};
        _.defaults(config.presence, {'interval': 1000, 'timeout': 3000});
        _timeout = config.presence.timeout;
        _interval = config.presence.interval;
        return callback();
    });
};

/**
 * Destroy the presence component
 */
var destroy = module.exports.destroy = function(callback) {
    clearInterval(_intervalHandle);

    // Emit absence only if we're a broadcaster
    cowboy.util.invokeIfNecessary(_broadcasts, internal.absent, cowboy.data.get('hostname'), function(err) {
        if (err) {
            cowboy.logger.system().warn({'err': err}, 'Failed to broadcast absence during shutdown. Ignoring');
        }

        _broadcasts = false;
        _interval = null;
        _intervalHandle = null;
        _timeout = null;
        _hostMap = {};

        return callback();
    });
};

/**
 * Begin broadcasting presence on a regular interval
 */
var broadcast = module.exports.broadcast = function(callback) {
    callback = callback || function() {};

    cowboy.logger.system().trace({
        'host': cowboy.data.get('hostname'),
        'intervalInMs': _interval
    }, 'Beginning presence broadcast interval');

    // Emit set a timer to continuously emit presence and emit immediately
    clearInterval(_intervalHandle);
    _intervalHandle = setInterval(function() {
        internal.present(cowboy.data.get('hostname'), Date.now());
    }, _interval);

    return internal.present(cowboy.data.get('hostname'), Date.now(), function(err) {
        if (err) {
            cowboy.logger.system().error({'err': err}, 'Error emitting initial presence');
            return callback(err);
        }

        cowboy.logger.system().trace('Successfully emit initial presence');
        return callback();
    });
};

/**
 * Clear all presence entries in storage and locally. It will require some time
 * for presence of external hosts to re-acknowledge after this.
 */
var clear = module.exports.clear = function(callback) {
    internal.clear(function(clearErr) {
        if (clearErr) {
            cowboy.logger.system().error({'err': clearErr}, 'Failed to clear presence from redis');
            return consume(function(consumeErr) {
                if (consumeErr) {
                    cowboy.logger.system().error({'err': consumeErr}, 'Failed to re-consume presence after clearing error');
                }

                return callback(clearErr);
            });
        }

        // Clear our in-memory cache of presence
        _hostMap = {};
        return callback();
    });
};

/**
 * Consume and cache the current state of presence for subsequent `hosts` invocations
 */
var consume = module.exports.consume = function(callback) {
    internal.consume(function(err, hostMap) {
        if (err) {
            cowboy.logger.system().error({'err': err}, 'Failed to consume host status for cluster');
            return callback(err);
        }

        cowboy.logger.system().trace({'hosts': hostMap}, 'Successfully consumed presence');
        _hostMap = hostMap || {};
        return callback();
    });
};

/**
 * Get all the active hosts known by the system as of the last `consume` invocation
 */
var hosts = module.exports.hosts = function() {
    var hosts = [];

    // Assemble the active hosts array, while pruning out those which have timed out
    _.each(_hostMap, function(lastPresent, host) {
        if (Date.now() - lastPresent > _timeout) {
            delete _hostMap[host];
        } else {
            hosts.push(host);
        }
    });

    return hosts;
};
