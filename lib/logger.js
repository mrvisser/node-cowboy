
var bunyan = require('bunyan');
var PrettyStream = require('bunyan-prettystream');

var systemLogLevel = 'info';
var cattleLogLevel = 'info';
var cattleLogDir = null;

/**
 * Create a logger for use by the system
 */
var system = module.exports.system = function() {
    return bunyan.createLogger({
        'name': 'system',
        'streams': [_createConsoleStream(systemLogLevel)]
    });
};

/**
 * Create a logger to be used for logging cattle response
 */
var cattle = module.exports.cattle = function(name) {
    var stream = null;
    if (cattleLogDir) {
        stream = {'path': util.format('%s/%s.log', cattleLogDir, name)};
    } else {
        stream = _createConsoleStream(cattleLogLevel);
    }

    return bunyan.createLogger({
        'name': name,
        'streams': [stream]
    });
};

/*!
 * Create a readable console log stream
 */
var _createConsoleStream = function(level) {
    var prettyStdout = new PrettyStream({'mode': 'short'});
    prettyStdout.pipe(process.stdout);
    return {
        'level': systemLogLevel,
        'type': 'raw',
        'stream': prettyStdout
    };
};