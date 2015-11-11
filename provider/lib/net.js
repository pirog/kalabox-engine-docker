/**
 * Contains network handling suff
 * @module b2d.net
 */

'use strict';

module.exports = function(kbox) {

  // NPM modules
  var _ = require('lodash');

  // Define some ip constants
  var KALABOX_HOST_ONLY = '10.13.37.1';
  var KALABOX_DEFAULT_IP = '10.13.37.42';

  /*
   * Promisified shell
   */
  var shell = function(cmd) {
    // Kbox shell
    var _shell = kbox.core.deps.get('shell');

    // Execute promisified shell
    return Promise.fromNode(function(cb) {
      shell.exec(cmd, cb);
    });
  };

  /*
   * Get the correct windows network adapter
   */
  var getWindowsAdapter = function() {

    // Command to run
    var cmd = [
      '"C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe"',
      'showvminfo "Kalabox2" | findstr "Host-only"'
    ];

    // Get network information from virtual box.
    return shell(cmd.join(' '))

    // Parse the output
    .then(function(output) {

      // Debug log output
      kbox.core.log.debug('ADAPTER INFO => ' + JSON.stringify(output));

      // Parse output to get network adapter information.
      var start = output.indexOf('\'');
      var last = output.lastIndexOf('\'');

      // Get the adapter
      var adapter = [
        output.slice(start + 1, last).replace('Ethernet Adapter', 'Network')
      ];

      // debug
      kbox.core.log.debug('WINDOWS ADAPTER => ' + JSON.stringify(adapter));

      // Return
      return adapter;
    });

  };

  /*
   * Get the correct windows network adapter
   */
  var getWindowsAdapters = function() {

    // Command to run
    var cmd = [
      '"C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe"',
      'list hostonlyifs'
    ];

    // Get network information from virtual box.
    return shell(cmd.join(' '))

    // Parse the output
    .then(function(output) {

      // Debug log output
      kbox.core.log.debug('ADAPTER INFO => ' + JSON.stringify(output));

      // Parse output to get network adapter information.
      var start = output.indexOf('\'');
      var last = output.lastIndexOf('\'');

      // Get the adapter
      var adapter = [
        output.slice(start + 1, last).replace('Ethernet Adapter', 'Network')
      ];

      // debug
      kbox.core.log.debug('WINDOWS ADAPTER => ' + JSON.stringify(adapter));

      // Return
      return adapter;
    });

  };

  /*
   * Check the status of our host only adapter
   */
  var isHostOnlySet = function() {

    // Grab the default HOA
    var ip = KALABOX_HOST_ONLY;

    // Grab the host only adapter so we can be SUPER PRECISE!
    return getWindowsAdapter()

    // Get network information from virtual box.
    .then(function(adapter) {

      var adp = adapter;

      // Command to run
      var cmd = 'netsh interface ipv4 show addresses';

      // Execute promisified shell
      return shell(cmd.join(' '))

      // Need to catch findstr null reporting as error
      .catch(function(err) {
        // @todo: something more precise here
      })

      .then(function(output) {
        // Truncate the string for just data on what we need
        // This elminates the possibility that another adapter has our
        // setup. Although, to be fair, if another adapter does then
        // we are probably SOL anyway.

        // Trim the left
        var leftTrim = 'Configuration for interface "' + adp + '"';
        var truncLeft = output.indexOf(leftTrim);
        var left = output.slice(truncLeft);

        // Trim the right
        var rightTrim = 'Subnet Prefix';
        var truncRight = left.indexOf(rightTrim);

        // Return precise
        return left.slice(0, truncRight);
      });

    })

    // Parse the output
    .then(function(output) {

      // Parse output
      var isSet = _.includes(output, ip);

      // Debug log output
      kbox.core.log.debug('ADAPTER SET CORRECTLY => ' + JSON.stringify(isSet));

      // Return
      return isSet;
    });

  };

  /*
   * Force set the host only adapter if it is not set correctly
   */
  var setHostOnly = function() {

    // Get network information from virtual box.
    return getWindowsAdapter()

    // Parse the output
    .then(function(adapter) {

      // @todo: Dont hardcode this
      var ip = KALABOX_HOST_ONLY;
      // Command to run
      var cmd = 'netsh interface ipv4 set address name="' + adapter + '" ' +
        'static ' + ip + ' store=persistent';

      // Debug log output
      kbox.core.log.debug('SETTING ADAPTER => ' + JSON.stringify(cmd));

      // Run an elevated command for this
      return kbox.util.shell.execElevated(cmd);

    });

  };

  // Build module function.
  return {
    defaultIp: KALABOX_DEFAULT_IP,
    hostOnlyIp: KALABOX_HOST_ONLY,
    isHostOnlySet: isHostOnlySet,
    setHostOnly: setHostOnly
  };

};
