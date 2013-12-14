
var _ = require('underscore');
var colors = require('colors');
var sprintf = require('sprintf-js').sprintf;

var Command = module.exports = function() {
    this._responseLatencies = {};
    this._start = Date.now();

    console.log(sprintf('%-25s Latency'.bold.underline, 'Host'));
};

/**
 * Return an object that describes the help information for the plugin. The object
 * has fields:
 *
 *  * description   : A String description of what the plugin does. Can be multiple lines.
 *  * args          : A single line of text showing the args. E.g., "<required option> [<optional option>] [-v] [-d <directory>]"
 *  * examples      : A list of strings showing ways to use the module
 *
 *  {
 *      "description": "Uses npm -g to globally install a module on the cattle nodes.",
 *      "args": "<npm module>",
 *      "exampleArgs": ["express", "express@3.3.4", "git://github.com/visionmedia/express"]
 *  }
 *
 * @return  {Object}    An object describing
 */
Command.prototype.help = function() {
    return {'description': 'Send a simple ping to cattle nodes to determine if they are active and listening.'};
};

/**
 * Handle a request from the cowboy. This will be invoked on the cattle node.
 *
 * @param  {CommandContext} ctx                     The command context of the current command
 * @param  {Function}       reply                   Invoke this to send a data-frame back to the cowboy
 * @param  {Object}         reply.data              The reply data to send
 * @param  {Function}       [reply.callback]        Invoked when the reply has been sent
 * @param  {Error}          [reply.callback.err]    An error that occurred while sending the reply frame, if any
 * @param  {Function}       end                     Invoked when the command has finished processing
 * @param  {Function}       [end.callback]          Invoked when the end frame has been sent to the cowboy client
 * @param  {Error}          [end.callback.err]      An error that occured while sending the end frame, if any
 */
Command.prototype.exec = function(ctx, reply, done) {
    reply('pong');
    return done();
};

/**
 * Handle the end response of an individual cattle host.
 */
Command.prototype.hostEnd = function(ctx, host, response, done) {
    var latency = (Date.now() - this._start);
    this._responseLatencies[host] = latency;

    console.log(sprintf('%-25s %dms', host, latency));
    return done();
};

/**
 * Invoked on the cowboy client when all cattle hosts have finished their response (or timed out).
 *
 * @param  {CommandContext} ctx         The command context of the current command
 * @param  {Object}         responses   The responses object that that represents all reply frames from each
 *                                      cattle host. The object is keyed by the cattle node hostname, and the
 *                                      value is an array of Object's, each object representing an invokation
 *                                      of `reply` by the cattle node's `exec` method
 * @param  {String[]}       expired     A list of cattle node hostnames who failed to reply to the command
 *                                      within the idle expiry timeframe
 * @param  {Function}       done        Invoked when the function is complete
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
        console.log(sprintf('Avg: %6.2fms', avg));
        console.log(sprintf('Min: %6dms', min));
        console.log(sprintf('Max: %6dms', max));
    }
    console.log(sprintf('Tmt: %6d', timedout));
    done();
};
