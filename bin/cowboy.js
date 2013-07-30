#!/usr/bin/env node

var _ = require('underscore');
var cowboy = require('cowboy');
var optimist = require('optimist');
var util = require('util');

var argv = optimist
    .usage('Usage: $0 [--config <config file>] [--timeout <seconds>] [-s <selection>] <command> [<arg0> [<arg1> ...]]')

    .describe('help', 'Show this usage information')
    .describe('config', 'The configuration file to use. All configuration provided at the command line will override entries in the config file.')
    .describe('timeout', 'The maximum amount of time to wait (in seconds) to receive all responses. If this is set low, it\'s possible you won\'t give enough time for all responses to return.')
    .describe('log-level', 'The system log level. One of info, warn, debug, trace')
    .describe('log-path', 'The path to a file to log to. If unspecified, will log to stdout')

    .alias('s', 'select')
    .describe('s', 'A selection that can be made based on the cattle host names. Can supply multiple values and use regular expressions.')

    .argv;

if (argv.help) {
    optimist.showHelp();
    process.exit(0);
} else if (!_.isArray(argv._) || !argv._.length) {
    optimist.showHelp();
    process.exit(1);
}

process.on('uncaughtException', function(ex) {
    cowboy.logger.system().error({'err': ex}, 'An uncaught exception has been raised');
    process.exit(1);
});

var sigintQuit = true;
process.on('SIGINT', function() {
    if (sigintQuit) {
        cowboy.logger.system().debug('Terminating the process due to SIGINT');
        process.exit(1);
    }
});

// Initialize the cowboy context
cowboy.context.init(argv, function(err) {
    if (err) {
        throw err;
    }

    var command = argv._.shift();
    var args = argv._.slice();
    var selections = argv.s;

    var lasso = cowboy.context.getLassoPlugin(command);
    if (!lasso) {
        cowboy.logger.system().error('Could not find lasso plugin for command "%s"', command);
        process.exit(1);
    }

    var renderResponseFunction = lasso.renderResponse || require('cowboy/lib/renderers/default').renderResponse;
    var renderCompleteFunction = lasso.renderComplete || require('cowboy/lib/renderers/default').renderComplete;

    var config = cowboy.context.getConfig();

    // Connect to redis
    cowboy.redis.init(config.host, config.port, config.index, config.password, function(err) {
        if (err) {
            throw err;
        }

        // Manages state for multiple responses
        var responses = [];
        var responseQueue = [];
        var flushing = false;

        /*!
         * Lock and flush everything in the response queue
         */
        var _flushResponseQueue = function(_continuing) {
            if (!_continuing && flushing) {
                // Already flushing, so don't start a new one
                return;
            } else if (responseQueue.length === 0) {
                // We have finished flushing for now
                flushing = false;
                return;
            }

            // Indicate that we've started flushing the queue so we don't get multiple iterations on it
            flushing = true;

            // Jump into a new process tick since we're recursively invoking _flushResponseQueue and don't want
            // to blow out the stack
            process.nextTick(function() {
                var response = responseQueue.shift();
                var logger = cowboy.logger.cattle(response.name);
                renderResponseFunction(response.name, response.code, response.reply, args, logger, function() {
                    return _flushResponseQueue(true);
                });
            });
        };

        // Send the command and await replies
        cowboy.redis.request(command, args, selections, function(response) {
            responses.push(response);
            responseQueue.push(response);
            _flushResponseQueue();
        });

        var _terminate = function() {
            // If renderCompleteFunction hangs, we want the user to be able to terminate with sigint
            sigintQuit = true;
            renderCompleteFunction(responses, args, cowboy.logger.system(), function() {
                cowboy.redis.destroy();
            });
        };

        // We are going to allow one sigint to kill just the timeout period and jump to renderComplete. So we
        // tell the top-level handler to lay off the next sigint
        sigintQuit = false;

        // Wait for a maximum of the configured timeout, then unbind from redis to kill the process
        var waitTimeout = setTimeout(_terminate, config.timeout * 1000);
        process.once('SIGINT', function() {
            cowboy.logger.system().debug('Short-circuiting the timeout because of SIGINT');
            clearTimeout(waitTimeout);
            return _terminate();
        });
    });
});
