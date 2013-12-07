
var _ = require('underscore');
var assert = require('assert');
var cowboy = require('../../index');

describe('Redis', function() {

    describe('Channel Communication', function() {

        var channel = null;

        beforeEach(function(callback) {
            channel = cowboy.redis.createChannel('test-channel');
            channel.listen(callback);
        });

        afterEach(function(callback) {
            channel.close(callback);
        });

        it('sends and receives strings', function(callback) {
            channel.send('Hello');
            channel.once('data', function(message) {
                assert.strictEqual(message, 'Hello');
                return callback();
            });
        });

        it('sends and receives numbers', function(callback) {
            channel.send(7);
            channel.once('data', function(message) {
                assert.strictEqual(message, 7);
                return callback();
            });
        });

        it('sends and receives booleans', function(callback) {
            channel.send(true);
            channel.once('data', function(message) {
                assert.strictEqual(message, true);
                return callback();
            });
        });

        it('sends and receives null', function(callback) {
            channel.send(null);
            channel.once('data', function(message) {
                assert.strictEqual(message, null);
                return callback();
            });
        });

        it('sends and receives objects', function(callback) {
            channel.send({
                'Hello': 'Hello',
                7: 7,
                'true': true,
                'false': false,
                'null': null,
                'undefined': undefined,
                'object': {},
                'array': []
            });

            channel.once('data', function(message) {
                assert.ok(_.isObject(message) && !_.isArray(message));
                assert.strictEqual(message.Hello, 'Hello');
                assert.strictEqual(message[7], 7);
                assert.strictEqual(message['true'], true);
                assert.strictEqual(message['false'], false);
                assert.strictEqual(message['null'], null);
                assert.ok(!_.chain(message).keys().contains('undefined').value());
                assert.ok(_.isObject(message.object) && !_.isArray(message.object) && _.isEmpty(message.object));
                assert.ok(_.isArray(message.array) && _.isEmpty(message.array));
                return callback();
            });
        });

        it('sends and receives arrays', function(callback) {
            channel.send(['Hello', 7, true, false, {}, [], null, undefined]);
            channel.once('data', function(message) {
                assert.ok(_.isArray(message));
                assert.strictEqual(message[0], 'Hello');
                assert.strictEqual(message[1], 7);
                assert.strictEqual(message[2], true);
                assert.strictEqual(message[3], false);
                assert.ok(_.isObject(message[4]) && !_.isArray(message[4]) && _.isEmpty(message[4]));
                assert.ok(_.isArray(message[5]) && _.isEmpty(message[5]));
                assert.strictEqual(message[6], null);
                assert.strictEqual(message[7], null);
                return callback();
            });
        });

        it('stops receiving messages after close', function(callback) {
            channel.once('data', function(message) {
                assert.fail();
            });
            channel.close();

            channel.send('fail');
            return process.nextTick(callback);
        });

        it('throws an error when listening on duplicate channels', function(callback) {
            assert.throws(function() {
                var duplicateChannel = cowboy.redis.createChannel('test-channel');
                duplicateChannel.listen(function() {});
            });
            return callback();
        });

        it('does not receive messages on a channel when not listening', function(callback) {
            var readOnlyChannel = cowboy.redis.createChannel('test-channel');

            // The readonly channel has not been set up to listen, so it should not receive the message
            readOnlyChannel.on('data', function(message) {
                assert.fail();
            });

            // The regular test channel is listening, complete when it receives the message
            channel.once('data', function(message) {
                return callback();
            });

            channel.send('Only I can have this');
        });

        it('receives multiple messages sent in the same process tick', function(callback) {
            for (var i = 0; i < 10; i++) {
                channel.send('Message ' + i);
            }

            // I'm hesitant about testing order like this, as it's not clear to me that Redis actually
            // strictly guarantees it. Either way, if ordering does ever "break" in node_redis or redis
            // itself, it would be good to at least know about it, so I'll test continue to ensure
            // ordering for now
            var j = 0;
            channel.on('data', function(message) {
                // Ensure we get all 10 messages in the correct order
                assert.strictEqual(message, 'Message ' + (j++));
                if (j === 10) {
                    return callback();
                }
            });
        });
    });
});