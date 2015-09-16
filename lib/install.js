'use strict';

module.exports = function(kbox) {

  // Native modules
  var path = require('path');

  // NPM Modules
  var fs = require('fs-extra');

  // Kalabox modules
  var meta = require('./meta.js');
  var sysProfiler = kbox.install.sysProfiler;
  var provider = kbox.engine.provider;
  var shell = kbox.util.shell;
  var Promise = kbox.promise;
  var util = require('./util.js')(kbox);

  // "Constants"
  var PROVIDER_ATTEMPTS = meta.PROVIDER_UP_ATTEMPTS;

  /*
   * Adds the appropriate downloads to our list
   */
  if (util.needsDownloads()) {
    kbox.install.registerStep(function(step) {
      step.name = 'engine-docker-downloads';
      step.description = 'Queuing up provider downloads...';
      step.subscribes = ['core-downloads'];
      step.all = function(state) {

        // What platform are we on?
        var platform = process.platform;

        // Only grab profile if needed
        if (util.needsProfile()) {
          state.downloads.push(meta.PROVIDER_PROFILE_URL);
        }

        // Only grab B2D if needed
        if (util.needsB2D()) {
          state.downloads.push(meta.PROVIDER_DOWNLOAD_URL[platform].b2d);
        }

        // Add extra stuff for linux if appropriate
        if (platform === 'linux' && util.needsVB()) {
          var nix = kbox.install.linuxOsInfo.get();
          var vb = meta.PROVIDER_DOWNLOAD_URL.linux.vb;
          state.downloads.push(vb[nix.ID][nix.VERSION_ID]);
        }

        // Add extra stuff for Windosw if appropriate
        if (platform === 'win32' && util.needsInf()) {
          state.downloads.push(meta.PROVIDER_INF_URL);
        }

      };
    });
  }

  /*
   * Install the provider profile into the correct location
   */
  if (util.needsProfile()) {
    kbox.install.registerStep(function(step) {
      step.name = 'engine-docker-provider-profile';
      step.deps = ['core-downloads'];
      step.description = 'Setting up the provider profile...';
      step.all = function(state) {

        // Install the profile
        util.installProfile(state);

        // Update our current install
        state.updateCurrentInstall({PROVIDER_PROFILE_VERSION: '0.10.0'});

      };
    });
  }

  /*
   * Add in admin commands that are relevant to setting up the engine if
   * needed
   */
  if (util.needsAdminCommands()) {
    kbox.install.registerStep(function(step) {
      step.name = 'engine-docker-install-engine';
      step.description  = 'Queuing provider admin commands...';
      step.deps = ['core-auth'];
      step.subscribes = ['core-run-admin-commands'];
      step.all.darwin = function(state, done) {

        // Grab the target volume
        return kbox.util.disk.getMacVolume()

        // Extract the volume UUID and then add the command if
        // we need it
        .then(function(data) {

          // Analyze volume data
          var match = data.match(/Volume UUID:[ ]*(.*)\n/);

          // Fail if there is no match
          if (!match) {
            state.fail(state, 'Cannot get your Mac volume UUID!');
          }

          // Add the install B2D command if we need to
          if (util.needsB2D()) {

            // Get package location
            var pkgDir = kbox.util.disk.getTempDir();
            var pkgName = path.basename(meta.PROVIDER_DOWNLOAD_URL.darwin.b2d);
            var pkg = path.join(pkgDir, pkgName);

            // Generate and add the command
            var cmd = kbox.install.cmd.buildInstallCmd(pkg, match[1]);
            state.adminCommands.push(cmd);

          }
        })

        // Next step
        .nodeify(done);

      };
      step.all.linux = function(state, done) {
        var downloadDir = kbox.util.disk.getTempDir();
        var nix = kbox.install.linuxOsInfo.get();
        var vb = meta.PROVIDER_DOWNLOAD_URL.linux.vb[nix.ID][nix.VERSION_ID];
        var pkg = path.join(
          downloadDir,
          path.basename(vb)
        );
        var cmd = kbox.install.cmd.buildInstallCmd(pkg, nix);
        state.adminCommands.push(cmd);
        var b2dBin = path.join(
          downloadDir,
          path.basename(meta.PROVIDER_DOWNLOAD_URL.linux.b2d)
        );
        var b2dBinDest = path.join('/usr/local/bin', 'boot2docker');
        // Need to do this if the user is moving a file across partitions
        var is = fs.createReadStream(b2dBin);
        var os = fs.createWriteStream(b2dBinDest);
        is.pipe(os);
        is.on('end', function() {
          fs.unlinkSync(b2dBin);
          fs.chmodSync(b2dBinDest, '0755');
        });
        done();
      };
      step.all.win32 = function(state, done) {
        var downloadDir = kbox.util.disk.getTempDir();
        var pkg = path.join(
          downloadDir,
          path.basename(meta.PROVIDER_DOWNLOAD_URL.win32.b2d)
        );
        var cmd = kbox.install.cmd.buildInstallCmd(
          pkg,
          path.join(downloadDir, path.basename(meta.PROVIDER_INF_URL))
        );
        state.adminCommands.push(cmd);
        done();
      };
    });
  }

/*
  kbox.install.registerStep(function(step) {
    step.name = 'engine-up';
    step.deps = ['engine-docker-provider-profile'];
    step.description = 'Setting up and activating the engine...';
    step.all = function(state, done) {
      var iso = path.join(state.config.sysProviderRoot, 'boot2docker.iso');
      state.log.debug('iso -> ' + iso);
      var exists = fs.existsSync(iso);
      state.log.debug('exists -> ' + exists);
      if (exists) {
        //@todo: revisit why this is here?
        //fs.unlinkSync(iso);
      }
      var options = {};
      if (state.disksize) {
        options.disksize = state.disksize;
      }
      kbox.engine.provider().call('up', options)
      .catch(function(err) {
        state.status = false;
        throw err;
      })
      .then(function(data) {
        if (data) {
          state.log.debug(data);
        }
      })
      .nodeify(done);
    };
  });

*/

};
