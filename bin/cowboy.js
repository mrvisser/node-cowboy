#!/usr/bin/env node

var _ = require('underscore');
var cowboy = require('../index');
var optimist = require('optimist');
var util = require('util');

var CommandContext = require('../lib/model/command-context');

var optimist = require('optimist')
    .usage(
        'Usage: cowboy --help | --list | <command> [--help] | <command> [-c <config file>] [--log-level <level>] [--log-path <path>] [-- <command specific args>]\n\n' +
        
        'Examples:\n\n' +
        '  cowboy --help\n' +
        '  cowboy --list\n' +
        '  cowboy npm-install --help\n' +
        '  cowboy npm-install -- express@3.3.4\n')

    .describe('help', 'Display help content for either cowboy or the command if specified')
    .describe('list', 'List all lasso plugins installed on the cowboy (not necessarily installed on the remote cattle)')

    .alias('c', 'config')
    .describe('config', 'The configuration file to use. All configuration provided at the command line will override entries in the config file.')

    .describe('log-level', 'The system log level. One of trace, debug, info, warn or error')
    .describe('log-path', 'The path to a file to log to. If unspecified, will log to stdout');

// Apply the hosts args to the optimist object
require('../lib/filters/hosts').args(optimist);
var argv = optimist.argv;

process.on('uncaughtException', function(err) {
    cowboy.logger.system().error({'err': err}, 'An uncaught exception has been raised');
    process.exit(1);
});

var quitOnSigint = true;
process.on('SIGINT', function() {
    if (quitOnSigint) {
        cowboy.logger.system().debug('Terminating the process due to SIGINT');
        return process.exit(1);
    }
});

var commandName = argv._.shift();
var args = argv._.slice();

// User must specify at least a commandName, --help or --list
if (!commandName && !argv.list) {
    optimist.showHelp();
    if (argv.help) {
        return process.exit(0);
    } else {
        return process.exit(1);
    }
}

// Initialize the cowboy context
cowboy.context.init(argv, function(err) {
    if (err) {
        throw err;
    }

    // List all the available modules if requested
    if (argv.list) {
        var commands = cowboy.plugins.commands();
        if (commands.length > 0) {
            console.info('\nAvailable Command Plugins:\n');
            _.each(commands, function(commandName) {
                console.info('  %s', commandName);
            });
            console.info('\nUse "cowboy <command> --help" to show how to use a particular command');
        } else {
            console.info('\nThere are no available commands.');
        }

        process.exit(0);
    }

    // Get the command plugin the user is trying to execute
    var Command = cowboy.plugins.command(commandName);
    if (!Command) {
        cowboy.logger.system().error('Could not find command plugin for command "%s"', commandName);
        return process.exit(1);
    }

    var command = new Command();

    // Invoke the help operation for the command if the user asked
    if (argv.help) {
        var commandHelp = null;
        if (_.isFunction(command.help)) {
            commandHelp = command.help();
        }

        return _printCommandHelp(commandName, commandHelp);
    }

    // Validate the filter arguments
    var filtersValidationMessage = cowboy.util.validateFilterArgs(argv);
    if (filtersValidationMessage) {
        console.error('There is an error with the filter parameters:\n');
        console.error(filtersValidationMessage);
        console.error('\nTry running "cowboy --help" for more information.');
        process.exit(1);
    }

    var filters = cowboy.util.parseFilterArgs(argv);

    // Validate the arguments for the command plugin
    var validateFunction = (_.isFunction(command.validate)) ? command.validate : function(args, callback) { return callback(); };
    validateFunction(args, function(validationMessage) {
        if (validationMessage) {
            console.error('Error invoking command:\n');
            console.error(validationMessage);
            console.error('\nTry running "cowboy %s --help" for more information.', command);
            process.exit(1);
        }

        // Resolve the "before" function
        var beforeFunction = (_.isFunction(command.before)) ? command.before : function(ctx, done) {
            return done();
        };

        // Resolve the "hostEnd" function
        var hostEndFunction = (_.isFunction(command.hostEnd)) ? command.hostEnd : function(ctx, host, response, done) {
            return done();
        };

        // Resolve the "end" function
        var endFunction = (_.isFunction(command.end)) ? command.end : function(ctx, responses, expired, done) {
            return done();
        };

        var requestData = {
            'commandName': commandName,
            'args': args,
            'filters': filters
        };

        var requestOptions = {
            'timeout': {
                'idle': (_.isFunction(command.timeout)) ? command.timeout() : null
            }
        };

        cowboy.presence.consume(function(err) {
            if (err) {
                throw err;
            }

            var accepted = {};
            var rejected = {};

            var ctx = new CommandContext(requestData.args);
            beforeFunction.call(command, ctx, function() {
                var commandRequest = cowboy.conversations.broadcast.request('command', requestData, requestOptions);

                // When a host returns any "data" frame
                commandRequest.on('data', function(host, body) {
                    if (body === 'accept' && !accepted[host]) {
                        cowboy.logger.system().trace('Host "%s" has accepted the request filter', host);
                        accepted[host] = true;
                    } else if (body === 'reject') {
                        cowboy.logger.system().trace('Host "%s" has accepted the request filter', host);
                        rejected[host] = true;
                    }
                });

                var processing = false;
                var processingQueue = [];
                var processQueue = function() {
                    // If already processing, let it be
                    if (processing) {
                        return;
                    }

                    // Indicate that we're processing
                    processing = true;

                    // Take the next operation, if it's empty, we just finish processing
                    var operation = processingQueue.shift();
                    if (!operation) {
                        processing = false;
                        return;
                    }

                    // We have an operation, invoke it
                    operation.method.apply(command, _.union(operation.args, function() {
                        if (_.isFunction(operation.done)) {
                            // If there was a `done` function on this operation, we forcefully terminate processing here
                            return operation.done();
                        } else {
                            // If there was not a `done` function, we just continue along with the processing queue
                            processing = false;
                            return processQueue();
                        }
                    }));
                };

                // When any host has submit their "end" frame
                commandRequest.on('hostEnd', function(host, response) {
                    processingQueue.push({
                        'method': hostEndFunction,
                        'args': [ctx, host, response]
                    });

                    return processQueue();
                });

                // When all hosts have submit their "end" frame or have timed out
                commandRequest.on('end', function(responses, expecting) {

                    // Amend the responses to remove internal cowboy-cattle communication frames
                    _.each(responses, function(response, host) {
                        if (response[0] === 'accept') {
                            // If the host accepted the frame, we will return its response. Slice out the first frame
                            responses[host] = response.slice(1);
                        } else if (response[0] === 'reject') {
                            // If the host rejected the frame, we will ignore its response. Delete it
                            delete responses[host];
                        } else {
                            // This shouldn't happen :(
                            cowboy.logger.system().warn('Received invalid initial frame from host "%s". Ignoring response', host);
                            delete responses[host];
                        }
                    });

                    // Push the final end frame onto the processing queue
                    processingQueue.push({
                        'method': endFunction,
                        'args': [ctx, responses, expecting],
                        'done': function() {
                            cowboy.logger.system().info('Complete');
                            process.exit(0);
                        }
                    });

                    return processQueue();
                });
            });
        });
    });
});

/*!
 * Print the formatted help object to the console.
 */
var _printCommandHelp = function(command, help) {
    var helpString = '\n';
    if (help) {
        if (help.description) {
            helpString += util.format('%s\n\n', help.description);
        }

        help.args = help.args || '';
        helpString += util.format('cowboy %s', command);

        if (help.args) {
            helpString += util.format(' -- %s\n', help.args);
        } else {
            helpString += '\n';
        }

        if (_.isArray(help.exampleArgs) && !_.isEmpty(help.exampleArgs)) {
            helpString += '\nExample use:\n\n';
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
