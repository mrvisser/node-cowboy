
/**
 * If the `val` is parseable to an integer, return its integer value. Otherwise return the `defaultVal`.
 */
var getIntParam = module.exports.getIntParam = function(val, defaultVal) {
    val = parseInt(val, 10);
    if (!isNaN(val)) {
        return val;
    } else {
        return defaultVal;
    }
};