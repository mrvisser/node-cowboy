
var _ = require('underscore');
var colors = require('colors');
var sprintf = require('sprintf-js').sprintf;

var Command = module.exports = function() {};

/**
 * @see ../command.js
 */
Command.prototype.help = function() {
    return {'description': 'Describe the modules and commands installed on each cattle node.'};
};

/**
 * @see ../command.js
 */
Command.prototype.before = function(ctx, done) {
    console.log(' ');
    console.log(sprintf('  %-25s | %-25s | %-50s ', 'Host', 'Module', 'Commands'));
    _printSeparator();
    return done();
};

/**
 * @see ../command.js
 */
Command.prototype.exec = function(ctx, reply, done) {
    var response = {};
    ctx.cowboy().modules.ls(function(err, modules) {
        if (err) {
            reply({'error': err.message});
            return done();
        }

        var commands = ctx.cowboy().plugins.commands();

        _.each(modules, function(module) {
            response[module.npm.name] = {
                'version': module.npm.version,
                'commands': commands[module.npm.name] && _.keys(commands[module.npm.name])
            };
        });

        reply({'modules': response});
        return done();
    });
};

Command.prototype.end = function(ctx, responses, expired, done) {
    _.each(responses, function(response, host) {
        response = response[0];
        if (response.error) {
            _printError(host, response.error);
        } else {
            _printHost(host, response.modules);
        }

        _printSeparator();
    });
    return done();
};

var _printHost = function(host, modules) {
    var commandLineLength = 50;
    _.each(modules, function(module, moduleName) {
        moduleName = sprintf('%s@%s', moduleName, module.version);
        var commandRows = [];
        var currentCommandRow = [];
        var currentCommandRowLength = 0;

        // For aesthetics, the commands should wrap to new rows when reaching the column length
        _.each(module.commands, function(commandName) {
            if (currentCommandRowLength === 0 || (currentCommandRowLength + commandName.length + 2) < commandLineLength) {
                currentCommandRow.push(commandName);
                currentCommandRowLength += (commandName.length + 2);
            } else {
                commandRows.push(currentCommandRow);
                currentCommandRow = [commandName];
                currentCommandRowLength = commandName.length;
            }
        });

        // Push the final row
        commandRows.push(currentCommandRow);

        // Print the first row, which contains the host and module name
        _printRow(host, moduleName, commandRows[0] && commandRows[0].join(', '));
        for (var i = 1; i < commandRows.length; i++) {
            _printRow(' ', ' ', commandRows[i].join(', '));
        }
    });
    
};

var _printRow = function(host, module, commands) {
    console.log(sprintf('  %-25s | %-25s | %-50s ', host, module, commands));
};

var _printError = function(host, message) {
    console.log(sprintf('  %-25s | %-78s ', host, message.red));
};

var _printSeparator = function() {
    console.log('----------------------------|---------------------------|----------------------------------------------------');
};
