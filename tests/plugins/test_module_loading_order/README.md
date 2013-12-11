This test module directory is set up so that there are 2 modules who are different in alphabetical ordering and who have different implementations of the same command `my-command.js`.

The test will ensure that:

1. `module_b` is installed
  * Ensure my-command returns `b` functionality
2. `module_a` is installed
  * Ensure my-command still returns `b` functionality
3. The context is reloaded in the installation directory
  * Ensure my-command still returns `b` functionality

This effectively ensures that module loading order is consistent with how plugins are rejected at install time so that you don't restart your cattle process and now run a different command implementation on start up than you did before.