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
    return needsVB() || needsMachine();
  };

  /*
   * Helper function to determine whether we need to run linux DNS commands
   */
  var needsB2DIsoUpdate = function() {

    // Get some state info
    var neverUpdated = getCurrentInstall().PROVIDER_B2D_ISO === undefined;
    var hasMachine = getCurrentInstall().PROVIDER_MACHINE_VERSION !== undefined;

    if (!hasMachine) {
      // Return false if this is our first provision.
      return false;
    } else if (neverUpdated) {
      // Return true if we've never updated before
      return true;
    }

    // Otherwise return our normal compare
    return getProUp('PROVIDER_B2D_ISO') ;

  };

  /*
   * Helper function to assess whether we need to grab a new vb
   */
  var installB2DLinux = function(state) {

    // Get temp path
    var downloadDir = kbox.util.disk.getTempDir();

    // Get the b2d bin location
    var b2d = meta.PROVIDER_DOWNLOAD_URL.linux.b2d;
    var b2dBin = path.join(downloadDir, path.basename(b2d));

    // Destination path
    var sysConfRoot = kbox.core.deps.get('config').sysConfRoot;
    var b2dBinDest = path.join(sysConfRoot, 'bin', 'boot2docker');

    // Need to do it this way if the user is moving a file across
    // partitions
    var is = fs.createReadStream(b2dBin);
    var os = fs.createWriteStream(b2dBinDest);
    is.pipe(os);

    // debug
    state.log.debug('INSTALLING B2DBIN FROM => ' + b2dBin);
    state.log.debug('INSTALLING B2DBIN TO => ' + b2dBinDest);

    // Execute perm on complete
    is.on('end', function() {
      fs.chmodSync(b2dBinDest, '0755');
    });

  };

  return {
    needsDownloads: needsDownloads,
    needsB2DIsoUpdate: needsB2DIsoUpdate,
    needsAdminCommands: needsAdminCommands,
    needsVB: needsVB,
    needsMachine: needsMachine,
    installB2DLinux: installB2DLinux
  };

};
