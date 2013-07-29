#!/usr/bin/env node

var _ = require('underscore');
var cowboy = require('cowboy');
var optimist = require('optimist');
var os = require('os');

var argv = optimist
    .usage('Usage: $0 [--config <config file>] [--timeout <seconds>] [-s <selection>] <command> <arg0> <arg1>')

    .describe('help', 'Show this usage information')

    .alias('config')
    .describe('config', 'The configuration file to use. All configuration provided at the command line will override entries in the config file.')

    .argv;

process.on('uncaughtException', function(ex) {
    cowboy.logger.system().error({'err': ex}, 'An uncaught exception has been raised');
});

// Load all of the lasso plugins
cowboy.context.init(argv, function(err) {
    if (err) {
        cowboy.logger.system().error({'err': err}, 'An error occurred initializing the context');
        process.exit(1);
    }

    var config = cowboy.context.getConfig();

    // Connect to redis
    cowboy.redis.init(config.host, config.port, config.index, config.password, function(err) {
        if (err) {
            cowboy.logger.system().error({'err': err}, 'An error occurred establishing a connection to redis');
            process.exit(1);
        }

        // Start listening for requests / commands from a cowboy client
        cowboy.redis.listenRequest(function(command, args, done) {
            var lasso = cowboy.context.getLassoPlugin(command);
            if (lasso) {
                lasso.handle(args, done);
            }
        });
    });
});