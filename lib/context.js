
var _ = require('underscore');
var cowboy = require('../index');
var extend = require('extend');
var fs = require('fs');
var minimatch = require('minimatch');
var shell = require('shelljs');
var util = require('util');

var _config = null;
var _hasInit = false;

var _components = [
    'logger',
    'data',
    'redis',
    'conversations',
    'presence',
    'modules',
    'plugins'
];

/**
 * Initialize the application context.
 *
 * @param   {String[]}  argv            The execution time arguments that were used to invoke the process
 * @param   {Object}    [defaultConfig] Default configuration values to overlay onto the internal default configuration file
 * @param   {Function}  callback        Invoked when initialization is complete
 * @param   {Error}     callback.err    An error that occurred, if any
 */
var init = module.exports.init = function(argv, defaultConfig, callback) {
    if (_hasInit) {
        throw new Error('Attempted to initialize twice');
    }
    _hasInit = true;

    if (_.isFunction(defaultConfig)) {
        callback = defaultConfig;
        defaultConfig = null;
    }

    defaultConfig = defaultConfig || {};

    // Get an initial configuration with the argv parameters and the default configuration. This is mostly useful
    // for short-circuiting loading to get the logging configuration before anything else happens, so we can
    // log configuration loading details to debug user-level issues with configuration
    var initConfig = extend(true, {}, _loadDefaultConfig(defaultConfig), _loadConfigFromArgv(argv));

    cowboy.logger.init(initConfig, function(err) {
        if (err) {
            return callback(err);
        }

        // Resolve the configuration and re-initialize logging with the actual resolved configuration
        _config = _resolveConfig(argv.config, argv, defaultConfig);
        return _initAll(callback);
    });
};

/**
 * Destroy the application context
 */
var destroy = module.exports.destroy = function(callback) {
    _destroyAll(function(err) {
        if (err) {
            return callback(err);
        }

        _config = null;
        _hasInit = false;
        return callback();
    });
};

/*!
 * Initialize all modules in the `_components` array in the order they are specified
 */
var _initAll = function(callback, _i) {
    _i = _i || 0;
    if (_i === _components.length) {
        return callback();
    }

    cowboy.logger.system().debug('Initializing component: %s', _components[_i]);

    // Iterate from start to finish initializing components
    cowboy[_components[_i]].init(_config, function(err) {
        if (err) {
            cowoboy.logger.system().error({'err': err}, 'Error initializing component: %s', _components[_i]);
            return callback(err);
        }
        cowboy.logger.system().trace('Initialized component: %s', _components[_i]);

        return _initAll(callback, _i + 1);
    });
};

/*!
 * Destroy all modules in the `_components` array in reverse order specified
 */
var _destroyAll = function(callback, _i) {
    _i = _i || 1;
    if (_i === _components.length + 1) {
        return callback();
    }

    // Iterate from last to start initializing components
    cowboy[_components[_components.length - _i]].destroy(function(err) {
        if (err) {
            return callback(err);
        }

        return _destroyAll(callback, _i + 1);
    });
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
