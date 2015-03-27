'use strict';

var chalk = require('chalk');

var PROVIDER_UP_ATTEMPTS = 3;
var PROVIDER_DOWN_ATTEMPTS = 3;

module.exports = function(kbox) {

  var engine = kbox.engine;
  var events = kbox.core.events;
  var tasks = kbox.core.tasks;
  var services = kbox.services;

  if (engine.provider.hasTasks) {
    // Tasks
    // Start the kalabox engine
    tasks.registerTask('up', function(done) {
      engine.up(PROVIDER_UP_ATTEMPTS, done);
    });

    // Stop the kalabox engine
    tasks.registerTask('down', function(done) {
      engine.down(PROVIDER_DOWN_ATTEMPTS, done);
    });

    // Display status of provider.
    tasks.registerTask('status', function(done) {
      engine.provider.isUp(function(err, isUp) {
        if (err) {
          done(err);
        } else if (isUp) {
          console.log('up');
        } else {
          console.log('down');
        }
        done();
      });
    });

    tasks.registerTask('ip', function(done) {
      engine.provider.getIp(function(err, ip) {
        if (err) {
          done(err);
        } else {
          console.log(ip);
          done();
        }
      });
    });

    // Events
    events.on('post-up', function(done) {
      console.log(chalk.green('Kalabox engine has been activated.'));
      done();
    });

    events.on('post-down', function(done) {
      console.log(chalk.red('Kalabox engine has been deactivated.'));
      done();
    });
  }

};
