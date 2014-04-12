
var _ = require('underscore');
var cowboy = require('../index');
var events = require('events');
var redis = require('redis');
var util = require('util');

// One client for subscriber mode, the other for everything else (publish, store, etc...)
var _subClient = null;
var _pubClient = null;

var subscribers = {};

/**
 * Create and optionally authenticate a redis client
 */
var init = module.exports.init = function(ctx, callback) {
    ctx.config().redis = ctx.config().redis || {};
    _.defaults(ctx.config().redis, {'host': 'localhost', 'port': 6379, 'index': 0});

    // Create the subscriber and publisher clients
    _createClient(ctx.config().redis, function(err, subClient) {
        if (err) {
            return callback(err);
        }

        cowboy.logger.system().debug(_.pick(ctx.config().redis, 'host', 'port', 'index'), 'Initialized subscriber redis client');

        _createClient(ctx.config().redis, function(err, pubClient) {
            if (err) {
                return callback(err);
            }

            cowboy.logger.system().debug(_.pick(ctx.config().redis, 'host', 'port', 'index'), 'Initialized publisher redis client');
            _subClient = subClient;
            _pubClient = pubClient;

            // Immediately subscribe to the central cowboy exchange
            return callback();
        });
    });
};

/**
 * Destroy the redis connection(s)
 */
var destroy = module.exports.destroy = function(callback) {
    cowboy.logger.system().debug('Destroying redis connections');

    // Hold a reference to these guys for cleanup
    var subClient = _subClient;
    var pubClient = _pubClient;

    // Erase the managed clients
    _subClient = null;
    _pubClient = null;

    // Close the clients
    subClient.quit();
    pubClient.quit();

    // When completely closed, we've finished cleaning up
    var complete = 0;
    var _onEnd = function() {
        complete++;
        if (complete === 2) {
            return callback();
        }
    };

    subClient.once('end', function() {
        cowboy.logger.system().trace('Finished closing subscriber client');
        return _onEnd();
    });

    pubClient.once('end', function() {
        cowboy.logger.system().trace('Finished closing publisher client');
        return _onEnd();
    });
};

/**
 * Create a communication channel over the provided name
 */
var createChannel = module.exports.createChannel = function(name) {
    var subscribed = false;
    var channel = new events.EventEmitter();

    // If the consumer eventually listens to the channel, we need the _onMessage listener to be in scope of
    // the close method so we can strip away the listener
    var _onMessage = _createOnMessageListener(name, channel);

    // Send data on the channel. It's wrapped into a body indicating the channel so we can filter based on it
    channel.send = function(data, callback) {
        cowboy.logger.system().trace({'data': data, 'channelName': name}, 'Sending message into channel');
        _pubClient.publish(name, JSON.stringify(data), callback);
    };

    // Start listening for incoming messages in the channel
    channel.listen = function(callback) {
        callback = callback || function() {};
        if (subscribers[name]) {
            throw new Error('Attempted to listen on duplicate channel');
        }

        // Create the _onSubscribe handler which will strip itself off the subClient and invoke the callback
        // when completed
        var _onSubscribe = _createOnceSubscribeListener('subscribe', name, callback);

        subscribed = true;
        subscribers[name] = true;

        _subClient.subscribe(name);
        _subClient.on('subscribe', _onSubscribe);
        _subClient.on('message', _onMessage);
    };

    // Close the channel and clean up any resources it consumes
    channel.close = function(callback) {
        callback = callback || function() {};
        if (!subscribed) {
            // If we weren't subscribed, there's actually no cleanup to do
            return callback();
        }

        // Create the _onUnsubscribe handler which will strip itself off the subClient and invoke the
        // callback when completed
        var _onUnsubscribe = _createOnceSubscribeListener('unsubscribe', name, callback);

        delete subscribers[name];
        _subClient.removeListener('message', _onMessage);
        _subClient.unsubscribe(name);
        return _subClient.on('unsubscribe', _onUnsubscribe);
    };

    return channel;
};

/**
 * Get the raw redis client. Beware etc, etc...
 */
var client = module.exports.client = function() {
    return _pubClient;
};

/*!
 * Create a redis client that is ready to interact with redis
 */
var _createClient = function(options, callback) {
    cowboy.logger.system().trace({
        'host': options.host,
        'port': options.port,
        'index': options.index,
        'password': !!options.password
    }, 'Begin create redis client');

    var client = redis.createClient(options.port, options.host);

    // Authenticate optionally if a password is specified
    _auth(client, options.password, function(err) {
        if (err) {
            return callback(err);
        }

        // Select the redis database index to use
        client.select(options.index, function(err) {
            if (err) {
                return callback(err);
            }

            cowboy.logger.system().trace('Established connection to redis');
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
 * Create the function that will be invoked when a message on the specified channel has been received
 */
var _createOnMessageListener = function(channelName, channel) {
    return function(name, message) {
        if (name !== channelName) {
            // Reject any message that wasn't intended for this channel
            return;
        }

        try {
            message = JSON.parse(message);
        } catch (ex) {
            cowboy.logger.system().error({'err': ex, 'channelName': channelName, 'message': message}, 'Received invalid JSON from channel');
            return;
        }

        // Emit the data we received from the channel
        cowboy.logger.system().trace({'message': message, 'channelName': channelName}, 'Received message');
        channel.emit('data', message);
    };
};

/**
 * Create a listener that will only be invoked once. But will wait until the appropriate event for the appropriate
 * channel occurrs first before performing the invoke.
 *
 * This is necessary because the subscribe/unsubscribe events for redis are global, whereas we want to subscribe /
 * unsubscribe from individual channels. To accomplish this, we filter out all sub/unsub events that are not intended
 * for our channel, and only perform the event once when the correct event comes along.
 */
var _createOnceSubscribeListener = function(subscribeOrUnsubscribe, channelName, callback) {
    var _listener = function(name, count) {
        if (name !== channelName) {
            // If the channel was not ours, we just ignore it
            return;
        }

        // Ensure we clean up our subscribe listener
        _subClient.removeListener(subscribeOrUnsubscribe, _listener);
        return callback();
    };

    return _listener;
};
