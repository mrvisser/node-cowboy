
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
                    _assertPingOutput(output, [cowboy.data.get('hostname')], ['test-host']);
                    return callback();
                });
            });

            it('accepts replies from multiple cattle servers', function(callback) {
                // Start a second cattle server with custom host
                var secondCattleConfig = _.extend({}, _defaultCattleConfig, {'data': {'hostname': 'test-host'}});
                cowboyCli.cattle(secondCattleConfig, function(err, kill) {
                    assert.ok(!err);

                    cowboyCli.cowboy(_defaultCowboyConfig, 'ping', function(code, output) {
                        kill(false, function() {
                            assert.strictEqual(code, 0);
                            _assertPingOutput(output, [cowboy.data.get('hostname'), 'test-host'], []);
                            return callback();
                        });
                    });
                });
            });
        });
    });

    describe('Filters', function() {

        describe('Host', function() {

            it('filters based on a plain string', function(callback) {
                // Start a second cattle server with custom host
                var secondCattleConfig = _.extend({}, _defaultCattleConfig, {'data': {'hostname': 'test-host'}});
                cowboyCli.cattle(secondCattleConfig, function(err, kill) {
                    assert.ok(!err);

                    // Verify we only get test-host
                    cowboyCli.cowboy(_defaultCowboyConfig, ['-H', 'test-host'], 'ping', function(code, output) {
                        assert.strictEqual(code, 0);
                        _assertPingOutput(output, ['test-host'], [cowboy.data.get('hostname')]);

                        // Verify we get no hosts
                        cowboyCli.cowboy(_defaultCowboyConfig, ['-H', 'test'], 'ping', function(code, output) {
                            assert.strictEqual(code, 0);
                            assert.strictEqual(output.split('\n').length, 5);

                            // Verify we get our local host and test-host with 2 filters
                            cowboyCli.cowboy(_defaultCowboyConfig, ['-H', 'test-host', '-H', cowboy.data.get('hostname')], 'ping', function(code, output) {
                                assert.strictEqual(code, 0);
                                _assertPingOutput(output, ['test-host', cowboy.data.get('hostname')], []);
                                kill(false, function(code, signal) {
                                    return callback();
                                });
                            });
                        });
                    });
                });
            });

        });
    });
});

var _assertPingOutput = function(output, expectHosts, expectNotHosts) {
    var lines = output.split('\n');

    var hostLatencies = {};
    var endHosts = false;
    var min = 0;
    var max = 0;
    _.each(lines.slice(1), function(line) {
        if (endHosts) {
            return;
        } else if (line === '') {
            endHosts = true;
            return;
        }

        line = line.split(' ');
        var host = _.first(line);
        var latency = _.last(line);
        assert.strictEqual(/[1-9][0-9]*ms/.test(latency), true);

        // Convert to a strict number
        latency = parseInt(latency.slice(0, -2), 10);
        assert.ok(!isNaN(latency));
        assert.ok(latency >= max);
        assert.ok(max >= min);

        // min is the first latency (it is output first), max is the last latency
        min = min || latency;
        max = latency;

        hostLatencies[host] = latency;
    });

    // Ensure we have all the expected hosts and none of the unexpected hosts
    _.each(expectHosts, function(expectHost) { assert.ok(hostLatencies[expectHost]); });
    _.each(expectNotHosts, function(expectNotHost) { assert.ok(!hostLatencies[expectNotHost]); });

    // Verify the latency data
    var numHosts = _.keys(hostLatencies).length;

    // Ensure the average is more than the min and less than the max
    var outAvg = parseInt(_.last(lines[numHosts + 3].split(' ')).slice(0, -2), 10);
    assert.ok(!isNaN(outAvg));
    assert.ok(outAvg >= min);
    assert.ok(outAvg <= max);

    // Ensure the max and min and timeout lines are accurate
    assert.strictEqual(lines[numHosts + 4], util.format('Min: %dms', min));
    assert.strictEqual(lines[numHosts + 5], util.format('Max: %dms', max));
    assert.strictEqual(lines[numHosts + 6], 'Tmt: 0');
};
