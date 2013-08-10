
var _ = require('underscore');
var cowboy = require('../index');
var extend = require('extend');
var fs = require('fs');
var minimatch = require('minimatch');
var shell = require('shelljs');
var util = require('util');

var hasInit = false;
var lassoPlugins = null;
var lassoMetadata = null;
var config = null;

/**
 * Initialize the application context
 */
var init = module.exports.init = function(argv, callback) {
    if (hasInit) {
        throw new Error('Attempted to initialize twice');
    }
    hasInit = true;

    // Just get the argv parameters first so we can get user-level logging configuration for the logger. Then we resolve the
    // full config after so we can get some useful information about how configuration is actually being resolved if the user
    // specifies --log-level trace
    argvConfig = _loadConfigFromArgv(argv);
    cowboy.logger.init(argvConfig);

    // Resolve the configuration and re-initialize logging with the actual resolved configuration
    config = _resolveConfig(argv.config, argv);
    cowboy.logger.init(config);
    cowboy.data.init(config);

    // Intialize npm in the configured directory
    cowboy.npm.init(config, function(err) {
        if (err) {
            return callback(err);
        }

        // Load all the cowboy plugins in the npm directory
        _loadPlugins(function(err, _lassoMetadata, _lassoPlugins) {
            if (err) {
                return callback(err);
            }

            lassoMetadata = _lassoMetadata;
            lassoPlugins = _lassoPlugins;
            
            // Initialize each individual plugin
            _.each(lassoPlugins, function(plugin, name) {
                if (_.isFunction(plugin.init)) {
                    cowboy.logger.system().debug('Initializing plugin "%s"', name);
                    try {
                        plugin.init(cowboy);
                    } catch (ex) {
                        cowboy.logger.system().warn({'err': ex}, 'An error was thrown while initializing plugin "%s". Removing the plugin.', name);
                        delete lassoPlugins[name];
                        delete lassoMetadata[name];
                    }
                } else {
                    cowboy.logger.system().trace('Plugin "%s" has no initialization implementation', name);
                }
            });

            return callback();
        });
    });
};

/**
 * Gets a lasso plugin from the loaded set of plugins
 *
 * @param  {String}     name    The name of the plugin (i.e., the command name)
 */
var getLassoPlugin = module.exports.getLassoPlugin = function(name) {
    if (!lassoPlugins) {
        return undefined;
    }

    return lassoPlugins[name];
};

/**
 * Get a hash keyed by lasso plugin name, whose value is some metadata about the lasso
 * plugin:
 *
 *  * `name`    : The name of the plugin (command name)
 *  * `version` : The version of the plugin (well, the containing module)
 */
var getLassoMetadata = module.exports.getLassoMetadata = function() {
    return lassoMetadata;
};

/**
 * Get the effective configuration
 */
var getConfig = module.exports.getConfig = function() {
    return extend(true, {}, config);
};

/**
 * Reboot the context. At the moment, this quite literally reboots the nodejs process
 */
var reboot = module.exports.reboot = function() {
    var cmd = config.restart.cmd;
    var args = config.restart.args || [];
    require('child_process').spawn(cmd, args, {'detached': true}).unref();
};

/*!
 * Load all the cowboy plugins that were installed with npm globally
 */
var _loadPlugins = function(callback) {
    var _lassoMetadata = {};
    var _lassoPlugins = {};

    cowboy.logger.system().debug('Loading plugins from base directory %s', cowboy.npm.dir());

    // Locate all the cowboy.json files in the base directory
    _.each(_findCowboyJson(cowboy.npm.dir()), function(cowboyJson) {

        // Locate all the lasso plugins identified by the cowboy.json
        _.each(_findLassoPlugins(cowboyJson), function(lassoPlugin, name) {
            if (_lassoPlugins[name]) {
                cowboy.logger.system().error('Lasso plugin "%s" conflicts with another plugin. Ignoring.', name);
                return;
            }

            _lassoMetadata[name] = {'name': name, 'version': lassoPlugin.version};
            _lassoPlugins[name] = lassoPlugin.plugin;
        });
    });

    return callback(null, _lassoMetadata, _lassoPlugins);

};

/*!
 * Locate and parse all the cowboy JSON files in the base directory
 */
var _findCowboyJson = function(baseDir) {
    var cowboyJsons = [];
    var glob = '*/cowboy.json';
    cowboy.logger.system().debug('Searching for minimatch pattern %s/%s', baseDir, glob);

    _.each(shell.ls('-R', baseDir).filter(minimatch.filter('**/cowboy.json')), function(cowboyFile) {
        var absolutePath = util.format('%s/%s', baseDir, cowboyFile);
        var parentDir = absolutePath.split('/').slice(0, -1).join('/');
        var packageJsonPath = util.format('%s/package.json', parentDir);
        var packageJson = null;
        var cowboyJson = null;

        cowboy.logger.system().trace('Found cowboy.json file at %s', absolutePath);

        // Load the package.json file of the module. We at least need this for the version of the plugin
        try {
            packageJson = require(packageJsonPath);
        } catch (err) {
            cowboy.logger.system().warn({'err': err, 'path': packageJsonPath}, 'Found invalid package.json file. Skipping this module.');
            return;
        }

        try {
            cowboyJson = require(absolutePath);
            cowboyJson.moduleDir = parentDir;
            cowboyJson.version = packageJson.version;
            cowboyJsons.push(cowboyJson);

            cowboy.logger.system().debug({'cowboyJson': cowboyJson}, 'Loaded cowboy module at path %s', absolutePath);
        } catch (err) {
            cowboy.logger.system().warn({'err': err, 'path': absolutePath}, 'Found invalid cowboy.json file. Skipping this module.');
            return;
        }
    });

    return cowboyJsons;
};

/*!
 * Find the lasso plugins specified by the cowboy.json spec
 */
var _findLassoPlugins = function(cowboyJson) {
    var baseDir = util.format('%s/%s/lassos', cowboyJson.moduleDir, cowboyJson.plugins);
    var lassoPlugins = {};
    _.each(shell.ls(baseDir), function(pluginFile) {
        var plugin = null;
        var name = pluginFile.split('/').pop().split('.').shift();
        pluginFile = util.format('%s/%s', baseDir, pluginFile);
        try {
            cowboy.logger.system().trace('Found plugin file at path %s', pluginFile);
            plugin = require(pluginFile);
            if (!_.isFunction(plugin.handle)) {
                cowboy.logger.system().warn('Plugin "%s" does not have a handle function. Skipping this plugin.', name);
                return;
            }
            lassoPlugins[name] = {'plugin': plugin, 'version': cowboyJson.version};
            cowboy.logger.system().debug('Loaded plugin %s@%s at path %s', name, cowboyJson.version, pluginFile);
        } catch (err) {
            cowboy.logger.system().warn({'err': err}, 'Failed to load lasso plugin "%s"', name);
            return;
        }
    });

    return lassoPlugins;
};

/*!
 * Determine the effective configuration from the file-system config (if any) and the supplied parameters (if any)
 */
var _resolveConfig = function(configPath, argv) {
    cowboy.logger.system().debug('Resolving effective configuration from priority argv -> specified config path -> default config path');
    var configFromFile = _loadConfigFromFile(configPath);
    var configFromArgv = _loadConfigFromArgv(argv);
    var configDefault = _loadDefaultConfig();
    
    // Resolve the effective configuration in priority order
    var effectiveConfig = extend(true, {}, configDefault, configFromFile, configFromArgv);
    cowboy.logger.system().trace({'config': _createLoggableConfig(effectiveConfig)}, 'Resolved effective configuration');

    return effectiveConfig;
};

/*!
 * Load the default configuration object
 */
var _loadDefaultConfig = function() {
    return _loadConfigFromFile(util.format('%s/../etc/cowboy.config.json', __dirname));
};

/*!
 * Load a configuration from the command arguments
 */
var _loadConfigFromArgv = function(argv) {
    cowboy.logger.system().debug('Loading a configuration from process argv');
    var configFromArgv = {
        'command': {
            'timeout': cowboy.util.getIntParam(argv.timeout)
        },
        'log': {
            'level': argv['log-level'],
            'path': argv['log-path']
        }
    };
    cowboy.logger.system().trace({'config': _createLoggableConfig(configFromArgv)}, 'Loaded configuration from argv');
    return configFromArgv;
};

/*!
 * Try and load a configuration from a JSON file located at the given path
 */
var _loadConfigFromFile = function(configPath) {
    if (!configPath) {
        cowboy.logger.system().trace('Attempted to load config from undefined location');
        return null;
    }

    cowboy.logger.system().debug('Loading a configuration from file %s', configPath);
    var configFromFile = require(configPath);
    cowboy.logger.system().trace({'config': _createLoggableConfig(configFromFile)}, 'Loaded configuration from file %s', configPath);
    return extend(true, {}, require(configPath));
};

var _createLoggableConfig = function(config) {
    var loggableConfig = extend(true, {}, config);
    if (loggableConfig.redis) {
        loggableConfig.redis.password = (loggableConfig.redis.password) ? true : false;
    }
    return loggableConfig;
};
