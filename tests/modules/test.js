
var _ = require('underscore');
var assert = require('assert');
var cowboy = require('../../index');
var fs = require('fs');
var shell = require('shelljs');
var testsUtil = require('../util');
var util = require('util');

var _installModulesDir = util.format('%s/._cowboy_test_install', __dirname);
var _testModulesDir = util.format('%s/test_modules', __dirname);

describe('Modules', function() {

    beforeEach(function(callback) {
        // Ensure we're running with an empty install modules directory
        _clearModules(true);
        testsUtil.reloadContext({'modules': {'dir': _testModulesDir}}, callback);
    });

    after(function(callback) {
        // Reset the context to default configuration after all tests here are complete
        _clearModules(true);
        testsUtil.reloadContext(callback);
    });

    describe('init', function() {
        it('automatically creates the node_modules directory inside the cowboy modules directory', function(callback) {
            testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                assert.ok(!err);
                assert.ok(fs.existsSync(util.format('%s/node_modules', _installModulesDir)));
                _clearModules(true);
                return callback();
            });
        });
    });

    describe('install', function() {

        beforeEach(function(callback) {
            // All install tests default to the install modules directory
            return testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, callback);
        });

        it('installs to the correct modules directory', function(callback) {
            this.timeout(5000);

            // Install the local _cowboy_test1 module
            cowboy.modules.install(util.format('%s/test_modules/node_modules/_cowboy_test1', __dirname), function(err, module) {
                assert.ok(!err);
                assert.ok(fs.existsSync(util.format('%s/node_modules/_cowboy_test1+%s/package.json', _installModulesDir, module.timestamp)));
                _validateModuleTest1(module, _installModulesDir, module.timestamp);
                return callback();
            });
        });

        it('installs a new version of the same module when installed twice', function(callback) {
            this.timeout(10000);

            // Install the local _cowboy_test1 module
            cowboy.modules.install(util.format('%s/test_modules/node_modules/_cowboy_test1', __dirname), function(err, firstModule) {
                assert.ok(!err);
                assert.ok(fs.existsSync(util.format('%s/node_modules/_cowboy_test1+%s/package.json', _installModulesDir, firstModule.timestamp)));
                _validateModuleTest1(firstModule, _installModulesDir, firstModule.timestamp);

                // Wait a little bit to ensure we get a new millisecond
                cowboy.modules.install(util.format('%s/test_modules/node_modules/_cowboy_test1', __dirname), function(err, secondModule) {
                    assert.ok(!err);

                    // Ensure only the second module exists
                    assert.ok(!fs.existsSync(util.format('%s/node_modules/_cowboy_test1+%s/package.json', _installModulesDir, firstModule.timestamp)));
                    assert.ok(fs.existsSync(util.format('%s/node_modules/_cowboy_test1+%s/package.json', _installModulesDir, secondModule.timestamp)));
                    _validateModuleTest1(secondModule, _installModulesDir, secondModule.timestamp);
                    return callback();
                });
            });
        });

        it('emits an "install" event after successful installation', function(callback) {
            this.timeout(5000);

            // Install the local _cowboy_test1 module and ensure it emits the event
            var installUri = util.format('%s/test_modules/node_modules/_cowboy_test1', __dirname);
            cowboy.modules.install(installUri);
            cowboy.modules.once('install', function(uri, module) {
                assert.strictEqual(uri, installUri);
                assert.ok(fs.existsSync(util.format('%s/node_modules/_cowboy_test1+%s/package.json', _installModulesDir, module.timestamp)));
                _validateModuleTest1(module, _installModulesDir, module.timestamp);
                return callback();
            });
        });

        it('installing an invalid module results in an error', function(callback) {
            this.timeout(5000);

            // Install the local _cowboy_invalid_cowboy module
            cowboy.modules.install(util.format('%s/test_modules/node_modules/_cowboy_invalid_cowboy', __dirname), function(err, module) {
                assert.ok(err);
                assert.strictEqual(err.module, '_cowboy_invalid_cowboy');
                return callback();
            });
        });
    });

    describe('uninstall', function() {
        beforeEach(function(callback) {
            // All install tests default to the install modules directory
            return testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, callback);
        });

        it('removes the module directory when uninstalled', function(callback) {
            this.timeout(5000);

            // Install the local _cowboy_test1 module
            cowboy.modules.install(util.format('%s/test_modules/node_modules/_cowboy_test1', __dirname), function(err, module) {
                assert.ok(!err);
                assert.ok(fs.existsSync(util.format('%s/node_modules/_cowboy_test1+%s/package.json', _installModulesDir, module.timestamp)));
                _validateModuleTest1(module, _installModulesDir, module.timestamp);

                // Now uninstall it and ensure it has disappeared from the FS
                cowboy.modules.uninstall('_cowboy_test1', function(err) {
                    assert.ok(!err);
                    assert.ok(!fs.existsSync(util.format('%s/node_modules/_cowboy_test1+%s', _installModulesDir, module.timestamp)));

                    // Ensure the module is not listed
                    cowboy.modules.get('_cowboy_test1', function(err) {
                        assert.ok(err);
                        return callback();
                    });
                });
            });
        });
    });

    describe('ls', function() {
        it('lists an empty modules array from an empty modules directory', function(callback) {
            testsUtil.reloadContext({'modules': {'dir': _installModulesDir}}, function(err) {
                cowboy.modules.ls(function(err, modules) {
                    assert.ok(!err);
                    assert.strictEqual(modules.length, 0);
                    return callback();
                });
            });
        });

        it('lists healthy modules while filtering out unhealthy modules', function(callback) {
            cowboy.modules.ls(function(err, modules) {
                assert.ok(!err);
                assert.strictEqual(modules.length, 2);

                var hasTest1 = false;
                var hasTest2 = false;

                _.each(modules, function(module) {
                    assert.ok(module.npm);
                    assert.ok(module.cowboy);
                    if (module.npm.name === '_cowboy_test1') {
                        hasTest1 = true;
                        _validateModuleTest1(module, _testModulesDir);
                    } else if (module.npm.name === '_cowboy_test2') {
                        hasTest2 = true;
                        _validateModuleTest2(module, _testModulesDir);
                    }
                });

                assert.ok(hasTest1, 'Expected to get test1 module');
                assert.ok(hasTest2, 'Expected to get test2 module');

                return callback();
            });
        });
    });

    describe('get', function() {
        it('gets a valid module', function(callback) {
            cowboy.modules.get('_cowboy_test1', function(err, module) {
                assert.ok(!err);
                _validateModuleTest1(module, _testModulesDir);
                return callback();
            });
        });

        it('returns an error for an invalid and non-existing module', function(callback) {
            cowboy.modules.get('_cowboy_invalid_cowboy', function(err) {
                assert.ok(err);
                assert.strictEqual(err.module, '_cowboy_invalid_cowboy');
                cowboy.modules.get('_cowboy_invalid_package', function(err) {
                    assert.ok(err);
                    assert.strictEqual(err.module, '_cowboy_invalid_package');
                    cowboy.modules.get('non_existing_module', function(err) {
                        assert.ok(err);
                        assert.strictEqual(err.module, 'non_existing_module');
                        return callback();
                    });
                });
            });
        });
    });
});

var _validateModuleTest1 = function(module, moduleDir, timestamp) {
    assert.ok(module.npm);
    assert.ok(module.cowboy);

    var expectedRoot = util.format('%s/node_modules/_cowboy_test1', moduleDir);
    if (timestamp) {
        expectedRoot = util.format('%s/node_modules/_cowboy_test1+%s', moduleDir, timestamp);
    }

    assert.strictEqual(module.root, expectedRoot);
    assert.strictEqual(module.npm.name, '_cowboy_test1');
    assert.strictEqual(module.npm.version, '0.0.1');
    assert.ok(!module.cowboy.plugins);
};

var _validateModuleTest2 = function(module, moduleDir, timestamp) {
    assert.ok(module.npm);
    assert.ok(module.cowboy);

    var expectedRoot = util.format('%s/node_modules/_cowboy_test2', moduleDir);
    if (timestamp) {
        expectedRoot = util.format('%s/node_modules/_cowboy_test2+%s', moduleDir, timestamp);
    }

    assert.strictEqual(module.root, util.format('%s/node_modules/_cowboy_test2', moduleDir));
    assert.strictEqual(module.npm.name, '_cowboy_test2');
    assert.strictEqual(module.npm.version, '0.0.1');
    assert.ok(!module.cowboy.plugins);
};

var _clearModules = function(includeNodeModules) {
    if (includeNodeModules) {
        shell.rm('-rf', util.format('%s/node_modules', _installModulesDir));
    } else {
        shell.rm('-rf', util.format('%s/node_modules/*', _installModulesDir));
    }
};