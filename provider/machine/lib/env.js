/**
 * Contains environment handling suff
 * @module machine.env
 */

'use strict';

module.exports = function(kbox) {

  // NPM modules
  var _ = require('lodash');

  // Kalabox modules
  var bin = require('./bin.js')(kbox);

  /*
   * Set Machine Env
   */
  var setMachineEnv = function() {

    // Set Path environmental variable if we are on windows so we get access
    // to things like ssh.exe
    if (process.platform === 'win32') {

      // Get Path
      var gitBin = 'C:\\Program Files (x86)\\Git\\bin';

      // Only add the gitbin to the path if the path doesn't start with
      // it. We want to make sure gitBin is first so other things like
      // putty don't F with it.
      // See https://github.com/kalabox/kalabox/issues/342
      if (!_.startsWith(process.env.path, gitBin)) {
        kbox.core.env.setEnv('Path', [gitBin, process.env.Path].join(';'));
      }
    }

    // Add machine executable path to path to handle weird situations where
    // the user may not have machine in their path
    var pathString = (process.platform === 'win32') ? 'Path' : 'PATH';
    var pathSep = (process.platform === 'win32') ? ';' : ':';
    var machinePath = bin.getMachineBinPath();
    if (!_.startsWith(process.env.path, machinePath)) {
      var newPath = [machinePath, process.env[pathString]].join(pathSep);
      kbox.core.env.setEnv(pathString, newPath);
    }

  };

  // Build module function.
  return {
    setMachineEnv: setMachineEnv
  };

};
