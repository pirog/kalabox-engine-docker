'use strict';

/**
 * This contains all the core commands that kalabox can run on every machine
 */

var prompt = require('prompt');

var PROVIDER_ATTEMPTS = 3;

module.exports = function(kbox) {

  var helpers = kbox.util.helpers;

  // Make sure the engine is on before we prepare it.
  kbox.update.registerStep(function(step) {
    step.name = 'engine-up';
    step.deps = ['core-auth'];
    step.description = 'Ensuring engine is up.';
    step.all = function(state, done) {
      kbox.engine.up(PROVIDER_ATTEMPTS, function(err) {
        if (err) {
          done(err);
        }
        else {
          done();
        }
      });
    };
  });

    // Make sure the engine is on before we prepare it.
  kbox.update.registerStep(function(step) {
    step.name = 'engine-docker-prepared';
    step.deps = [
      'core-image-prepare'
    ];
    step.description = 'Restarting engine for updates.';
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

};
