'use strict';

/**
 * Kalabox lib -> engine -> docker module.
 * @module docker
 */

var async = require('async');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var Dockerode = require('dockerode');
var S = require('string');

var docker = null;
var dockerConfig = null;

module.exports = function(kbox) {

  var self = this;

  var core = kbox.core;
  var util = kbox.util;
  var shell = util.shell;

  var logDebug = core.log.debug;
  var logInfo = core.log.info;

  var x = require('./index.js')(kbox);

  var init = function(engineConfig) {

    logDebug('DOCKER => initializing. ', engineConfig);
    dockerConfig = engineConfig;
    docker = new Dockerode(dockerConfig);
  };

  var teardown = function() {
    docker = null;
  };

  var getProviderModule = function() {
    // @todo: Change this to check platform.
    return require('./provider/b2d.js')(kbox);
  };

  var inspect = function(container, callback) {
    container.inspect(callback);
  };

  var parseDockerContainerName = function(dockerContainerName) {
    var parts = dockerContainerName.split('_');
    if (parts.length === 2 && parts[0] === 'kalabox') {
      return {
        prefix: parts[0],
        app: null,
        name: parts[1]
      };
    } else if (parts.length === 3 && parts[0] === 'kb') {
      return {
        prefix: parts[0],
        app: parts[1],
        name: parts[2]
      };
    } else {
      return null;
    }
  };

  var charsToRemove = ['/', ' '];
  var cleanupDockerContainerName = function(name) {
    var str = S(name);
    var charToRemove = _.find(charsToRemove, function(char) {
      return str.startsWith(char);
    });
    if (charToRemove === undefined) {
      return name;
    } else {
      return str.chompLeft(charToRemove).s;
    }
  };

  var toGenericContainer = function(dockerContainer) {
    var dockerContainerName = cleanupDockerContainerName(
      dockerContainer.Names[0]
    );
    var parsedName = parseDockerContainerName(dockerContainerName);
    if (parsedName === null) {
      return null;
    } else {
      return {
        id: dockerContainer.Id,
        name: dockerContainerName,
        app: parsedName.app
      };
    }
  };

  var list = function(appName, callback) {
    if (callback === undefined && typeof appName === 'function') {
      callback = appName;
      appName = null;
    }
    docker.listContainers({all: 1}, function(err, dockerContainers) {
      if (err) {
        callback(err, []);
      } else {
        var containers = dockerContainers.map(function(container) {
          return toGenericContainer(container);
        }).filter(function(container) {
          if (container === null) {
            return false;
          } else if (appName !== null) {
            return container.app === appName;
          } else {
            return true;
          }
        });
        callback(null, containers);
      }
    });
  };

  var findGenericContainer = function(cid, callback) {
    list(function(err, containers) {
      if (err) {
        callback(err);
      } else {
        var found = _.find(containers, function(container) {
          return container.id === cid || container.name === cid;
        });
        callback(null, found);
      }
    });
  };

  var findGenericContainerErr = function(cid, callback) {
    findGenericContainer(cid, function(err, genericContainer) {
      if (err) {
        callback(err);
      } else if (!genericContainer) {
        callback(new Error('The container "' + cid + '" does NOT exist'));
      } else {
        callback(null, genericContainer);
      }
    });
  };

  var get = function(searchValue, callback) {
    list(function(err, containers) {
      if (err) {
        callback(err);
      } else {
        var container = _.find(containers, function(container) {
          return container.id === searchValue || container.name === searchValue;
        });
        if (container === undefined) {
          callback(err, null);
        } else {
          callback(err, docker.getContainer(container.id));
        }
      }
    });
  };

  var getEnsure = function(searchValue, action, callback) {
    get(searchValue, function(err, container) {
      if (err) {
        callback(err);
      } else if (!container) {
        callback(new Error(
          'Cannot ' +
          action +
          ' the container "' + searchValue +
          '" it does NOT exist!'));
      } else {
        callback(err, container);
      }
    });
  };

  var info = function(cid, callback) {
    list(function(err, containers) {
      if (err) {
        callback(err);
      } else {
        var container = _.find(containers, function(container) {
          return container.id === cid || container.name === cid;
        });
        if (container) {
          docker.getContainer(container.id).inspect(function(err, data) {
            if (err) {
              callback(err);
            } else {
              // MixIn ports.
              var ports = data.NetworkSettings.Ports;
              if (ports) {
                container.ports = [];
                _.each(ports, function(port, key) {
                  if (port && Array.isArray(port) && port.length > 0) {
                    var hostPort = port[0].HostPort;
                    if (hostPort) {
                      container.ports.push([key, hostPort].join('=>'));
                    }
                  }
                });
              }
              // MixIn running state.
              var running = data.State.Running;
              if (running !== undefined) {
                container.running = running;
              }
              callback(null, container);
            }
          });
        } else {
          callback();
        }
      }
    });
  };

  var containerExists = function(searchValue, callback) {
    get(searchValue, function(err, container) {
      if (err) {
        callback(err);
      } else {
        callback(err, container !== null);
      }
    });
  };

  var create = function(createOptions, callback) {
    logInfo('DOCKER => Creating container.');
    var containerName = createOptions.name;
    containerExists(containerName, function(err, exists) {
      if (err) {
        callback(err);
      } else if (exists) {
        callback(
          new Error(
            'The container "' + containerName + '" already exists!'
          ),
        null);
      } else {
        logDebug('DOCKER => CreateOptions', createOptions);
        //logInfo('createOptions: ' + JSON.stringify(createOptions));
        docker.createContainer(createOptions, function(err, data) {
          if (err) {
            logInfo('DOCKER => Error creating container.', err);
            callback(err);
          } else {
            var container = {};
            if (data) {
              if (createOptions.name) {
                container = {
                  cid: data.id,
                  name: createOptions.name
                };
              }
            }
            logInfo('DOCKER => Container created.', container);
            callback(err, container);
          }
        });
      }
    });
  };

  var start = function(cid, startOptions, callback) {
    logInfo('DOCKER => Starting container.', cid);
    if (typeof startOptions === 'function' && callback === undefined) {
      callback = startOptions;
      startOptions = {};
    }
    getEnsure(cid, 'start', function(err, container) {
      if (err) {
        callback(err);
      } else {
        inspect(container, function(err, data) {
          if (err) {
            callback(err);
          } else if (data.State.Running) {
            logInfo('DOCKER => Container already started.', cid);
            callback(null);
          } else {
            container.start(startOptions, function(err) {
              if (err) {
                logInfo('DOCKER => Error while starting container.', err);
              } else {
                // @todo: this is a lie, we should be async polling the state
                // here until the state is running.
                logInfo('DOCKER => Container started.', cid);
              }
              callback(null);
            });
          }
        });
      }
    });
  };

  var resizeTerminal = function(container) {
    var terminalSize = {
      h: process.stdout.rows,
      w: process.stdout.columns
    };
    if (terminalSize.h !== 0 && terminalSize.w !== 0) {
      container.resize(terminalSize, function(err) {
        // @todo: What do we do if this results in an error?
      });
    }
  };

  var nextAvailableTempContainerName = function(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Invalid callback function: ' + callback);
    }
    var maxTempContainers = 100;
    var rec = function(i) {
      if (i > maxTempContainers) {
        callback(new Error('Too many temp containers!'));
      } else {
        var name = ['kalabox', 'temp' + i].join('_');
        findGenericContainer(name, function(err, generic) {
          if (err) {
            callback(err);
          } else if (generic) {
            rec(i + 1);
          } else {
            callback(null, name);
          }
        });
      }
    };
    rec(1);
  };

  var once = function(image, cmd, crtOpts, strOpts, callback, done) {
    if (typeof image !== 'string') {
      throw new TypeError('Invalid image: ' + image);
    }
    if (typeof cmd !== 'string' && !Array.isArray(cmd)) {
      throw new TypeError('Invalid cmd: ' + cmd);
    }
    if (crtOpts !== null && typeof crtOpts !== 'object') {
      throw new TypeError('Invalid crtOpts: ' + crtOpts);
    }
    if (strOpts !== null && typeof strOpts !== 'object') {
      throw new TypeError('Invalid strOpts: ' + strOpts);
    }
    if (typeof callback !== 'function') {
      throw new TypeError('Invalid callback function: ' + callback);
    }
    if (typeof done !== 'function') {
      throw new TypeError('Invalid done function: ' + done);
    }
    nextAvailableTempContainerName(function(err, name) {
      if (err) {
        done(err);
      } else {
        var opts = {
          Hostname: '',
          name: name,
          User: '',
          AttachStdin: false,
          AttachStdout: false,
          AttachStderr: false,
          Tty: true,
          OpenStdin: false,
          StdinOnce: false,
          Env: null,
          Cmd: cmd,
          Image: image,
          Volumes: {},
          VolumesFrom: ''
        };

        _.extend(opts, crtOpts);

        docker.createContainer(opts, function(err, container) {
          if (err) {
            done(err);
          } else {
            container.start(strOpts, function(startErr) {
              if (startErr) {
                container.remove({force:true}, function(removeErr) {
                  if (startErr) {
                    done(startErr);
                  } else {
                    done(removeErr);
                  }
                });
              } else {
                findGenericContainerErr(container.id, function(err, generic) {
                  if (err) {
                    done(err);
                  } else {
                    callback(generic, function(err) {
                      container.remove({force:true}, function(removeErr) {
                        if (err) {
                          done(err);
                        } else {
                          done(removeErr);
                        }
                      });
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
  };

  // @todo: document
  var exec = function(cid, cmd, callback) {
    if (typeof cid !== 'string') {
      throw new TypeError('Invalid cid: ' + cid);
    }
    if (typeof cmd === 'string') {
      cmd = [cmd];
    }
    if (!Array.isArray(cmd)) {
      throw new TypeError('Invalid cmd: ' + cmd);
    }
    if (typeof callback !== 'function') {
      throw new TypeError('Invalid callback function: ' + callback);
    }

    getEnsure(cid, 'exec', function(err, container) {
      if (err) {
        callback(err);
      } else {
        var opts = {
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Cmd: cmd
        };
        container.exec(opts, function(err, exec) {
          if (err) {
            callback(err);
          } else {
            exec.start(function(err, stream) {
              callback(err, stream);
            });
          }
        });
      }
    });
  };

  var run = function(image, cmd, streamIn, streamOut,
    createOptions, startOptions, callback) {
    var opts = {
      Hostname: '',
      User: '',
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      Env: null,
      Cmd: cmd,
      Image: image,
      Volumes: {},
      VolumesFrom: ''
    };

    _.extend(opts, createOptions);

    logInfo('DOCKER => Creating RUN container.');

    // Create container.
    docker.createContainer(opts, function(err, container) {
      if (err) {
        callback(err);
      } else {

        // Attach options.
        var attachOpts = {
          stream: true,
          stdin: true,
          stdout: true,
          stderr: true
        };

        logInfo('DOCKER => Attaching RUN container.');

        // Attach to container.
        container.attach(attachOpts, function(err, stream) {
          if (err) {
            callback(err);
          } else {

            // Pipe containers stdout directly to host stdout.
            stream.pipe(streamOut);

            // Pipe host stdin to containers stdin.
            var isRaw = streamIn.isRaw;
            streamIn.resume();
            streamIn.setEncoding('utf8');
            streamIn.setRawMode(true);
            streamIn.pipe(stream);

            logInfo('DOCKER => Starting RUN container.');

            // Start container.
            container.start(startOptions, function(err, data) {

              // Resize terminal
              resizeTerminal(container);
              streamOut.on('resize', resizeTerminal);

              // Wait for container to finish running.
              container.wait(function(err, data) {
                logInfo('DOCKER => RUN container shutting down.');

                // Cleanup and exit.
                streamOut.removeListener('resize', resizeTerminal);
                streamIn.removeAllListeners();
                streamIn.setRawMode(isRaw);
                streamIn.destroy();
                stream.end();

                container.remove({force:true}, function(err) {
                  callback(err);
                });

              });

            });

          }
        });

      }
    });
  };

  // @todo: document
  var query = function(image, cmd, createOpts, startOpts, callback, done) {
    var opts = {
      Hostname: '',
      User: '',
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: false,
      StdinOnce: true,
      Env: null,
      Cmd: cmd,
      Image: image,
      Volumes: {},
      VolumesFrom: ''
    };

    _.extend(opts, createOpts);

    logDebug('DOCKER => Creating QUERY container.');

    // Create container.
    docker.createContainer(opts, function(err, container) {
      if (err) {
        callback(err);
      } else {

        // Attach options.
        var attachOpts = {
          stream: true,
          stdin: false,
          stdout: true,
          stderr: true
        };

        logDebug('DOCKER => Attaching QUERY container.');

        // Attach to container.
        container.attach(attachOpts, function(err, stream) {
          if (err) {
            callback(err);
          } else {

            logDebug('DOCKER => Starting QUERY container.');

            // Start container.
            container.start(startOpts, function(err, data) {
              if (err) {
                callback(err);
              } else {

                callback(null, stream);

                // Wait for container to finish running.
                container.wait(function(err, data) {
                  logDebug('DOCKER => QUERY container shutting down.');

                  container.remove({force:true}, function(err) {
                    done();
                  });
                });

              }

            });

          }
        });

      }
    });
  };

  var stop = function(cid, callback) {
    logInfo('DOCKER => Stopping container.', cid);
    getEnsure(cid, 'stop', function(err, container) {
      if (err) {
        callback(err);
      } else {
        inspect(container, function(err, data) {
          if (err) {
            callback(err);
          } else if (!data.State.Running) {
            logInfo('DOCKER => Container already stopped.', cid);
            callback(null);
          } else {
            container.stop(function(err) {
              if (err) {
                logInfo('DOCKER => Error while stopping container.', err);
              } else {
                // @todo: this is a lie, we should be async polling the state
                // here until the state is not running.
                logInfo('DOCKER => Container stopped.', cid);
              }
              callback(err);
            });
          }
        });
      }
    });
  };

  var remove = function(cid, opts, callback) {
    logInfo('DOCKER => Removing container.', cid);
    if (typeof opts === 'function') {
      callback = opts;
      opts = {
        v: true
      };
    }
    if (!opts.kill) {
      opts.kill = false;
    }
    getEnsure(cid, 'remove', function(err, container) {
      if (err) {
        callback(err);
      } else {
        inspect(container, function(err, data) {
          if (err) {
            callback(err);
          } else if (!data.State.Running) {
            container.remove(opts, function(err) {
              if (err) {
                logInfo('DOCKER => Error while removing container.', err);
              } else {
                logInfo('DOCKER => Container removed.', cid);
              }
              callback(err);
            });
          } else if (data.State.Running && opts.kill) {
            logInfo('DOCKER => Stopping container.', cid);
            container.stop(function(err) {
              if (err) {
                logInfo('DOCKER => Error while stopping container.', err);
                callback(err);
              } else {
                logInfo('DOCKER => Container stopped.', cid);
                container.remove(function(err) {
                  if (err) {
                    logInfo('DOCKER => Error while removing container.', err);
                  } else {
                    logInfo('DOCKER => Container removed.', cid);
                  }
                  callback(err);
                });
              }
            });
          } else {
            callback(
              new Error(
              'The container "' +
              cid +
              '" can NOT be removed, it is still running.'
              )
            );
          }
        });
      }
    });
  };

  var parseDockerStream = function(data) {
    var parsedData;
    try {
      parsedData = JSON.parse(data.toString());
    } catch (err) {
      // do nothing
    }
    logInfo('DOCKER => DATA', parsedData);
    if (parsedData) {
      for (var x in parsedData) {
        if (x.toLowerCase() === 'errordetail') {
          return new Error(parsedData[x].message);
        }
      }
    }
  };

  var buildInternal = function(image, callback) {
    logInfo('DOCKER => Building image.', image);
    var workingDir = path.dirname(image.src);
    var filename = 'archive.tar';
    var file = path.resolve(workingDir, filename);

    process.chdir(workingDir);

    var archive =
      (process.platform === 'win32') ?
        // @todo: this is unbelievably janksauce
        // ideally handled at a deeper level
        file.replace(/\\/g, '/').replace('C:/', 'c:/').replace('c:/', '/c/') :
        file;
    var cmd = 'tar -cvf ' + archive + ' *';
    shell.exec(cmd, function(err, data) {
      if (err) {
        callback(err);
      } else {
        data = fs.createReadStream(file);
        docker.buildImage(data, {t: image.name}, function(err, stream) {
          if (err) {
            callback(err);
          } else {
            err = null;
            stream.on('data', function(data) {
              // seems like this listener is required for this to work.
              var parsedError = parseDockerStream(data);
              if (parsedError && !err) {
                err = parsedError;
              }
            });
            stream.on('end', function() {
              fs.unlinkSync(file);
              core.deps.call(function(globalConfig) {
                process.chdir(globalConfig.srcRoot);
              });
              logInfo('DOCKER => Building image complete.', image);
              callback(err);
            });
          }
        });
      }
    });
  };

  var pull = function(image, callback) {
    logInfo('DOCKER => Pulling image.', image);
    docker.pull(image.name, function(err, stream) {
      if (err) {
        callback(err);
      } else {
        err = null;
        stream.on('data', function(data) {
          var parsedErr = parseDockerStream(data);
          if (parsedErr && !err) {
            err = parsedErr;
          }
        });
        stream.on('end', function() {
          logInfo('DOCKER => Pulling image complete.', image);
          callback(err);
        });
      }
    });
  };

  /*
   * Pretty print object.
   */
  var pp = function(obj) {

    return JSON.stringify(obj);

  };

  /*
   * Parse a docker image name, example -> <repo>/<name>:<tag>.
   */
  var parseImageName = function(imageName) {

    // Split by repo sep.
    var parts = imageName.split('/');

    // Init.
    var o = {
      repo: undefined,
      name: undefined,
      tag: undefined
    };

    if (parts.length === 1) {

      // Just name, no repo.
      o.name = parts[0];

    } else if (parts.length === 2) {

      // Name and repo.
      o.repo = parts[0];
      o.name = parts[1];

    } else {

      // Throw error.
      throw new Error('Invalid image name: ' + imageName);

    }

    // Split by tag sep.
    parts = o.name.split(':');

    if (parts.length === 2) {

      // Name and tag.
      o.name = parts[0];
      o.tag = parts[1];

    } else if (parts.length > 2) {

      // Throw error.
      throw new Error('Invalid image name: ' + imageName);

    }

    // @todo: remove.
    console.log(o, null, '  ');

    return o;

  };

  /*
   * Take a parsed image name and convert it to a string.
   */
  var parsedImageNameToString = function(parsed) {

    // Validate.
    if (typeof parsed.repo !== 'string') {
      throw new TypeError('Invalid image repo: ' + pp(parsed));
    }
    if (typeof parsed.name !== 'string') {
      throw new TypeError('Invalid image name: ' + pp(parsed));
    }
    if (parsed.tag && typeof parsed.tag !== 'string') {
      throw new TypeError('Invalid image tag: ' + pp(parsed));
    }

    // Put name back together.
    var name = [parsed.repo, parsed.name].join('/');

    if (parsed.tag) {

      // Add version.
      return [name, parsed.tag].join(':');

    } else {

      return name;

    }

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

    // Validate raw image's keys.
    var validKeys = ['name', 'srcRoot'];
    _.each(_.keys(rawImage), function(key) {
      if (!_.contains(validKeys, key)) {
        throw new TypeError('Invalid image: ' + pp(rawImage));
      }
    });

    // Load global dependencies.
    return kbox.core.deps.call(function(globalConfig) {

      // Parse image name.
      var parsed = parseImageName(rawImage.name);

      // Set and validate the engine repo.
      var engineRepo = globalConfig.engineRepo;
      if (typeof engineRepo !== 'string') {

        // Throw error.
        throw new Error('Invalid config.engineRepo: ' +
          globalConfig.engineRepo);

      }

      // Get and validate version.
      var version = globalConfig.version;
      // Force version's patch to zero.
      var versionParts = version.split('.');
      if (versionParts.length !== 3) {
        throw new Error('Invalid config.version: ' + version);
      }
      version = [versionParts[0], versionParts[1], '0'].join('.');

      // Get build local dependency.
      var buildLocal = kbox.core.deps.contains('buildLocal') ?
        kbox.core.deps.lookup('buildLocal') : false;

      if (!parsed.repo) {

        // Get repo name from global config.
        parsed.repo = engineRepo;

      }

      if (parsed.repo === engineRepo && !parsed.tag) {

        // Set the tag to the version.
        parsed.tag = version;

      }

      // Build image to be returned.
      var image = {
        name: parsedImageNameToString(parsed),
        build: buildLocal
      };

      if (buildLocal) {

        // Default src root.
        if (!rawImage.srcRoot) {
          rawImage.srcRoot = globalConfig.srcRoot;
        }

        // Validate src root.
        if (typeof rawImage.srcRoot !== 'string') {
          throw new TypeError('Invalid image.srcRoot: ' + pp(rawImage));
        }

        // Build Dockerfile path.
        image.src = path.join(rawImage.srcRoot, 'dockerfiles',
          parsed.name, 'Dockerfile');

        if (!fs.existsSync(image.src)) {

          // Throw error is dockerfile doesn't exist.
          throw new Error('Could not find image file: ' + image.src);

        }

      }

      return image;

    });

  };

  /*
   * Decorate image object, and decide to build or pull.
   */
  var build = function(rawImage, callback) {

    // Validate
    if (typeof callback !== 'function') {
      throw new TypeError('Invalid callback function: ' + pp(callback));
    }
    if (typeof rawImage !== 'object') {
      callback(new TypeError('Invalid docker image object: ' + pp(rawImage)));
    }

    // Decorate and validate the raw image.
    var image = decorateRawImage(rawImage);

    if (image.build) {

      // Build image locally rather than the docker registry.
      buildInternal(image, callback);

    } else {

      // Pull image from docker registry.
      pull(image, callback);

    }

  };

  return {
    build: build,
    create: create,
    exec: exec,
    get: get,
    getEnsure: getEnsure,
    getProviderModule: getProviderModule,
    info: info,
    init: init,
    inspect: inspect,
    list: list,
    once: once,
    pull: pull,
    remove: remove,
    run: run,
    start: start,
    stop: stop,
    teardown: teardown
  };

};
