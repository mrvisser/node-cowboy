
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
var _onModuleInstall = {};
var _onModuleUninstall = {};

/**
 * Initialize the module loader component
 */
var init = module.exports.init = function(config, callback) {
    config.modules = config.modules || {};
    _npm = config.modules.npm || 'npm';

    _dir = config.modules.dir || '.';
    _dir = path.resolve(_dir);
    cowboy.logger.system().info('Using module directory: %s', _dir);

    // Create the node_modules directory if it doesn't exist
    var nodeModulesDir = util.format('%s/node_modules', _dir);
    if (!fs.existsSync(nodeModulesDir)) {
        fs.mkdirSync(nodeModulesDir);
    }

    return callback();
};

/**
 * Destroy the module loader module
 */
var destroy = module.exports.destroy = function(callback) {
    _npm = null;
    _dir = null;
    _onModuleInstall = {};
    _onModuleUninstall = {};
    return callback();
};

/**
 * Install a module with the given npm `uri` identifier. Since it is an npm uri, it can be a local file-system
 * reference, git repository, npm module, etc...
 *
 * @param   {String}    uri                     The npm uri of the module to install
 * @param   {Function}  callback                Invoked when the installation is complete
 * @param   {Error}     callback.err            An error that occurred, if any
 * @param   {Object}    callback.module         The module object representing the module that was installed
 * @param   {String}    callback.module.root    The root directory on the filesystem for the module
 * @param   {Object}    callback.module.npm     A basic version of the `package.json` spec for the module
 * @param   {Object}    callback.module.cowboy  A basic version of the `cowboy.json` spec for the module
 */
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

        var moduleName = stdout[0].name;

        // Bail and throw an error if they installed a cowboy module. Oops!
        if (moduleName === 'cowboy') {
            return callback(new Error('Cannot install cowboy module itself within the cowboy modules directory'));
        }

        // Ensure the new installation is in a unique directory path so that when we re-require it it becomes
        var now = Date.now();
        var originalModuleDir = _getModuleDir(moduleName);
        var uniqueModuleDir = _getModuleDir(moduleName, now);
        fs.rename(originalModuleDir, uniqueModuleDir, function(err) {
            if (err) {
                cowboy.logger.system().error({'err': err, 'originalModuleDir': originalModuleDir, 'uniqueModuleDir': uniqueModuleDir}, 'Failed to move installed module to a unique module directory');
                return callback(err);
            }

            // Return the loaded module to the caller
            get(moduleName, function(err, module) {
                if (err) {
                    return callback(err);
                }

                _invokeOnModuleInstall(uri, module, function() {
                    return callback(null, module);
                });
            });
        });
    });
};

/**
 * Uninstall a module by its npm `name`
 *
 * @param   {String}    name            The name of the module to uninstall (e.g., the `name` field in the
 *                                      `package.json`)
 * @param   {Function}  callback        Invoked when the module has been uninstalled
 * @param   {Error}     callback.err    An error that occurred, if any
 */
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

            return _invokeOnModuleUninstall(name, callback);
        });
    });
};

/**
 * List the modules that are available in the modules directory
 *
 * @param   {Function}  callback                    Invoked when listing has complete
 * @param   {Error}     callback.err                An error that occurred, if any
 * @param   {Object[]}  callback.modules            A list of module objects representing the modules that have been
 *                                                  installed
 * @param   {Object}    callback.modules[i].npm     A basic version of the `package.json` spec for the module
 * @param   {Object}    callback.modules[i].cowboy  A basic version of the `cowboy.json` spec for the module
 */
var ls = module.exports.ls = function(callback) {
    cowboy.logger.system().trace('Listing modules in modules directory...');

    // Aggregate modules with moduleName{String} -> timestamp{Number} -> module{Object}
    var modules = {};

    // Do some house-cleaning along the way
    var moduleDirsToDelete = [];
 
    // First load the modules of the global cowboy module
    var cowboyModule = _readModuleMetadata(util.format('%s/..', __dirname));
    modules[cowboyModule.name] = cowboyModule;

    // Read all the modules out of the node_modules directory in the modules directory
    fs.readdir(_getModuleNodeModulesDir(), function(err, dirNames) {
        if (err) {
            return callback(err);
        }

        // For each module directory, grab only the latest installation of each module
        _.each(dirNames, function(dirName) {
            var moduleNameAndTimestamp = _splitModuleName(dirName);

            cowboy.logger.system().trace({'moduleSplit': moduleNameAndTimestamp}, 'Listed module directory: %s/%s', _getModuleNodeModulesDir(), dirName);

            // Ignore any module named cowboy to avoid it overriding the global installation
            if (moduleNameAndTimestamp.name === 'cowboy') {
                cowboy.logger.system().trace({'moduleSplit': moduleNameAndTimestamp}, 'Ignoring module directory as it clashes with the core cowboy directory: %s/%s', _getModuleNodeModulesDir(), dirName);
                return;
            } else if (moduleNameAndTimestamp.name.indexOf('.') === 0) {
                cowboy.logger.system().trace({'moduleSplit': moduleNameAndTimestamp}, 'Ignoring system directory as it begins with a "."');
                return;
            }

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

/**
 * Get a module by its `name`
 *
 * @param   {String}    name                    The `name` of the npm module to get, as shown in the `package.json`
 * @param   {Function}  callback                Invoked when the module metadata has been fetched
 * @param   {Error}     callback.err            An error that occurred, if any
 * @param   {Object}    callback.module         The module object representing the module that was fetched
 * @param   {String}    callback.module.root    The root directory on the filesystem for the module
 * @param   {Object}    callback.module.npm     A basic version of the `package.json` spec for the module
 * @param   {Object}    callback.module.cowboy  A basic version of the `cowboy.json` spec for the module
 */
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

/**
 * Perform an operation after a module is installed
 *
 * @param   {String}    handlerId           The id of the handler. Can be used to disable the event later
 * @param   {Function}  handler             The function to handle the event
 * @param   {String}    handler.uri         The source `uri` of the module that was just installed
 * @param   {Object}    handler.module      The module object that was installed, similar to the module returned in the
 *                                          `install` method callback
 * @param   {Function}  handler.callback    Invoke this method when finished processing the event
 */
var onModuleInstall = module.exports.onModuleInstall = function(handlerId, handler) {
    _onModuleInstall[handlerId] = handler;
};

/**
 * Remove a handler that was bound with `onModuleInstall`
 *
 * @param   {String}    handlerId   The id of the handler to remove
 */
var offModuleInstall = module.exports.offModuleInstall = function(handlerId) {
    delete _onModuleInstall[handlerId];
};

/**
 * Perform an operation after a module is installed
 *
 * @param   {String}    handlerId           The id of the handler. Can be used to disable the event later
 * @param   {Function}  handler             The function to handle the event
 * @param   {String}    handler.name        The npm `name` of the module that was just uninstalled
 * @param   {Function}  handler.callback    Invoke this method when finished processing the event
 */
var onModuleUninstall = module.exports.onModuleUninstall = function(handlerId, handler) {
    _onModuleUninstall[handlerId] = handler;
};

/**
 * Remove a handler that was bound with `onModuleUninstall`
 *
 * @param   {String}    handlerId   The id of the handler to remove
 */
var offModuleUninstall = module.exports.offModuleUninstall = function(handlerId) {
    delete _onModuleUninstall[handlerId];
};

/*!
 * Invoke the `onModuleInstall` handlers that are currently registered in a chain
 */
var _invokeOnModuleInstall = function(uri, module, callback, _handlers) {
    if (!_handlers) {
        return _invokeOnModuleInstall(uri, module, callback, _.values(_onModuleInstall));
    } else if (_.isEmpty(_handlers)) {
        return callback();
    }

    var handler = _handlers.shift();
    try {
        handler(uri, module, function() {
            return _invokeOnModuleInstall(uri, module, callback, _handlers);
        });
    } catch (err) {
        cowboy.logger.system().warn({'err': err}, 'There was a handler exception thrown while invoking onModuleInstall');
        return _invokeOnModuleInstall(uri, module, callback, _handlers);
    }
};

/*!
 * Invoke the `onModuleUninstall` handlers that are currently registered in a chain
 */
var _invokeOnModuleUninstall = function(name, callback, _handlers) {
    if (!_handlers) {
        return _invokeOnModuleUninstall(name, callback, _.values(_onModuleUninstall));
    } else if (_.isEmpty(_handlers)) {
        return callback();
    }

    var handler = _handlers.shift();
    try {
        handler(name, function() {
            return _invokeOnModuleUninstall(name, callback, _handlers);
        });
    } catch (err) {
        cowboy.logger.warn({'err': err}, 'There was a handler exception thrown while invoking onModuleUninstall');
        return _invokeOnModuleUninstall(name, callback, _handlers);
    }
};

/*!
 * Read the metadata for a module located in the given `moduleDir`. If the module is not a valid module, this function
 * will return `null`.
 *
 * @return  {Object}    module          Returns the module object represented by the metadata files
 *          {String}    module.root     The root module directory on the filesystem
 *          {Object}    module.npm      A basic version of the `package.json` metadata for the module
 *          {Object}    module.cowboy   A basic version of the `cowboy.json` metadata for the module
 */
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

/*!
 * Delete the modules by directory name from within the configured module directory
 */
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

/*!
 * Given a module directory name of its versioned form <moduleName>+<timestamp>, split it and return a more usable
 * version in an object.
 */
var _splitModuleName = function(dirName) {
    dirName = dirName.split('+');
    var name = dirName.shift();
    var timestamp = dirName.shift();
    return {
        'name': name,
        'timestamp': (!isNaN(parseInt(timestamp, 10))) ? parseInt(timestamp, 10) : undefined
    };
};

/*!
 * Given a module name and timestamp return its directory name
 */
var _getModuleDir = function(name, timestamp) {
    if (timestamp) {
        return util.format('%s/%s+%s', _getModuleNodeModulesDir(), name, timestamp);
    } else {
        return util.format('%s/%s', _getModuleNodeModulesDir(), name);
    }
};

/*!
 * Get the module node_modules directory for the currently configured context
 */
var _getModuleNodeModulesDir = function() {
    return util.format('%s/node_modules', _dir);
};

/*!
 * Execute a command as a child process of the current cowboy process
 */
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
