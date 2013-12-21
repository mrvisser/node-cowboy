
var _ = require('underscore');
var colors = require('colors');
var sprintf = require('sprintf-js').sprintf;

var Command = module.exports = function() {};

/**
 * @see ../command.js
 */
Command.prototype.help = function() {
    return {
        'description': 'Install a cowboy module from NPM in the plugins directory of each cattle node.',
        'args': '<npm module>[@<version>]',
        'exampleArgs': ['cowboy-contrib-apt', 'cowboy-contrib-apt@1.0.3', 'git://github.com/mrvisser/cowboy-contrib-apt']
    };
};

/**
 * @see ../command.js
 */
Command.prototype.validate = function(ctx, done) {
    if (!_.isString(ctx.args()[0])) {
        return done('You must specific an npm module to install.');
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
    console.log('Installing module: %s', ctx.args()[0].bold);
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
    ctx.cowboy().modules.install(ctx.args()[0], function(err, module) {
        if (err) {
            reply({'error': err.message});
            return done();
        } else if (_.isEmpty(module) || !module.npm || !module.npm.name || !module.npm.version) {
            console.log(JSON.stringify(module, null, 2));
            reply({'error': 'An unexpected error occurred'});
            return done();
        }

        reply({
            'module': {
                'name': module.npm.name,
                'from': module.npm.from,
                'version': module.npm.version
            }
        });

        return done();
    });
};

/**
 * @see ../command.js
 */
Command.prototype.hostEnd = function(ctx, host, response, done) {
    response = response[0];
    var msg = null;
    if (response.error) {
        if (response.error.indexOf('Tried to get a non-existing module') === 0) {
            msg = 'Installed module is not a cowboy plugin module';
        } else {
            ctx.cowboy().logger.system().error('Plugin install error: %s', response.error.message);
            msg = 'An unexpected error occurred';
        }

        msg = msg.red;
    } else {
        msg = sprintf('Installed: %s@%s', response.module.name, response.module.version);
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
