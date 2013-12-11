#!/usr/bin/env node

var _ = require('underscore');
var cowboy = require('../index');
var optimist = require('optimist');
var util = require('util');

var argv = optimist
    .usage('Usage: cattle [--config <config file>] [--log-level <level>] [--log-path <path>]')

    .describe('help', 'Show this usage information')
    .describe('config', 'The configuration file to use. All configuration provided at the command line will override entries in the config file.')
    .describe('log-level', 'The system log level. One of info, warn, debug, trace')
    .describe('log-path', 'The path to a file to log to. If unspecified, will log to stdout')

    .argv;

if (argv.help) {
    optimist.showHelp();
    process.exit(0);
}

process.on('uncaughtException', function(err) {
    cowboy.logger.system().error({'err': err}, 'An uncaught exception has been raised');
});

// Initialize the application context
cowboy.context.init(argv, function(err) {
    if (err) {
        cowboy.logger.system().error({'err': err}, 'An error occurred initializing the context');
        process.exit(1);
    }

    // Start listening to commands
    var commandListener = cowboy.conversations.broadcast.listen('command');
    commandListener.on('listen', function() {
        cowboy.logger.system().info('Started listening on command channel');

        // Start emitting presence
        cowboy.presence.broadcast();

        commandListener.on('request', function(body, reply, end) {
            var command = cowboy.plugins.command(body.commandName);
            if (!command) {
                cowboy.logger.system().debug({'body': body}, 'Rejecting unknown command');
                reply('reject');
                return end();
            } else if (!_matchesFilter(body.filters)) {
                cowboy.logger.system().debug({'body': body}, 'Rejecting command because of filter mismatch');
                reply('reject');
                return end();
            }

            cowboy.logger.system().debug({'body': body}, 'Accepting command');

            // Handle the command by first accepting and then handing over the reply and end functions to the plugin
            reply('accept');
            return command.handle(body.args, reply, end);
        });
    });
});

/*!
 * Determine if the given set of filters from a command match this cattle node
 */
var _matchesFilter = function(filters) {
    if (!filters || filters.length === 0) {
        cowboy.logger.system().debug('No filters specified, default to a match');
        return true;
    }

    var matches = false;
    _.each(filters, function(filter) {
        var filterModule = null;
        var requiring = util.format('../lib/filters/%s', filter.type);

        try {
            filterModule = require(requiring);
        } catch (ex) {
            // There was no filter, simply ignore
            cowboy.logger.system().warn('No filter found for type "%s" at path "%s"', filter.type);
            return;
        }

        if (filterModule.test(filter.args)) {
            cowboy.logger.system().debug({'filter': filter}, 'Filter matched');
            matches = true;
        } else {
            cowboy.logger.system().trace({'filter': filter}, 'Filter did not match');
        }
    });

    return matches;
};
