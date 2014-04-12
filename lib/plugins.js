
var _ = require('underscore');
var cowboy = require('../index');

var events = require('events');
var fs = require('fs');
var util = require('util');

var _emitter = module.exports = new events.EventEmitter();
var _modules = null;

/**
 * Initialize the plugin loader component
 */
var init = module.exports.init = function(ctx, callback) {
    _resetModulePlugins();
    cowboy.modules.onModuleInstall('cowboy-plugins', _onModuleInstall);
    cowboy.modules.onModuleUninstall('cowboy-plugins', _onModuleUninstall);
    return _loadAllModules(callback);
};

/**
 * Destroy / reset the plugin loader component
 */
var destroy = module.exports.destroy = function(callback) {
    cowboy.modules.offModuleInstall('cowboy-plugins');
    cowboy.modules.offModuleUninstall('cowboy-plugins');
    _resetModulePlugins();
    return callback();
};

/**
 * Load all the plugins stored with the given array of modules
 *
 * @param   {Object[]}  modules             The modules whose plugins to load, as returned by `modules.ls`
 * @param   {Function}  callback            Invoked when the modules' plugins have been loaded
 * @param   {Error}     callback.err        An error that occurred, if any
 */
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

/**
 * List all the modules and associated commands available to the application
 *
 * @return  {Object}    commands                            The commands object, holding all modules and commands
 *                                                          available to the application
 *          {Object}    commands.<moduleName>               An object whose keys represent all command names provided by
 *                                                          the module
 *          {Command}   commands.<moduleName>.<commandName> The object whose constructor produces a Command object that
 *                                                          can be used to carry out the command lifecycle
 */
var commands = module.exports.commands = function() {
    var commands = {};
    _.each(_modules, function(module, moduleName) {
        commands[moduleName] = _.extend({}, module.commands);
    });
    return commands;
};

/**
 * Fetch a command from a given module by name
 *
 * @param   {String}        commandName     The name of the command to fetch
 * @param   {String}        [moduleName]    The name of the module that provides the command. If unspecified, all modules will be searched for the command
 * @return  {Array|Command}                 If only one command is found with the criteria, it is returned as a Command. If multiple commands were found (e.g., for different modules), they will all be returned as an array
 */
var command = module.exports.command = function(commandName, moduleName) {
    if (moduleName) {
        return (_modules[moduleName] && _modules[moduleName].commands[commandName]);
    }

    var commands = [];
    _.each(_modules, function(module, moduleName) {
        if (module.commands[commandName]) {
            commands.push(module.commands[commandName]);
        }
    });

    return (commands.length > 1) ? commands : commands[0];
};

/*!
 * Load the plugins of a module given the module object as returned by `modules.get`
 */
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

/*!
 * Load all the command plugins for a module object as returned by `modules.get` and its provided `pluginsDir`
 */
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

            // Apply the new commands to the module
            _modules[module.npm.name].commands = commands;
            return callback(null, true);
        });
    });
};

/*!
 * Load all plugins provided by all modules of the current application context
 */
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

/*!
 * Perform all actions necessary to perform when a module has installed
 */
var _onModuleInstall = function(uri, module, callback) {
    return _load(module, function(err) {
        if (err) {
            cowboy.logger.error({'err': err, 'uri': uri, 'module': module}, 'Error loading plugins from installed module');
        }

        return callback();
    });
};

/*!
 * Perform all actions necessary to perform when a module has been uninstalled
 */
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

/*!
 * Reset the index of module plugins
 */
var _resetModulePlugins = function() {
    _modules = {};
};
