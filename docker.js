'use strict';

/**
 * Kalabox lib -> engine -> docker module.
 * @module docker
 */

/*
 * Node API modules.
 */
var assert = require('assert');
var format = require('util').format;
var fs = require('fs');
var path = require('path');
var pp = require('util').inspect;

/*
 * NPM modules.
 */
var Dockerode = require('dockerode');
var MemoryStream = require('memorystream');
var Promise = require('bluebird');
var VError = require('verror');
var _ = require('lodash');
var async = require('async');
var retry = require('retry-bluebird');
var uuid = require('uuid');

// Build module.
module.exports = function(kbox) {

  // Save for later.
  var self = this;

  // Create logging functions.
  var log = kbox.core.log.make('DOCKER');

  /*
   * Load the provider module.
   */
  var getProvider = _.once(function() {

    // Log.
    log.debug('Initializing provider.');

    // Load.
    return Promise.try(function() {
      return require('./provider/b2d.js')(kbox);
    })
    // Log success.
    .tap(function() {
      log.debug('Provider initialized.');
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Failure initializing provider.');
    });

  });

  /*
   * Docker config instance lazy loaded and cached singelton.
   */
  var dockerConfigInstance = _.once(function() {

    // Log start.
    log.debug('Initializing docker config.');

    // Get engine config from provider.
    return getProvider().call('engineConfig')
    // Register engine config dependency.
    .tap(function(engineConfig) {
      log.debug('Docker config initialized.');
      kbox.core.deps.register('engineConfig', engineConfig);
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error getting docker config.');
    });

  });

  /*
   * Docker instance lazy loaded and cached singleton.
   */
  var dockerInstance = _.once(function() {

    // Get docker config.
    return dockerConfigInstance()
    // Initalize a dockerode object.
    .then(function(engineConfig) {
      log.debug('Initializing docker.', engineConfig);
      return new Dockerode(engineConfig);
    })
    // Log success.
    .tap(function() {
      log.debug('Docker initialized.');
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error initializing docker.');
    });

  });

  /*
   * Return a containers name.
   */
  var getContainerName = function(container) {
    var name = container.Names[0];
    if (_.head(name) === '/' || _.head(name) === ' ') {
      name = name.slice(1);
    }
    return name;
  };

  /*
   * Convert a docker container to a generic container.
   */
  var toGenericContainer = function(dockerContainer) {

    // Get name of docker container.
    var containerNameString = getContainerName(dockerContainer);

    // Parse docker container name.
    var name = null;
    try {
      name = kbox.util.docker.containerName.parse(containerNameString);
    } catch (err) {
      name = null;
    }

    // Build generic container.
    // @todo: @bcauldwell - What defines a generic container should
    // go in a kbox library module.
    if (!name) {
      return null;
    } else {
      return {
        id: dockerContainer.Id,
        name: containerNameString,
        app: name.app
      };
    }

  };

  /*
   * Query docker for a list of containers.
   */
  var list = function(appName) {

    // Query docker for list of containers.
    return dockerInstance()
    .then(function(dockerInstance) {
      return Promise.fromNode(function(cb) {
        dockerInstance.listContainers({all: 1}, cb);
      });
    })
    // Make sure we have a timeout.
    .timeout(30 * 1000)
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error querying docker for list of containers.');
    })
    // Map docker containers to generic containers.
    .map(toGenericContainer)
    // Filter out nulls and undefineds.
    .filter(_.identity)
    // Filter by app name if an app name was given.
    .then(function(containers) {
      if (appName) {
        return Promise.filter(containers, function(container) {
          return container.app === appName;
        });
      } else {
        return containers;
      }
    });

  };

  /*
   * Find a generic container.
   */
  var findGenericContainer = function(cid) {

    // Get list of generic containers.
    return list()
    // Filter by container id and container name.
    .filter(function(container) {
      return container.id === cid || container.name === cid;
    })
    // Return head on results.
    .then(function(results) {
      assert(results.length < 2);
      return _.head(results);
    });

  };

  /*
   * Find a generic container and throw an error if it doesn't exist.
   */
  var findGenericContainerThrows = function(cid) {

    // Find a generic container with given cid.
    return findGenericContainer(cid)
    // Throw an error if a container was not found.
    .tap(function(container) {
      if (!container) {
        throw new Error(format('The container %s does not exist!', cid));
      }
    });

  };

  /*
   * Find a docker container.
   */
  var findContainer = function(cid) {

    // Find a generic container.
    return findGenericContainer(cid)
    .then(function(container) {
      if (container) {
        // Map container id to a docker container.
        return dockerInstance().call('getContainer', container.id);
      } else {
        return undefined;
      }
    });

  };

  /*
   * Find a docker container and throw error if it does not exist.
   */
  var findContainerThrows = function(cid) {

    if (typeof cid !== 'string') {
      throw new Error(format('Invalid container id: "%s"', pp(cid)));
    }

    // Find container.
    return findContainer(cid)
    // Throw an error if a container was not found.
    .tap(function(container) {
      if (!container) {
        throw new Error(format('The container "%s" does not exist!', pp(cid)));
      }
    });

  };

  /*
   * Inspect a container.
   */
  var inspect = function(cid) {

    // Find a container.
    return findContainerThrows(cid)
    // Inspect container.
    .then(function(container) {
      return Promise.fromNode(function(cb) {
        container.inspect(cb);
      });
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error inspecting container.', cid);
    });
  };

  /*
   * Return true if the container is running otherwise false.
   */
  var isRunning = function(cid) {
    // Validate input.
    return Promise.try(function() {
      if (typeof cid !== 'string') {
        throw new Error('Invalid cid: ' + pp(cid));
      }
    })
    // Inspect.
    .then(function() {
      return inspect(cid);
    })
    .then(function(data) {
      return _.get(data, 'State.Running', false);
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error querying isRunning: "%s".', pp(cid));
    });
  };

  /*
   * Return a generic container with extra info added.
   */
  var info = function(cid) {

    // Find a generic container.
    return findGenericContainer(cid)
    .then(function(container) {

      if (!container) {

        // No container found so return undefined.
        return undefined;

      } else {

        // Inspect container.
        return dockerInstance()
        .then(function(dockerInstance) {
          return Promise.fromNode(function(cb) {
            dockerInstance.getContainer(container.id).inspect(cb);
          });
        })
        // Wrap errors.
        .catch(function(err) {
          throw new VError(err, 'Error inspecting container: %s.', cid);
        })
        // Add more information properties to generic container object.
        .then(function(data) {

          // Add port mappings.
          var ports = _.get(data, 'NetworkSettings.Ports', {});
          container.ports = _.map(ports, function(val, key) {
            var port = key;
            var hostPort = val[0].HostPort || 'ERROR';
            return [port, hostPort].join('=>');
          });

          // Add container's running status.
          container.running = _.get(data, 'State.Running', false);

          return container;

        });

      }

    });

  };

  /*
   * Return true if a container exists, otherwise false.
   */
  var containerExists = function(cid) {

    return findContainer(cid)
    .then(function(container) {
      return !!container;
    });

  };

  /*
   * Create a container.
   */
  var create = function(opts) {

    // Expand the image name.
    opts.Image = kbox.util.docker.imageName.expand(opts.Image);

    // Check if the container already exists.
    return containerExists(opts.name)
    .tap(function(exists) {
      if (exists) {
        throw new Error(format('The container %s already exists!', opts.name));
      }
    })
    // Log options.
    .tap(function() {
      log.info('Creating container.', opts);
    })
    // Create the container.
    .then(function() {
      return dockerInstance()
      .then(function(dockerInstance) {
        return Promise.fromNode(function(cb) {
          dockerInstance.createContainer(opts, cb);
        });
      });
    })
    // Map data to a result object.
    .then(function(data) {
      return {
        cid: data.id,
        name: opts.name
      };
    })
    // Log success.
    .tap(function(result) {
      log.info('Container created.', result);
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Creating container %s failed.', opts.name);
    });

  };

  /*
   * Start a container.
   */
  var start = function(cid, opts) {

    // Log starting.
    log.info(format('Starting container %s.', cid), opts);

    // Find and bind container.
    return findContainerThrows(cid)
    .bind({})
    .then(function(container) {
      this.container = container;
    })
    // Find out if container is already running.
    .then(function() {
      return isRunning(cid);
    })
    .then(function(isRunning) {

      // Save for later.
      var self = this;

      if (isRunning) {

        // Container is already started so do nothing.
        log.info('Container already started.', cid);

      } else {

        // Start container.
        return Promise.fromNode(function(cb) {
          self.container.start(opts, cb);
        })
        // Log finished.
        .then(function() {
          log.info('Container started.', cid);
        });

      }

    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error starting container %s.', cid);
    });

  };

  /*
   * Do a docker exec into a container.
   */
  var exec = function(cid, opts) {

    // Tty = use in terminal mode.

    /*
     * Terminal mode does not support demuxing streams into stdout and stderr.
     */

    // Default options.
    opts.tty = opts.tty || false;
    opts.cmd = opts.cmd || ['bash'];

    // Exec creation options.
    var createOpts = {
      AttachStdin: opts.tty, // Attach stdin if terminal mode.
      AttachStdout: true,
      AttachStderr: true,
      Tty: opts.tty, // Terminal mode.
      Cmd: opts.cmd, // Command to execute.
      stream: true // Needed for dockerode.
    };

    // Exec start options.
    var startOpts = {
      Detach: false, // Needs to be detached so process doesn't block.
      stdin: opts.tty, // Attach stdin if terminal mode.
      stdout: true,
      stderr: true
    };

    // Make sure container exists.
    return findContainerThrows(cid)
    // Create a container exec.
    .then(function(container) {
      return Promise.fromNode(function(cb) {
        log.debug('Creating exec.', createOpts);
        container.exec(createOpts, cb);
      })
      // Start the exec.
      .then(function(exec) {
        return Promise.fromNode(function(cb) {
          log.debug('Starting exec.', startOpts);
          exec.start(startOpts, cb);
        });
      })
      // Return result.
      .then(function(stream) {

        var result = {};

        if (opts.tty) {

          // Just stdout to worry about.
          process.stdin.pipe(stream);
          result.stdout = stream;
          result.stdout.setEncoding('utf8');
          // Function to wait on.
          result.wait = function() {
            return new Promise.fromNode(function(cb) {
              stream.on('end', cb);
            });
          };

        } else {

          // Demux stream into stdout and stderr.
          result.stdout = new MemoryStream();
          result.stderr = new MemoryStream();
          result.stdout.setEncoding('utf8');
          result.stderr.setEncoding('utf8');
          container.modem.demuxStream(stream, result.stdout, result.stderr);
          // Function to wait on.
          result.wait = function() {
            return new Promise(function(fulfill, reject) {
              stream.on('end', function() {
                fulfill();
              });
              result.stderr.on('data', function(data) {
                reject(new Error(data));
              });
            });
          };

        }

        return result;

      });
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err,
        'Error while running command "%s" in container %s', opts.cmd, cid);
    });

  };

  /*
   * Open a terminal to a container.
   */
  var terminal = function(cid) {

    // Exec options.
    var opts = {
      cmd: ['/bin/bash'], // Terminal should run bash shell.
      tty: true // Terminal mode should be turned on so we get prompts.
    };

    // Create and start exec.
    return exec(cid, opts)
    .then(function(res) {
      // Pipe terminal's stdout to local stdout.
      res.stdout.pipe(process.stdout);
      // Wait for terminal session to end.
      return res.wait()
      // Do some cleanup.
      .then(function() {
        process.stdin.destroy();
      });
    });

  };

  /*
   * Run a query against a container.
   */
  var query = function(cid, cmd) {

    // Exec options.
    var opts = {
      cmd: cmd
    };

    return exec(cid, opts);

  };

  /*
   * Run a query against a container, return data.
   */
  var queryData = function(cid, cmd) {

    // Query container.
    return query(cid, cmd)
    .then(function(res) {
      // Wait for container to finish.
      return res.wait()
      // Return contents of stdout.
      .then(function() {
        return res.stdout.toString();
      });
    });

  };

  /*
   * Create a container, do something, then make sure it gets stopped
   * and removed.
   */
  var use = function(rawImage, createOpts, startOpts, fn) {

    // Expand image.
    var image = kbox.util.docker.imageName.expand(rawImage);

    // Argument processing.
    if (!fn && _.isFunction(startOpts)) {
      fn = startOpts;
      startOpts = {};
    }

    // Argument processing.
    if (!fn && _.isFunction(createOpts)) {
      fn = createOpts;
      createOpts = {};
    }

    // Get a temp container name.
    var name = kbox.util.docker.containerName.format(
      kbox.util.docker.containerName.createTemp()
    );

    // Extend options.
    var opts = {
      name: name,
      Cmd: ['bash'], // This makes sure container doesn't stop until removed.
      Tty: true,
      Image: image
    };
    _.extend(opts, createOpts);

    // Create container.
    return dockerInstance()
    .then(function(dockerInstance) {
      return Promise.fromNode(function(cb) {
        log.info('Creating ad hoc container.', image);
        dockerInstance.createContainer(opts, cb);
      });
    })
    // Bind container.
    .bind({})
    .then(function(container) {
      log.info('Ad hoc container created.', container.id);
      this.container = container;
    })
    // Start container.
    .then(function() {
      // Save for later.
      var self = this;
      log.info('Starting ad hoc container.', self.container.id);
      return Promise.fromNode(function(cb) {
        self.container.start(startOpts, cb);
      })
      .then(function() {
        log.info('Ad hoc container started.', self.container.id);
      });
    })
    // Run callback.
    .then(function() {
      return Promise.try(fn, this.container);
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error running ad hoc container with %s.', image);
    })
    // Cleanup.
    .finally(function() {
      // Save for later.
      var self = this;
      // Remove container.
      if (self.container) {
        log.info('Removing ad hoc container.', this.container.id);
        return Promise.fromNode(function(cb) {
          self.container.remove({force: true}, cb);
        });
      }
    });

  };

  /*
   * Create and run a command inside of a container.
   */
  var run = function(rawImage, cmd, createOpts, startOpts) {

    var image = kbox.util.docker.imageName.expand(rawImage);

    var defaultCreateOpts = {
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      Cmd: cmd,
      Image: image
    };

    createOpts = _.extend(defaultCreateOpts, createOpts);

    var attachOpts = {
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true
    };

    var removeOpts = {
      force: true
    };

    return dockerInstance()
    .then(function(dockerInstance) {
      log.debug('Creating RUN container.', createOpts);
      return Promise.fromNode(function(cb) {
        dockerInstance.createContainer(createOpts, cb);
      })
      .tap(function() {
        log.debug('Created RUN container.');
      });
    })
    .then(function(container) {
      log.debug('Attaching to RUN container.', attachOpts);
      return Promise.fromNode(function(cb) {
        container.attach(attachOpts, cb);
      })
      .tap(function() {
        log.debug('Attached to RUN container.')  ;
      })
      .then(function(stream) {
        stream.pipe(process.stdout);
      })
      .then(function() {
        log.debug('Starting RUN container.', startOpts);
        return Promise.fromNode(function(cb) {
          container.start(startOpts, cb);
        })
        .tap(function() {
          log.debug('Started RUN container.');
        });
      })
      .then(function() {
        log.debug('Waiting on RUN container.');
        return Promise.fromNode(function(cb) {
          container.wait(cb);
        });
      })
      .finally(function() {
        log.debug('Removing RUN container.', removeOpts);
        return Promise.fromNode(function(cb) {
          container.remove(removeOpts, cb);
        })
        .tap(function() {
          log.debug('Removed RUN container.');
        });
      });
    });

  };

  /*
   * Stop a container.
   */
  var stop = function(cid) {

    // Log start.
    log.info('Stopping container.', cid);

    // Find and bind container.
    return findContainerThrows(cid)
    .bind({})
    .then(function(container) {
      this.container = container;
    })
    // Check if container is running.
    .then(function() {
      return isRunning(cid);
    })
    // Stop container if it is running.
    .then(function(isRunning) {
      var self = this;
      if (!isRunning) {
        // Container is already stopped so do nothing.
        log.info('Container already stopped.', cid);
      } else {
        // Stop container.
        return Promise.fromNode(function(cb) {
          self.container.stop(cb);
        })
        // Log success.
        .then(function() {
          log.info('Container stopped.', cid);
        });
      }
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error stopping container %s.', cid);
    });

  };

  /*
   * Remove a container.
   */
  var remove = function(cid, opts) {

    // Some option handling.
    opts = opts || {};
    opts.v = _.get(opts, 'v', true);
    opts.kill = _.get(opts, 'kill', false);

    // Log start.
    log.info(format('Removing container %s.', cid), opts);

    // Find a container or throw and error.
    return findContainerThrows(cid)
    .then(function(container) {
      // Stop the container if it's running.
      return isRunning(cid)
      .tap(function(isRunning) {
        if (isRunning) {
          log.info('Stopping container.', cid);
          return Promise.fromNode(container.stop);
        }
      })
      // Remove the container.
      .then(function() {
        return Promise.fromNode(function(cb) {
          container.remove(opts, cb);
        });
      })
      // Log success.
      .then(function() {
        log.info('Container removed.', cid);
      });
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error removing container %s.', cid);
    });

  };

  /*
   * Consume a docker build image or pull image stream.
   */
  var consumeBuildOrPullStream = function(stdout) {

    return new Promise(function(fulfill, reject) {
      // Make sure stream serves strings rather than buffers.
      stdout.setEncoding('utf8');
      stdout.on('data', function(data) {
        try {
          // Parse and log json.
          var json = JSON.parse(data);
          if (!json.stream) {
            // This is either an error message or something we don't expect.
            log.info(json);
            reject(new Error(json));
          } else {
            log.info(json.stream);
          }
        } catch (err) {
          // Error trying to parse json, so just treat it as a string.
          log.info(data);
        }
      });
      // Fulfill promise when the stream is finished.
      stdout.on('end', fulfill);
    });

  };

  /*
   * Build a docker image from a dockerfile.
   */
  var buildInternal = function(image) {

    // Log start.
    log.info('Building image.', image);

    // Get working directory for image.
    var workingDir = path.dirname(image.src);

    // Build path for a tar file that will contain everything in the
    // dockerfiles folder so that docker will have access to ADD and
    // COPY files.
    var tarFilepath = path.resolve(workingDir, 'dockerfile.tar');

    // Change the current process' working directory.
    process.chdir(workingDir);

    // In order to run the tar command we need a cross platform path that
    // will work on windows.
    var crossPlatformTarFilepath =
      // @todo: @mpirog - Does this work correctly?
      // Old way of doing this incase what's under this doesn't work.
      //file.replace(/\\/g, '/').replace('C:/', 'c:/').replace('c:/', '/c/') :
      (process.platform === 'win32') ?
        path.win32.normalize(tarFilepath) :
        tarFilepath;

    // Tar command.
    var cmd = ['tar', '-cvf', crossPlatformTarFilepath, '*'];

    // Run tar command.
    return Promise.fromNode(function(cb) {
      kbox.util.shell.exec(cmd, cb);
    })
    // Create a read stream from tar file's contents to feed to docker.
    .then(function() {
      return fs.createReadStream(tarFilepath);
    })
    // Start the building of the image.
    .then(function(tarStream) {
      return dockerInstance()
      .then(function(dockerInstance) {
        return Promise.fromNode(function(cb) {
          var buildOpts = {
            t: image.name
          };
          dockerInstance.buildImage(tarStream, buildOpts, cb);
        });
      });
    })
    // Monitor the output of the building of the image.
    .then(consumeBuildOrPullStream)
    // Log success.
    .tap(function() {
      log.info('Building image complete.', image);
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error while building image "%s".', image);
    })
    // Cleanup regardless of errors.
    .finally(function() {
      var globalConfig = kbox.core.deps.get('globalConfig');
      process.chdir(globalConfig.srcRoot);
      fs.unlinkSync(tarFilepath);
    });

  };

  /*
   * Pull a docker image form the docker registry.
   */
  var pull = function(image) {

    // Log start.
    log.info('Pulling image.', image);

    // Start pulling docker image.
    return dockerInstance()
    .then(function(dockerInstance) {
      return Promise.fromNode(function(cb) {
        dockerInstance.pull(image.name, cb);
      });
    })
    // Consume stdout from pulling docker image.
    .then(consumeBuildOrPullStream)
    // Log success.
    .tap(function() {
      log.info('Pulling image complete.', image);
    })
    // Wrap errors.
    .catch(function(err) {
      throw new VError(err, 'Error pulling image "%s".', image);
    });

  };

  /*
   * Decorate raw image object.
   */
  var decorateRawImage = function(rawImage) {

    // Validate
    if (typeof rawImage !== 'object') {
      throw new TypeError('Invalid docker image object: ' + pp(rawImage));
    }
    if (typeof rawImage.name !== 'string' || rawImage.name.length === 0) {
      throw new TypeError('Invalid image name: ' + pp(rawImage));
    }
    if (rawImage.forcePull && typeof rawImage.forcePull !== 'boolean') {
      throw new TypeError('Invalid image.forcePull: ' + pp(rawImage));
    }

    // Validate raw image's keys.
    var validKeys = [
      'build',
      'createOpts',
      'forcePull',
      'name',
      'postProviderOpts',
      'src',
      'srcRoot',
      'startOpts'
    ];
    _.each(_.keys(rawImage), function(key) {
      if (!_.contains(validKeys, key)) {
        throw new TypeError('Invalid image key=' + key + ' : ' + pp(rawImage));
      }
    });

    // Get build local dependency.
    var buildLocal = kbox.core.deps.contains('buildLocal') ?
      kbox.core.deps.lookup('buildLocal', {optional:true}) : false;

    if (rawImage.forcePull && rawImage.build) {
      throw new Error('Invalid, image.forcePull and image.build' +
        ' are both set: ' + pp(rawImage));
    }

    // Force pull takes president!
    var shouldBuild = !rawImage.forcePull && (rawImage.build || buildLocal);

    // Build image to be returned.
    var image = {
      name: kbox.util.docker.imageName.expand(rawImage.name),
      build: shouldBuild,
      createOpts: rawImage.createOpts,
      startOpts: rawImage.startOpts,
      postProviderOpts: rawImage.postProviderOpts
    };

    if (shouldBuild) {

      // Default src root.
      if (!rawImage.src && !rawImage.srcRoot) {
        rawImage.srcRoot = kbox.core.deps.lookup('globalConfig').srcRoot;
      }

      // Validate src root.
      if (!rawImage.src && typeof rawImage.srcRoot !== 'string') {
        throw new TypeError('Invalid image.srcRoot: ' + pp(rawImage));
      }
      if (!rawImage.srcRoot && typeof rawImage.src !== 'string') {
        throw new TypeError('Invalid image.src: ' + pp(rawImage));
      }

      // Build Dockerfile path.
      if (rawImage.src) {

        image.src = rawImage.src;

      } else {

        var repo = kbox.util.docker.imageName.parse(rawImage.name).repo;
        image.src = path.join(
          rawImage.srcRoot,
          'dockerfiles',
          repo,
          'Dockerfile'
        );

      }

      if (!fs.existsSync(image.src)) {

        // Throw error is dockerfile doesn't exist.
        throw new Error('Could not find image file: ' + image.src);

      }

    }

    return image;

  };

  /*
   * Decorate image object, and decide to build or pull.
   */
  var build = function(rawImage) {

    // Decorate and validate the raw image.
    var image = decorateRawImage(rawImage);

    if (image.build) {

      // Build image locally rather than the docker registry.
      return buildInternal(image);

    } else {

      // Pull image from docker registry.
      return pull(image);

    }

  };

  return {
    build: build,
    create: create,
    exec: exec,
    get: findContainer,
    getEnsure: findContainerThrows,
    getProvider: getProvider,
    info: info,
    inspect: inspect,
    isRunning: isRunning,
    list: list,
    pull: pull,
    query: query,
    queryData: queryData,
    remove: remove,
    run: run,
    start: start,
    stop: stop,
    terminal: terminal,
    use: use
  };

};
