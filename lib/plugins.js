
var _ = require('underscore');
var cowboy = require('../index');
var events = require('events');
var fs = require('fs');
var util = require('util');

var _emitter = module.exports = new events.EventEmitter();
var _modules = null;

var init = module.exports.init = function(config, callback) {
    _resetModulePlugins();
    cowboy.modules.on('install', _onModuleInstall);
    cowboy.modules.on('uninstall', _onModuleUninstall);
    return _loadAllModules(callback);
};

var destroy = module.exports.destroy = function(callback) {
    cowboy.modules.removeListener('install', _onModuleInstall);
    cowboy.modules.removeListener('uninstall', _onModuleUninstall);
    _resetModulePlugins();
    return callback();
};

var load = module.exports.load = function(modules, callback) {
    if (!_.isArray(modules)) {
        return load([modules], callback);
    } else if (modules.length === 0) {
        return callback();
    }

    // Copy the modules array since we copy it
    modules = modules.slice();
    _load(modules.shift(), function(err) {
        if (err) {
            return callback(err);
        }

        return load(modules, callback);
    });
};

var command = module.exports.command = function(commandName) {
    var command = null;
    _.chain(_modules).keys().each(function(moduleName) {
        if (_modules[moduleName].commands[commandName]) {
            command = _modules[moduleName].commands[commandName];
        }
    });

    return command;
};

var _load = function(module, callback) {
    callback = callback || function() {};
    if (_.isString(module)) {
        // If we are given a module name, fetch the module metadata and re-run
        return cowboy.modules.get(module, function(err, module) {
            if (err) {
                return callback(err);
            }

            return _load(module, callback);
        });
    }

    // Seed the module name into our plugin registry
    _modules[module.npm.name] = _modules[module.npm.name] || {'commands': {}};

    var pluginsConfig = module.cowboy.plugins || {};
    _.defaults(pluginsConfig, {'dir': 'plugins'});

    var pluginsDir = util.format('%s/%s', module.root, pluginsConfig.dir);

    // Don't try and load plugins if the plugin directory does not exist
    fs.exists(pluginsDir, function(exists) {
        if (!exists) {
            cowboy.logger.system().warn({'moduleName': module.npm.name, 'pluginsDir': pluginsDir}, 'Skipping plugin loading for module with non-existing plugins directory');
            return callback();
        }

        _loadCommands(module, pluginsDir, function(err, loaded) {
            if (err) {
                return callback(err);
            } else if (loaded) {
                _emitter.emit('load', module.npm.name, _modules[module.npm.name]);
            }

            return callback();
        });
    });
};

var _loadCommands = function(module, pluginsDir, callback) {
    var commands = {};
    var commandsDir = util.format('%s/commands', pluginsDir);

    fs.exists(commandsDir, function(exists) {
        if (!exists) {
            cowboy.logger.system().debug('Skipping module with missing commands directory: %s', commandsDir);
            return callback();
        }

        fs.readdir(commandsDir, function(err, commandFilenames) {
            if (err) {
                return callback(err);
            }

            _.each(commandFilenames, function(commandFilename) {
                var commandPath = util.format('%s/%s', commandsDir, commandFilename);
                var commandName = commandFilename.split('.');
                if (commandName.pop() !== 'js') {
                    // Only consider JS files as commands
                    return;
                }

                commandName = commandName.join('.');

                // If the command is already provided by another module, we cannot load it
                if (!(_modules[module.npm.name] && _modules[module.npm.name].commands[commandName]) && cowboy.plugins.command(commandName)) {
                    return cowboy.logger.system().warn({'module': module.npm.name, 'commandPath': commandPath}, 'Skipping duplicate command "%s" in plugins directory', commandName);
                }

                // Require the command's .js file
                var command = null;
                try {
                    command = require(commandPath);
                } catch (ex) {
                    return cowboy.logger.system().debug({'err': ex, 'module': module.npm.name, 'commandPath': commandPath}, 'Skipping invalid command "%s" in plugins directory', commandName);
                }

                // Only consider commands that actually have a handle function
                if (!_.isFunction(command.handle)) {
                    return cowboy.logger.system().debug({'module': module.npm.name, 'commandPath': commandPath}, 'Skipping invalid command "%s" that did not have a "handle" function in plugins directory', commandName);
                }

                commands[commandName] = command;
            });

            // Apply the new commands to the module
            _modules[module.npm.name].commands = commands;
            return callback(null, true);
        });
    });
};

var _loadAllModules = function(callback) {
    callback = callback || function() {};
    cowboy.modules.ls(function(err, modules) {
        if (err) {
            return callback(err);
        }

        // To ensure we load modules in a deterministic way, we sort the modules
        modules.sort(function(one, other) {
            return (one < other) ? -1 : (one > other) ? 1 : 0;
        });

        _resetModulePlugins();
        return load(modules, callback);
    });
};

var _onModuleInstall = function(uri, module) {
    return _load(module);
};

var _onModuleUninstall = function(name) {
    // When we uninstall a module, there is a possibility that a conflicting command should now become available. So we need
    // to reload all modules
    _loadAllModules(function(err) {
        if (!err) {
            _emitter.emit('unload', name);
        }
    });
};

var _resetModulePlugins = function() {
    _modules = {};
};
