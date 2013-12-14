
var _ = require('underscore');
var assert = require('assert');
var cowboy = require('../../index');
var fs = require('fs');
var shell = require('shelljs');
var testsUtil = require('../util');
var util = require('util');

var _installModulesDir = util.format('%s/._cowboy_test_install', __dirname);
var _testModulesDir = util.format('%s/test_modules', __dirname);
var _testModuleLoadingOrderDir = util.format('%s/test_module_loading_order', __dirname);

var EXPECTED_CORE_COMMANDS = ['ping'];

describe('Plugins', function() {

    beforeEach(function(callback) {
        // Ensure we're running with an empty install modules directory
        _clearModules(true);
        testsUtil.reloadContext({'modules': {'dir': _testModulesDir}}, callback);
    });

    after(function(callback) {
        // Reset the context to default configuration after all tests here are complete
        // _clearModules(true);
        testsUtil.reloadContext(callback);
    });

    describe('init', function() {
        it('loads commands from all modules on start-up', function(callback) {
            return _assertDefaultPluginsDirModuleCommands(callback);
        });
    });

    describe('load', function() {
        it('loads/unloads commands after they have been installed/uninstalled', function(callback) {
            this.timeout(5000);

            testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                assert.ok(!err);

                // Ensure the basic command does not exist yet
                assert.ok(!cowboy.plugins.command('test-basic'));

                // Install the valid basic command
                cowboy.modules.install(util.format('%s/node_modules/_cowboy_default_plugins_dir', _testModulesDir), function(err) {
                    assert.ok(!err);

                    // Ensure the command(s) for the module have been loaded
                    _assertDefaultPluginsDirModuleCommands(function() {

                        // Uninstall the module and ensure its command plugin is no longer loaded
                        cowboy.modules.uninstall('_cowboy_default_plugins_dir', function(err) {
                            assert.ok(!err);
                            assert.ok(!cowboy.plugins.command('test-basic'));

                            return callback();
                        });
                    });
                });
            });
        });

        it('loads the same module and commands twice without an error', function(callback) {
            cowboy.plugins.load('_cowboy_default_plugins_dir', function(err) {
                assert.ok(!err);
                return _assertDefaultPluginsDirModuleCommands(callback);
            });
        });

        it('upgrades a module and reloads its plugins', function(callback) {
            this.timeout(5000);

            testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                assert.ok(!err);

                // Install version 1 and verify it loads correctly
                cowboy.modules.install(util.format('%s/node_modules/_cowboy_plugin_upgrade_v1', _testModulesDir), function(err) {
                    assert.ok(!err);

                    // Ensure v1 has the correct v1 functionality
                    var Command = cowboy.plugins.command('test-version');
                    (new Command()).exec(null, function(response) {
                        assert.strictEqual(response, 'version 1');

                        // Install version 2 and verify it loads correctly
                        cowboy.modules.install(util.format('%s/node_modules/_cowboy_plugin_upgrade_v2', _testModulesDir), function(err) {
                            assert.ok(!err);

                            // Ensure the command now has the correct v2 functionality
                            Command = cowboy.plugins.command('test-version');
                            (new Command()).exec(null, function(response) {
                                assert.strictEqual(response, 'version 2');

                                // Revert back to version 1 and ensure it has reloaded properly
                                cowboy.modules.install(util.format('%s/node_modules/_cowboy_plugin_upgrade_v1', _testModulesDir), function(err) {
                                    assert.ok(!err);

                                    // Ensure we have the v1 functionality again
                                    Command = cowboy.plugins.command('test-version');
                                    (new Command()).exec(null, function(response) {
                                        assert.strictEqual(response, 'version 1');
                                        return callback();
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

        it('loads commands from modules in a way that is consistent with install (ascending)', function(callback) {
            this.timeout(5000);
            return _testLoadOrdering(true, callback);
        });

        it('loads commands from modules in a way that is consistent with install (descending)', function(callback) {
            this.timeout(5000);
            return _testLoadOrdering(false, callback);
        });

        /*!
         * Test that ensures plugin selection and precedence is consistent between installing a plugin
         * and loading a set of plugins from a module
         */
        var _testLoadOrdering = function(asc, callback) {
            var effectiveCommandModule = (asc) ? 'a' : 'b';
            var duplicateCommandModule = (asc) ? 'b' : 'a';

            testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                assert.ok(!err);

                // Install plugin that will have the effective implementation of my-command
                cowboy.modules.install(util.format('%s/node_modules/_cowboy_%s', _testModuleLoadingOrderDir, effectiveCommandModule), function(err) {
                    assert.ok(!err);

                    var numResponses = 0;
                    var _assertResponse = function(response) {
                        assert.strictEqual(response, util.format('module_%s', effectiveCommandModule));
                        numResponses++;
                    };

                    // Verify we have the expected effective functionality
                    var Command = cowboy.plugins.command('my-command');
                    (new Command()).exec(null, _assertResponse, function() {
                        assert.strictEqual(numResponses, 1);

                        // Install plugin that will have the duplicate / ignored implementation of my-command
                        cowboy.modules.install(util.format('%s/node_modules/_cowboy_%s', _testModuleLoadingOrderDir, duplicateCommandModule), function(err) {
                            assert.ok(!err);

                            // Verify we still have the expected effective functionality of my-command
                            Command = cowboy.plugins.command('my-command');
                            (new Command()).exec(null, _assertResponse, function() {
                                assert.strictEqual(numResponses, 2);

                                // Reload the context to ensure loading order is still consistent
                                testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                                    assert.ok(!err);

                                    // Ensure we still have the expected effective functionality even after reload
                                    Command = cowboy.plugins.command('my-command');
                                    (new Command()).exec(null, _assertResponse, function() {
                                        assert.strictEqual(numResponses, 3);
                                        return callback();
                                    });
                                });
                            });
                        });
                    });
                });
            });
        };
    });

    describe('commands', function() {
        it('can return core commands from empty plugins directory', function(callback) {
            testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                assert.ok(!err);

                var commands = cowboy.plugins.commands();
                assert.ok(commands);
                assert.strictEqual(commands.length, EXPECTED_CORE_COMMANDS.length);
                for (var i = 0; i < commands.length; i++) {
                    assert.strictEqual(commands[i], EXPECTED_CORE_COMMANDS[i]);
                }

                return callback();
            });
        });

        it('returns all installed commands with core commands', function(callback) {
            var commands = cowboy.plugins.commands();
            assert.ok(commands);

            // Ensure we have the core commands plus the 2 loaded in this test modules directory
            assert.strictEqual(commands.length, EXPECTED_CORE_COMMANDS.length + 2);
            assert.ok(_.contains(commands, 'test-basic'));
            assert.ok(_.contains(commands, 'test-version'));
            return callback();
        });

        it('will not override or imposter core plugin commands when installing module that overrides them', function(callback) {
            this.timeout(5000);

            var numCorePingReplies = 0;
            var _expectCorePingReply = function(reply) {
                assert.strictEqual(reply, 'pong');
                numCorePingReplies++;
            };

            // First ensure we have core ping functionality in the default test_modules directory where there is one override (_cowboy_override)
            // and one imposter (cowboy)
            var Command = cowboy.plugins.command('ping');
            (new Command()).exec(null, _expectCorePingReply, function() {

                // Reload into our install swag directory to test installing them and ensure they do not replace when installed on-the-fly
                testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                    assert.ok(!err);

                    // Ensure we have core ping in the empty install dir
                    Command = cowboy.plugins.command('ping');
                    (new Command()).exec(null, _expectCorePingReply, function() {

                        // Install override module
                        cowboy.modules.install(util.format('%s/node_modules/_cowboy_override', _testModulesDir), function(err, module) {
                            assert.ok(!err);
                            assert.strictEqual(module.npm.name, '_cowboy_override');

                            // Install cowboy imposter module
                            cowboy.modules.install(util.format('%s/node_modules/cowboy', _testModulesDir), function(err, module) {
                                assert.ok(err);
                                assert.strictEqual(err.message, 'Cannot install cowboy module itself within the cowboy modules directory');
                                assert.ok(!module);

                                // Ensure we still get the core ping
                                Command = cowboy.plugins.command('ping');
                                (new Command()).exec(null, _expectCorePingReply, function() {

                                    // Reload the context to ensure we still have the core ping from a fresh reload
                                    testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                                        assert.ok(!err);

                                        // Ensure we still get the core ping
                                        Command = cowboy.plugins.command('ping');
                                        (new Command()).exec(null, _expectCorePingReply, function() {
                                            // In this test we should have done 4 core ping invokations
                                            assert.strictEqual(numCorePingReplies, 4);
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
    });

    describe('command', function() {
        it('returns a command by name', function(callback) {
            var Command = cowboy.plugins.command('test-basic');
            assert.ok(Command);
            assert.ok(_.isFunction((new Command()).exec));
            return callback();
        });

        it('returns falsey when specifying invalid command', function(callback) {
            var Command = cowboy.plugins.command('non-existing-command');
            assert.ok(!Command);
            return callback();
        });
    });
});

var _assertDefaultPluginsDirModuleCommands = function(callback) {
    var Command = cowboy.plugins.command('test-basic');
    assert.ok(Command);

    var command = new Command();
    assert.strictEqual(command.help().description, 'Basic command plugin');
    command.exec(null, function(msg) {
        assert.strictEqual(msg, 'basic');

        // Ensure none of the invalid commands were loaded
        assert.ok(!cowboy.plugins.command('no_exec_function'));
        assert.ok(!cowboy.plugins.command('not_js'));
        assert.ok(!cowboy.plugins.command('not_js.blah'));

        return callback();
    });
};

var _clearModules = function(includeNodeModules) {
    if (includeNodeModules) {
        shell.rm('-rf', util.format('%s/node_modules', _installModulesDir));
    } else {
        shell.rm('-rf', util.format('%s/node_modules/*', _installModulesDir));
    }
};
