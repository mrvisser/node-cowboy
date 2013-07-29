
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
 * @param  {Function}   done    Invoke this when you are done rendering
 */
var renderResponse = module.exports.renderResponse = function(name, code, reply, args, logger, done) {
    logger.info(reply);
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
 * @param  {Function}   done                Invoke this when you are done rendering
 */
var renderComplete = module.exports.renderResponses = function(responses, args, logger, done) {
    return done();
};