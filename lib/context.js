
var _ = require('underscore');
var cowboy = require('cowboy');
var extend = require('extend');
var fs = require('fs');
var minimatch = require('minimatch');
var npm = require('npm');
var shell = require('shelljs');
var util = require('util');

var hasInit = false;
var lassoPlugins = null;
var lassoMetadata = null;
var config = null;
var exec = null;


/**
 * Initialize the application context
 */
var init = module.exports.init = function(executable, argv, callback) {
    if (hasInit) {
        throw new Error('Attempted to initialize twice');
    }
    hasInit = true;

    exec = executable;
    config = _resolveConfig(argv.config, argv);
    cowboy.logger.init(config);

    _loadPlugins(function(err, _lassoMetadata, _lassoPlugins) {
        if (err) {
            return callback(err);
        }

        lassoMetadata = _lassoMetadata;
        lassoPlugins = _lassoPlugins;
        
        return callback();
    });
};

/**
 * Whether or not this context was initialized for the cowboy process
 */
var isCowboy = module.exports.isCowboy = function() {
    return (exec === 'cowboy');
};

/**
 * Whether or not this context was initialized for the cattle process
 */
var isCattle = module.exports.isCattle = function() {
    return (exec === 'cattle');
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
    return _.extend({}, config);
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
    npm.load({'global': true, 'loglevel': 'silent'}, function(err) {
        if (err) {
            throw err;
        }

        npm.commands.ls([], true, function(err, data, lite) {
            if (err) {
                throw err;
            }

            var _lassoMetadata = {};
            var _lassoPlugins = {};

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
                    if (_lassoPlugins[name]) {
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

                    _lassoPlugins[name] = plugin;
                    _lassoMetadata[name] = {'name': name, 'version': module.version};
                });
            });

            return callback(null, _lassoMetadata, _lassoPlugins);
        });
    });
};

/*!
 * Determine the effective configuration from the file-system config (if any) and the supplied parameters (if any)
 */
var _resolveConfig = function(configPath, argv) {
    var configFromFile = _loadConfigFromFile(configPath);
    var configFromArgv = _loadConfigFromArgv(argv);
    var configDefault = _loadDefaultConfig();

    // Apply the configurations in priority order
    return extend(true, {}, configDefault, configFromFile, configFromArgv);
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
    return {
        'command': {
            'timeout': cowboy.util.getIntParam(argv.timeout)
        },
        'log': {
            'level': argv['log-level'],
            'path': argv['log-path']
        }
    };
};

/*!
 * Try and load a configuration from a JSON file located at the given path
 */
var _loadConfigFromFile = function(configPath) {
    if (!configPath) {
        return null;
    }

    return extend(true, {}, require(configPath));
};

