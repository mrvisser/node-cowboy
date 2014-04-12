
var _ = require('underscore');
var cowboy = require('../index');
var extend = require('extend');
var fs = require('fs');
var minimatch = require('minimatch');
var shell = require('shelljs');
var util = require('util');

var _config = null;

/**
 * Initialize the application context.
 *
 * @param   {InitContext}   ctx             The initialization context
 * @param   {Function}      callback        Invoked when initialization is complete
 * @param   {Error}         callback.err    An error that occurred, if any
 */
var init = module.exports.init = function(ctx, callback) {
    // Get an initial configuration with the argv parameters and the default configuration. This is mostly useful
    // for short-circuiting loading to get the logging configuration before anything else happens, so we can
    // log configuration loading details to debug user-level issues with configuration
    var initConfig = extend(true, {}, _loadDefaultConfig(ctx.defaultConfig()), _loadConfigFromArgv(ctx.argv()));

    // Initialize the logger quickly with initial values so configuration resolution can be logged
    ctx.config(initConfig);
    cowboy.logger.init(ctx, function(err) {
        if (err) {
            return callback(err);
        }

        // Resolve the configuration and continue initialization
        _config = _resolveConfig(ctx.argv().config, ctx.argv(), ctx.defaultConfig());
        ctx.config(_config);

        return callback();
    });
};

/**
 * Destroy the application context
 */
var destroy = module.exports.destroy = function(callback) {
    _config = null;
    return callback();
};

/*!
 * Determine the effective configuration from the file-system config (if any) and the supplied parameters (if any)
 */
var _resolveConfig = function(configPath, argv, defaultConfig) {
    cowboy.logger.system().debug('Resolving effective configuration from priority argv -> specified config path -> default config path');
    var configFromFile = _loadConfigFromFile(configPath);
    var configFromArgv = _loadConfigFromArgv(argv);
    var configDefault = _loadDefaultConfig(defaultConfig);
    
    // Resolve the effective configuration in priority order
    var effectiveConfig = extend(true, {}, configDefault, configFromFile, configFromArgv);
    cowboy.logger.system().trace({'config': _createLoggableConfig(effectiveConfig)}, 'Resolved effective configuration');

    return effectiveConfig;
};

/*!
 * Load the default configuration object
 */
var _loadDefaultConfig = function(defaultConfig) {
    return extend(true, _loadConfigFromFile(util.format('%s/../etc/cowboy.config.json', __dirname)), defaultConfig);
};

/*!
 * Load a configuration from the command arguments
 */
var _loadConfigFromArgv = function(argv) {
    cowboy.logger.system().debug('Loading a configuration from process argv');
    var configFromArgv = {
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
    configPath = configPath || _resolveFileConfigPath();
    if (!configPath) {
        cowboy.logger.system().trace('Attempted to load config from undefined location');
        return null;
    }

    cowboy.logger.system().debug('Loading a configuration from file %s', configPath);
    var configFromFile = require(configPath);
    cowboy.logger.system().trace({'config': _createLoggableConfig(configFromFile)}, 'Loaded configuration from file %s', configPath);
    return extend(true, {}, require(configPath));
};

/*!
 * Determine where (if anywhere) the file configuration on disk is
 */
var _resolveFileConfigPath = function() {
    var path = util.format('%s/.cowboy/cowboy.config.json', cowboy.util.getHomeDirectory());
    if (fs.existsSync(path)) {
        cowboy.logger.system().debug('Using configuration from file %s', path);
        return path;
    } else {
        cowboy.logger.system().trace('No configuration found at %s', path);
    }

    path = '/etc/cowboy/cowboy.config.json';
    if (fs.existsSync(path)) {
        cowboy.logger.system().debug('Using configuration from file %s', path);
        return path;
    } else {
        cowboy.logger.system().trace('No configuration found at %s', path);
    }

    return null;
};

/*!
 * Create a config object that is safe to output to the logs
 */
var _createLoggableConfig = function(config) {
    var loggableConfig = extend(true, {}, config);
    if (loggableConfig.redis) {
        loggableConfig.redis.password = (loggableConfig.redis.password) ? true : false;
    }
    return loggableConfig;
};
