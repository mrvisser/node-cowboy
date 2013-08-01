
/**
 * Return an object that describes the help information for the plugin. The object
 * has fields:
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
    return {'description': 'Send a simple ping to cattle nodes to determine if they are active and listening.'};
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
    return done(0, 'pong');
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
    logger.info(reply);
    return done();
};