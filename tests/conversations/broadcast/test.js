
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

            var listener = cowboy.conversations.broadcast.listen('test');
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
            var request = cowboy.conversations.broadcast.request('test', 'test-request', {'expect': [cowboy.data.get('hostname')]});
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
                return callback();
            });
        });
    });
});