
var _ = require('underscore');
var cowboy = require('../../index');

/**
 * Runs on the cowboy. Applies arguments to the optimist object so we can tell the user what commands this filter takes.
 *
 * @param  {Optimist}   The optimist object acquired through require('optimist');
 */
var args = module.exports.args = function(optimist) {
    optimist.describe('H', 'Specify which cattle nodes to apply the command to by host. Can be string literal or ' +
        'regexp (e.g., "-H www0 -H /db[0-2]/" would apply to www0, db0, db1 and db2');
};

/**
 * Runs on the cowboy. Provides the ability to validate the filter content before sending it to the cattle
 *
 * @param  {String[]}   filter          The filters specified by the user
 * @return {String}                     An error message to show to the user. If falsey, it indicates that validation passed
 */
var validate = module.exports.validate = function(filter) {
    return null;
};

/**
 * Runs on the cattle. Specifies whether or not this machine matches the provided filter content.
 *
 * @param  {String[]}   filters         The list of filters of this type specified by the user that determines if it is a match.
 * @return {Boolean}                    Whether or not this cattle node matches the filter
 */
var test = module.exports.test = function(filters) {
    if (!filters) {
        return true;
    } else if (!_.isArray(filters)) {
        filters = [filters];
    }

    var hostname = cowboy.data.get('hostname');
    var matched = false;
    _.each(filters, function(filter) {
        filter = _parseFilter(filter);
        if (_.isRegExp(filter) && filter.test(hostname)) {
            matched = true;
        } else if (filter === hostname) {
            matched = true;
        }
    });

    return matched;
};

/*!
 * Convert a filter string into a filter. It will be regexp if it starts and ends with /, otherwise it's a literal
 * string filter.
 */
var _parseFilter = function(filter) {
    if (!filter) {
        return null;
    } else if (filter[0] === '/' && filter[filter.length - 1] === '/') {
        return new RegExp(filter.slice(1, -1));
    } else {
        return filter;
    }
};
