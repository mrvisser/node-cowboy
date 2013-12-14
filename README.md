## Cowboy

**This is currently undergoing significant refactoring to facilitate a more advanced communications protocol and test harness**

[![Build Status](https://travis-ci.org/mrvisser/node-cowboy.png?branch=master)](https://travis-ci.org/mrvisser/node-cowboy)

**Cowboy** is a tool inspired by MCollective that fills essentially the same need, lassoing a large cluster of servers together in order to perform execution tasks in parallel. I got sad with how difficult MCollective was to set up (mostly to install and configure ActiveMQ, Ruby stomp gem, etc...) and decided something in nodejs would be much simpler.

## Simple Usage

First [download and install Redis](http://redis.io/download), make sure it's listening on port 6379. Then install and run cowboy:

```bash
~/Source/cowboy$ npm -g install forever

# It will be on NPM when it hits a functional milestone
~/Source/cowboy$ npm -g install cowboy

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
{
    "plugins": "plugins"
}
```

**/plugins:** This directory contains all the plugin types as directories. The only type of plugin at the moment is a `lasso` plugin, which is a plugin that will receive a command from the cowboy on the cattle, and then format the response on the cowboy. More later.

**/plugins/lassos:** This directory contains all the lasso plugins as javascript files. Each file should be `<command name>.js`, where the command name is the first argument to `cowboy` (e.g., `cowboy ping` - ping is the command). Notice the file `lib/plugins/lassos/ping.js` which controls the ping command.

**/plugins/lassos/ping.js:** The file that implements the lasso command. It will contain 2 methods:

```javascript
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
var help = module.exports.help = function() {
    return {'description': 'Send a simple ping to cattle nodes to determine if they are active and listening.'};
};

/**
 * Handle a request from the cowboy. This will be invoked on the cattle node.
 *
 * @param  {String[]}   args        The arguments that the command was invoked with
 * @param  {Function}   done        Invoke this when you are finished handling the request
 * @param  {Number}     done.code   A numeric code indicating the exit status. 0 should indicate success, anything above 0 should indicate some plugin-specific error code.
 * @param  {Object}     done.reply  The reply that goes along with the code. Can be any arbitrary String or Object
 */
var handle = module.exports.exec = function(args, done) {
    return done(0, 'pong');
};
```

For a more in-depth example, have a look at the [npm-install plugin](https://github.com/mrvisser/node-cowboy/blob/master/plugins/lassos/npm-install.js)

## License

Copyright (c) 2013 Branden Visser

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
