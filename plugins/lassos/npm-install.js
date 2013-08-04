
var cowboy = require('cowboy');

var ERR_NPM_LOAD = 1;
var ERR_NPM_INSTALL = 2;
var ERR_NPM_FINDMODULE_UNKNOWN = 3;
var ERR_NPM_FINDMODULE_NOTFOUND = 4;



/////////////////////////////////////////////////////////////////////////////
// 1. INVOKED ON THE COWBOY PROCESS BEFORE SENDING COMMAND TO REMOTE NODES //
/////////////////////////////////////////////////////////////////////////////

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
        'description': 'Uses npm to globally install a module on each cattle node. Useful for dynamically installing new cattle plugins across the cluster.',
        'args': '<npm module name or github repository>',
        'exampleArgs': ['express', 'express@3.3.4', 'git://github.com/visionmedia/express']
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
        return callback('Must specify an option for the module to install.');
    } else {
        return callback();
    }
};

/**
 * Specify the recommended timeout for this command (in seconds). This will override the configuration default for the command timeout,
 * but will not override a value provided at the command line by the user.
 *
 * @return {Number}     The timeout (in seconds) to wait before assuming all cattle that would have responded have done so.
 */
var timeout = module.exports.timeout = function() {
    return 15;
};



///////////////////////////////////////////////////////////////////////////
// 2. INVOKED ON THE CATTLE NODES AFTER THE COMMAND HAS BEEN TRANSMITTED //
///////////////////////////////////////////////////////////////////////////

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



//////////////////////////////////////////////////////////////////////////////////////////////
// 3. INVOKED ON THE CATTLE NODE AFTER THE RESPONSE HAS BEEN TRANSMITTED BACK TO THE COWBOY //
//////////////////////////////////////////////////////////////////////////////////////////////

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
        // If it was successful, or if it only failed sometime after the npm install, we'll reboot the process to try and pick up changes
        cowboy.context.reboot();
    }
};



///////////////////////////////////////////////////////////////////////////////////
// 4. INVOKED ON THE COWBOY AFTER THE RESPONSE HAS BEEN RECEIVED FROM THE CATTLE //
///////////////////////////////////////////////////////////////////////////////////

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



////////////////////////////////////////////////////////////////////////////////////////////////////
// 5. INVOKED ON THE COWBOY AFTER ALL RESPONSES HAVE BEEN RECEIVED (OR TIMED OUT, OR USER CTRL+C) //
////////////////////////////////////////////////////////////////////////////////////////////////////

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
