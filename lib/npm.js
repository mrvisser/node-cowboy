
var _ = require('underscore');
var cowboy = require('../index');
var fs = require('fs');
var minimatch = require('minimatch');
var npm = require('npm');
var path = require('path');
var shell = require('shelljs');
var util = require('util');

/**
 * Initialize the NPM context
 *
 * @param  {Object}     config          The cowboy configuration
 * @param  {Function}   callback        Invoked when NPM has been initialized
 * @param  {Error}      callback.err    An error that occurred, if any
 */
var init = module.exports.init = function(config, callback) {
    var prefix = config.npm.prefix;
    _isGlobal = (prefix) ? false : true;

    var opts = {'loglevel': 'silent'};
    if (prefix) {
        if (prefix[0] === '/') {
            opts.prefix = prefix;
        } else {
            opts.prefix = util.format('%s/%s', process.cwd(), prefix);
        }
        opts.global = false;
    } else {
        opts.global = true;
    }

    cowboy.logger.system().debug({'opts': opts}, 'Intializing NPM');
    npm.load(opts, callback);
};

/**
 * Get the module directory under which npm is operating. This directory should always be a `node_modules` directory from where
 * modules will be installed and loaded, including those that supply plugins
 */
var dir = module.exports.dir = function() {
    return npm.dir;
};

/**
 * List the NPM modules in the configured context
 */
var ls = module.exports.ls = function(callback) {
    npm.commands.config(['set', 'depth', '2'], function(err) {
        if (err) {
            return callback(err);
        }

        npm.commands.ls([], true, function(err, dependencies, lite) {
            if (err) {
                return callback(err);
            }

            return callback(null, lite.dependencies);
        });
    });
};

/**
 * Install the npm module by the given name (or github repository)
 */
var install = module.exports.install = function(name, callback) {
    npm.commands.install([name], callback);
};

/**
 * Find a global npm module by going directly to the file-system for up-to-date information. This is meant to
 * bypass in-memory process cache of npm modules.
 *
 * @param  {Npm}        npm             The loaded npm module with which to search
 * @param  {String[]}   from            An array of matches in the package.json "from" property to look for
 * @param  {Function}   callback        Invoked when the lookup completes
 * @param  {Error}      callback.err    An error that occurred, if any
 * @param  {Object}     callback.module The module's package.json content if it was found
 */
var findModuleByFrom = module.exports.findModuleByFrom = function(from, callback) {
    var returned = false;

    // Search for package.json files in top-level directories of the global npm dir
    _.each(shell.ls('-R', dir()).filter(minimatch.filter('*/package.json')), function(packageJsonFile) {
        if (returned) {
            return;
        }

        cowboy.logger.system().trace('Inspecting package.json file: %s', packageJsonFile);

        var packageJson = null;
        try {
            packageJson = JSON.parse(fs.readFileSync(util.format('%s/%s', dir(), packageJsonFile)));
        } catch (ex) {
            cowboy.logger.system().warn({'err': ex, 'path': packageJsonFile}, 'Found invalid package.json file in npm global directory');
            return;
        }

        cowboy.logger.system().trace('Found package.json file for module %s with from: %s', packageJson.name, packageJson._from);

        // Check if the from parameter in package.json is a match
        if (_.contains(from, packageJson._from)) {
            returned = true;
            return callback(null, packageJson);
        }
    });

    // We didn't find one. Return empty handed
    if (!returned) {
        returned = true;
        return callback();
    }
};
