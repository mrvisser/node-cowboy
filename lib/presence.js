
var _ = require('underscore');
var cowboy = require('../index');
var events = require('events');

var REDIS_KEY_PRESENCE = 'presence';

var _broadcasts = false;
var _consumes = false;

var _timeout = null;
var _interval = null;
var _intervalHandle = null;

var _hostMap = {};

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
    cowboy.util.invokeIfNecessary(_broadcasts, _absent, function(err) {
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

var broadcast = module.exports.broadcast = function(callback) {
    callback = callback || function() {};

    // Emit set a timer to continuously emit presence and emit immediately
    clearInterval(_intervalHandle);
    _intervalHandle = setInterval(_present, _interval);
    return _present(callback);
};

var consume = module.exports.consume = function(callback) {
    cowboy.redis.client().hgetall(REDIS_KEY_PRESENCE, function(err, hostMap) {
        if (err) {
            cowboy.logger.system().error({'err': err}, 'Failed to consume host status for cluster');
            return callback(err);
        }

        _hostMap = hostMap;
        return callback();
    });
};

/**
 * Get all the active hosts known by the system
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

var _absent = function(callback) {
    cowboy.redis.client().hdel(REDIS_KEY_PRESENCE, cowboy.data.get('hostname'), callback);
};

var _present = function(callback) {
    cowboy.redis.client().hset(REDIS_KEY_PRESENCE, cowboy.data.get('hostname'), Date.now(), callback);
};
