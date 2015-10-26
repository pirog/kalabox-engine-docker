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

  /*
   * NPM modules.
   */
  var Promise = require('bluebird');
  var VError = require('verror');
  var _ = require('lodash');
  var retry = require('retry-bluebird');

  /*
   * Get directory for provider executable.
   */
  var getB2DBinPath = function() {

    // Get sysconf
    var sysConfRoot = kbox.core.deps.get('config').sysConfRoot;

    // Return path based on platform
    switch (process.platform) {
      case 'win32': return 'C:\\Program Files\\Boot2Docker for Windows';
      case 'darwin': return path.join('usr', 'local', 'bin');
      case 'linux': return path.join(sysConfRoot, 'bin');
    }

  };

  /*
   * Return the B2D executable location
   */
  var getB2DExecutable = function() {

    // Get b2d path
    var b2dPath = getB2DBinPath();

    // Return exec based on path
    switch (process.platform) {
      case 'win32': return '"' + path.join(b2dPath, 'boot2docker.exe') + '"';
      case 'darwin': return path.join(b2dPath, 'boot2docker');
      case 'linux': return path.join(b2dPath, 'boot2docker');
    }

  };

  /*
   * Return the SSH executable location
   */
  var getSSHExecutable = function() {

    // For cleanliness
    var wBin = '"C:\\Program Files (x86)\\Git\\bin\\ssh.exe"';

    return process.platform === 'win32' ? wBin : 'ssh';

  };

  // Get boot2docker and ssh executable path.
  var B2D_EXECUTABLE = getB2DExecutable();
  var SSH_EXECUTABLE = getSSHExecutable();

  // Set of logging functions.
  var log = kbox.core.log.make('BOOT2DOCKER');

  // Define some ip constants
  var KALABOX_HOST_ONLY = '10.13.37.1';
  var KALABOX_DEFAULT_IP = '10.13.37.42';

  // Define kalabox SSH Key
  var KALABOX_SSH_KEY = 'boot2docker.kalabox.id_rsa';

  /*
   * Base shell command.
   */
  var _sh = kbox.core.deps.get('shell');

  /*
   * Get dynamic flags
   */
  var getFlags = function() {

    // Start up our options
    var options = [];

    // Use a custom SSH key to avoid SSH mixup with other B2D intances
    var sshPath = path.join(kbox.core.deps.get('config').home, '.ssh');
    options.push('--sshkey="' + path.join(sshPath, KALABOX_SSH_KEY) + '"');

    // Try to explicitly set hostIP on win32
    // @todo: we might not need this since we check and correct later
    if (process.platform === 'win32') {
      options.push('--hostip="' + KALABOX_HOST_ONLY + '"');
    }

    // Limit number of retries to increase performance of non-HOSTIP Vms
    options.push('--retries=50');

    // Concat and return
    return options.join(' ');

  };

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
      return Promise.fromNode(function(cb) {
        shell.exec(cmd, cb);
      })

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
   * Set B2D Env
   */
  var setB2DEnv = function() {

    // Set the provider root directory as a environmental variable.
    setRootDirEnv();

    // Set Path environmental variable if we are on windows so we get access
    // to things like ssh.exe
    if (process.platform === 'win32') {

      // Get Path
      var gitBin = 'C:\\Program Files (x86)\\Git\\bin';

      // Only add the gitbin to the path if the path doesn't start with
      // it. We want to make sure gitBin is first so other things like
      // putty don't F with it.
      // See https://github.com/kalabox/kalabox/issues/342
      if (!_.startsWith(process.env.path, gitBin)) {
        kbox.core.env.setEnv('Path', [gitBin, process.env.Path].join(';'));
      }
    }

    // Add B2D executable path to path to handle weird situations where
    // the user may not have B2D in their path
    var pathString = (process.platform === 'win32') ? 'Path' : 'PATH';
    var pathSep = (process.platform === 'win32') ? ';' : ':';
    var b2dPath = getB2DBinPath();
    if (!_.startsWith(process.env.path, b2dPath)) {
      var newPath = [b2dPath, process.env[pathString]].join(pathSep);
      kbox.core.env.setEnv(pathString, newPath);
    }

  };

  /*
   * Run a provider command in a shell.
   */
  var shProvider = function(cmd) {

    // Set the B2D env
    setB2DEnv();

    // Run a provider command in a shell.
    return sh([B2D_EXECUTABLE].concat(getFlags()).concat(cmd));

  };

  /*
   * Run a command inside the provider
   */
  var shProviderSSH = function(cmd) {

    // Set the B2D env
    setB2DEnv();

    /*
     * Return ssh options
     */
    var getSSHOptions = function() {

      // Get SSHkey Path
      var sshPath = path.join(kbox.core.deps.get('config').home, '.ssh');

      // Needed SSH opts
      var opts = [
        '-o IdentitiesOnly=yes',
        '-o StrictHostKeyChecking=no',
        '-o UserKnownHostsFile=/dev/null',
        '-o LogLevel=quiet',
        '-p 2022',
        '-i ' + path.join(sshPath, KALABOX_SSH_KEY),
        'docker@localhost'
      ];

      // concat and return all options
      return opts.join(' ');
    };

    // Run a provider command in a shell.
    return sh([SSH_EXECUTABLE].concat(getSSHOptions()).concat(cmd));

  };

  /*
   * Get Manual set IP command
   */
  var setProviderIPCmd = function() {
    //@todo: do we need to do this on eth0 as well?
    return [
      'sudo',
      'ifconfig',
      'eth1',
      KALABOX_DEFAULT_IP,
      'netmask',
      '255.255.255.0',
      'broadcast',
      '10.13.37.255',
      'up'
    ].join(' ');
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
        // Add disksize option to command.'
        if (opts.disksize) {
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
        })
        .then(function(output) {
          // If B2D reports no IP found we will try to set it manually
          // @todo: tighter check here
          if (_.includes(output, 'No IP') || _.includes(output, 'Error')) {

            // Log falure
            log.info('Boot2docker failed to provide an IP. Setting manually.');

            // Set manually
            return shProviderSSH(setProviderIPCmd())

            // Retry up so we can grab the correct adapter
            .then(function() {
              return up({max:3});
            });
          }
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
    opts.max = opts.max || opts.maxRetries || 5;

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

      // Trim the IP to remove newline cruft
      var host = _.trim(ip, '\n');

      // Check to see if we somehow landed on the wrong IP
      var ipSegs = host.split('.');
      if (ipSegs[3] !== '42') {
        // Try to manually set to correct and then try to grab IP again
        return shProviderSSH(setProviderIPCmd())
        .then(function() {
          return up({max:3});
        })
        .then(function() {
          return getIp();
        });
      }
      else {
        return host;
      }
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
   * Check to see if we have a Kalabox2 VM
   */
  var vmExists = function() {

    // See if there is any info
    return shProvider(['info'])

    // if there is output then we are probably good
    // @todo: we can do a stronger check here
    .then(function(output) {
      if (output) {
        return true;
      }
    })

    // If there is an error then we probably need to run the install
    .catch(function(err) {
      return false;
    });

  };

  /*
   * Return true if boot2docker is installed.
   * @todo: installer should set a uuid file from boot2docker info and then
   * run 'boot2docker info' and compare the UUID key with the uuid file.
   */
  var isInstalled = function() {

    // set the b2d env
    setB2DEnv();

    // Grab correct path checking tool
    // @todo: handle alternate shells
    var which = (process.platform === 'win32') ? 'where' : 'which';
    // Run command to find location of boot2docker.
    return sh([which, path.basename(B2D_EXECUTABLE)])
    .then(function(output) {
      if (output) {
        // If a location was return, return value of hasProfile.
        return hasProfile()
        // Do a final check to see if a Kalabox2 VM exists
        .then(function(hasProfile) {
          return hasProfile && vmExists();
        });
      }
      else {
        // Boot2docker does not exist so return false.
        return false;
      }
    })
    // Which returned an error, this should mean it does not exist.
    .catch(function(err) {
      return false;
    });

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
      var upperIp = _.trim(profile.UpperIP, '"').split('.');
      var lowerIp = _.trim(profile.LowerIP, '"').split('.');

      // Assert the start of upper IP and lower IP are the same.
      assert(_.isEqual(_.take(upperIp, 3), _.take(lowerIp, 3)));

      // Transform to integers and add one to the upper to accomodate how
      // _.range() works
      var bottomIp = parseInt(_.last(lowerIp));
      var topIp = parseInt(_.last(upperIp)) + 1;

      // Get range of last octets for what will be a full list of possible ips.
      var lastOctets = _.range(bottomIp, topIp);

      // Map range of last octets to IP addresses.
      return _.map(lastOctets, function(lastOctet) {
        // Get first 3 octets from upper IP address.
        var octets = _.take(upperIp, 3);
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
    sshKey: KALABOX_SSH_KEY,
    name: 'boot2docker',
    path2Bind4U: path2Bind4U,
    up: up
  };

};
