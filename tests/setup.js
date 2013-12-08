
var assert = require('assert');
var cowboy = require('../index');
var testsUtil = require('./util');

before(function(callback) {
    testsUtil.reloadContext(callback);
});

beforeEach(function(callback) {
    cowboy.logger.system().info('Beginning test: %s', this.currentTest.title);

    // Ensure we always start a test with empty presence
    cowboy.presence.clear(function(err) {
        assert.ok(!err);
        return callback();
    });
});

afterEach(function(callback) {
    cowboy.logger.system().info('Finished test: %s', this.currentTest.title);
    return callback();
});