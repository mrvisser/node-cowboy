#!/usr/bin/env node

var _ = require('underscore');
var cowboy = require('../index');
var optimist = require('optimist');
var util = require('util');

var optimist = require('optimist')
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
    .describe('log-path', 'The path to a file to log to. If unspecified, will log to stdout');

// Apply the hosts args to the optimist object
require('../lib/filters/hosts').args(optimist);
var argv = optimist.argv;

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
    var command = cowboy.plugins.command(commandName);
    if (!command) {
        cowboy.logger.system().error('Could not find command plugin for command "%s"', commandName);
        return process.exit(1);
    }

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

        // Apply default timeout and end function
        var timeoutFunction = (_.isFunction(command.timeout)) ? command.timeout : function() { return; };
        var endFunction = (_.isFunction(command.end)) ? command.end : function(args, responses, timedOut, done) {
            cowboy.logger.system().info({'responses': responses}, 'Finished executing command "%s"', commandName);
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

            var commandRequest = cowboy.conversations.broadcast.request('command', requestData, requestOptions);
            commandRequest.on('end', function(responses, expecting) {
                endFunction(args, responses, expecting, function() {
                    cowboy.logger.system().info('Complete');
                    process.exit(0);
                });
            });
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
