
var _ = require('underscore');
var cowboy = require('cowboy');

var ERR_NPM_LOAD = 1;
var ERR_NPM_LS = 2;
var ERR_NOT_INSTALLED = 3;

/**
 * Return an object that describes the help information for the plugin. The object has fields:
 *
 *  * description   : A String description of what the plugin does. Can be multiple lines.
 *  * args          : A single line of text showing the args. E.g., "<required option> [<optional option>] [-v] [-d <directory>]"
 *  * examples      : A list of strings showing ways to use the module
 *
 *  {
 *      "description": "Uses npm -g to globally install a module on the cattle nodes.",
 *      "args": "<npm module>",
 *      "exampleArgs": ["express", "express@3.3.4", "git://github.com/visionmedia/express"]
 *  }
 *
 * @return  {Object}    An object describing
 */
var help = module.exports.help = function() {
    return {
        'description': 'Uses npm to show information about an installed module on the cattle.',
        'args': '<module name>',
        'exampleArgs': ['cowboy']
    };
};

/**
 * Validate the arguments with which the user invoked the command.
 *
 * @param  {String[]}   args            The array of arguments that are supplied for the command. These are essentially what you would receive from `process.argv`. This will never be unspecified, will always at least be an empty array.
 * @param  {Function}   callback        Invoked when validation is completed
 * @return {String}     callback.err    A string error message to display for the user, it can be multiple lines. If falsey, it will be assumed validation succeeded.
 */
var validate = module.exports.validate = function(args, callback) {
    if (!args[0]) {
        return callback('Must specify an option for the module to show.');
    } else {
        return callback();
    }
};

/**
 * Handle a request from the cowboy. This will be invoked on the cattle node.
 *
 * @param  {String[]}   args        The arguments that the command was invoked with
 * @param  {Function}   done        Invoke this when you are finished handling the request
 * @param  {Number}     done.code   A numeric code indicating the exit status. 0 should indicate success, anything above 0 should indicate some plugin-specific error code.
 * @param  {Object}     done.reply  The reply that goes along with the code. Can be any arbitrary String or Object
 */
var handle = module.exports.handle = function(args, done) {
    var moduleName = args[0];
    var module = null;

    // Load the npm context
    cowboy.npm.load(function(err, npm) {
        if (err) {
            return done(ERR_NPM_LOAD, err);
        }

        // Set the depth to 2 so npm ls gives us at least the version
        npm.commands.config(['set', 'depth', '2'], function(err) {
            if (err) {
                return done(ERR_NPM_LOAD, err);
            }

            npm.commands.ls([], true, function(err, data, lite) {
                if (err) {
                    return done(ERR_NPM_LS, err);
                }

                var module = lite.dependencies[moduleName];
                if (!module) {
                    return done(ERR_NOT_INSTALLED);
                } else {
                    return done(0, module);
                }
            });
        });
    });
};

/**
 * Render a single response from a cattle node.
 *
 * @param  {String}     name    The name of the cattle node who gave this response
 * @param  {Number}     code    The numeric code with which the lasso plugin exitted
 * @param  {Object}     reply   The arbitrary reply object that was sent back with the exit code
 * @param  {String[]}   args    The arguments that the command was invoked with
 * @param  {Object}     logger  A Bunyan logger that can be used to render information to the log
 * @param  {Function}   done    Invoke this when you are done rendering
 */
var renderResponse = module.exports.renderResponse = function(name, code, reply, args, logger, done) {
    if (code === ERR_NOT_INSTALLED) {
        logger.info('Module "%s" is not installed', args[0]);
    } else if (code !== 0) {
        logger.error({'err': reply}, 'Error loading modules');
    } else {
        logger.info('Module "%s" is version %s', args[0], reply.version);
    }

    return done();
};
