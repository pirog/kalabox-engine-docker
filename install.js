'use strict';

var fs = require('fs');

var BOOT2DOCKER = 'Boot2Docker';

module.exports = function(kbox) {

  var sysProfiler = kbox.install.sysProfiler;

  // Boot2docker installed?
  kbox.install.registerStep(function(step) {
    step.name = 'boot2docker-installed';
    step.description = 'Check if boot2docker is installed.';
    step.deps = [];
    step.all = function(state, done) {
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

  // Boot2docker profile exists?
  kbox.install.registerStep(function(step) {
    step.name = 'boot2docker-profile-exists';
    step.description = 'Check if boot2docker profile exists.';
    step.deps = [];
    step.all.darwin = function(state, done) {
      var filepath = path.join(config.sysProviderRoot, 'profile');
      fs.exists(filepath, function(exists) {
        state.boot2dockerProfileExists = exists;
        done();
      });
    };
  });

};
