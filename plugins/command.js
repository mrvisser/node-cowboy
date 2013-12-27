
var Command = module.exports = function() {};

/**
 * Return an object that describes the help information for the plugin. The object has fields:
 *
 *  * description   : A String description of what the plugin does. Can be multiple lines.
 *  * args          : A single line of text showing the args.
 *                      E.g., "<required option> [<optional option>] [-v] [-d <directory>]"
 *  * examples      : A list of strings showing ways to use the module
 *
 *  {
 *      "description": "Uses npm -g to globally install a module on the cattle nodes.",
 *      "args": "<npm module>",
 *      "exampleArgs": ["express", "express@3.3.4", "git://github.com/visionmedia/express"]
 *  }
 *
 * @return  {Object}    An object describing the help information for the command
 * @runat   cowboy
 * @optional
 */
Command.prototype.help = function() {};

/**
 * Validate the command context that was invoked by the user. This function must return a String as the first argument
 * in the `done` callback method in order to indicate a validation error message. If an error message is provided, the
 * command execution will not continue and the cattle nodes will not receive the command.
 *
 * @param   {CommandContext}    ctx             The context of the command
 * @param   {Function}          done            The function to invoke when validation is complete
 * @param   {String}            [done.message]  An error message to display for the user if the arguments are not
 *                                              correct
 * @runat   cowboy
 * @optional
 */
Command.prototype.validate = function(ctx, done) {};

/**
 * Provide a custom idle timeout for the command request. If your cattle command needs an unusually long (e.g., more
 * than 5 seconds) duration of time between reply frames being sent to the cowboy, it is important to set this to a
 * more appropriate idle timeout so that the cowboy does not timeout in its request.
 *
 * Note that there are some other ways to intervene idle timeout such as sending heartbeat frames to the cowboy during
 * command processing while operations are being performed.
 *
 * @return  {Number}    The timeout in milliseconds that the cowboy will wait between receiving reply frames from the
 *                      cattle nodes
 * @runat   cowboy
 * @optional
 */
Command.prototype.timeout = function() {};

/**
 * Perform any post-validation, pre-execution operations on the cowboy. This is useful for tasks such as setting
 * internal command state on the cowboy or outputting initial text for the user to indicate that the command will begin
 * executing.
 *
 * @param   {CommandContext}    ctx     The command context of the current command
 * @param   {Function}          done    The function to invoke when the command preparation is complete
 * @runat   cowboy
 * @optional
 */
Command.prototype.before = function(ctx, done) {};

/**
 * Perform the execution of the command on the cattle node.
 *
 * @param   {CommandContext}    ctx                     The command context of the current command
 * @param   {Function}          reply                   A function that can be used to send a frame of data to the
 *                                                      cowboy node. This can be invoked many times before the command
 *                                                      is complete
 * @param   {Object}            reply.data              The arbitrary reply data to send in this frame
 * @param   {Function}          [reply.callback]        Invoked when the reply has been sent to the cowboy
 * @param   {Error}             [reply.callback.err]    An error that occurred while sending the reply frame, if any
 * @param   {Function}          done                    A function that should be used to indicate that the command has
 *                                                      completed successfully. The cowboy node will hang until either
 *                                                      this method is invoked for all known cowboy nodes, or until it
 *                                                      times out
 * @param   {Function}          [done.callback]         Invoked when the end frame has been sent to the cowboy client
 * @param   {Error}             [done.callback.err]     An error that occured while sending the end frame, if any
 * @runat   cattle
 * @required
 */
Command.prototype.exec = function(ctx, reply, done) {};

/**
 * Perform any operations necessary on the cowboy after an individual cattle node has finished executing (i.e., sent its
 * "end" frame). This is useful for operations such as setting internal command state or outputting feedback to the user
 * to indicate something has finished.
 *
 * @param   {CommandContext}    ctx         The context of the current command
 * @param   {String}            host        The host identifier of the cattle node who just finished processing
 * @param   {Object[]}          response    An array of response frames (mix-typed) that were sent by the cattle node
 *                                          while it was executing the command
 * @param   {Function}          done        The function to invoke when the hostEnd operations have been performed
 * @runat   cowboy
 * @optional
 */
Command.prototype.hostEnd = function(ctx, host, response, done) {};

/**
 * Perform any operations necessary on the cowboy after all known cattle nodes have finished executing the command or
 * timed out from the idle timeout. This is useful for showing summarized output to the user of everything accomplished
 * during command execution on all nodes.
 *
 * @param   {CommandContext}    ctx         The command context of the current command
 * @param   {Object}            responses   The responses object that that represents all reply frames from each cattle
 *                                          host. The object is keyed by the cattle node hostname, and the value is an
 *                                          array of Objects, each object representing an invokation of `reply` by the
 *                                          cattle node's `exec` method
 * @param   {String[]}          expired     A list of cattle node hostnames who failed to send a reply to the command
 *                                          within the idle expiry timeframe
 * @param   {Function}          done        The function to invoke when the end operations have been performed
 * @runat   cowboy
 * @optional
 */
Command.prototype.end = function(ctx, responses, expired, done) {};
