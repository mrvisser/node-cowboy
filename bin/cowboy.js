#!/usr/bin/env node

var _ = require('underscore');
var cowboy = require('cowboy');
var optimist = require('optimist');
var util = require('util');

var argv = optimist
    .usage(
        'Usage: cowboy --help | --list | <command> [--help] | <command> [-c <config file>] [-t <seconds>] [--log-level <level>] [--log-path <path>] [-- <command specific args>]\n\n' +
        
        'Examples:\n\n' +
        '  cowboy --help\n' +
        '  cowboy --list\n' +
        '  cowboy npm-install --help\n' +
        '  cowboy npm-install -- express@3.3.4\n' +
        '  cowboy npm-install -t 30 -- express@3.3.4')

    .describe('help', 'Display help content for either cowboy or the command if specified')
    .describe('list', 'List all lasso plugins installed on the cowboy (not necessarily installed on the remote cattle)')

    .alias('c', 'config')
    .describe('config', 'The configuration file to use. All configuration provided at the command line will override entries in the config file.')

    .alias('t', 'timeout')
    .describe('timeout', 'The maximum amount of time to wait (in seconds) to receive all responses. Leave this number high and use CTRL+C to break early')

    .describe('log-level', 'The system log level. One of trace, debug, info, warn or error')
    .describe('log-path', 'The path to a file to log to. If unspecified, will log to stdout')

    .argv;

process.on('uncaughtException', function(ex) {
    cowboy.logger.system().error({'err': ex}, 'An uncaught exception has been raised');
    process.exit(1);
});

var quitOnSigint = true;
process.on('SIGINT', function() {
    if (quitOnSigint) {
        cowboy.logger.system().debug('Terminating the process due to SIGINT');
        return process.exit(1);
    }
});

var command = argv._.shift();
var args = argv._.slice();
var selections = argv.s;

// User must specify at least a command, --help or --list
if (!command && !argv.list) {
    optimist.showHelp();
    if (argv.help) {
        return process.exit(0);
    } else {
        return process.exit(1);
    }
}

// Initialize the cowboy context
cowboy.context.init('cowboy', argv, function(err) {
    if (err) {
        throw err;
    }

    // List all the available modules if requested
    if (argv.list) {
        var metadata = _.values(cowboy.context.getLassoMetadata());
        var lassoNames = _.keys(metadata);

        // Sort alphabetically by command name
        lassoNames.sort();
        
        console.info('\nAvailable Lasso Plugins:\n');
        _.each(lassoNames, function(lassoName) {
            var lasso = metadata[lassoName];
            console.info('  %s (%s)', lasso.name, lasso.version);
        });
        console.info('\nUse "cowboy <command> --help" to show how to use a particular command');
        process.exit(0);
    }

    var lasso = cowboy.context.getLassoPlugin(command);
    if (!lasso) {
        cowboy.logger.system().error('Could not find lasso plugin for command "%s"', command);
        return process.exit(1);
    }

    // Invoke the help operation if the user asked
    if (argv.help) {
        var commandHelp = null;
        if (_.isFunction(lasso.help)) {
            commandHelp = lasso.help();
        }

        return _printCommandHelp(command, commandHelp);
    }

    // Run the arguments through the lasso plugin validator if implemented
    if (_.isFunction(lasso.validate)) {
        var validationMessage = lasso.validate(args);
        if (validationMessage) {
            console.error('Error invoking command:\n');
            console.error(validationMessage);
            console.error('\nTry running "cowboy help %s" for more information.', command);
            process.exit(1);
        }
    }

    // Apply the base renderers that give reasonable output
    var renderResponseFunction = (_.isFunction(lasso.renderResponse)) ? lasso.renderResponse : require('cowboy/lib/renderers/default').renderResponse;
    var renderCompleteFunction = (_.isFunction(lasso.renderComplete)) ? lasso.renderComplete : require('cowboy/lib/renderers/default').renderComplete;

    var config = cowboy.context.getConfig();

    // Connect to redis
    cowboy.redis.init(config.redis.host, config.redis.port, config.redis.index, config.redis.password, function(err) {
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

        // Derive the timeout, with the priority-order being: command-line, lasso plugin, config file
        var timeout = cowboy.util.getIntParam(argv.t);

        // Fall back to lasso plugin
        if (timeout === undefined && _.isFunction(lasso.timeout)) {
            timeout = cowboy.util.getIntParam(lasso.timeout());
        }

        // Fall back to configuration
        if (timeout === undefined) {
            timeout = config.command.timeout;
        }

        /*!
         * Finish the command and quit the process
         */
        var _terminate = function() {
            // If renderCompleteFunction hangs, we want the user to be able to terminate with sigint
            quitOnSigint = true;
            renderCompleteFunction(responses, args, cowboy.logger.system(), function() {
                cowboy.redis.destroy();
            });
        };

        // We are going to allow one sigint to kill just the timeout period and jump to renderComplete. So we
        // tell the top-level handler to lay off the next sigint
        quitOnSigint = false;

        // Wait for a maximum of the configured timeout, then unbind from redis to kill the process
        cowboy.logger.system().debug('Waiting %s seconds for responses from cattle nodes', timeout);
        var waitTimeout = setTimeout(_terminate, timeout * 1000);
        process.once('SIGINT', function() {
            cowboy.logger.system().debug('Short-circuiting the timeout because of SIGINT');
            clearTimeout(waitTimeout);
            return _terminate();
        });
    });
});

/*!
 * Print the formatted help object to the console.
 */
var _printCommandHelp = function(command, help) {
    var helpString = '';
    if (help) {
        if (help.description) {
            helpString = util.format('%s\n\n', help.description);
        }

        help.args = help.args || '';
        helpString += util.format('cowboy %s', command);

        if (help.args) {
            helpString += util.format(' -- %s\n\n', help.args);
        } else {
            helpString += '\n\n';
        }

        if (_.isArray(help.exampleArgs) && help.exampleArgs.length > 0) {
            helpString += 'Example use:\n\n';
            _.each(help.exampleArgs, function(exampleArgs) {
                helpString += util.format('cowboy %s -- %s\n', command, exampleArgs);
            });
        }
    }

    if (helpString) {
        console.info(helpString);
    } else {
        console.info('No help defined for command "%s"', command);
    }

    process.exit(0);
};
