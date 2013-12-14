
var _ = require('underscore');
var cowboy = require('../index');

var events = require('events');
var fs = require('fs');
var util = require('util');

var _emitter = module.exports = new events.EventEmitter();
var _modules = null;

var init = module.exports.init = function(config, callback) {
    _resetModulePlugins();
    cowboy.modules.onModuleInstall('cowboy-plugins', _onModuleInstall);
    cowboy.modules.onModuleUninstall('cowboy-plugins', _onModuleUninstall);
    return _loadAllModules(callback);
};

var destroy = module.exports.destroy = function(callback) {
    cowboy.modules.offModuleInstall('cowboy-plugins');
    cowboy.modules.offModuleUninstall('cowboy-plugins');
    _resetModulePlugins();
    return callback();
};

var load = module.exports.load = function(modules, callback) {
    if (!_.isArray(modules)) {
        return load([modules], callback);
    } else if (modules.length === 0) {
        return callback();
    }

    // Copy the modules array since we modify it
    modules = modules.slice();
    _load(modules.shift(), function(err) {
        if (err) {
            return callback(err);
        }

        return load(modules, callback);
    });
};

var commands = module.exports.commands = function() {
    var commands = [];
    _.each(_modules, function(module, moduleName) {
        commands = _.union(commands, _.keys(module.commands));
    });
    commands.sort();
    return commands;
};

var command = module.exports.command = function(commandName) {
    var command = null;
    _.each(_modules, function(module, moduleName) {
        command = command || module.commands[commandName];
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

    // Don't try and load plugins if the plugin directory does not exist
    var pluginsDir = util.format('%s/%s', module.root, pluginsConfig.dir);
    fs.exists(pluginsDir, function(exists) {
        if (!exists) {
            cowboy.logger.system().warn({'moduleName': module.npm.name, 'pluginsDir': pluginsDir}, 'Skipping plugin loading for module with non-existing plugins directory');
            return callback();
        }

        _loadCommands(module, pluginsDir, function(err, loaded) {
            if (err) {
                return callback(err);
            } else if (loaded) {
                _emitter.emit('commands-load', module.npm.name, _modules[module.npm.name]);
            } else {
                _emitter.emit('commands-skip', module.npm.name);
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

            var abort = false;

            _.each(commandFilenames, function(commandFilename) {
                if (abort) {
                    // If we have indicated to abort, do not load anything else
                    return;
                }

                var commandPath = util.format('%s/%s', commandsDir, commandFilename);
                var commandName = commandFilename.split('.');
                if (commandName.pop() !== 'js') {
                    // Only consider JS files as commands
                    return;
                }

                commandName = commandName.join('.');

                // If the command is already provided by another module, we cannot load it
                if (!(_modules[module.npm.name] && _modules[module.npm.name].commands[commandName]) && cowboy.plugins.command(commandName)) {
                    cowboy.logger.system().warn({'module': module.npm.name, 'commandPath': commandPath}, 'Skipping module that provides duplicate command "%s" in plugins directory', commandName);

                    // Finish processing the module immediately and do not bind its commands
                    abort = true;
                    return callback();
                }

                // Require the command's .js file
                var Command = null;
                try {
                    Command = require(commandPath);
                } catch (ex) {
                    return cowboy.logger.system().debug({'err': ex, 'module': module.npm.name, 'commandPath': commandPath}, 'Skipping invalid command "%s" in plugins directory', commandName);
                }

                // Only consider commands that actually have an exec function
                if (!Command.prototype || !_.isFunction(Command.prototype.exec)) {
                    return cowboy.logger.system().debug({'module': module.npm.name, 'commandPath': commandPath}, 'Skipping invalid command "%s" that did not have an "exec" function in plugins directory', commandName);
                }

                commands[commandName] = Command;
            });

            // Bail out if we have aborted loading this module's commands
            if (abort) {
                return;
            }

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

        // Extract the cowboy module from the list of modules to load
        var cowboyModule = null;
        modules = _.chain(modules).map(function(module) {
            if (module.npm.name === 'cowboy') {
                // Handle the core module separately
                cowboyModule = module;
                return null;
            }

            return module;
        }).compact().value();

        // To ensure we load modules in a deterministic way, we sort the modules first by timestamp (ascending) and then alphabetically
        modules.sort(function(one, other) {
            var oneTimestamp = cowboy.util.getIntParam(one.timestamp, 0);
            var otherTimestamp = cowboy.util.getIntParam(other.timestamp, 0);
            var oneName = one.npm.name;
            var otherName = other.npm.name;

            // First order by timestamp
            var sortVal = (oneTimestamp < otherTimestamp) ? -1 : (oneTimestamp > otherTimestamp) ? 1 : 0;
            if (sortVal === 0) {
                // Fall back to module name
                sortVal = (oneName < otherName) ? -1 : (oneName > otherName) ? 1 : 0;
            }

            return sortVal;
        });

        _resetModulePlugins();

        // First load the core cowboy module for precedence
        load(cowboyModule, function(err) {
            if (err) {
                return callback(err);
            }

            // Proceed to load all the other plugins
            return load(modules, callback);
        });
    });
};

var _onModuleInstall = function(uri, module, callback) {
    return _load(module, function(err) {
        if (err) {
            cowboy.logger.error({'err': err, 'uri': uri, 'module': module}, 'Error loading plugins from installed module');
        }

        return callback();
    });
};

var _onModuleUninstall = function(name, callback) {
    // When we uninstall a module, there is a possibility that a conflicting command should now become available. So we need
    // to reload all modules
    _loadAllModules(function(err) {
        if (err) {
            cowboy.logger.error({'err': err, 'name': name}, 'Error unloading plugin from uninstalled module');
            return callback();
        }

        _emitter.emit('commands-unload', name);
        return callback();
    });
};

var _resetModulePlugins = function() {
    _modules = {};
};
