
var _ = require('underscore');
var cowboy = require('../index');
var fs = require('fs');
var temp = require('temp');
var util = require('util');

var _init = false;

var reloadContext = module.exports.reloadContext = function(config, callback) {
    if (_.isFunction(config)) {
        callback = config;
        config = {};
    }

    config.modules = config.modules || {};
    config.modules.dir = config.modules.dir || util.format('%s/.cowboy_default_modules', __dirname);

    // Destroy the context only if we were previously initialized
    cowboy.util.invokeIfNecessary(_init, cowboy.context.destroy, function(err) {
        if (err) {
            return callback(err);
        }

        // Write a configuration file to a test config only if we've been given one
        temp.open({'prefix': 'cowboy-test-config', 'suffix': '.json'}, function(err, tmp) {
            if (err) {
                return callback(err);
            }

            // Write the temp configuration file only if a custom configuration was specified
            fs.writeFile(tmp.path, JSON.stringify(config, null, 4), function(err) {
                if (err) {
                    return callback(err);
                }

                _init = true;
                return cowboy.context.init({'log-level': 'trace', 'log-path': './units.log', 'config': tmp.path}, callback);
            });
        });
    });
};
