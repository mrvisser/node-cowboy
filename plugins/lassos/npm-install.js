
var cowboy = require('cowboy');
var shell = require('shelljs');
var util = require('util');

var ERR_NPM_LOAD = 1;
var ERR_NPM_INSTALL = 2;
var ERR_NPM_FINDMODULE_UNKNOWN = 3;
var ERR_NPM_FINDMODULE_NOTFOUND = 4;

/**
 * Handle a request from the cowboy. This will be invoked on the cattle node.
 *
 * @param  {String[]}   args        The arguments that the command was invoked with
 * @param  {Function}   done        Invoke this when you are finished handling the request
 * @param  {Number}     done.code   A numeric code indicating the exit status. 0 should indicate success, anything above 0 should indicate some plugin-specific error code.
 * @param  {Object}     done.reply  The reply that goes along with the code. Can be any arbitrary String or Object
 */
var handle = module.exports.handle = function(args, done) {
    var module = args[0];

    // For module name lookups that didn't have versions, npm will append an @ at the end with an empty string. Look for it, too.
    var lookup = [module, module+'@'];

    // Load the npm context
    cowboy.npm.load(function(err, npm) {
        if (err) {
            return done(ERR_NPM_LOAD, err);
        }

        // Install the specified module
        npm.commands.install([module], function(err, data) {
            if (err) {
                return done(ERR_NPM_INSTALL, err);
            }

            // Find the module in the npm node_modules directory. We can't use npm ls because the loaded npm context has everything
            // cached
            cowboy.npm.findModule(npm, lookup, function(err, packageJson) {
                if (err) {
                    return done(ERR_NPM_FINDMODULE_UNKNOWN, err);
                } else if (!packageJson) {
                    return done(ERR_NPM_FINDMODULE_NOTFOUND, 'npm install completed successfully but the module was not found in the global npm directory afterward');
                }

                return done(0, packageJson);
            });
        });
    });
};

/**
 * Perform something after the reply has been sent back to the cowboy
 *
 * @param  {Object}     err     An error that occurred returning a response, if any
 * @param  {Number}     code    The numeric code indicating the exit status of the handler
 * @param  {Object}     reply   The reply object that was sent by the handler
 */
var afterResponse = module.exports.afterResponse = function(err, code, reply) {
    cowboy.logger.system().info('Restarting the cattle process');
    if (code === 0 || code > ERR_NPM_INSTALL) {
        // If it was successful, or if it failed after the npm install, we'll reboot the process to try and pick up changes
        cowboy.context.reboot();
    }
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
    if (code !== 0) {
        logger.error({'err': reply, 'code': code}, 'Error installing module');
    } else {
        logger.info('Installed version %s of module %s', reply.version, reply.name);
    }

    return done();
};

/**
 * Provides the ability to render something on the cowboy at the end of the command lifecycle with
 * all the replies that were received.
 *
 * @param  {Object[]}   responses           An array of responses that were received
 * @param  {String}     responses[i].name   The name of the cattle node who gave this response
 * @param  {Number}     responses[i].code   The numeric code with which the lasso plugin exitted
 * @param  {Object}     responses[i].reply  The arbitrary reply object that was sent back with the exit code
 * @param  {String[]}   args                The arguments that the command was invoked with
 * @param  {Object}     logger              A Bunyan logger that can be used to render information to the log
 * @param  {Function}   done                Invoke this when you are done rendering
 */
var renderComplete = module.exports.renderResponses = function(responses, args, logger, done) {
    return done();
};