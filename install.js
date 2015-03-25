'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

var BOOT2DOCKER = 'Boot2Docker';

var PROVIDER_URL_V1_4_1 =
  'https://github.com/boot2docker/osx-installer/releases/download/v1.4.1/' +
  'Boot2Docker-1.4.1.pkg';
var PROVIDER_URL_PACKAGE = PROVIDER_URL_V1_4_1;

var PROVIDER_URL_PROFILE =
  'https://raw.githubusercontent.com/' +
  'kalabox/kalabox-boot2docker/master/profile';

module.exports = function(kbox) {

  var sysProfiler = kbox.install.sysProfiler;

  // Boot2docker installed?
  kbox.install.registerStep(function(step) {
    step.name = 'is-boot2docker-installed';
    step.description = 'Check if boot2docker is installed.';
    step.deps = [];
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
        done();
      });
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
        state.downloaDir = kbox.util.disk.getTempDir();
      }
      state.dockerDependencyDownloads = [];

      // Boot2docker profile.
      if (!state.isBoot2dockerProfileSet) {
        state.dockerDependencyDownloads.push(PROVIDER_URL_PROFILE);
        state.boot2dockerProfileDownloadFilepath = path.join(
          state.downloadDir,
          path.basename(PROVIDER_URL_PROFILE)
        );
      }

      // Boot2docker package.
      if (!state.isBoot2DockerInstalled) {
        state.dockerDependencyDownloads.push(PROVIDER_URL_PACKAGE);
        state.boot2dockerPackageDownloadFilepath = path.join(
          state.downloadDir,
          path.basename(PROVIDER_URL_PACKAGE)
        );
      }

      // Download dependencies/
      var urls = state.dockerDependencyDownloads;
      urls.forEach(function(url) {
        state.log(url);
      });
      if (urls.length > 0) {
        kbox.util.download.downloadFiles(urls, state.downloadDir, function() {
          done();
        });
      } else {
        done();
      }

    };
  });

  // Setup Boot2docker profile.
  kbox.install.registerStep(function(step, done) {
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
  });

};
