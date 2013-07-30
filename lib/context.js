
var _ = require('underscore');
var cowboy = require('cowboy');
var fs = require('fs');
var minimatch = require('minimatch');
var npm = require('npm');
var shell = require('shelljs');
var util = require('util');

var hasInit = false;
var lassos = null;
var config = null;

/**
 * Initialize the application context
 */
var init = module.exports.init = function(argv, callback) {
    if (hasInit) {
        throw new Error('Attempted to initialize twice');
    }
    hasInit = true;

    config = _resolveConfig(argv.config, argv);
    cowboy.logger.init(config);

    _loadPlugins(function(err, _lassos) {
        if (err) {
            return callback(err);
        }

        lassos = _lassos;
        
        return callback();
    });
};

/**
 * Gets a lasso plugin from the loaded set of plugins
 *
 * @param  {String}     name    The name of the plugin (i.e., the command name)
 */
var getLassoPlugin = module.exports.getLassoPlugin = function(name) {
    if (!lassos) {
        return undefined;
    }

    return lassos[name];
};

/**
 * Get the effective configuration
 */
var getConfig = module.exports.getConfig = function() {
    return _.extend({}, config);
};

/**
 * Reboot the context. At the moment, this quite literally reboots the nodejs process
 */
var reboot = module.exports.reboot = function() {
    var child = require('child_process').spawn('forever', ['restart', 'bin/cattle.js'], {'detached': true});
    child.unref();
};

/**
 * Load all the cowboy plugins that were installed with npm globally
 */
var _loadPlugins = function(callback) {
    npm.load({'global': true, 'loglevel': 'silent'}, function(err) {
        if (err) {
            throw err;
        }

        npm.commands.ls([], true, function(err, data, lite) {
            if (err) {
                throw err;
            }

            var lassos = {};

            _.each(lite.dependencies, function(module, moduleName) {
                var moduleDir = util.format('%s/%s', npm.dir, moduleName);
                var cowboyJson = null;
                try {
                    cowboyJson = require(util.format('%s/cowboy.json', moduleDir));
                } catch (ex) { }

                // Bail if it's not a cowboy plugin
                if (!cowboyJson) {
                    return;
                }

                var lassosDir = util.format('%s/%s/%s', moduleDir, cowboyJson.plugins || 'plugins', 'lassos');

                var files = null;
                try {
                    // Load the files in the lasso plugin dir, filtering to just js files
                    files = fs.readdirSync(lassosDir).filter(minimatch.filter('*.js'));
                } catch (ex) {
                    // The lassos dir probably didn't exist. Continue on.
                    return;
                }

                _.each(files, function(jsFile) {
                    // Every js file in the directory is a plugin
                    var name = jsFile.split('/').pop().split('.').shift();
                    if (lassos[name]) {
                        logError('Lasso plugin "%s" conflicts with another plugin. Ignoring.', name);
                        return;
                    }

                    var plugin = null;
                    try {
                        plugin = require(util.format('%s/%s', lassosDir, name));
                        if (!_.isFunction(plugin.handle)) {
                            throw new Error('Plugin "' + name + '" does not have a handle function');
                        }
                    } catch (ex) {
                        logError('Failed to load lasso plugin "%s"', name);
                        logException(ex);
                        return;
                    }

                    lassos[name] = plugin;
                });
            });

            return callback(null, lassos);
        });
    });
};

/**
 * Determine the effective configuration from the file-system config (if any) and the supplied parameters (if any)
 */
var _resolveConfig = function(configPath, argv) {
    configPath = configPath || util.format('%s/../etc/cowboy.config.json', __dirname);
    var configFromFile = _loadConfigFromFile(configPath);
    var configFromArgv = _loadConfigFromArgv(argv);
    var configDefault = {
        'host': '127.0.0.1',
        'port': 6739,
        'index': 0,
        'logLevel': 'info'
    };

    // Apply the configurations in priority order
    return _.extend({}, configDefault, configFromFile, configFromArgv);
};

/**
 * Load a configuration from the command arguments
 */
var _loadConfigFromArgv = function(argv) {
    var config = {
        'timeout': _getIntParam(argv.timeout),
        'logLevel': argv['log-level'],
        'logPath': argv['log-path']
    };

    _pruneUndefinedValues(config);

    return config;
};

/**
 * Try and load a configuration from a JSON file located at the given path
 */
var _loadConfigFromFile = function(configPath) {
    if (!configPath) {
        return null;
    }

    var fileConfig = require(configPath);
    var config = {
        'host': fileConfig.redis && fileConfig.redis.host,
        'port': fileConfig.redis && fileConfig.redis.port,
        'index': fileConfig.redis && fileConfig.redis.index,
        'password': fileConfig.redis && fileConfig.redis.password,
        'timeout': _getIntParam(fileConfig.timeout, 5),
        'logLevel': fileConfig.systemLog && fileConfig.systemLog.level,
        'logPath': fileConfig.systemLog && fileConfig.systemLog.path
    };

    _pruneUndefinedValues(config);

    return config;
};

/**
 * If the `val` is parseable to an integer, return its integer value. Otherwise
 * return the `defaultVal.
 */
var _getIntParam = function(val, defaultVal) {
    val = parseInt(val, 10);
    if (!isNaN(val)) {
        return val;
    } else {
        return defaultVal;
    }
};

/**
 * Clean out keys whose values are undefined.
 */
var _pruneUndefinedValues = function(config) {
    // Prune the keys of the unspecified values
    _.each(config, function(value, key) {
        if (value === undefined) {
            delete config[key];
        }
    });
};