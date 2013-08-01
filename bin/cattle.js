#!/usr/bin/env node

var _ = require('underscore');
var cowboy = require('cowboy');
var optimist = require('optimist');
var os = require('os');

var argv = optimist
    .usage('Usage: $0 [--config <config file>] [--timeout <seconds>] [-s <selection>] <command> <arg0> <arg1>')

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
        cowboy.redis.listenRequest(function(command, args, doPublish) {
            var lasso = cowboy.context.getLassoPlugin(command);
            if (lasso) {
                cowboy.logger.system().debug({'command': command, 'args': args}, 'Handling command from cowboy');

                // Pass the message on to the proper lasso plugin
                lasso.handle(args, function(code, reply) {

                    // Pass the result to redis to publish the reply
                    doPublish(os.hostname(), code, reply, function(err, code, reply) {
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