
var _ = require('underscore');

var ProcessingQueue = module.exports = function() {
    var self = this;

    this._processing = false;
    this._queue = [];
    this._whenDone = function() {};

    this._process = function() {
        self._processing = true;

        var op = self._queue.shift();
        if (!op) {
            self._processing = false;
            return self._whenDone();
        }

        return op.method.apply(op.self, _.union(op.args, self._process));
    };
};

ProcessingQueue.prototype.push = function(method, self, args) {
    this._queue.push({
        'method': method,
        'self': self,
        'args': args
    });

    if (!this._processing) {
        process.nextTick(this._process);
    }
};

ProcessingQueue.prototype.whenDone = function(whenDone) {
    this._whenDone = whenDone;
};
