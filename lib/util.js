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
  var Promise = kbox.promise;

  /*
   * Return some info about the current state of the kalabox installation
   */
  var getCurrentInstall = function(installDetails) {

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
  var needsB2D = function() {
    return getProUp('PROVIDER_B2D_VERSION');
  };

  /*
   * Helper function to assess whether we need to grab a new profile
   */
  var needsProfile = function() {
    return getProUp('PROVIDER_PROFILE_VERSION');
  };

  /*
   * Helper function to assess whether we need to grab a new inf
   */
  var needsInf = function() {
    return getProUp('PROVIDER_INF_VERSION');
  };

  /*
   * Helper function to assess whether we need to grab a new vb
   */
  var needsVB = function() {
    return getProUp('PROVIDER_VB_VERSION');
  };

  /*
   * Helper function to assess whether we need to grab a new vb
   */
  var needsDownloads = function() {
    return needsVB() || needsInf() || needsProfile() || needsB2D();
  };

  /*
   * Helper function to assess whether we need to grab a new vb
   */
  var installProfile = function(state) {

    // Get profile location and make sure it exists
    fs.mkdirpSync(state.config.sysProviderRoot);

    // Get temp path
    var downloadDir = kbox.util.disk.getTempDir();

    // Get source and destination
    var src = path.join(downloadDir, path.basename(meta.PROVIDER_PROFILE_URL));
    var dest = path.join(state.config.sysProviderRoot, 'profile');

    // Copy the profile over to the right spot
    fs.renameSync(src, dest);

  };

  return {
    needsDownloads: needsDownloads,
    needsVB: needsVB,
    needsInf: needsInf,
    needsProfile: needsProfile,
    needsB2D: needsB2D,
    installProfile: installProfile
  };

};
