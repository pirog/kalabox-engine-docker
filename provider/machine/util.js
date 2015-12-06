'use strict';

/**
 * Some helpers for the engine installer
 */

module.exports = function(kbox) {

  // Native modules
  var path = require('path');

  // Npm modules
  var fs = require('fs-extra');
  var _ = require('lodash');

  // Kalabox modules
  var meta = require('./meta.js');
  var config = kbox.core.deps.get('globalConfig');

  /*
   * Return some info about the current state of the kalabox installation
   */
  var getCurrentInstall = function() {

    // This is where our current install file should live
    var cIF = path.join(config.sysConfRoot, 'installed.json');

    // If the file exists use that if not empty object
    var currentInstall = (fs.existsSync(cIF)) ? require(cIF) : {};

    return currentInstall;

  };

  /*
   * Helper function to grab and compare a meta prop
   */
  var getProUp = function(prop) {

    // Get details about the state of the current installation
    var currentInstall = getCurrentInstall();

    // This is the first time we've installed so we def need
    if (_.isEmpty(currentInstall) || !currentInstall[prop]) {
      return true;
    }

    // We have a syncversion to compare
    // @todo: is diffence a strong enough check?
    var nV = meta[prop];
    if (currentInstall[prop] && (currentInstall[prop] !== nV)) {
      return true;
    }

    // Hohum i guess we're ok
    return false;

  };

  /*
   * Helper function to assess whether we need a new B2D
   */
  var needsMachine = function() {
    return getProUp('PROVIDER_MACHINE_VERSION');
  };

  /*
   * Helper function to assess whether we need to grab a new vb
   */
  var needsVB = function() {
    return getProUp('PROVIDER_VB_VERSION');
  };

  /*
   * Helper function to assess whether we need to grab downloads
   */
  var needsDownloads = function() {
    return needsVB() || needsMachine();
  };

  /*
   * Helper function to assess whether we need to add in commands
   */
  var needsAdminCommands = function() {
    return needsVB();
  };

  /*
   * Helper function to determine whether we need to run linux DNS commands
   */
  var needsKalaboxIsoUpdate = function() {

    // Get some state info
    var neverUpdated = getCurrentInstall().PROVIDER_KALABOX_ISO === undefined;
    var hasMachine = getCurrentInstall().PROVIDER_MACHINE_VERSION !== undefined;

    if (!hasMachine) {
      // Return false if this is our first provision.
      return false;
    } else if (neverUpdated) {
      // Return true if we've never updated before
      return true;
    }

    // Otherwise return our normal compare
    return getProUp('PROVIDER_KALABOX_ISO') ;

  };

  /*
   * Helper function to assess whether we need to grab a new vb
   */
  var installMachine = function(state) {

    // Get temp path
    var downloadDir = kbox.util.disk.getTempDir();

    // Destination path
    var sysConfRoot = kbox.core.deps.get('config').sysConfRoot;
    var machineBinDest = path.join(sysConfRoot, 'bin');

    // Move all docker-machine* files over to the kbox bin location
    _.forEach(fs.readdirSync(downloadDir), function(file) {
      if (_.includes(file, 'docker-machine')) {
        var source = path.join(downloadDir, file);
        var dest = path.join(machineBinDest, file);
        state.log.debug('INSTALLING ' + file + ' FROM => ' + downloadDir);
        fs.copySync(source, dest);
        state.log.debug('INSTALLED ' + file + ' TO => ' + machineBinDest);
      }
    });

  };

  return {
    needsDownloads: needsDownloads,
    needsKalaboxIsoUpdate: needsKalaboxIsoUpdate,
    needsAdminCommands: needsAdminCommands,
    needsVB: needsVB,
    needsMachine: needsMachine,
    installMachine: installMachine
  };

};
