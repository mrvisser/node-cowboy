
var assert = require('assert');
var cowboy = require('../../index');
var cowboyCli = require('cowboy-cli-api');
var util = require('util');

describe('CLI', function() {

    var _kill = null;
    var _testModulesDir = util.format('%s/test_modules', __dirname);
    var _defaultCowboyConfig = {
        'log': {
            'path': util.format('%s/cowboy.log', __dirname)
        },
        'modules': {
            'dir': _testModulesDir
        }
    };

    beforeEach(function(callback) {
        // Prepare the cattle process
        cowboyCli.cattle({
            'log': {
                'level': 'trace',
                'path': util.format('%s/cattle.log', __dirname)
            },
            'modules': {
                'dir': _testModulesDir
            }
        }, function(err, kill) {
            assert.ok(!err);
            _kill = kill;
            return callback();
        });
    });

    afterEach(function(callback) {
        _kill(false, function(code, signal) {
            return callback();
        });
    });

    it('returns error code 1 with invalid arguments', function(callback) {
        cowboyCli.cowboy(_defaultCowboyConfig, function(code, output) {
            assert.strictEqual(code, 1);
            return callback();
        });
    });

    describe('Help', function() {
        it('returns help info when run with --help', function(callback) {
            cowboyCli.cowboy(_defaultCowboyConfig, ['--help'], function(code, output) {
                assert.strictEqual(code, 0);
                assert.strictEqual(output.indexOf('Usage: cowboy --help | --list | <command> [--help] | <command> [-c <config file>] [--log-level <level>] [--log-path <path>] [-- <command specific args>]'), 0);
                return callback();
            });
        });

        it('returns command help info when a command is run with --help', function(callback) {
            cowboyCli.cowboy(_defaultCowboyConfig, ['--help'], 'ping', function(code, output) {
                assert.strictEqual(code, 0);
                assert.strictEqual(output.indexOf('\nSend a simple ping to cattle nodes to determine if they are active and listening.'), 0);
                return callback();
            });
        });
    });
});