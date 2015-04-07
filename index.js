'use strict';

module.exports = function(kbox) {

  require('./lib/tasks.js')(kbox);
  require('./lib/install.js')(kbox);
  require('./lib/updates.js')(kbox);

};
