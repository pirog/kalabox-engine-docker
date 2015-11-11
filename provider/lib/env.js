/**
 * Contains binary handling suff
 * @module b2d.bin
 */

'use strict';

module.exports = function(kbox) {

  // Node modules
  var format = require('util').format;
  var path = require('path');

  // NPM modules
  var VError = require('verror');

  // Kalabox modules
  var Promise = kbox.Promise;

  /*
   * Get directory for provider executable.
   */
  var getB2DBinPath = function() {

    // Get sysconf
    var sysConfRoot = kbox.core.deps.get('config').sysConfRoot;

    // Return path based on platform
    switch (process.platform) {
      case 'win32': return 'C:\\Program Files\\Boot2Docker for Windows';
      case 'darwin': return '/' + path.join('usr', 'local', 'bin');
      case 'linux': return path.join(sysConfRoot, 'bin');
    }

  };

  /*
   * Return the B2D executable location
   */
  var getB2DExecutable = function() {

    // Get b2d path
    var b2dPath = getB2DBinPath();

    // Return exec based on path
    switch (process.platform) {
      case 'win32': return '"' + path.join(b2dPath, 'boot2docker.exe') + '"';
      case 'darwin': return path.join(b2dPath, 'boot2docker');
      case 'linux': return path.join(b2dPath, 'boot2docker');
    }

  };

  /*
   * Return the SSH executable location
   */
  var getSSHExecutable = function() {

    // For cleanliness
    var wBin = '"C:\\Program Files (x86)\\Git\\bin\\ssh.exe"';

    return process.platform === 'win32' ? wBin : 'ssh';

  };

  // Set of logging functions.
  var log = kbox.core.log.make('BOOT2DOCKER');

  /*
   * Base shell command.
   */
  var _sh = kbox.core.deps.get('shell');

  /*
   * Run a shell command.
   */
  var sh = function(cmd) {

    // Log start.
    log.debug('Executing command.', cmd);

    // Run shell command.
    return Promise.fromNode(function(cb) {
      _sh.exec(cmd, cb);
    })
    // Log results.
    .tap(function(data) {
      log.debug('Command results.', data);
    })
    // Wrap errors.
    .catch(function(err) {
      log.debug(format('Error running command "%s".', cmd), err);
      throw new VError(err, 'Error running command "%s".', cmd);
    });

  };

  // Build module function.
  return {
    sh: sh,
    getB2DExecutable: getB2DExecutable,
    getSSHExecutable: getSSHExecutable
  };

};
