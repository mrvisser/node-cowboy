#!/usr/bin/env node

var cowboy = require('../index');
var util = require('util');

process.on('uncaughtException', function(err) {
    cowboy.logger.system().error({'err': err}, 'An uncaught exception has been raised');
    process.exit(1);
});

var cli = require('../lib/internal/cli');

cli.invokeCommand(process.argv, function(code) {
    return process.exit(code);
});