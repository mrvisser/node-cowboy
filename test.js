var events = require('events');
var redis = require('redis');
var client = redis.createClient();

client.publish('blah', 'blah!', function(err) {
    console.log('i am hopefully second');

    client.quit(function(err) {
        console.log('i will hopefully be fourth!');
    });

    console.log('i am hopefully third');
});

console.log('i am hopefully first');
