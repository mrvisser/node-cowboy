#!/usr/bin/env node

var _ = require('underscore');
var cowboy = require('cowboy');
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
cowboy.context.init('cattle', argv, function(err) {
    if (err) {
        cowboy.logger.system().error({'err': err}, 'An error occurred initializing the context');
        process.exit(1);
    }

    var config = cowboy.context.getConfig();

    // Connect to redis
    cowboy.redis.init(config.redis.host, config.redis.port, config.redis.index, config.redis.password, function(err) {
        if (err) {
            cowboy.logger.system().error({'err': err}, 'An error occurred establishing a connection to redis');
            process.exit(1);
        }

        // Start listening for requests / commands from a cowboy client
        cowboy.redis.listenRequest(function(filters, command, args, doPublish) {

            // See if this cattle node matches the filter
            if (!_matchesFilter(filters)) {
                return cowboy.logger.system().debug('Rejecting message that did not match filter');
            } else {
                cowboy.logger.system().trace({'filters': filters}, 'Filter matched');
            }

            var lasso = cowboy.context.getLassoPlugin(command);
            if (lasso) {
                cowboy.logger.system().debug({'command': command, 'args': args}, 'Handling command from cowboy');

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
            } else {
                cowboy.logger.system().debug({'command': command}, 'Ignoring request for which we had no handler');
            }
        });

        cowboy.logger.system().info('Listening for redis requests');
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
        try {
            var requiring = util.format('../lib/filters/%s', filter.type);
            filterModule = require(requiring);
        } catch (ex) {
            // There was no filter, simply ignore
            cowboy.logger.system().debug('No filter found for type "%s"', filter.type);
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