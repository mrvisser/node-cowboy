
var assert = require('assert');
var cowboy = require('../index');
var cowboyCli = require('cowboy-cli-api');
var testsUtil = require('./util');
var util = require('util');

before(function(callback) {
    cowboyCli.cowboyPath(util.format('%s/../bin/cowboy.js', __dirname));
    cowboyCli.cattlePath(util.format('%s/../bin/cattle.js', __dirname));
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