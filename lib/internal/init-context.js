
var InitContext = module.exports = function(argv, defaultConfig) {
    this._argv = argv;
    this._config = null;
    this._defaultConfig = defaultConfig || {};
};

InitContext.prototype.argv = function() {
    return this._argv;
};

InitContext.prototype.config = function(config) {
    return this._config = config;
};

InitContext.prototype.defaultConfig = function() {
    return this._defaultConfig;
};
