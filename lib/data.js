
var _ = require('underscore');
var cowboy = require('cowboy');
var extend = require('extend');
var os = require('os');

var _data = null;

/**
 * Initialize the data
 */
var init = module.exports.init = function(config) {
    _data = extend(true, {}, _defaultData(), config);
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
