'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var meta = require('./meta.js');
var PROVIDER_ATTEMPTS = 3;

module.exports = function(kbox) {

  var sysProfiler = kbox.install.sysProfiler;
  var provider = kbox.engine.provider;
  var shell = kbox.util.shell;
  var provisioned = kbox.core.deps.lookup('globalConfig').provisioned;

  kbox.install.registerStep(function(step) {
    step.name = 'engine-docker-provider-profile';
    step.deps = ['core-downloads'];
    step.description = 'Setting up the provider profile...';
    step.all = function(state, done) {
      state.status = true;
      if (!fs.existsSync(path.join(state.config.sysProviderRoot, 'profile'))) {
        mkdirp.sync(state.config.sysProviderRoot);
        var downloadDir = kbox.util.disk.getTempDir();
        var src = path.join(
          downloadDir,
          path.basename(meta.PROVIDER_PROFILE_URL)
        );
        var dst = path.join(
          state.config.sysProviderRoot,
          'profile'
        );
        fs.rename(src, dst, function(err) {
          if (err) {
            state.status = false;
            done(err);
          } else {
            done();
          }
        });
      }
      else {
        done();
      }
    };
  });

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
      kbox.engine.provider.up(function(err, data) {
        if (data) {
          state.log.debug(data);
        }
        if (err) {
          state.status = false;
          done(err);
        } else {
          done();
        }
      });
    };
  });

  if (!provisioned) {

    // @todo: add this step into the install docs
    /*
    kbox.install.registerStep(function(step) {
      step.name = 'engine-docker-finalize-engine';
      step.description = 'Halting engine on Windows...';
      step.subscribes = ['core-finish'];
      step.deps = ['services-kalabox-finalize'];
      step.all.win32 = function(state, done) {
        var winB2d =
          '"C:\\Program Files\\Boot2Docker for Windows\\boot2docker.exe"';
        var turnUpForWhat = [winB2d + ' --vm="Kalabox2" down'];
        var child = kbox.install.cmd.runCmdsAsync(turnUpForWhat);
        child.stdout.on('data', function(data) {
          state.log.debug(data);
        });
        child.on('exit', function(code) {
          state.log.debug('Install completed with code ' + code);
          done();
        });
      };
      step.all.darwin = function(state, done) { done(); };
      step.all.linux = step.all.darwin;
    });
    */

    kbox.install.registerStep(function(step) {
      step.name = 'engine-docker-downloads';
      step.description = 'Queuing up provider downloads...';
      step.subscribes = ['core-downloads'];
      step.all = function(state) {
        state.downloads.push(meta.PROVIDER_PROFILE_URL);
        state.downloads.push(meta.PROVIDER_DOWNLOAD_URL[process.platform].b2d);
        if (process.platform === 'linux' && !state.vbIsInstalled) {
          var nix = kbox.install.linuxOsInfo.get();
          state.downloads.push(
            meta.PROVIDER_DOWNLOAD_URL.linux.vb[nix.ID][nix.VERSION_ID]
          );
        }
        if (process.platform === 'win32' && !state.vbIsInstalled) {
          state.downloads.push(meta.PROVIDER_INF_URL);
        }
      };
    });

    kbox.install.registerStep(function(step) {
      step.name = 'engine-docker-install-engine';
      step.description  = 'Queuing provider admin commands...';
      step.deps = ['core-auth'];
      step.subscribes = ['core-run-admin-commands'];
      step.all.darwin = function(state, done) {
        kbox.util.disk.getMacVolume(function(err, volume) {
          if (err) {
            state.status = false;
            done(err);
          } else {
            var downloadDir = kbox.util.disk.getTempDir();
            var pkg = path.join(
              downloadDir,
              path.basename(meta.PROVIDER_DOWNLOAD_URL.darwin.b2d)
            );
            var cmd = kbox.install.cmd.buildInstallCmd(pkg, volume);
            state.adminCommands.push(cmd);
          }
          done(err);
        });
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

  // Make sure the engine is on before we prepare it.
  if (provisioned) {
    kbox.install.registerStep(function(step) {
      step.name = 'engine-docker-prepared';
      step.deps = [
        'core-apps-prepare',
        'core-image-prepare'
      ];
      step.description = 'Restarting engine for updates...';
      step.all = function(state, done) {
        kbox.engine.down(PROVIDER_ATTEMPTS, function(err) {
          if (err) {
            done(err);
          }
          else {
            kbox.engine.up(PROVIDER_ATTEMPTS, function(err) {
              if (err) {
                done(err);
              }
              else {
                done();
              }
            });
          }
        });
      };
    });
  }

};
