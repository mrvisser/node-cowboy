
var _ = require('underscore');
var assert = require('assert');
var cowboy = require('../../../index');

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

            it('times out with an error when it receives no reply', function(callback) {
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
        });
    });
});

var _setupRequestAndListener = function(name, requestData, requestOptions, callback) {
    requestData = requestData || {};
    requestOptions = requestOptions || {};
    requestOptions.expect = requestOptions.expect || [cowboy.data.get('hostname')];

    var listener = cowboy.conversations.broadcast.listen('test');
    var request = cowboy.conversations.broadcast.request(name, requestData, requestOptions);
    return callback(listener, request);
};