/**
 * Module to wrap and abstract access to boot2docker.
 * @module b2d
 */

'use strict';

module.exports = function(kbox) {

  /*
   * Node modules.
   */
  var _exec = require('child_process').exec;
  var assert = require('assert');
  var format = require('util').format;
  var fs = require('fs');
  var path = require('path');
  var pp = require('util').inspect;
  var windosu = require('windosu');

  /*
   * NPM modules.
   */
  var Promise = require('bluebird');
  var VError = require('verror');
  var _ = require('lodash');
  var retry = require('retry-bluebird');

  /*
   * Get root directory for provider.
   */
  var getLinuxBinPath = function() {
    var sysConfRoot = kbox.core.deps.get('config').sysConfRoot;
    return path.join(sysConfRoot, 'bin');
  };

  /*
   * Return the B2D executable location
   */
  var getB2DExecutable = function() {

    // For cleanliness
    var wBin = '"C:\\Program Files\\Boot2Docker for Windows\\boot2docker.exe"';

    switch (process.platform) {
      case 'win32': return [wBin, '--hostip="10.13.37.1"'].join(' ');
      case 'darwin': return 'boot2docker';
      case 'linux': return path.join(getLinuxBinPath(), 'boot2docker');
    }

  };

  // Get boot2docker executable path.
  var B2D_EXECUTABLE = getB2DExecutable();

  // Set of logging functions.
  var log = kbox.core.log.make('BOOT2DOCKER');

  /*
   * Base shell command.
   */
  var _sh = kbox.core.deps.get('shell');

  /*
   * Get the correct windows network adapter
   */
  var getWindowsAdapter = function() {

    // Get shell library.
    var shell = kbox.core.deps.get('shell');

    // Command to run
    var cmd = [
      '"C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe"',
      'showvminfo "Kalabox2" | findstr "Host-only"'
    ];

    // Get network information from virtual box.
    return Promise.fromNode(function(cb) {
      shell.exec(cmd.join(' '), cb);
    })

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

    // Get shell library.
    var shell = kbox.core.deps.get('shell');

    // @todo: Need a stronger check than this eventually
    var ip = '10.13.37.1';
    // Command to run
    var cmd = 'netsh interface ipv4 show addresses | findstr ' + ip;

    // Get network information from virtual box.
    return Promise.fromNode(function(cb) {
      shell.exec(cmd, cb);
    })

    // Parse the output
    .then(function(output) {

      // Parse output
      var isSet = _.contains(output, ip);

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
      var ip = '10.13.37.1';
      // Command to run
      var cmd = 'netsh interface ipv4 set address name="' + adapter + '" ' +
        'static ' + ip + ' store=persistent';

      // Debug log output
      kbox.core.log.debug('SETTING ADAPTER => ' + JSON.stringify(cmd));

      // @todo: need to figure out how to get this to be blocking
      windosu.exec(cmd);

    });

  };

  /*
   * Run a shell command.
   */
  var sh = function(cmd) {

    // Log start.
    log.debug('Executing command.', cmd);

    // Run shell command.
    return Promise.fromNode(function(cb) {
      _sh.exec(cmd, cb);
    })
    // Log results.
    .tap(function(data) {
      log.debug('Command results.', data);
    })
    // Wrap errors.
    .catch(function(err) {
      log.debug(format('Error running command "%s".', cmd), err);
      throw new VError(err, 'Error running command "%s".', cmd);
    });

  };

  /*
   * Get root directory for provider.
   */
  var getRootDir = function() {
    return kbox.core.deps.get('config').sysProviderRoot;
  };

  /*
   * Get path to provider profile.
   */
  var getProfilePath = function() {
    return path.join(getRootDir(), 'profile');
  };

  /*
   * Set provider profile as environmental variable.
   */
  var setRootDirEnv = function() {
    kbox.core.env.setEnv('BOOT2DOCKER_DIR', getRootDir());
  };

  /*
   * Returns a cached instance of the provider profile.
   */
  var profileInstance = _.once(function() {

    // Read contents of profile file.
    return Promise.fromNode(function(cb) {
      fs.readFile(getProfilePath(), {encoding: 'utf8'}, cb);
    })
    // Build profile object using contents of profile file.
    .then(function(data) {

      // Get list of lines.
      var lines = data.split('\n');

      // Build profile object.
      var profile =
        // Start chain with lines from profile file.
        _.chain(lines)
        // Filter out any uninteresting lines.
        .filter(function(line) {
          var isComment = _.startsWith(line, '#');
          var isEmpty = _.isEmpty(line);
          var isKeyValue = _.contains(line, '=');
          return !isComment && !isEmpty && isKeyValue;
        })
        // Reduce list of interesting lines to an object.
        .reduce(function(profile, line) {
          // Split on equals sign, and trim the parts.
          var parts = _.map(line.split('='), _.trim);
          if (parts.length === 2) {
            // Use parts as key value to add property to object.
            profile[parts[0]] = parts[1];
          }
          return profile;
        }, {})
        // End chain.
        .value();

      return profile;

    });

  });

  /*
   * Run a provider command in a shell.
   */
  var shProvider = function(cmd) {

    // Set the provider root directory as a environmental variable.
    setRootDirEnv();

    // Set Path environmental variable if we are on windows.
    if (process.platform === 'win32') {

      // Get Path
      var gitBin = 'C:\\Program Files (x86)\\Git\\bin;';

      // Only add the gitbin to the path if the path doesn't start with
      // it. We want to make sure gitBin is first so other things like
      // putty don't F with it.
      // See https://github.com/kalabox/kalabox/issues/342
      if (!_.startsWith(process.env.path, gitBin)) {
        kbox.core.env.setEnv('Path', gitBin + process.env.path);
      }
    }

    // Run a provider command in a shell.
    return sh([B2D_EXECUTABLE].concat(cmd));

  };

  /*
   * Bring boot2docker up.
   */
  var up = function(opts) {

    // @todo: @bcauldwell - Maybe split each task out into it's own function
    // to make this a little cleaner.

    // Default settings for max retries.
    opts.max = opts.max || opts.maxRetries || 3;

    // Log start.
    log.info('Starting up.', opts);

    // Emit pre-up event.
    return Promise.try(kbox.core.events.emit, 'pre-up')
    // Init boot2docker.
    .then(function() {
      return retry(opts, function(counter) {
        // Log start.
        log.info(kbox.util.format('Initializing boot2docker [%s].', counter));
        // Build command.
        var initCmd = ['init'];
        if (opts.disksize) {
          // Add disksize option to command.
          initCmd.unshift(kbox.util.format('--disksize=%s', opts.disksize));
        }
        // Run provider command.
        return shProvider(initCmd)
        // Wrap errors.
        .catch(function(err) {
          log.info('Initializing boot2docker failed, retrying.', err);
          throw new VError(err, 'Error initializing boot2docker.', initCmd);
        });
      });
    })
    // Check the status so we know what to do on the next step
    .then(function() {
      return getStatus();
    })
    // Manually share files on linux. But only do this if the VM is off first
    .then(function(status) {
      if (process.platform === 'linux' && status !== 'running') {
        return retry(opts, function(counter) {
          // @todo: make this less gross
          var shareCmd = 'VBoxManage sharedfolder add "Kalabox2"' +
          ' --name "Users" --hostpath "/home" --automount';
          log.info(kbox.util.format('Sharing folders [%s].', counter));
          return Promise.fromNode(function(cb) {
            _exec(shareCmd, cb);
          })
          .catch(function(err) {
            log.info('Sharing folder failed, retrying.', err);
            throw new VError(err, 'Error sharing folders.');
          });
        });
      }
      if (process.platform === 'win32') {
        // Check if we need to add a DNS command
        return isHostOnlySet()
        // If not set then set
        .then(function(isSet) {
          if (!isSet) {
            return setHostOnly();
          }
        });
      }
    })
    // Bring boot2docker up.
    .then(function() {
      return retry(opts, function(counter) {
        // Log start.
        log.info(kbox.util.format('Bringing boot2docker up [%s].', counter));
        // Run provider command.
        return shProvider(['up'])
        // Wrap errors.
        .catch(function(err) {
          log.info('Bringing up boot2docker failed, retrying.', err);
          throw new VError(err, 'Error bringing boot2docker up.');
        });
      });
    })
    // Log success.
    .then(function() {
      log.info('Boot2docker is up.');
    })
    // Emit post-up event.
    .then(function() {
      return kbox.core.events.emit('post-up');
    });

  };

  /*
   * Bring boot2docker down.
   */
  var down = function(opts) {

    // Default settings for max retries.
    opts = opts || {};
    opts.max = opts.max || opts.maxRetries || 3;

    // Emit pre down event.
    return Promise.try(kbox.core.events.emit, 'pre-down')
    // Retry to shutdown if an error occurs.
    .then(function() {
      return retry(opts, function(counter) {
        log.info(format('Shutting down [%s].', counter));
        return shProvider(['down']);
      });
    })
    // Log success.
    .then(function() {
      log.info('Shut down successful.');
    })
    // Emit post down event.
    .then(function() {
      return kbox.core.events.emit('post-down');
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error while shutting down.');
    });

  };

  /*
   * Return status of boot2docker.
   */
  var getStatus = function() {

    // Get status.
    return retry({max: 3}, function(counter) {
      log.debug(format('Checking status [%s].', counter));
      return shProvider(['status']);
    })
    // Trim off newline.
    .then(function(status) {
      return _.trim(status, '\n');
    });

  };

  /*
   * Return boot2docker's IP address.
   */
  var getIp = function() {

    // Get IP address.
    return retry({max: 3}, function() {
      return shProvider(['ip']);
    })
    // Remove endline.
    .then(function(ip) {
      return _.trim(ip, '\n');
    });

  };

  /*
   * Return true if boot2docker is up.
   */
  var isUp = function() {

    // Return true if status is 'running'.
    return getStatus()
    .then(function(status) {
      return (status === 'running');
    });

  };

  /*
   * Return true if boot2docker is down.
   */
  var isDown = function() {

    // Return the opposite of isUp.
    return isUp()
    .then(_.negate);

  };

  /*
   * Return true if boot2docker profile exists and is in the right place.
   */
  var hasProfile = function() {

    // Get path to profile.
    var profilePath = getProfilePath();

    // Read contents of profile.
    return Promise.fromNode(function(cb) {
      fs.readFile(profilePath, {encoding: 'utf8'}, cb);
    })
    // Read was successful so return true.
    .then(function() {
      return true;
    })
    // An error occured, decide what to do next.
    .catch(function(err) {
      if (err.code === 'ENOENT') {
        // File does not exist, so return false.
        return false;
      } else {
        // An unexpected error occured so wrap and throw it.
        throw new VError(err,
          'Error reading boot2docker profile "%s".',
          profilePath
        );
      }
    });

  };

  /*
   * Return true if boot2docker is installed.
   */
  var isInstalled = function() {

    // @todo: installer should set a uuid file from boot2docker info and then
    // run 'boot2docker info' and compare the UUID key with the uuid file.
    // @todo: on MYSYSGIT which is just a bash script for 'type -p $1' there is
    // probably a cross platform way to do this but for now:

    if (process.platform === 'win32') {

      // @todo: @bcauldwell - This is jank as shit.
      var filepath = _.trim(_.head(B2D_EXECUTABLE.split(' --')), '"');

      // Try to read the boot2docker executable.
      return Promise.fromNode(function(cb) {
        fs.open(filepath, 'r', cb);
      })
      // Read was a success so return true.
      .then(function() {
        return true;
      })
      // Error.
      .catch(function(err) {
        if (err.code === 'ENOENT') {
          // File does not exist so return false.
          return false;
        } else {
          // Unexpected error, so wrap and throw it.
          throw new VError(err, 'Error trying to read "%s".', filepath);
        }
      });
    } else {

      // Run which command to find location of boot2docker.
      return sh(['which', B2D_EXECUTABLE])
      .then(function(output) {
        if (output) {
          // If a location was return, return value of hasProfile.
          return hasProfile();
        } else {
          // Boot2docker does not exist so return false.
          return false;
        }
      })
      // Which returned an error, this should mean it does not exist.
      .catch(function(err) {
        return false;
      });

    }

  };

  /*
   * Return cached instance of engine config.
   */
  var getEngineConfig = _.once(function() {

    // Get ip address of boot2docker.
    return getIp()
    .then(function(ip) {
      // Build docker config.
      var config = {
        protocol: 'http',
        host: ip,
        port: '2375'
      };
      return config;
    });

  });

  /*
   * @todo: @pirog - What is this for?
   */
  var hasTasks = function() {
    return Promise.resolve(true);
  };

  /*
   * Get list of server IP addresses.
   */
  var getServerIps = function() {

    // Get instance of boot2docker profile object.
    return profileInstance()
    // Return list of possibel IP addresses.
    .then(function(profile) {

      // Get upper and lower IP address octets from profile.
      var upperIpOctets = _.trim(profile.UpperIP, '"').split('.');
      var lowerIpOctets = _.trim(profile.LowerIP, '"').split('.');

      // Assert the start of upper IP and lower IP are the same.
      assert(_.isEqual(_.take(upperIpOctets, 3), _.take(lowerIpOctets, 3)));

      // Get range of last octets for what will be a full list of possible ips.
      var lastOctets = _.range(_.last(lowerIpOctets), _.last(upperIpOctets));

      // Map range of last octets to IP addresses.
      return _.map(lastOctets, function(lastOctet) {
        // Get first 3 octets from upper IP address.
        var octets = _.take(upperIpOctets, 3);
        // Add last octet.
        octets.push(lastOctet);
        // Format octets to a IP string.
        return octets.join('.');
      });

    });

  };

  /*
   * @todo: @pirog - I'm not touching this one! :)
   */
  var path2Bind4U = function(path) {
    var bind = path;
    if (process.platform === 'win32') {
      bind = path
        .replace(/\\/g, '/')
        .replace('C:/', 'c:/')
        .replace('c:/', '/c/');
    }
    else if (process.platform === 'linux')  {
      bind = path.replace('/home', '/Users');
    }
    return bind;
  };

  // Build module function.
  return {
    down: down,
    engineConfig: getEngineConfig,
    getIp: getIp,
    getServerIps: getServerIps,
    hasTasks: hasTasks,
    isDown: isDown,
    isInstalled: isInstalled,
    isUp: isUp,
    name: 'boot2docker',
    path2Bind4U: path2Bind4U,
    up: up
  };

};
