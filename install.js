'use strict';

module.exports = function(kbox) {

  kbox.install.registerStep(function(step) {
    step.name = 'docker';
    step.description = step.name;
    step.deps = [];
    step.all = function(state) {
      console.log(step.name);
    };
  });

};
