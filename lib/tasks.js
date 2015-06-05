'use strict';

var chalk = require('chalk');

var PROVIDER_UP_ATTEMPTS = 3;
var PROVIDER_DOWN_ATTEMPTS = 3;

module.exports = function(kbox) {

  var engine = kbox.engine;
  var events = kbox.core.events;
  var services = kbox.services;

  var Promise = require('bluebird');

  // Tasks
  // Start the kalabox engine
  kbox.tasks.add(function(task) {
    task.path = ['up'];
    task.description = 'Bring kbox container engine up.';
    task.func = function(done) {
      engine.up()
      .nodeify(done);
    };
  });

  // Stop the kalabox engine
  kbox.tasks.add(function(task) {
    task.path = ['down'];
    task.description = 'Bring kbox container engine down.';
    task.func = function(done) {
      engine.down()
      .nodeify(done);
    };
  });

  // Display status of provider.
  kbox.tasks.add(function(task) {
    task.path = ['status'];
    task.description = 'Display status of kbox container engine.';
    task.func = function(done) {
      engine.provider().call('isUp')
      .then(function(isUp) {
        return isUp ? 'up' : 'down';
      })
      .then(console.log)
      .nodeify(done);
    };
  });

  // Display ip.
  kbox.tasks.add(function(task) {
    task.path = ['ip'];
    task.description = 'Display kbox container engine\'s ip address.';
    task.func = function(done) {
      engine.provider().call('getIp')
      .then(console.log)
      .nodeify(done);
    };
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

};
