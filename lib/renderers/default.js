
var _ = require('underscore');
var cowboy = require('cowboy');

/**
 * Handle an individual response from a cattle node
 */
var renderResponse = module.exports.renderResponse = function(name, code, reply, args, logger, done) {
    var lines = JSON.stringify({
        'name': name,
        'code': code,
        'reply': reply,
        'args': args
    }).split('\n');

    _.each(lines, function(line) {
        logger.info(line);
    });

    return done();
};

/**
 * All responses received, you can do something with them here
 */
var renderComplete = module.exports.renderComplete = function(responses, args, logger, done) {
    logger.info('Complete');
    return done();
};
