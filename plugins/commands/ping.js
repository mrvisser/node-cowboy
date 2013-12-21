
var _ = require('underscore');
var colors = require('colors');
var sprintf = require('sprintf-js').sprintf;

var Command = module.exports = function() {};

/**
 * @see ../command.js
 */
Command.prototype.help = function() {
    return {'description': 'Send a simple ping to cattle nodes to determine if they are active and listening.'};
};

/**
 * @see ../command.js
 */
Command.prototype.before = function(ctx, done) {
    this._responseLatencies = {};
    this._start = Date.now();

    console.log(sprintf('%-25s Latency'.bold.underline, 'Host'));
    return done();
};

/**
 * @see ../command.js
 */
Command.prototype.exec = function(ctx, reply, done) {
    reply('pong');
    return done();
};

/**
 * @see ../command.js
 */
Command.prototype.hostEnd = function(ctx, host, response, done) {
    var latency = (Date.now() - this._start);
    this._responseLatencies[host] = latency;

    console.log(sprintf('%-25s %dms', host, latency));
    return done();
};

/**
 * @see ../command.js
 */
Command.prototype.end = function(ctx, responses, expired, done) {
    var timedout = 0;

    // Indicate the timed out hosts in the latency table
    if (_.isArray(expired)) {
        timedout = expired.length;
        expired.sort();
        _.each(expired, function(expiredHost) {
            console.log(sprintf('%-25s timeout', host, latency));
        });
    }

    // Calculate some stats
    var latencies = _.values(this._responseLatencies);
    var max = latencies[0];
    var min = latencies[0];
    var sum = 0;

    _.each(latencies, function(latency) {
        max = Math.max(max, latency);
        min = Math.min(min, latency);
        sum += latency;
    });

    var avg = (sum/latencies.length);

    console.log('');
    console.log('Ping Statistics:'.bold.underline);
    if (!_.isEmpty(latencies)) {
        console.log(sprintf('Avg: %.2fms', avg));
        console.log(sprintf('Min: %dms', min));
        console.log(sprintf('Max: %dms', max));
    }
    console.log(sprintf('Tmt: %d', timedout));
    return done();
};
