
var cowboy = require('../../index');

var REDIS_KEY_PRESENCE = 'presence';

/*!
 * Mark the provided host as absent from responding to cowboy requests
 */
var absent = module.exports.absent = function(host, callback) {
    return cowboy.redis.client().hdel(REDIS_KEY_PRESENCE, host, callback);
};

/*!
 * Clear all presence entries in the database
 */
var clear = module.exports.clear = function(callback) {
    return cowboy.redis.client().del(REDIS_KEY_PRESENCE, callback);
};

/*!
 * Read all present hosts from redis
 */
var consume = module.exports.consume = function(callback) {
    return cowboy.redis.client().hgetall(REDIS_KEY_PRESENCE, callback);
};

/*!
 * Mark the provided host as present for responding to cowboy requests
 */
var present = module.exports.present = function(host, callback) {
    return cowboy.redis.client().hset(REDIS_KEY_PRESENCE, host, Date.now(), callback);
};
