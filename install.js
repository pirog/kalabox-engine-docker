'use strict';

var fs = require('fs');
var path = require('path');

var BOOT2DOCKER = 'Boot2Docker';

var PROVIDER_URL_V1_4_1 =
  'https://github.com/boot2docker/osx-installer/releases/download/v1.4.1/' +
  'Boot2Docker-1.4.1.pkg';

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
      var filepath = path.join(state.config.sysProviderRoot, 'profile');
      fs.exists(filepath, function(exists) {
        state.isBoot2dockerProfileSet = exists;
        done();
      });
    };
  });

  // Download docker dependencies
  kbox.install.registerStep(function(step) {
    step.name = 'download-docker-dependencies';
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
      }

      // Boot2docker package.
      if (!state.isBoot2DockerInstalled) {
        state.dockerDependencyDownloads.push(PROVIDER_URL_V1_4_1);
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

};
