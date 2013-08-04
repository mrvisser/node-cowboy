
var _ = require('underscore');
var cowboy = require('cowboy');
var fs = require('fs');
var minimatch = require('minimatch');
var npm = require('npm');
var shell = require('shelljs');
var util = require('util');

/**
 * Load the npm module
 *
 * @param  {Function}   callback        Invoked when npm has been loaded
 * @param  {Error}      callback.err    An error that occurred, if any
 * @param  {Npm}        callback.npm    The npm module that was loaded
 */
var load = module.exports.load = function(callback) {
    npm.load({'global': true, 'loglevel': 'silent'}, function(err) {
        if (err) {
            return callback(err);
        }

        return callback(null, npm);
    });
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
var findModule = module.exports.findModule = function(npm, from, callback) {
    var returned = false;

    // Search for package.json files in top-level directories of the global npm dir
    _.each(shell.ls('-R', npm.dir).filter(minimatch.filter('*/package.json')), function(packageJsonFile) {
        if (returned) {
            return;
        }

        cowboy.logger.system().trace('Inspecting package.json file: %s', packageJsonFile);

        var packageJson = null;
        try {
            packageJson = JSON.parse(fs.readFileSync(util.format('%s/%s', npm.dir, packageJsonFile)));
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
