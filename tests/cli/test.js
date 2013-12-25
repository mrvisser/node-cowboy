
var _ = require('underscore');
var assert = require('assert');
var colors = require('colors');
var cowboy = require('../../index');
var cowboyCli = require('cowboy-cli-api');
var extend = require('extend');
var shell = require('shelljs');
var util = require('util');

var _cattleToKill = [];
var _testModulesDir = util.format('%s/test_modules', __dirname);

var _defaultCowboyConfig = {
    'log': {
        'level': 'trace',
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

describe('CLI', function() {

    beforeEach(function(callback) {
        // Prepare the default cattle process
        _startCattle(_defaultCattleConfig, function(err) {
            assert.ok(!err);
            return callback();
        });
    });

    afterEach(function(callback) {
        // Kill all kattle processes
        return _killCattle(callback);
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
            cowboyCli.cowboy(_defaultCowboyConfig, ['--help'], 'cowboy:ping', function(code, output) {
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
                assert.strictEqual(output[3], '  _cowboy_duplicate_command:ping');
                assert.strictEqual(output[4], '  _cowboy_lifecycle:test-lifecycle');
                assert.strictEqual(output[5], '  _cowboy_lifecycle:test-ping');
                assert.strictEqual(output[6], '  _cowboy_lifecycle:test-timeout');
                assert.strictEqual(output[7], '  cowboy:describe');
                assert.strictEqual(output[8], '  cowboy:install');
                assert.strictEqual(output[9], '  cowboy:ping');
                assert.strictEqual(output[10], '  cowboy:uninstall');
                assert.strictEqual(output[12], 'Use "cowboy <command> --help" to show how to use a particular command');
                return callback();
            });
        });
    });

    describe('Commands', function() {

        describe('Lifecycle', function() {

            it('stops processing on validation failure', function(callback) {
                cowboyCli.cowboy(_defaultCowboyConfig, 'test-lifecycle', function(code, output) {
                    assert.strictEqual(code, 1);

                    var lines = output.split('\n');
                    assert.strictEqual(lines.length, 7);
                    assert.strictEqual(lines[0], 'validate');
                    assert.strictEqual(lines[1], 'Error invoking command:');
                    assert.strictEqual(lines[3], 'validation failed');
                    assert.strictEqual(lines[5], 'Try running "cowboy test-lifecycle --help" for more information.');
                    return callback();
                });
            });

            it('invokes the full command lifecycle', function(callback) {
                cowboyCli.cowboy(_defaultCowboyConfig, 'test-lifecycle', ['-v', 'validated', '-b', 'before', '-o', 'output', '-h', 'host ended', '-e', 'ended'], function(code, output) {
                    assert.strictEqual(code, 0);

                    var lines = output.split('\n');
                    assert.strictEqual(lines.length, 7);
                    assert.strictEqual(lines[0], 'validate');
                    assert.strictEqual(lines[1], 'validate: validated');
                    assert.strictEqual(lines[2], 'timeout');
                    assert.strictEqual(lines[3], 'before: before');
                    assert.strictEqual(lines[4], util.format('%s: exec: output (arg: host ended)', cowboy.data.get('hostname')));
                    assert.strictEqual(lines[5], util.format('%s: exec: output (arg: ended)', cowboy.data.get('hostname')));
                    return callback();
                });
            });

            it('respects the timeout provided by the command', function(callback) {
                cowboyCli.cowboy(_defaultCowboyConfig, 'test-timeout', function(code, output) {
                    assert.strictEqual(code, 0);

                    var lines = output.split('\n');

                    // We had no response from the local host
                    assert.ok(_.isEmpty(JSON.parse(lines[0])[cowboy.data.get('hostname')]));

                    // The local host was in the expecting array
                    assert.strictEqual(JSON.parse(lines[1])[0], cowboy.data.get('hostname'));
                    return callback();
                });
            });

            it('chooses the correct command when namespaced by module', function(callback) {
                cowboyCli.cowboy(_defaultCowboyConfig, '_cowboy_duplicate_command:ping', function(code, output) {
                    assert.strictEqual(code, 0);
                    assert.strictEqual(output, 'pang\n');
                    return callback();
                });
            });

            it('throws an error when chosen command is ambiguous', function(callback) {
                cowboyCli.cowboy(_defaultCowboyConfig, 'ping', function(code, output) {
                    assert.strictEqual(code, 1);
                    assert.notEqual(output.indexOf('Command "ping" is ambiguous. Use the module namespace to more specifically identify the command (e.g., cowboy:ping)'), -1);
                    return callback();
                });
            });
        });

        describe('Ping', function() {

            it('outputs the proper data and format', function(callback) {
                cowboyCli.cowboy(_defaultCowboyConfig, 'cowboy:ping', function(code, output) {
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

                    cowboyCli.cowboy(_defaultCowboyConfig, 'cowboy:ping', function(code, output) {
                        kill(false, function() {
                            assert.strictEqual(code, 0);
                            _assertPingOutput(output, [cowboy.data.get('hostname'), 'test-host'], []);
                            return callback();
                        });
                    });
                });
            });
        });

        describe('Install', function() {

            beforeEach(function(callback) {
                // Destroy the cattle node already running, we want to restart it with a new modules dir
                _killCattle(function() {
                    return _createInstallCattleHosts([null, 'host_a'], callback);
                });
            });

            afterEach(function(callback) {
                _killCattle(function() {
                    // Remove the host_a modules directory
                    shell.rm('-rf', util.format('%s/node_modules', _installModulesDir('host_a')));
                    shell.rm('-rf', util.format('%s/node_modules', _installModulesDir()));
                    return callback();
                });
            });

            it('installs a module on multiple cattle nodes', function(callback) {
                this.timeout(5000);

                var cowboyConfig = extend(true, _defaultCowboyConfig, {'modules': {'dir': _installModulesDir()}});
                var from = util.format('%s/node_modules/_cowboy_lifecycle', _testModulesDir);

                // Install the lifecycle plugin
                cowboyCli.cowboy(cowboyConfig, 'install', [from], function(code, output) {
                    assert.strictEqual(code, 0);

                    var lines = output.split('\n');
                    assert.strictEqual(lines.length, 11);
                    assert.strictEqual(lines[1].indexOf('Installing module'), 0);
                    assert.ok(lines[1].indexOf(from) !== -1);

                    // Ensure there are 2 response lines, one for host_a and one for the local host
                    var words6 = lines[6].split(' ');
                    var words7 = lines[7].split(' ');
                    var hosts = [words6[2], words7[2]];
                    assert.ok(_.contains(hosts, 'host_a'));
                    assert.ok(_.contains(hosts, cowboy.data.get('hostname')));

                    // Ensure both response lines report the proper module and version
                    assert.strictEqual(_.last(words6), '_cowboy_lifecycle@0.0.1');
                    assert.strictEqual(_.last(words7), '_cowboy_lifecycle@0.0.1');

                    // Ensure the test-ping command is installed
                    cowboyCli.cowboy(cowboyConfig, 'test-ping', function(code, output) {
                        assert.strictEqual(code, 0);
                        
                        output = JSON.parse(output);
                        assert.strictEqual(output.host_a[0], 'responded');
                        assert.strictEqual(output[cowboy.data.get('hostname')][0], 'responded');

                        return callback();
                    });
                });
            });

            it('reports an unexpected error when a module fails to install', function(callback) {
                this.timeout(15000);

                var cowboyConfig = extend(true, _defaultCowboyConfig, {'modules': {'dir': _installModulesDir()}});
                var from = 'git://invalid module path';

                // Install the lifecycle plugin
                cowboyCli.cowboy(cowboyConfig, 'install', [from], function(code, output) {
                    assert.strictEqual(code, 0);

                    var lines = output.split('\n');
                    assert.strictEqual(lines.length, 11);
                    assert.strictEqual(lines[1].indexOf('Installing module'), 0);
                    assert.ok(lines[1].indexOf(from) !== -1);

                    // Ensure there are 2 response lines, one for host_a and one for the local host
                    var words6 = lines[6].split(' ');
                    var words7 = lines[7].split(' ');
                    var hosts = [words6[2], words7[2]];
                    assert.ok(_.contains(hosts, 'host_a'));
                    assert.ok(_.contains(hosts, cowboy.data.get('hostname')));

                    // Ensure both response lines report the proper module and version
                    assert.strictEqual(words6.slice(-4).join(' '), 'An unexpected error occurred'.red);
                    assert.strictEqual(words7.slice(-4).join(' '), 'An unexpected error occurred'.red);

                    return callback();
                });
            });

            it('reports an invalid module when an invalid cowboy plugin installs successfully', function(callback) {
                this.timeout(5000);
                var cowboyConfig = extend(true, _defaultCowboyConfig, {'modules': {'dir': _installModulesDir()}});
                var from = util.format('%s/node_modules/_cowboy_invalid_module', _testModulesDir);

                // Install the lifecycle plugin
                cowboyCli.cowboy(cowboyConfig, 'install', [from], function(code, output) {
                    assert.strictEqual(code, 0);

                    var lines = output.split('\n');
                    assert.strictEqual(lines.length, 11);
                    assert.strictEqual(lines[1].indexOf('Installing module'), 0);
                    assert.ok(lines[1].indexOf(from) !== -1);

                    // Ensure there are 2 response lines, one for host_a and one for the local host
                    var words6 = lines[6].split(' ');
                    var words7 = lines[7].split(' ');
                    var hosts = [words6[2], words7[2]];
                    assert.ok(_.contains(hosts, 'host_a'));
                    assert.ok(_.contains(hosts, cowboy.data.get('hostname')));

                    // Ensure both response lines report the proper module and version
                    assert.strictEqual(words6.slice(-8).join(' '), 'Installed module is not a cowboy plugin module'.red);
                    assert.strictEqual(words7.slice(-8).join(' '), 'Installed module is not a cowboy plugin module'.red);

                    return callback();
                });
            });
        });

        describe('Uninstall', function() {

            beforeEach(function(callback) {
                // Destroy the cattle node already running, we want to restart it with a new modules dir
                _killCattle(function() {
                    return _createInstallCattleHosts([null, 'host_a'], callback);
                });
            });

            afterEach(function(callback) {
                _killCattle(function() {
                    // Remove the host_a modules directory
                    shell.rm('-rf', util.format('%s/node_modules', _installModulesDir('host_a')));
                    shell.rm('-rf', util.format('%s/node_modules', _installModulesDir()));
                    return callback();
                });
            });

            it('uninstalls a module on multiple cattle nodes', function(callback) {
                this.timeout(5000);

                var cowboyConfig = extend(true, _defaultCowboyConfig, {'modules': {'dir': _installModulesDir()}});
                var from = util.format('%s/node_modules/_cowboy_lifecycle', _testModulesDir);

                // Install the lifecycle plugin
                cowboyCli.cowboy(cowboyConfig, 'install', [from], function(code, output) {
                    assert.strictEqual(code, 0);

                    // Sanity check that the command is in the command list
                    cowboyCli.cowboy(cowboyConfig, ['--list'], function(code, output) {
                        assert.strictEqual(code, 0);
                        assert.notEqual(output.indexOf('test-ping'), -1);

                        // Uninstall the module and ensure the test-ping command is no longer available
                        cowboyCli.cowboy(cowboyConfig, 'uninstall', ['_cowboy_lifecycle'], function(code, output) {
                            assert.strictEqual(code, 0);
                            assert.strictEqual(output.indexOf('test-ping'), -1);
                            return callback();
                        });
                    });
                });
            });

            it('reports an error when uninstalling an non-existent module', function(callback) {
                this.timeout(5000);

                var cowboyConfig = extend(true, _defaultCowboyConfig, {'modules': {'dir': _installModulesDir()}});
                var from = util.format('%s/node_modules/_cowboy_lifecycle', _testModulesDir);

                // Uninstall the module and ensure the test-ping command is no longer available
                cowboyCli.cowboy(cowboyConfig, 'uninstall', ['_cowboy_module_does_not_exist'], function(code, output) {
                    assert.strictEqual(code, 0);

                    var lines = output.split('\n');
                    var words6 = lines[6].split(' ');
                    var words7 = lines[7].split(' ');

                    assert.strictEqual(words6.slice(-7).join(' '), 'Tried to get a non-existing module: "_cowboy_module_does_not_exist"'.red);
                    assert.strictEqual(words7.slice(-7).join(' '), 'Tried to get a non-existing module: "_cowboy_module_does_not_exist"'.red);
                    return callback();
                });
            });
        });

        describe('Describe', function() {

            beforeEach(function(callback) {
                // Destroy the cattle node already running, we want to restart it with a new modules dir
                _killCattle(function() {
                    return _createInstallCattleHosts([null, 'host_a'], callback);
                });
            });

            it('describes the cowboy module', function(callback) {
                this.timeout(5000);

                var cowboyConfig = extend(true, _defaultCowboyConfig, {'modules': {'dir': _installModulesDir()}});
                cowboyCli.cowboy(cowboyConfig, 'describe', function(code, output) {
                    assert.strictEqual(code, 0);
                    
                    var lines = output.split('\n');
                    assert.strictEqual(lines.length, 8);

                    var words3 = lines[3].split(' ');
                    var words5 = lines[5].split(' ');

                    // Ensure both hosts were output
                    var outputHosts = [words3[2], words5[2]];
                    assert.strictEqual(_.difference(outputHosts, [cowboy.data.get('hostname'), 'host_a']).length, 0);

                    // Ensure both lines contain the module name and commands
                    assert.strictEqual(lines[3].slice(30, 37), 'cowboy@');
                    assert.strictEqual(lines[3].slice(58).indexOf('describe, install, ping, uninstall'), 0);
                    assert.strictEqual(lines[5].slice(30, 37), 'cowboy@');
                    assert.strictEqual(lines[5].slice(58).indexOf('describe, install, ping, uninstall'), 0);

                    return callback();
                });
            });

            it('describes multiple modules and commands', function(callback) {
                this.timeout(5000);

                var cowboyConfig = extend(true, _defaultCowboyConfig, {'modules': {'dir': _installModulesDir()}});
                var from = util.format('%s/node_modules/_cowboy_lifecycle', _testModulesDir);

                // Install the lifecycle plugin
                cowboyCli.cowboy(cowboyConfig, 'install', [from], function(code, output) {
                    assert.strictEqual(code, 0);

                    cowboyCli.cowboy(cowboyConfig, 'describe', function(code, output) {
                        assert.strictEqual(code, 0);

                        var lines = output.split('\n');
                        assert.strictEqual(lines.length, 10);

                        var words3 = lines[3].split(' ');
                        var words4 = lines[4].split(' ');
                        var words6 = lines[6].split(' ');
                        var words7 = lines[7].split(' ');
                        var outputHosts = [words3[2], words6[2]];
                        assert.strictEqual(_.difference(outputHosts, [cowboy.data.get('hostname'), 'host_a']).length, 0);

                        // The lines following the host should be an empty cell as we only show each host once
                        assert.strictEqual(words4[2], '');
                        assert.strictEqual(words7[2], '');

                        // Ensure the first host first line contains the lifecycle module and its commands
                        assert.strictEqual(lines[3].slice(30, 53), '_cowboy_lifecycle@0.0.1');
                        assert.strictEqual(lines[3].slice(58).indexOf('test-lifecycle, test-ping, test-timeout'), 0);

                        // Ensure the first host second line contains the cowboy module and its commands
                        assert.strictEqual(lines[4].slice(30, 37), 'cowboy@');
                        assert.strictEqual(lines[4].slice(58).indexOf('describe, install, ping, uninstall'), 0);

                        // Ensure the second host first line contains the lifecycle module and its commands
                        assert.strictEqual(lines[6].slice(30, 53), '_cowboy_lifecycle@0.0.1');
                        assert.strictEqual(lines[6].slice(58).indexOf('test-lifecycle, test-ping, test-timeout'), 0);

                        // Ensure the second host second line contains the cowboy module and its commands
                        assert.strictEqual(lines[7].slice(30, 37), 'cowboy@');
                        assert.strictEqual(lines[7].slice(58).indexOf('describe, install, ping, uninstall'), 0);

                        return callback();
                    });
                });
            });
        });
    });

    describe('Filters', function() {

        describe('Host', function() {

            it('filters based on a plain string', function(callback) {
                this.timeout(5000);

                // Start a second cattle server with custom host
                var secondHostName = 'test-host-' + Math.floor(Math.random() * 1000);
                var secondCattleConfig = _.extend({}, _defaultCattleConfig, {'data': {'hostname': secondHostName}});
                cowboyCli.cattle(secondCattleConfig, function(err, kill) {
                    assert.ok(!err);

                    cowboyCli.cowboy(_defaultCowboyConfig, ['-H', secondHostName], 'cowboy:ping', function(codeOnlyTestHost, outputOnlyTestHost) {
                        cowboyCli.cowboy(_defaultCowboyConfig, ['-H', 'test'], 'cowboy:ping', function(codeNoHosts, outputNoHosts) {
                            cowboyCli.cowboy(_defaultCowboyConfig, ['-H', secondHostName, '-H', cowboy.data.get('hostname')], 'cowboy:ping', function(codeBothHosts, outputBothHosts) {
                                kill(false, function(code, signal) {

                                    // The first invokation should have only the test host
                                    assert.strictEqual(codeOnlyTestHost, 0);
                                    _assertPingOutput(outputOnlyTestHost, [secondHostName], [cowboy.data.get('hostname')]);

                                    // The second invokation should not have matched any hosts
                                    assert.strictEqual(codeNoHosts, 0);
                                    assert.strictEqual(outputNoHosts.split('\n').length, 5);

                                    // The third invokation should have matched both hosts
                                    assert.strictEqual(codeBothHosts, 0);
                                    _assertPingOutput(outputBothHosts, [secondHostName, cowboy.data.get('hostname')], []);
                                    return callback();
                                });
                            });
                        });
                    });
                });
            });

            it('filters based on a regular expression', function(callback) {
                this.timeout(5000);

                // Start a second cattle server with custom host
                var nonce = Math.floor(Math.random() * 1000);
                var secondHostName = 'test-host-' + nonce;
                var secondCattleConfig = _.extend({}, _defaultCattleConfig, {'data': {'hostname': secondHostName}});
                cowboyCli.cattle(secondCattleConfig, function(err, kill) {
                    assert.ok(!err);

                    // Verify we only get test-host
                    cowboyCli.cowboy(_defaultCowboyConfig, ['-H', util.format('/^.*%d$/', nonce)], 'cowboy:ping', function(codeOnlyTestHost, outputOnlyTestHost) {
                        cowboyCli.cowboy(_defaultCowboyConfig, ['-H', util.format('/^%d/', nonce)], 'cowboy:ping', function(codeNoHosts, outputNoHosts) {
                            cowboyCli.cowboy(_defaultCowboyConfig, ['-H', util.format('/^%s$/', secondHostName), '-H', util.format('/^%s$/', cowboy.data.get('hostname'))], 'cowboy:ping', function(codeBothHosts, outputBothHosts) {
                                kill(false, function(code, signal) {

                                    // The first invokation should have only the test host
                                    assert.strictEqual(codeOnlyTestHost, 0);
                                    _assertPingOutput(outputOnlyTestHost, [secondHostName], [cowboy.data.get('hostname')]);

                                    // The second invokation should not have matched any hosts
                                    assert.strictEqual(codeNoHosts, 0);
                                    assert.strictEqual(outputNoHosts.split('\n').length, 5);

                                    // The third invokation should have matched both hosts
                                    assert.strictEqual(codeBothHosts, 0);
                                    _assertPingOutput(outputBothHosts, [secondHostName, cowboy.data.get('hostname')], []);
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

var _startCattle = function(configs, callback) {
    if (!_.isArray(configs)) {
        return _startCattle([configs], callback);
    }

    var numToStart = configs.length;
    var _err = null;
    _.each(configs, function(config) {
        cowboyCli.cattle(config, function(err, kill) {
            if (err) {
                _err = err;
            }

            _cattleToKill.push(kill);
            numToStart--;
            if (numToStart === 0) {
                return callback(_err);
            }
        });
    });
};

var _killCattle = function(callback) {
    var numToKill = _cattleToKill.length;
    if (numToKill === 0) {
        return callback();
    }

    _.each(_cattleToKill, function(kill) {
        kill(false, function() {
            numToKill--;
            if (numToKill === 0) {
                _cattleToKill = [];
                return callback();
            }
        });
    });
};

var _createInstallCattleHosts = function(hosts, callback) {
    var configs = _.map(hosts, function(host) {
        return extend(true, {}, _defaultCattleConfig, {
            'data': {
                'hostname': host || cowboy.data.get('hostname')
            },
            'modules': {
                'dir': _installModulesDir(host)
            }
        });
    });

    return _startCattle(configs, callback);
};

var _installModulesDir = function(host) {
    if (host) {
        return util.format('%s/._cowboy_test_install/%s', __dirname, host);
    } else {
        return util.format('%s/._cowboy_test_install', __dirname);
    }
};

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
