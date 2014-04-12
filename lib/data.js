
var _ = require('underscore');
var extend = require('extend');
var os = require('os');

var _data = null;

/**
 * Initialize the data component
 */
var init = module.exports.init = function(ctx, callback) {
    _data = extend({}, _defaultData(), ctx.config().data);
    return callback();
};

/**
 * Destroy / reset the data module
 */
var destroy = module.exports.destroy = function(callback) {
    _data = null;
    return callback();
};

/**
 * Get a data item by key from the machine
 */
var get = module.exports.get = function(key) {
    if (!_data) {
        throw new Error('Attempt to access unitialized data');
    }

    var val = _data[key];
    if (_.isObject(val)) {
        return extend(true, {}, val);
    } else if (_.isArray(val)) {
        return extend(true, [], val);
    } else {
        return val;
    }
};

/*!
 * Get the default data object
 */
var _defaultData = function() {
    return {'hostname': os.hostname()};
};
