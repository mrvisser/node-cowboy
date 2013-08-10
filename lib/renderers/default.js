
var _ = require('underscore');
var cowboy = require('../../index');

/**
 * Handle an individual response from a cattle node
 */
var renderResponse = module.exports.renderResponse = function(name, code, reply, args, logger, done) {
    if (_.isObject(reply) || _.isArray(reply)) {
        logger.info({
            'name': name,
            'code': code,
            'reply': reply
        }, 'Response received from %s', name);
    } else {
        var data = {'name': name};
        if (code) {
            data.code = code;
        }
        logger.info(data, reply);
    }

    return done();
};

/**
 * All responses received, you can do something with them here
 */
var renderComplete = module.exports.renderComplete = function(responses, args, logger, done) {
    logger.info('Complete');
    return done();
};
