
var _ = require('underscore');
var cowboy = require('../../index');
var util = require('util');

var CommandContext = require('./command-context');
var InitContext = require('./init-context');
var ProcessingQueue = require('./processing-queue');

/**
 * Invoke a cowboy command from the command line.
 *
 * @param   {String[]}  argv            The command-line arguments with which to invoke the command
 * @param   {Function}  callback        Invoked when the command has completed running
 * @param   {Number}    callback.code   The command exit code, where 0 indicates successful execution
 */
var invokeCommand = module.exports.invokeCommand = function(argv, callback) {
    _parseArgv(argv, function(optimist, argv, commandName, commandArgv) {
        // Display cowboy help and exit if necessary
        var exitCode = _cowboyHelp(optimist, argv, commandName);
        if (_.isNumber(exitCode)) {
            return callback(exitCode);
        }

        var initializationContext = new InitContext(argv, {'log': {'path': './cowboy.log'}});

        // Initialize the cowboy context. By default, it logs to a file so that users
        // using the cowboy executable in test mode has less resistence
        cowboy.init(initializationContext, function(err) {
            if (err) {
                throw err;
            }

            // Display the list of commands if requested
            exitCode = _commandList(optimist, argv);
            if (_.isNumber(exitCode)) {
                return callback(exitCode);
            }

            var commandExec = cowboy.util.parseInputCommand(commandName);

            // Get the command plugin the user is trying to execute
            var Command = cowboy.plugins.command(commandExec.commandName, commandExec.moduleName);
            if (!Command) {
                // If the command is falsey, it could not be found
                cowboy.logger.system().error('Could not find command plugin for command "%s"', commandName);
                console.log('Could not find command with name "%s"'.red, commandName);
                return callback(1);
            } else if (_.isArray(Command)) {
                // If the command is an array, it was ambiguous and we cannot execute
                cowboy.logger.system().error('Command "%s" is ambiguous, use the module namespace to more specifically identify the command (e.g., cowboy:ping)');
                console.log('Command "%s" is ambiguous. Use the module namespace to more specifically identify the command (e.g., cowboy:ping)'.red, commandName);
                return callback(1);
            }

            var command = new Command();

            // Display the command help if requested
            exitCode = _commandHelp(optimist, argv, commandName, command);
            if (_.isNumber(exitCode)) {
                return callback(exitCode);
            }

            // Validate the filter arguments, if any
            exitCode = _filterValidate(optimist, argv);
            if (_.isNumber(exitCode)) {
                return callback(exitCode);
            }

            var ctx = new CommandContext(commandArgv);

            // Validate the arguments for the command plugin
            var validateFunction = (_.isFunction(command.validate)) ? command.validate : function(ctx, callback) { return callback(); };
            validateFunction(ctx, function(validationMessage) {
                if (validationMessage) {
                    console.error('Error invoking command:\n');
                    console.error(validationMessage);
                    console.error('\nTry running "cowboy %s --help" for more information.', commandName);
                    return callback(1);
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
                    'args': commandArgv,
                    'filters': cowboy.util.parseFilterArgs(argv)
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

                    beforeFunction.call(command, ctx, function() {

                        // Send the request to the cattle servers
                        var commandRequest = cowboy.conversations.broadcast.request('command', requestData, requestOptions);

                        var processingQueue = new ProcessingQueue();

                        // When any host has submit their "end" frame
                        commandRequest.on('hostEnd', function(host, response) {
                            // Invoke the hostEnd handler only if the host responded with "accept"
                            if (response[0] === 'accept') {
                                processingQueue.push(hostEndFunction, command, [ctx, host, response.slice(1)]);
                            }
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
                            processingQueue.push(endFunction, command, [ctx, responses, expecting]);
                            processingQueue.whenDone(function() {
                                cowboy.logger.system().info('Complete');
                                return callback(0);
                            });
                        });
                    });
                });
            });
        });
    });
};

var _cowboyHelp = function(optimist, argv, commandName) {
    if (commandName || argv.list)
        return;

    optimist.showHelp();
    if (argv.help) {
        return 0;
    } else {
        return 1;
    }
};

var _commandList = function(optimist, argv) {
    if (!argv.list)
        return;

    // List all the available modules if requested
    var commands = cowboy.plugins.commands();
    if (!_.isEmpty(commands)) {
        console.log('\nAvailable Command Plugins:\n');

        // Extract module names and sort them
        var moduleNames = _.keys(commands);
        moduleNames.sort();

        _.each(moduleNames, function(moduleName) {
            // Extract this module's command names and sort them
            var commandNames = _.keys(commands[moduleName]);
            commandNames.sort();

            _.each(commandNames, function(commandName) {
                console.log('  %s:%s', moduleName, commandName);
            });
        });

        console.log('\nUse "cowboy <command> --help" to show how to use a particular command');
    } else {
        console.log('\nThere are no available commands.');
    }

    return 0;
};

var _commandHelp = function(optimist, argv, commandName, command) {
    if (!argv.help)
        return;

    var commandHelp = null;
    if (_.isFunction(command.help)) {
        commandHelp = command.help();
    }

    var helpString = '\n';
    if (commandHelp) {
        if (commandHelp.description) {
            helpString += util.format('%s\n\n', commandHelp.description);
        }

        commandHelp.args = commandHelp.args || '';
        helpString += util.format('cowboy %s', commandName);

        if (commandHelp.args) {
            helpString += util.format(' -- %s\n', commandHelp.args);
        } else {
            helpString += '\n';
        }

        if (_.isArray(commandHelp.exampleArgs) && !_.isEmpty(commandHelp.exampleArgs)) {
            helpString += '\nExample use:\n\n';
            _.each(commandHelp.exampleArgs, function(exampleArgs) {
                helpString += util.format('cowboy %s -- %s\n', commandName, exampleArgs);
            });
        }
    }

    if (helpString) {
        console.log(helpString);
    } else {
        console.log('No help defined for command "%s"', command);
    }

    return 0;
};

var _filterValidate = function(optimist, argv) {
    var filtersValidationMessage = cowboy.util.validateFilterArgs(argv);
    if (filtersValidationMessage) {
        console.error('There is an error with the filter parameters:\n');
        console.error(filtersValidationMessage);
        console.error('\nTry running "cowboy --help" for more information.');
        return 1;
    }
};

var _parseArgv = function(argv, callback) {
    var optimist = require('optimist')
        .usage(
            'Usage: cowboy --help | --list | <command> [--help] | <command> [-c <config file>] [--log-level <level>] [--log-path <path>] [-- <command specific args>]\n\n' +

            'Examples:\n\n' +
            '  cowboy --help\n' +
            '  cowboy --list\n' +
            '  cowboy install --help\n' +
            '  cowboy install cowboy-exec@0.0.1\n')

        .describe('help', 'Display help content for either cowboy or the command if specified')
        .describe('list', 'List all lasso plugins installed on the cowboy (not necessarily installed on the remote cattle)')

        .alias('c', 'config')
        .describe('config', 'The configuration file to use. All configuration provided at the command line will override entries in the config file.')

        .describe('log-level', 'The system log level. One of trace, debug, info, warn or error')
        .describe('log-path', 'The path to a file to log to. If unspecified, will log to stdout');

    // Apply the hosts filter to the optimist, which will tell us how to parse the hosts filter
    // arguments
    require('../filters/hosts').args(optimist);

    argv = optimist.argv;

    return callback(optimist, argv, argv._.shift(), argv._.slice());
};
