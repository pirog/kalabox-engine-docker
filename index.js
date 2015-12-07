'use strict';

module.exports = function(kbox) {

  var VError = require('verror');
  var path = require('path');

  var load = function(s) {

    try {
      return require(s)(kbox);
    } catch (err) {
      throw new VError(err, 'Error loading module "%s".', s);
    }

  };

  // Load our tasks
  load('./lib/tasks.js');

  // Get the provider we need and then load its install routinezzz
  var provider = kbox.core.deps.get('globalConfig').provider;
  var providerInstallerPath = path.join('provider', provider, 'install.js');
  load('./' + providerInstallerPath);

};
