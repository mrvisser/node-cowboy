## Cowboy

[![Build Status](https://travis-ci.org/mrvisser/node-cowboy.png?branch=master)](https://travis-ci.org/mrvisser/node-cowboy) [![NPM version](https://badge.fury.io/js/cowboy.png)](http://badge.fury.io/js/cowboy)

**Cowboy** is a light-weight, easy-to-install tool that lassoes a large number of servers together in order to perform execution tasks or gather diagnostic information from nodes in parallel. At its core, Cowboy simply facilitates a framework and infrastructure that allows plugins to be implemented that do useful things. We give you these commands to get you started:

* `describe` - Describes the modules and commands available to all listening cattle nodes
* `install` - Installs a new cowboy module on all listening cattle nodes
* `ping` - Interrogates the network for cattle nodes that are listening for commands
* `uninstall` - Uninstalls an installed cowboy module on all listening cattle nodes

## Installation

First [download and install Redis](http://redis.io/download), make sure it's listening on port 6379.

Install [Bunyan](https://github.com/trentm/bunyan) and Cowboy:

`npm install -g bunyan cowboy`

## Simple Usage

Cowboy is made up of 2 components, the cattle server and the cowboy client. The Cattle server listens and executes commands when run from the cowboy client.

First start up the Cattle server:

`cattle | bunyan`

In a new terminal, run a command:

`cowboy ping`

Result:

```
Host                      Latency
branden-macbook.local     13ms

Ping Statistics:
Avg: 13.00ms
Min: 13ms
Max: 13ms
Tmt: 0
```

It's just that easy.

## License

Copyright (c) 2013 Branden Visser

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
