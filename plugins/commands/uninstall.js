
var _ = require('underscore');
var colors = require('colors');
var sprintf = require('sprintf-js').sprintf;

var Command = module.exports = function() {};

/**
 * @see ../command.js
 */
Command.prototype.help = function() {
    return {
        'description': 'Uninstall a cowboy module from NPM in the plugins directory of each cattle node.',
        'args': '<npm module>',
        'exampleArgs': ['cowboy-contrib-apt']
    };
};

/**
 * @see ../command.js
 */
Command.prototype.validate = function(ctx, done) {
    if (!_.isString(ctx.args()[0])) {
        return done('You must specific an npm module to uninstall.');
    }

    return done();
};

/**
 * @see ../command.js
 */
Command.prototype.timeout = function() {
    return 30000;
};

/**
 * @see ../command.js
 */
Command.prototype.before = function(ctx, done) {
    console.log(' ');
    console.log('Uninstalling module: %s', ctx.args()[0].bold);
    console.log(' ');
    console.log(sprintf('  %-25s | %s', 'Host', 'Result'));
    console.log('--------------------------- | -------------------------');
    console.log('                            |');
    return done();
};

/**
 * @see ../command.js
 */
Command.prototype.exec = function(ctx, reply, done) {
    ctx.cowboy().modules.uninstall(ctx.args()[0], function(err) {
        if (err) {
            reply({'error': err.message});
        }

        reply({});
        return done();
    });
};

/**
 * @see ../command.js
 */
Command.prototype.hostEnd = function(ctx, host, response, done) {
    response = response[0];
    if (response.error) {
        msg = response.error.red;
    } else {
        msg = sprintf('Uninstalled: %s', ctx.args()[0]);
    }

    console.log(sprintf('  %-25s | %s', host, msg));
    return done();
};

/**
 * @see ../command.js
 */
Command.prototype.end = function(ctx, responses, expired, done) {
    _.each(expired, function(host) {
        console.log(sprintf('  %-25s | %s', host, 'Timed out'.red));
    });
    console.log('                            |');
    console.log('-------------------------------------------------------');
    return done();
};
