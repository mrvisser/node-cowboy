
var util = require('util');

var getRequestChannelName = module.exports.getRequestChannelName = function(name) {
    return util.format('broadcast-request-%s', name);
};

var getReplyChannelName = module.exports.getReplyChannelName = function(name, broadcastId) {
    return util.format('broadcast-reply-%s-%s', name, broadcastId);
};
