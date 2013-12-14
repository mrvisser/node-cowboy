
module.exports = function(grunt) {
    var mocha_grep = process.env['MOCHA_GREP'] || undefined;

    grunt.loadNpmTasks('grunt-mocha-test');

    grunt.initConfig({
        'mochaTest': {
            'test': {
                'src': ['tests/setup.js', 'tests/*/**/*.js'],
                'options': {
                    'reporter': 'spec',
                    'grep': mocha_grep,
                    'ignoreLeaks': true
                }
            }
        }
    });

    grunt.registerTask('default', 'mochaTest');

};
