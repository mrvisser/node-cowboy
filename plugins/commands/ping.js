
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
 * @param  {String[]}   args                    The arguments that the command was invoked with
 * @param  {Function}   reply                   Invoke this to send a data-frame back to the cowboy
 * @param  {Object}     reply.data              The reply data to send
 * @param  {Function}   [reply.callback]        Invoked when the reply has been sent
 * @param  {Error}      [reply.callback.err]    An error that occurred while sending the reply frame, if any
 * @param  {Function}   end                     Invoke this when you are finished handling the request
 * @param  {Function}   [end.callback]          Invoked when the end frame has been sent to the cowboy
 * @param  {Error}      [end.callback.err]      An error that occured while sending the end frame, if any
 */
var handle = module.exports.handle = function(args, reply, done) {
    reply('pong');
    done();
};

/**
 * Indicates that all hosts have replied (or timed out).
 *
 * @param  {String[]}   args        The arguments that the command was invoked with
 * @param  {Object}     responses   An object keyed by host whose values are an array of objects representing the data of each `reply` invocation in the `handle` method
 * @param  {Function}   done        Invoke this method when complete
 *
var end = module.exports.end = function(args, responses, done) {
    cowboy.logger.system().info({'responses': responses}, 'Finished executing ping command');
};
*/