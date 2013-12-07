
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
                listener.on('request', function(request, send, end) {
                    assert.ok(!_request);
                    assert.strictEqual(request, 'test-request');
                    _request = true;

                    // Send a response
                    send('test-response', function(err) {
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

            describe('send', function() {
                it('gives an error when sending after the response has ended', function(callback) {
                    _setupRequestAndListener('test', null, null, function(listener, request) {

                        // Receive the request
                        listener.on('request', function(request, send, end) {

                            // Reply with "first" and ensure it succeeds as a sanity check
                            send('first', function(err) {
                                assert.ok(!err);

                                // End the response
                                end(function(err) {
                                    assert.ok(!err);

                                    // Try reply frame after the end, this should fail as we already ended
                                    send('second', function(err) {
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