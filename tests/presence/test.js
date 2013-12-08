
var _ = require('underscore');
var assert = require('assert');
var cowboy = require('../../index');

describe('Presence', function() {

    var _host = null;

    before(function() {
        _host = cowboy.data.get('hostname');
        assert.ok(_host);
    });

    beforeEach(function(callback) {
        cowboy.presence.init({}, callback);
    });

    it('adds a host entry when presence is consumed', function(callback) {
        // Begin the broadcast presence interval
        cowboy.presence.broadcast(function(err) {
            assert.ok(!err);

            cowboy.presence.consume(function(err) {
                assert.ok(!err);
                assert.ok(_.contains(cowboy.presence.hosts(), _host));
                return callback();
            });
        });
    });

    it('removes a host entry when absence is consumed', function(callback) {
        // First emit presence
        cowboy.presence.broadcast(function(err) {
            assert.ok(!err);

            // Consume and verify that presence
            cowboy.presence.consume(function(err) {
                assert.ok(!err);
                assert.ok(_.contains(cowboy.presence.hosts(), _host));

                // Emit absence for this host now
                _absence([_host], function() {

                    // Consume and verify that presence has disappeared
                    cowboy.presence.consume(function(err) {
                        assert.ok(!err);
                        assert.ok(!_.contains(cowboy.presence.hosts(), _host));
                        return callback();
                    });
                });
            });
        });
    });

    it('removes all host entries when presence is cleared', function(callback) {
        var hosts = ['1', '2'];
        _presence(hosts, function() {

            // Ensure the hosts' presence is consumed
            cowboy.presence.consume(function(err) {
                assert.ok(!err);
                _assertArrayEqual(cowboy.presence.hosts(), hosts);

                // Clear the presence
                cowboy.presence.clear(function(err) {
                    assert.ok(!err);
                    assert.ok(_.isEmpty(cowboy.presence.hosts()));

                    // Consume presence again to ensure the stored version is also empty
                    cowboy.presence.consume(function(err) {
                        assert.ok(!err);
                        assert.ok(_.isEmpty(cowboy.presence.hosts()));
                        return callback();
                    });
                });
            });
        });
    });

    it('adds and removes multiple presence and absence entries when a number of hosts emit presence in quick succession', function(callback) {
        cowboy.presence.consume(function() {
            var hosts = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
            var i = 0;

            // First emit lots of presence in the same process tick
            _presence(hosts, function() {

                // Consume the presence entries
                cowboy.presence.consume(function(err) {
                    assert.ok(!err);
                    _assertArrayEqual(cowboy.presence.hosts(), hosts);

                    // Emit absence entries for all those hosts now
                    _absence(hosts, function() {

                        // Consume again and verify we no longer have present hosts
                        cowboy.presence.consume(function(err) {
                            assert.ok(!err);
                            assert.ok(_.isEmpty(cowboy.presence.hosts()));
                            return callback();
                        });
                    });
                });
            });
        });
    });

    it('adds and removes multiple presence and expired entries when a number of hosts emit presence in quick succession', function(callback) {
        cowboy.presence.consume(function() {
            var hosts = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
            var i = 0;

            // First emit lots of presence in the same process tick
            _presence(hosts, function() {

                // Consume the presence entries
                cowboy.presence.consume(function(err) {
                    assert.ok(!err);
                    assert.strictEqual(cowboy.presence.hosts().length, 10);
                    assert.ok(_.chain(cowboy.presence.hosts()).difference(hosts).isEmpty().value());

                    // Emit absence entries for all those hosts now
                    _expire(hosts, function() {

                        // Consume again and verify we no longer have present hosts
                        cowboy.presence.consume(function(err) {
                            assert.ok(!err);
                            assert.ok(_.isEmpty(cowboy.presence.hosts()));
                            return callback();
                        });
                    });
                });
            });
        });
    });

    var _assertArrayEqual = function(one, other) {
        assert.ok(_.isArray(one));
        assert.ok(_.isArray(other));
        assert.strictEqual(one.length, other.length);
        assert.ok(_.chain(one).difference(other).isEmpty().value());
    };

    var _presence = function(hosts, callback) {
        hosts = hosts.slice();
        if (_.isEmpty(hosts)) {
            return callback();
        }

        cowboy.redis.client().hset('presence', hosts.shift(), Date.now(), function(err) {
            assert.ok(!err);
            return _presence(hosts, callback);
        });
    };

    var _absence = function(hosts, callback) {
        hosts = hosts.slice();
        if (_.isEmpty(hosts)) {
            return callback();
        }

        cowboy.redis.client().hdel('presence', hosts.shift(), function(err) {
            assert.ok(!err);
            return _absence(hosts, callback);
        });
    };

    var _expire = function(hosts, callback) {
        hosts = hosts.slice();
        if (_.isEmpty(hosts)) {
            return callback();
        }

        // Last entry was a minute ago for all hosts
        cowboy.redis.client().hset('presence', hosts.shift(), Date.now() - 60000, function(err) {
            assert.ok(!err);
            return _expire(hosts, callback);
        });
    };
});