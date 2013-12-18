
var _ = require('underscore');
var assert = require('assert');
var cowboy = require('../../index');
var cowboyCli = require('cowboy-cli-api');
var util = require('util');

describe('CLI', function() {

    var _kill = null;
    var _testModulesDir = util.format('%s/test_modules', __dirname);

    var _defaultCowboyConfig = {
        'log': {
            'path': util.format('%s/cowboy.log', __dirname)
        },
        'modules': {
            'dir': _testModulesDir
        }
    };

    var _defaultCattleConfig = {
        'log': {
            'level': 'trace',
            'path': util.format('%s/cattle.log', __dirname)
        },
        'modules': {
            'dir': _testModulesDir
        }
    };

    beforeEach(function(callback) {
        // Prepare the cattle process
        cowboyCli.cattle(_defaultCattleConfig, function(err, kill) {
            assert.ok(!err);
            _kill = kill;
            return callback();
        });
    });

    afterEach(function(callback) {
        _kill(false, function(code, signal) {
            return callback();
        });
    });

    it('returns error code 1 with invalid arguments', function(callback) {
        cowboyCli.cowboy(_defaultCowboyConfig, function(code, output) {
            assert.strictEqual(code, 1);
            return callback();
        });
    });

    describe('--help', function() {
        it('returns help info when run with --help', function(callback) {
            cowboyCli.cowboy(_defaultCowboyConfig, ['--help'], function(code, output) {
                assert.strictEqual(code, 0);
                assert.strictEqual(output.indexOf('Usage: cowboy --help | --list | <command> [--help] | <command> [-c <config file>] [--log-level <level>] [--log-path <path>] [-- <command specific args>]'), 0);
                return callback();
            });
        });

        it('returns command help info when a command is run with --help', function(callback) {
            cowboyCli.cowboy(_defaultCowboyConfig, ['--help'], 'ping', function(code, output) {
                assert.strictEqual(code, 0);
                assert.strictEqual(output.indexOf('\nSend a simple ping to cattle nodes to determine if they are active and listening.'), 0);
                return callback();
            });
        });
    });

    describe('--list', function() {
        it('lists the available commands when run with --list', function(callback) {
            cowboyCli.cowboy(_defaultCowboyConfig, ['--list'], function(code, output) {
                assert.strictEqual(code, 0);
                output = output.split('\n');
                assert.strictEqual(output[1], 'Available Command Plugins:');
                assert.strictEqual(output[3], '  ping');
                assert.strictEqual(output[5], 'Use "cowboy <command> --help" to show how to use a particular command');
                return callback();
            });
        });
    });

    describe('Commands', function() {
        
        describe('Ping', function() {

            it('outputs the proper data and format', function(callback) {
                cowboyCli.cowboy(_defaultCowboyConfig, 'ping', function(code, output) {
                    assert.strictEqual(code, 0);
                    output = output.split('\n');

                    var latencyLine = output[1].split(' ');
                    assert.strictEqual(_.first(latencyLine), cowboy.data.get('hostname'));
                    assert.strictEqual(/[0-9]+ms/.test(_.last(latencyLine)), true);

                    var latency = _.last(latencyLine).slice(0, -2);
                    assert.strictEqual(output[4], util.format('Avg: %d.00ms', latency));
                    assert.strictEqual(output[5], util.format('Min: %dms', latency));
                    assert.strictEqual(output[6], util.format('Max: %dms', latency));
                    assert.strictEqual(output[7], 'Tmt: 0');

                    return callback();
                });
            });

            it('accepts replies from multiple cattle servers', function(callback) {
                var secondCattleConfig = _.extend({}, _defaultCattleConfig, {'data': {'hostname': 'test-host'}});
                cowboyCli.cattle(secondCattleConfig, function(err, kill) {
                    assert.ok(!err);

                    cowboyCli.cowboy(_defaultCowboyConfig, 'ping', function(code, output) {
                        kill(false, function() {
                            assert.strictEqual(code, 0);

                            output = output.split('\n');

                            var hasLocalHost = false;
                            var hasTestHost = false;
                            var min = 0;
                            var max = 0;

                            var line = output[1].split(' ');
                            if (_.first(line) === 'test-host') {
                                hasTestHost = true;
                            } else if (_.first(line) === cowboy.data.get('hostname')) {
                                hasLocalHost = true;
                            }

                            // First line should always be the smallest
                            min = parseInt(_.last(line).slice(0, -2), 10);

                            line = output[2].split(' ');
                            if (_.first(line) === 'test-host') {
                                hasTestHost = true;
                            } else if (_.first(line) === cowboy.data.get('hostname')) {
                                hasLocalHost = true;
                            }

                            // Second line is higher
                            max = parseInt(_.last(line).slice(0, -2), 10);

                            assert.ok(hasTestHost);
                            assert.ok(hasLocalHost);
                            assert.ok(!isNaN(min));
                            assert.ok(!isNaN(max));
                            assert.ok(max >= min);

                            assert.strictEqual(output[6], util.format('Min: %dms', min));
                            assert.strictEqual(output[7], util.format('Max: %dms', max));

                            return callback();
                        });
                    });
                });
            });
        });
    });
});
