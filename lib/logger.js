
var bunyan = require('bunyan');
var extend = require('extend');

var systemLogLevel = null;
var systemLogPath = null;
var cattleLogLevel = null;
var cattleLogDir = null;

var _systemLogger = null;
var _cattleLoggers = null;

/**
 * Initialize the logger with the configuration.
 */
var init = module.exports.init = function(config, callback) {
    destroy(function() {

        if (config.log) {
            if (config.log.level) {
                systemLogLevel = config.log.level;
            }

            if (config.log.path && config.log.path !== 'stdout') {
                systemLogPath = config.log.path;
            }
        }

        system().debug({'systemLogLevel': systemLogLevel, 'systemLogPath': systemLogPath}, 'Initialized logging');
        return callback();
    });
};

var destroy = module.exports.destroy = function(callback) {
    systemLogLevel = 'info';
    systemLogPath = null;
    cattleLogLevel = 'info';
    cattleLogDir = null;

    _systemLogger = null;
    _cattleLoggers = {};

    return callback();
};

/**
 * Create a logger for use by the system
 */
var system = module.exports.system = function() {
    if (_systemLogger) {
        return _systemLogger;
    }

    var stream = null;
    if (systemLogPath) {
        stream = _createFileStream(systemLogLevel, systemLogPath);
    } else {
        stream = _createConsoleStream(systemLogLevel);
    }

    _systemLogger = bunyan.createLogger({
        'name': 'system',
        'streams': [stream],
        'serializers': {
            'err': bunyan.stdSerializers.err
        }
    });
    return _systemLogger;
};

/**
 * Create a logger to be used for logging cattle response
 */
var cattle = module.exports.cattle = function(name) {
    if (_cattleLoggers[name]) {
        return _cattleLoggers[name];
    }

    var stream = null;
    if (cattleLogDir) {
        stream = _createFileStream(cattleLogLevel, util.format('%s/%s.log', cattleLogDir, name));
    } else {
        stream = _createConsoleStream(cattleLogLevel);
    }

    _cattleLoggers[name] = bunyan.createLogger({'name': name, 'streams': [stream]});
    return _cattleLoggers[name];
};

/*!
 * Create a bunyan log stream to a file on the filesystem.
 */
var _createFileStream = function(level, path) {
    return {'level': level, 'path': path};
};

/*!
 * Create a readable console log stream
 */
var _createConsoleStream = function(level) {
    return {
        'level': systemLogLevel,
        'stream': process.stdout
    };
};
