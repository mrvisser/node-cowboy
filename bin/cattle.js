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

process.on('uncaughtException', function(ex) {
    cowboy.logger.system().error({'err': ex}, 'An uncaught exception has been raised');
});

// Load all of the lasso plugins
cowboy.context.init(argv, function(err) {
    if (err) {
        cowboy.logger.system().error({'err': err}, 'An error occurred initializing the context');
        process.exit(1);
    }

    // The cattle node will broadcast presence so the cowboy knows its existence
    cowboy.presence.broadcast();

    //////////
    // PING //
    //////////

    // Listen and response to ping requests
    cowboy.redis.listenPing(function(filters, command, doPong) {
        var lasso = cowboy.context.getLassoPlugin(command);
        if (!lasso) {
            return cowboy.logger.system().debug('Rejecting ping because there was no plugin for command "%s"', command);
        } else if (!_matchesFilter(filters)) {
            return cowboy.logger.system().debug({'filters': filters}, 'Rejecting ping because it did not match the filter(s)');
        }

        cowboy.logger.system().debug({'filters': filters}, 'Sending pong for command "%s"', command);
        return doPong(cowboy.data.get('hostname'));
    });



    /////////////
    // COMMAND //
    /////////////

    // Start listening for commands from a cowboy client
    cowboy.redis.listenCommand(function(filters, command, args, doPublish) {
        var lasso = cowboy.context.getLassoPlugin(command);
        if (!lasso) {
            return cowboy.logger.system().debug('Rejecting command because there was no plugin for command "%s"', command);
        } else if (!_matchesFilter(filters)) {
            return cowboy.logger.system().debug({'filters': filters}, 'Rejecting command because it did not match the filter(s)');
        }

        cowboy.logger.system().debug({'filters': filters, 'args': args}, 'Executing command "%s"', command);

        // Pass the message on to the proper lasso plugin
        lasso.handle(args, function(code, reply) {

            // Pass the result to redis to publish the reply
            doPublish(cowboy.data.get('hostname'), code, reply, function(err, code, reply) {
                if (err) {
                    cowboy.logger.system().error({'err': err}, 'Error publishing response back to the cowboy');
                }

                if (lasso.afterResponse) {
                    lasso.afterResponse(err, code, reply);
                }
            });
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
