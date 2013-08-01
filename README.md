## Cowboy

**Cowboy** is a tool inspired by MCollective that fills essentially the same need, lassoing a large cluster of servers together in order to perform execution tasks in parallel. I got sad with how difficult MCollective was to set up (mostly to install and configure ActiveMQ, Ruby stomp gem, etc...) and decided something in nodejs would be much simpler.

## Simple Usage

First [download and install Redis](http://redis.io/download), make sure it's listening on port 6379. Then install and run cowboy:

```bash

~/Source/cowboy$npm -g install forever

# It will be on NPM when it hits a functional milestone
~/Source/cowboy$npm -g install git://github.com/mrvisser/cowboy

# Start the cattle server
~/Source/cowboy$ npm -g start cowboy

# Send a ping command to all the remote cattle servers
~/Source/cowboy$ cowboy ping
[04:08:33.619Z]  INFO branden-macbook.local: pong
[04:08:38.617Z]  INFO system: Complete

# Install express on all the remote cattle servers
~/Source/cowboy$ cowboy npm-install express
[04:08:50.726Z]  INFO branden-macbook.local: Installed version 3.3.4 of module express
[04:08:52.439Z]  INFO system: Complete
```

## How it works

Cowboy uses a client module called, well, the "cowboy" and each server in your cluster runs a "cattle" server. The cowboy broadcasts messages to the cattle using Redis PubSub and the cattle responds with another PubSub message back to the cowboy.

## Example

```
~/Source/cowboy$ cowboy ping
[01:26:13.709Z]  INFO branden-macbook.local: pong
[01:26:18.705Z]  INFO system: Complete
```

This is a trivial "ping" module. When you execute `cowboy ping` from the cowboy, all nodes listening on the pubsub channel will reply back with "pong". The plugin is in charge of receiving the request and performing the operations on the remote server and sending a response to the cowboy. It is also responsible for formatting that response on the cowboy client.

## Plugins

The plugin system is managed by NPM. Meaning, you can install new plugins simply by running `npm install <plugin> -g`. When the cowboy and cattle servers start up, they do a scan of all modules available in the global NPM directory and look for `cowboy.json` in the root. If an NPM module has a `cowboy.json` it is considered to be a plugin.

Currently the only plugin is a `ping` plugin which is contained in the cowboy module itself. The anatomy this most simply plugin is:

**/cowboy.json:** This simply tells cowboy where the plugins directory for this module is (relative to the root of the module).

```json
{"plugins": "plugins"}
```

**/plugins:** This directory contains all the plugin types as directories. The only type of plugin at the moment is a `lasso` plugin, which is a plugin that will receive a command from the cowboy on the cattle, and then format the response on the cowboy. More later.

**/plugins/lassos:** This directory contains all the lasso plugins as javascript files. Each file should be `<command name>.js`, where the command name is the first argument to `cowboy` (e.g., `cowboy ping` - ping is the command). Notice the file `lib/plugins/lassos/ping.js` which controls the ping command.

**/plugins/lassos/ping.js:** The file that implements the lasso command. It will contain 3 methods:

```javascript
/**
 * Handle a request from the cowboy. This will be invoked on the cattle node.
 *
 * @param  {String[]}   args        The arguments that the command was invoked with
 * @param  {Function}   done        Invoke this when you are finished handling the request
 * @param  {Number}     done.code   A numeric code indicating the exit status. 0 should indicate success, anything above 0 should indicate some plugin-specific error code.
 * @param  {Object}     done.reply  The reply that goes along with the code. Can be any arbitrary String or Object
 */
var handle = module.exports.handle = function(args, done) {
    return done(0, 'pong');
};

/**
 * Perform something after the reply has been sent back to the cowboy
 *
 * @param  {Object}     err     An error that occurred returning a response, if any
 * @param  {Number}     code    The numeric code indicating the exit status of the handler
 * @param  {Object}     reply   The reply object that was sent by the handler
 */
var afterResponse = module.exports.afterResponse = function(err, code, reply) { };

/**
 * Render a single response from a cattle node.
 *
 * @param  {String}     name    The name of the cattle node who gave this response
 * @param  {Number}     code    The numeric code with which the lasso plugin exitted
 * @param  {Object}     reply   The arbitrary reply object that was sent back with the exit code
 * @param  {String[]}   args    The arguments that the command was invoked with
 * @param  {Function}   done    Invoke this when you are done rendering
 */
var renderResponse = module.exports.renderResponse = function(name, code, reply, args, logger, done) {
    logger.info(reply);
    return done();
};

/**
 * Provides the ability to render something on the cowboy at the end of the command lifecycle with
 * all the replies that were received.
 *
 * @param  {Object[]}   responses           An array of responses that were received
 * @param  {String}     responses[i].name   The name of the cattle node who gave this response
 * @param  {Number}     responses[i].code   The numeric code with which the lasso plugin exitted
 * @param  {Object}     responses[i].reply  The arbitrary reply object that was sent back with the exit code
 * @param  {String[]}   args                The arguments that the command was invoked with
 * @param  {Function}   done                Invoke this when you are done rendering
 */
var renderComplete = module.exports.renderResponses = function(responses, args, logger, done) {
    return done();
};
```

* `handle` - This method is actually invoked on the cattle server. Every time `cowboy ping` is executed, each cattle server's handle command will be executed in `ping.js`, where it returns an exit status of `0` and a reply body of `'pong'`
* `renderResponse` - This method is invoked on the cowboy client. It will be invoked for each cattle reply with the name (host name) of the cattle server that made the reply, response information, and a logger to use to output the response.
* `renderComplete` - This is also invoked on the cowboy client. It will be invoked just once after the command is done listening for cattle replies. It provides an opportunity to summarize and information and render it accordingly.

## Where it stands

As you can see the current functionality is very basic. Also, there has been next to no testing aside from my local laptop. Next sets of features in scope (in order of priority) are:

* ~~In addition to `ping`, a core plugin that allows you to install new cowboy modules.~~ It is unlikely there will be *core* modules than these 2 as they should provide everything to get started installing new plugins
* Ability to filter which cattle servers should reply to a command
* Ability to configure / derive more information about your cattle server ("facts") other than host, and possible integration with tools like facter

## License

Copyright (c) 2013 Branden Visser

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
