
var cowboy = require('cowboy');
var crypto = require('crypto');
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

        cowboy.logger.system().debug({'host': host, 'port': port, 'index': index}, 'Initialized subscriber redis client');

        _createClient(host, port, index, password, function(err, _persistentClient) {
            if (err) {
                return callback(err);
            }

            cowboy.logger.system().debug({'host': host, 'port': port, 'index': index}, 'Initialized publisher redis client');

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
    cowboy.logger.system().trace({'command': command, 'args': args, 'selections': selections}, 'Init sending cowboy request');
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

        cowboy.logger.system().debug({'request': request}, 'Publishing request from cowboy');
        return persistentClient.publish(_getRequestChannel(), JSON.stringify(request));
    });
};

/**
 * Listen for a cowboy request
 *
 * @param  {Function}   handler                 Invoked when a command has been received
 * @param  {String}     handler.command         The command that was received
 * @param  {String[]}   handler.args            The command arguments
 * @param  {Function}   handler.published       A function that will be invoked when the response has been published back to the cowboy
 * @param  {Error}      handler.published.err   An error that occurred publishing back tot he cowboy, if any
 * @param  {Number}     handler.published.code  The numeric code of the response being published back
 * @param  {Object}     handler.published.reply The arbitrary reply object being sent back by the handler
 */
var listenRequest = module.exports.listenRequest = function(handler) {
    // Subscribe to the request channel to handle incoming requests
    subscriberClient.psubscribe(_getRequestChannel());
    subscriberClient.on('pmessage', function(pattern, channel, message) {
        var request = JSON.parse(message);

        // Pass the request to the handler
        cowboy.logger.system().debug({'request': request}, 'Received request from cowboy');
        handler(request.command, request.args, function(name, code, reply, published) {

            // Serialize the response data and send it back to the cowboy
            var response = {'name': name, 'code': code, 'reply': reply};
            cowboy.logger.system().debug({'response': response}, 'Publishing cattle response');
            persistentClient.publish(_getReplyChannel(request.messageId), JSON.stringify(response), function(err) {
                if (err) {
                    cowboy.logger.system().error({'err': err}, 'Error sending response to cowboyt');
                }

                // Finally notify the cattle that we published back to the cowboy
                return published(err, code, reply);
            });
        });
    });
};

/**
 * Destroy the redis connection(s)
 */
var destroy = module.exports.destroy = function() {
    cowboy.logger.system().debug('Destroying redis connections');
    subscriberClient.end();
    persistentClient.end();
};

/*!
 * Create a redis client that is ready to interact with redis
 */
var _createClient = function(host, port, index, password, callback) {
    cowboy.logger.system().trace({
        'host': host,
        'port': port,
        'index': index,
        'password': (password) ? true : false
    }, 'Begin create redis client');

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

            cowboy.logger.system().trace('Established connection on redis db index %s', index);

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

    cowboy.logger.system().trace('Attempting to authenticate redis client');

    return client.auth(password, callback);
};

/*!
 * Generate a random message id
 */
var _generateMessageId = function(callback) {
    cowboy.logger.system().trace('Generating a message id');
    crypto.randomBytes(8, function(err, buffer) {
        if (err) {
            return callback(err);
        }

        var messageId = buffer.toString('hex');
        cowboy.logger.system().trace('Generated message id: %s', messageId);

        return callback(null, messageId);
    });
};

var _getRequestChannel = function() {
    return 'lasso';
};

var _getReplyChannel = function(messageId) {
    return util.format('lasso-%s', messageId);
};