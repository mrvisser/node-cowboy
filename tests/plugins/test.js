
var _ = require('underscore');
var assert = require('assert');
var cowboy = require('../../index');
var fs = require('fs');
var shell = require('shelljs');
var testsUtil = require('../util');
var util = require('util');

var _installModulesDir = util.format('%s/._cowboy_test_install', __dirname);
var _testModulesDir = util.format('%s/test_modules', __dirname);

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
                assert.ok(!cowboy.plugins.command('basic'));

                // Install the valid basic command
                cowboy.modules.install(util.format('%s/node_modules/_cowboy_default_plugins_dir', _testModulesDir), function(err) {
                    assert.ok(!err);

                    cowboy.plugins.once('load', function(moduleName, plugins) {
                        assert.strictEqual(moduleName, '_cowboy_default_plugins_dir');
                        assert.ok(plugins);
                        assert.ok(plugins.commands);
                        assert.ok(plugins.commands.basic);

                        // Ensure the command(s) for the module have been loaded
                        _assertDefaultPluginsDirModuleCommands(function() {

                            // Uninstall the module and ensure its command plugin is no longer loaded
                            cowboy.modules.uninstall('_cowboy_default_plugins_dir', function(err) {
                                assert.ok(!err);

                                cowboy.plugins.once('unload', function(name) {
                                    assert.strictEqual(name, '_cowboy_default_plugins_dir');
                                    assert.ok(!cowboy.plugins.command('basic'));
                                    return callback();
                                });
                            });
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

                    cowboy.plugins.once('load', function() {

                        // Ensure v1 has the correct v1 functionality
                        cowboy.plugins.command('version').handle(null, function(code, response) {
                            assert.strictEqual(code, 0);
                            assert.strictEqual(response, 'version 1');

                            // Install version 2 and verify it loads correctly
                            cowboy.modules.install(util.format('%s/node_modules/_cowboy_plugin_upgrade_v2', _testModulesDir), function(err) {
                                assert.ok(!err);
                                cowboy.plugins.once('load', function() {

                                    // Ensure the command now has the correct v2 functionality
                                    cowboy.plugins.command('version').handle(null, function(code, response) {
                                        assert.strictEqual(code, 0);
                                        assert.strictEqual(response, 'version 2');

                                        // Revert back to version 1 and ensure it has reloaded properly
                                        cowboy.modules.install(util.format('%s/node_modules/_cowboy_plugin_upgrade_v1', _testModulesDir), function(err) {
                                            assert.ok(!err);

                                            cowboy.plugins.once('load', function() {

                                                // Ensure we have the v1 functionality again
                                                cowboy.plugins.command('version').handle(null, function(code, response) {
                                                    assert.strictEqual(code, 0);
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
                });
            });
        });
    });
});

var _assertDefaultPluginsDirModuleCommands = function(callback) {
    var command = cowboy.plugins.command('basic');
    assert.ok(command);
    assert.strictEqual(command.help().description, 'Basic command plugin');
    command.handle(null, function(code, msg) {
        assert.strictEqual(code, 0);
        assert.strictEqual(msg, 'pong');

        // Ensure none of the invalid commands were loaded
        assert.ok(!cowboy.plugins.command('no_handle_function'));
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