## Cowboy

[![Build Status](https://travis-ci.org/mrvisser/node-cowboy.png?branch=master)](https://travis-ci.org/mrvisser/node-cowboy) [![NPM version](https://badge.fury.io/js/cowboy.png)](http://badge.fury.io/js/cowboy)

**Cowboy** is a light-weight, easy-to-install tool that lassoes a large number of servers together in order to perform execution tasks or gather diagnostic information from nodes in parallel. At its core, Cowboy simply facilitates a framework and infrastructure that allows plugins to be implemented that do useful things. Out of the box, cowboy comes with a simple set of plugins:

* `describe` - Describes the modules and commands available to all listening cattle nodes
* `install` - Installs a new cowboy module on all listening cattle nodes
* `ping` - Interrogates the network for cattle nodes that are listening for commands
* `uninstall` - Uninstalls an installed cowboy module on all listening cattle nodes

## Simple Usage

First [download and install Redis](http://redis.io/download), make sure it's listening on port 6379. Then install and run cowboy:

```bash
~/Source/cowboy$ npm -g install cowboy

# Start the cattle server, which listens for commands from the cowboyt node
~/Source/cowboy$ cattle &

# Send a ping command to all the remote cattle servers
~/Source/cowboy$ cowboy ping
Host                      Latency
branden-macbook.local     13ms

Ping Statistics:
Avg: 13.00ms
Min: 13ms
Max: 13ms
Tmt: 0

~/Source/cowboy$ cowboy describe
 
  Host                      | Module                    | Commands                                           
----------------------------|---------------------------|----------------------------------------------------
  branden-macbook.local     | cowboy@0.0.2              | describe, install, ping, uninstall                 
----------------------------|---------------------------|----------------------------------------------------
```

## How it works

Cowboy uses a client module called, well, the "cowboy" and each server in your cluster should run a "cattle" server. The cowboy broadcasts messages to the cattle using Redis PubSub and the cattle responds with another PubSub message back to the cowboy.

### Walk-through

Take for instance the simple `cowboy ping` command:

```
~/Source/cowboy$ cowboy ping
Host                      Latency
branden-macbook.local     13ms

Ping Statistics:
Avg: 13.00ms
Min: 13ms
Max: 13ms
Tmt: 0
```

When you execute `cowboy ping` from the cowboy, the cowboy client will issue a pubsub message on a command channel. All cattle nodes listening on the pubsub channel will receive the message, execute the `ping` command's `exec` method, who replies with a "pong" string. The plugin is in charge of receiving the request and performing the operations on the remote server and sending a response to the cowboy. It is also responsible for formatting that response on the cowboy client.

## License

Copyright (c) 2013 Branden Visser

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
