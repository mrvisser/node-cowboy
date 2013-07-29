var crypto = require('crypto');
var os = require('os');
var redis = require('redis');
var util = require('util');

// One client for subscriber mode, the other for everything else (publish, store, etc...)
var subscriberClient = null;
var persistentClient = null;

/**
 * Create and optionally authenticate a redis client
 */
var init = module.exports.init = function(host, port, index, password, callback) {
    _createClient(host, port, index, password, function(err, _subscriberClient) {
        if (err) {
            return callback(err);
        }

        _createClient(host, port, index, password, function(err, _persistentClient) {
            if (err) {
                return callback(err);
            }

            subscriberClient = _subscriberClient;
            persistentClient = _persistentClient;
            return callback();
        });
    });
};

/**
 * Make a cowboy request to redis
 */
var request = module.exports.request = function(command, args, selections, handler) {
    _generateMessageId(function(err, messageId) {
        if (err) {
            throw err;
        }

        // Bind the handler on the expected reply channel, based on the message id
        subscriberClient.psubscribe(_getReplyChannel(messageId));
        subscriberClient.on('pmessage', function(pattern, channel, response) {
            return handler(JSON.parse(response));
        });

        var request = {
            'messageId': messageId,
            'command': command,
            'args': args,
            'selections': selections
        };

        return persistentClient.publish(_getRequestChannel(), JSON.stringify(request));
    });
};

/**
 * Listen for a cowboy request.
 */
var listenRequest = module.exports.listenRequest = function(handler) {
    // Subscribe to the request channel to handle incoming requests
    subscriberClient.psubscribe(_getRequestChannel());
    subscriberClient.on('pmessage', function(pattern, channel, message) {
        var request = JSON.parse(message);
        handler(request.command, request.args, function(code, reply) {
            var response = {
                'name': os.hostname(),
                'code': code,
                'reply': reply
            };
            persistentClient.publish(_getReplyChannel(request.messageId), JSON.stringify(response));
        });
    });
};

/**
 * Destroy the redis connection(s)
 */
var destroy = module.exports.destroy = function(callback) {
    subscriberClient.end();
    persistentClient.end();
};

/*!
 * Create a redis client that is ready to interact with redis
 */
var _createClient = function(host, port, index, password, callback) {
    var client = redis.createClient(port, host);

    // Authenticate optionally if a password is specified
    _auth(client, password, function(err) {
        if (err) {
            return callback(err);
        }

        // Select the redis database index to use
        client.select(index, function(err) {
            if (err) {
                return callback(err);
            }

            return callback(null, client);
        });
    });
};

/*!
 * Authenticate the client if a password is specified
 */
var _auth = function(client, password, callback) {
    if (!password) {
        return callback();
    }

    return client.auth(password, callback);
};

/*!
 * Generate a random message id
 */
var _generateMessageId = function(callback) {
    crypto.randomBytes(8, function(err, buffer) {
        if (err) {
            return callback(err);
        }

        return callback(null, buffer.toString('hex'));
    });
};

var _getRequestChannel = function() {
    return 'lasso';
};

var _getReplyChannel = function(messageId) {
    return util.format('lasso-%s', messageId);
};