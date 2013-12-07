
var _ = require('underscore');
var child = require('child_process');
var cowboy = require('../index');
var events = require('events');
var fs = require('fs.extra');
var path = require('path');
var util = require('util');

var _npm = null;
var _dir = null;
var _emitter = module.exports = new events.EventEmitter();

var init = module.exports.init = function(config, callback) {
    config.modules = config.modules || {};
    _npm = config.modules.npm || 'npm';

    _resolveNpmModuleDir(function(err, prefix) {
        if (err) {
            return callback(err);
        }

        _dir = config.modules.dir || prefix;
        _dir = path.resolve(_dir);
        cowboy.logger.system().info('Using module directory: %s', _dir);

        // Create the node_modules directory if it doesn't exist
        var nodeModulesDir = util.format('%s/node_modules', _dir);
        if (!fs.existsSync(nodeModulesDir)) {
            fs.mkdirSync(nodeModulesDir);
        }

        return callback();
    });
};

var destroy = module.exports.destroy = function(callback) {
    _npm = null;
    _dir = null;
    return callback();
};

var install = module.exports.install = function(uri, callback) {
    callback = callback || function() {};

    // Run npm install
    _exec(util.format('%s install "%s" --json', _npm, uri), {'cwd': _dir}, function(err, stdout) {
        if (err) {
            return callback(err);
        }

        // Try and parse stdout into JSON
        try {
            stdout = JSON.parse(stdout);
        } catch (ex) {
            cowboy.logger.system().error({'err': ex, 'stdout': stdout}, 'Module "%s" installed correctly, but npm output (stdout) was not valid JSON', uri);
            return callback(ex);
        }

        // Validate the npm result
        if (!_.isArray(stdout)) {
            err = new Error('Expected npm install output to be an array');
            cowboy.logger.system().error({'err': ex, 'stdout': stdout}, 'Module "%s" installed correctly, but npm output (stdout) was not a JSON array', uri);
            return callback(err);
        } else if (stdout.length === 0) {
            err = new Error('Expected npm install output to be an array of length > 0');
            cowboy.logger.system().error({'err': ex, 'stdout': stdout}, 'Module "%s" installed correctly, but npm output (stdout) was not a JSON array with length > 0', uri);
            return callback(err);
        } else if (!stdout[0].name) {
            err = new Error('Expected npm install output module to have a module "name"');
            cowboy.logger.system().error({'err': ex, 'stdout': stdout}, 'Module "%s" installed correctly, but npm output (stdout) was not a module that had a "name" attribute', uri);
            return callback(err);
        }

        // Ensure the new installation is in a unique directory path so that when we re-require it it becomes
        var now = Date.now();
        var originalModuleDir = _getModuleDir(stdout[0].name);
        var uniqueModuleDir = _getModuleDir(stdout[0].name, now);
        fs.rename(originalModuleDir, uniqueModuleDir, function(err) {
            if (err) {
                cowboy.logger.system().error({'err': err, 'originalModuleDir': originalModuleDir, 'uniqueModuleDir': uniqueModuleDir}, 'Failed to move installed plugin to a unique module directory');
                return callback(err);
            }

            // Return the loaded module to the caller
            get(stdout[0].name, function(err, module) {
                if (err) {
                    return callback(err);
                }

                _emitter.emit('install', uri, module);
                return callback(null, module);
            });
        });
    });
};

var uninstall = module.exports.uninstall = function(name, callback) {
    callback = callback || function() {};
    get(name, function(err, module) {
        if (err) {
            return callback(err);
        }

        _deleteModules(_getModuleDir(name, module.timestamp).split('/').pop(), function(err) {
            if (err) {
                return callback(err);
            }

            _emitter.emit('uninstall', name);
            return callback();
        });
    });
};

var ls = module.exports.ls = function(callback) {
    cowboy.logger.system().trace('Listing modules in modules directory...');

    // Aggregate modules with moduleName{String} -> timestamp{Number} -> module{Object}
    var modules = {};

    // Do some house-cleaning along the way
    var moduleDirsToDelete = [];

    // Read all the modules out of the node_modules directory in the modules directory
    fs.readdir(_getModuleNodeModulesDir(), function(err, dirNames) {
        if (err) {
            return callback(err);
        }

        // For each module directory, grab only the latest installation of each module
        _.each(dirNames, function(dirName) {
            var moduleNameAndTimestamp = _splitModuleName(dirName);

            cowboy.logger.system().trace({'moduleSplit': moduleNameAndTimestamp}, 'Listed module directory: %s/%s', _getModuleNodeModulesDir(), dirName);

            // We already found a module with the current name, we'll have to figure out which one is more recent
            // and delete the old one to avoid building cruft
            var existingModule = modules[moduleNameAndTimestamp.name];
            if (existingModule) {
                cowboy.logger.system().trace({'module': {'name': existingModule.npm.name, 'timestamp': existingModule.timestamp}}, 'Conflicts with module: %s', existingModule.root);
                if (!moduleNameAndTimestamp.timestamp) {
                    moduleDirsToDelete.push(dirName);
                    return;
                } else if (!existingModule.timestamp) {
                    moduleDirsToDelete.push(existingModule.root.split('/').pop());
                } else if (moduleNameAndTimestamp.timestamp > existingModule.timestamp) {
                    moduleDirsToDelete.push(existingModule.root.split('/').pop());
                } else {
                    moduleDirsToDelete.push(dirName);
                    return;
                }
            }

            // If we made it here it means the current directory we're iterating over is a valid module to include
            var module = _readModuleMetadata(_getModuleDir(moduleNameAndTimestamp.name, moduleNameAndTimestamp.timestamp));
            if (module) {
                module.timestamp = moduleNameAndTimestamp.timestamp;
                modules[moduleNameAndTimestamp.name] = module;
            }
        });

        // Delete the stale modules
        _deleteModules(moduleDirsToDelete, function(err) {
            if (err) {
                cowboy.logger.system().warn({'err': err}, 'Failed to delete one or more stale module directories');
            }

            return callback(null, _.values(modules));
        });
    });
};

var get = module.exports.get = function(name, callback) {
    cowboy.logger.system().trace('Getting module with name "%s"', name);
    ls(function(err, modules) {
        if (err) {
            return callback(err);
        }

        var _module = null;
        _.each(modules, function(module) {
            if (module.npm.name === name) {
                _module = module;
            }
        });

        if (!_module) {
            var nonExistingErr = new Error(util.format('Tried to get a non-existing module: "%s"', name));
            nonExistingErr.module = name;
            cowboy.logger.system().error({'err': nonExistingErr}, nonExistingErr.message);

            return callback(nonExistingErr);
        }

        return callback(null, _module);
    });
};

var _readModuleMetadata = function(moduleDir) {
    var packageJsonPath = util.format('%s/package.json', moduleDir);
    var cowboyJsonPath = util.format('%s/cowboy.json', moduleDir);
    var packageJson = null;
    var cowboyJson = null;
    var content = null;

    try {
        content = fs.readFileSync(packageJsonPath, {'encoding': 'utf8'});
        packageJson = JSON.parse(content);
    } catch (ex) {
        cowboy.logger.system().warn({'err': ex, 'path': packageJsonPath, 'modulesDir': _dir, 'content': content}, 'Found invalid module inside cowboy module directory');
        return null;
    }

    try {
        content = fs.readFileSync(cowboyJsonPath, {'encoding': 'utf8'});
        cowboyJson = JSON.parse(content);
    } catch (ex) {
        cowboy.logger.system().warn({'err': ex, 'path': cowboyJsonPath, 'modulesDir': _dir, 'content': content}, 'Found invalid module inside cowboy module directory');
        return null;
    }

    return {
        'root': moduleDir,
        'npm': packageJson,
        'cowboy': cowboyJson
    };
};

var _deleteModules = function(moduleDirNames, callback, _errs) {
    _errs = _errs || [];
    if (!_.isArray(moduleDirNames)) {
        return _deleteModules([moduleDirNames], callback, _errs);
    } else if (moduleDirNames.length === 0) {
        var err = (_errs.length > 0) ? _errs[0] : null;
        return callback(err);
    }

    var moduleDir = _getModuleDir(moduleDirNames.shift());
    cowboy.logger.system().trace('Deleting stale module directory: "%s"', moduleDir);
    fs.rmrf(moduleDir, function(err) {
        if (err) {
            _errs.push(err);
        }

        return _deleteModules(moduleDirNames, callback, _errs);
    });
};

var _splitModuleName = function(dirName) {
    dirName = dirName.split('+');
    var name = dirName.shift();
    var timestamp = dirName.shift();
    return {
        'name': name,
        'timestamp': (!isNaN(parseInt(timestamp, 10))) ? parseInt(timestamp, 10) : undefined
    };
};

var _getModuleDir = function(name, timestamp) {
    if (timestamp) {
        return util.format('%s/%s+%s', _getModuleNodeModulesDir(), name, timestamp);
    } else {
        return util.format('%s/%s', _getModuleNodeModulesDir(), name);
    }
};

var _getModuleNodeModulesDir = function() {
    return util.format('%s/node_modules', _dir);
};

var _resolveNpmModuleDir = function(callback) {
    _exec(util.format('%s get prefix', _npm), null, function(err, result) {
        if (err) {
            return callback(err);
        }

        return callback(null, util.format('%s/lib', result.trim()));
    });
};

var _exec = function(cmd, options, callback) {
    options = options || {};
    cowboy.logger.system().trace({'cmd': cmd, 'options': options}, 'Executing shell command');

    child.exec(cmd, options, function(err, stdout, stderr) {
        if (err) {
            cowboy.logger.system().error({'err': err, 'stdout': stdout, 'stderr': stderr}, 'Error executing command');
            return callback(err);
        }

        cowboy.logger.system().trace({'stdout': stdout, 'stderr': stderr}, 'Shell command execution returned');
        return callback(null, stdout, stderr);
    });
};