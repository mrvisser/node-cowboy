
var _ = require('underscore');
var assert = require('assert');
var cowboy = require('../../../index');

var conversationsBroadcastUtil = require('../../../lib/internal/conversations.broadcast');
var presenceUtil = require('../../../lib/internal/presence');

describe('Conversations', function() {

    describe('Broadcast', function() {

        it('flows through the standard protocol', function(callback) {
            var _request = false;
            var _ack = false;
            var _response = false;
            var _responseCallback = false;
            var _endCallback = false;

            _setupRequestAndListener('test', 'test-request', null, function(listener, request) {

                // When the request is received, send the response and end it
                listener.on('request', function(body, reply, end) {
                    assert.ok(!_request);
                    assert.strictEqual(body, 'test-request');
                    _request = true;

                    // Send a response
                    reply('test-response', function(err) {
                        assert.ok(!err);
                        assert.ok(!_responseCallback);
                        _responseCallback = true;

                        // End the response
                        end(function(err) {
                            assert.ok(!err);
                            assert.ok(!_endCallback);
                            _endCallback = true;
                        });
                    });
                });

                // Send the request, expecting only a response from our own node
                request.on('ack', function(host) {
                    assert.strictEqual(host, cowboy.data.get('hostname'));
                    assert.ok(!_ack);
                    _ack = true;
                });

                request.on('data', function(host, data) {
                    assert.strictEqual(host, cowboy.data.get('hostname'));
                    assert.strictEqual(data, 'test-response');
                    assert.ok(!_response);
                    _response = true;
                });

                request.on('error', function(err) {
                    assert.fail();
                });

                request.on('end', function(responses, expecting) {
                    assert.ok(responses);
                    assert.ok(responses[cowboy.data.get('hostname')]);
                    assert.strictEqual(responses[cowboy.data.get('hostname')][0], 'test-response');
                    assert.ok(_.isEmpty(expecting));

                    // Ensure all of our events were triggered
                    assert.ok(_request);
                    assert.ok(_ack);
                    assert.ok(_response);
                    assert.ok(_responseCallback);
                    assert.ok(_endCallback);

                    return listener.close(callback);
                });
            });
        });

        describe('Listen', function() {

            describe('reply', function() {

                it('gives an error when sending after the response has ended', function(callback) {
                    _setupRequestAndListener('test', null, null, function(listener, request) {

                        // Receive the request
                        listener.on('request', function(request, reply, end) {

                            // Reply with "first" and ensure it succeeds as a sanity check
                            reply('first', function(err) {
                                assert.ok(!err);

                                // End the response
                                end(function(err) {
                                    assert.ok(!err);

                                    // Try reply frame after the end, this should fail as we already ended
                                    reply('second', function(err) {
                                        assert.ok(err);
                                        return listener.close(callback);
                                    });
                                });
                            });
                        });

                        // Ensure we never receive the "second" message on the requester side
                        request.on('data', function(host, data) {
                            assert.strictEqual(data, 'first');
                        });
                    });
                });
            });
        });

        describe('Request', function() {

            it('responds with no responses when it is not expecting any hosts', function(callback) {
                var request = cowboy.conversations.broadcast.request('test', {}, {'expecting': []});
                request.on('end', function(responses, expecting) {
                    assert.ok(_.isEmpty(responses));
                    assert.ok(_.isEmpty(expecting));
                    return callback();
                });
            });

            it('times out with a connect timeout error when it receives no reply', function(callback) {
                var request = cowboy.conversations.broadcast.request('test', null, {
                    'expect': [cowboy.data.get('hostname')],
                    'timeout': {
                        'connect': 10
                    }
                });

                // Do not bind a listener, instead let the request die after 10ms
                request.on('ack', function() { assert.fail(); });
                request.on('data', function() { assert.fail(); });
                request.on('end', function() { assert.fail(); });

                // Ensure we get the timeout error
                request.on('error', function(err, expecting) {
                    assert.ok(err);
                    assert.strictEqual(err.message, 'Did not receive a message within the connect timeout interval of 10ms');
                    assert.strictEqual(expecting.length, 1);
                    assert.strictEqual(expecting[0], cowboy.data.get('hostname'));
                    return callback();
                });
            });

            it('waits for an expected host to reply', function(callback) {
                // This test is only feasible if the timeout is pretty low. Make sure default timeout never impacts it
                this.timeout(2000);

                cowboy.presence.broadcast(function(err) {
                    assert.ok(!err);

                    // Make a 2nd host, host1, present
                    presenceUtil.present('host1', Date.now(), function(err) {
                        assert.ok(!err);

                        cowboy.presence.consume(function(err) {
                            assert.ok(!err);

                            var requestOptions = {
                                'timeout': {
                                    'idle': 60*60*1000
                                },
                                'expect': null
                            };

                            // Create a request that expects a response from only host1 and idles out after a crazy amount of time
                            _setupRequestAndListener('test', null, requestOptions, function(listener, request) {
                                var _request = false;

                                // End our own host's (not host1's) request immediately
                                listener.on('request', function(body, reply, end) {
                                    assert.ok(!_request);
                                    _request = true;

                                    end(function(err) {
                                        assert.ok(!err);
                                    });
                                });

                                // Ensure that the request never ends because it should be waiting around for the present host host1's
                                // response for an hour.
                                request.on('end', function() { assert.fail(); });

                                // We just make sure it hangs for at least 500ms
                                setTimeout(function() {
                                    listener.close(callback);
                                }, 500);
                            });
                        });
                    });
                });
            });

            it('waits for an unexpected host to finish if it received a response from it any way', function(callback) {
                cowboy.presence.broadcast(function(err) {
                    assert.ok(!err);

                    // Send a request that idles out after a bit of time, and is only told to wait for this machine's host to reply
                    _setupRequestAndListener('test', null, {'timeout': {'idle': 100}}, function(listener, request) {

                        // Our host receives the request
                        listener.on('request', function(body, reply, end) {

                            // Set up a channel with which we can send a mock "ack" so the request will hang on it even if it wasn't expecting it
                            var host1Channel = cowboy.redis.createChannel(conversationsBroadcastUtil.getReplyChannelName('test', request.broadcastId()));
                            host1Channel.send({'type': 'ack', 'host': 'host1'}, function(err) {
                                assert.ok(!err);

                                // End the response from our host. This should not end the request though as we have acknowledged from another host
                                end(function(err) { assert.ok(!err); });

                                // Ensure after this end frame is received, the request eventually idles out while still expecting the rogue host1 host
                                request.on('hostEnd', function(host, response) {
                                    assert.strictEqual(host, _host());
                                    assert.ok(_.isEmpty(response));

                                    // Request times out
                                    request.on('end', function(responses, expecting) {
                                        assert.ok(responses[_host()]);
                                        assert.ok(_.isEmpty(responses[_host()]));
                                        assert.ok(responses['host1']);
                                        assert.ok(_.isEmpty(responses['host1']));
                                        assert.ok(expecting);
                                        assert.strictEqual(expecting.length, 1);
                                        assert.strictEqual(expecting[0], 'host1');
                                        return listener.close(callback);
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

var _setupRequestAndListener = function(name, requestData, requestOptions, callback) {
    requestData = requestData || {};
    requestOptions = requestOptions || {};
    requestOptions.expect = (requestOptions.expect !== undefined) ? requestOptions.expect : [cowboy.data.get('hostname')];
    requestOptions.timeout = requestOptions.timeout || {};

    // Set the timeouts to an unreasonable amount of time since the only tests that should "timeout successfully" are those
    // we explicitly want to to configure to do so
    requestOptions.timeout.connect = requestOptions.timeout.connect || 60*60*1000;
    requestOptions.timeout.idle = requestOptions.timeout.idle || 60*60*1000;

    var listener = cowboy.conversations.broadcast.listen('test');
    var request = cowboy.conversations.broadcast.request(name, requestData, requestOptions);
    return callback(listener, request);
};

var _host = function() {
    return cowboy.data.get('hostname');
};