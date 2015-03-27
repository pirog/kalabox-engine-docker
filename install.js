'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var meta = require('./meta.js');

var BOOT2DOCKER = 'Boot2Docker';

module.exports = function(kbox) {

  var sysProfiler = kbox.install.sysProfiler;

  // Boot2docker installed?
  kbox.install.registerStep(function(step) {
    step.name = 'is-boot2docker-installed';
    step.description = 'Check if boot2docker is installed.';
    step.deps = [];
    // @todo: switch this to provider.isInstalled and remove
    // sysprofile stuff
    step.all.darwin = function(state, done) {
      sysProfiler.isAppInstalled(BOOT2DOCKER, function(err, isInstalled) {
        if (err) {
          done(err);
        } else {
          state.isBoot2DockerInstalled = isInstalled;
          state.log(BOOT2DOCKER + ' is installed?: ' + isInstalled);
          done();
        }
      });
    };
    step.all.linux = function(state, done) {
      console.log("b2d installed init");
      done();
    };
  });

  // Boot2docker profile set?
  kbox.install.registerStep(function(step) {
    step.name = 'is-boot2docker-profile-set';
    step.description = 'Check if boot2docker profile is set.';
    step.deps = [];
    step.all.darwin = function(state, done) {
      state.boot2dockerProfileFilepath = path.join(
        state.config.sysProviderRoot,
        'profile'
      );
      fs.exists(state.boot2dockerProfileFilepath, function(exists) {
        state.isBoot2dockerProfileSet = exists;
        state.log('Boot2docker profile set?: ' + exists);
        done();
      });
    };
    step.all.linux = function(state, done) {
      console.log("b2d check init");
      done();
    };
  });

  // Download docker dependencies
  kbox.install.registerStep(function(step) {
    step.name = 'download-boot2docker-dependencies';
    step.description = 'Download docker dependencies';
    step.deps = [
      'is-boot2docker-installed',
      'is-boot2docker-profile-set',
      'internet'
    ];
    step.all.darwin = function(state, done) {

      // Init.
      if (!state.downloadDir) {
        state.downloadDir = kbox.util.disk.getTempDir();
      }
      state.dockerDependencyDownloads = [];

      // Boot2docker profile.
      if (!state.isBoot2dockerProfileSet) {
        state.dockerDependencyDownloads.push(meta.PROVIDER_URL_PROFILE);
        state.boot2dockerProfileDownloadFilepath = path.join(
          state.downloadDir,
          path.basename(meta.PROVIDER_URL_PROFILE)
        );
      }

      // Boot2docker package.
      if (!state.isBoot2DockerInstalled) {
        state.dockerDependencyDownloads.push(meta.PROVIDER_DOWNLOAD_URL.darwin);
        state.boot2dockerPackageDownloadFilepath = path.join(
          state.downloadDir,
          path.basename(meta.PROVIDER_DOWNLOAD_URL.darwin)
        );
      }

      // Download dependencies/
      var urls = state.dockerDependencyDownloads;
      urls.forEach(function(url) {
        state.log(url);
      });
      if (urls.length > 0) {
        var dir = state.downloadDir;
        kbox.util.download.downloadFiles(urls, dir, function(err) {
          if (err) {
            state.log(state.status.notOk);
            done(err);
          } else {
            state.log(state.status.ok);
            done();
          }
        });
      } else {
        done();
      }

    };
    step.all.linux = function(state, done) {
      console.log("donwload init");
      done();
    };
  });

  // Setup Boot2docker profile.
  kbox.install.registerStep(function(step) {
    step.name = 'boot2docker-profile';
    step.description = 'Setup the boot2docker profile.';
    step.deps = ['download-boot2docker-dependencies'];
    step.all.darwin = function(state, done) {
      if (!state.isBoot2dockerProfileSet) {
        mkdirp.sync(state.config.sysProviderRoot);
        var src = state.boot2dockerProfileDownloadFilepath;
        var dst = state.boot2dockerProfileFilepath;
        fs.rename(src, dst, function(err) {
          if (err) {
            state.log(state.status.notOk);
            done(err);
          } else {
            state.log(state.status.ok);
            done();
          }
        });
      } else {
        state.log(state.status.ok);
        done();
      }
    };
    step.all.linux = function(state, done) {
      console.log("b2d profile");
      done();
    };
  });

  // Install Boot2docker.
  kbox.install.registerStep(function(step) {
    step.name = 'install-engine';
    step.description  = 'Install boot2docker package.';
    step.deps = [
      'boot2docker-profile',
      'download-boot2docker-dependencies'
    ];
    step.all.darwin = function(state, done) {
      if (!state.isBoot2DockerInstalled) {
        kbox.util.disk.getMacVolume(function(err, volume) {
          if (err) {
            state.log(state.status.notOk);
            done(err);
          } else {
            var pkg = state.boot2dockerPackageDownloadFilepath;
            var cmd = kbox.install.cmd.buildInstallCmd(pkg, volume);
            var cmds = [cmd];
            var child = kbox.install.cmd.runCmdsAsync(cmds);
            child.stdout.on('data', function(data) {
              state.log(data);
            });
            child.stdout.on('end', function() {
              state.log(state.status.ok);
              done();
            });
            child.stderr.on('data', function(data) {
              state.log(state.status.notOk);
              done(new Error(data));
            });
          }
        });
      } else {
        state.log(state.status.ok);
        done();
      }
    };
    step.all.linux = function(state, done) {
      console.log("engine install");
      done();
    };
  });

  // Init and start Boot2docker.
  kbox.install.registerStep(function(step) {
    step.name = 'init-engine';
    step.description = 'Init and start boot2docker';
    step.deps = ['install-engine'];
    step.all.darwin = function(state, done) {
      var iso = path.join(state.config.sysProviderRoot, 'boot2docker.iso');
      console.log('iso -> ' + iso);
      var exists = fs.existsSync(iso);
      console.log('exists -> ' + exists);
      if (exists) {
        fs.unlinkSync(iso);
      }
      kbox.engine.provider.up(function(err, data) {
        if (data) {
          state.log(data);
        }

        if (err) {
          state.log(state.status.notOk);
          done(err);
        } else {
          state.log(state.status.ok);
          done();
        }
      });
    };
    step.all.linux = function(state, done) {
      console.log("engine init");
      done();
    };
  });

};
