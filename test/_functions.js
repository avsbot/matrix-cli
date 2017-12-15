// fires off the cmd line easily
/**
 * run - run a command and watch the results
 * cmd '' - matrix command to run
 * options.responses [] - nested array of call and responses
 * options.checks [] - make sure all these strings exist in the output
 * options.postCheck f() - ( done, output=['','',...]) run a final check
 */

var showLogs = false;

var run = function(cmd, options, done) {
  if (!_.isFunction(done)) {
    throw new Error('Run needs a done()');
  }
  var args = cmd.split(' ');
  var isM = cmd.split(' ').shift();

  if (isM === 'matrix') {
    // matrix included, remove
    args.shift();
  }

  if (_.isString(options.checks)) {
    options.checks = [options.checks]
  }
  // console.log(args)
  var main = __dirname + '/../bin/matrix';
  var proc = require('child_process').spawn(main, args);

  var responseCount = 0; //options.responses.length;
  var checkCount = 0; //options.checks.length;

  var respondPrompts = _.map(options.responses, _.first);
  // return first for regex map
  // => /name|password/
  var respondRegex = new RegExp(_.map(options.responses, _.first).join('|'));

  var targetChecks = (options.hasOwnProperty('checks')) ? options.checks.length : 0;
  var targetResps = (options.hasOwnProperty('responses')) ? options.responses.length : 0;

  // global to match multis
  var checkRegex = new RegExp(options.checks.join('|'), 'g');

  // console.log(respondRegex, checkRegex)
  //

  var output = [];
  var finished = false;

  var handleOutput = function(out) {
    out = out.toString();
    output.push(out.split('\n'))
    if (process.env.hasOwnProperty('DEBUG') && out.length > 4) {
      console.log(out);
    }
    // called for each line of out
    var respMatch = out.match(respondRegex);
    // console.log(responseCount, '<', targetResps);
    // console.log(respMatch, out, '[]=>', respondRegex, targetResps)
    if (responseCount < targetResps && options.hasOwnProperty('responses') && !_.isNull(respMatch)) {
      var index = respondPrompts.indexOf(respMatch[0]);
      console.log(respMatch[0], index, options.responses[index][1])
      proc.stdin.write(options.responses[index][1]);
      responseCount += 1;
    }

    if (options.hasOwnProperty('checks') && !_.isNull(out.match(checkRegex))) {
      checkCount += out.match(checkRegex).length;
    }

    // console.log(responseCount, checkCount)
    if (!finished && responseCount >= targetResps && checkCount >= targetChecks) {
      finished = true;

      if (options.hasOwnProperty('postCheck')) {
        // make sure command has time to finish
        setTimeout(function() {
          // console.log('>>>Function POSTCHECK')
          options.postCheck(done, output);
        }, 100)
      } else {
        done();
      }
    }
  }
  // TODO: Debug uses stderr
  proc.stdout.on('data', handleOutput );

  // forward errors
  proc.stderr.on('data', handleOutput );

  proc.on('close', function(code) {
    console.log('finished'.green, cmd, code)
  })
}


module.exports = {
  showLogs: showLogs,
  run: run,
  readConfig: function readConfig() {
    return JSON.parse(require('fs').readFileSync(require('os').homedir() + '/.matrix/store.json'));
  },
  updateConfig: function updateConfig(valuesObject) {
    var fileContent = JSON.parse(require('fs').readFileSync(require('os').homedir() + '/.matrix/store.json'));
    fileContent = _.merge(valuesObject, fileContent);
    return require('fs').writeFileSync(require('os').homedir() + '/.matrix/store.json', JSON.stringify(fileContent));
  },
  setDevEnv: function(done) {
    run('matrix set env dev', {
      checks: ['dev'],
      postCheck: function(done) {
        var config = fn.readConfig();
        if (!config.hasOwnProperty('environment') && config.environment.name !== 'dev') {
          return done(new Error('Not in dev env'));
        }
        else {
          done();
        }
      }
    }, done);
  },
  login: function(done) {
    run('matrix login', {
      responses: [
        ['username', 'matrix_test@admobilize.com\n'],
        ['password', '123tapioca\n'],
        ['Share usage information', 'n\n']
      ],
      checks: [
        'Login Successful'
      ],
      postCheck: function(done) {
        if (fn.readConfig().user.hasOwnProperty('token')) {
          done();
        } else {
          done('No Token Saved to Local Config')
        }
      }
    }, done);
  },
  registerDevice: function(done) {
    var seed = Math.round(Math.random() * 1000000);

    run('matrix register device', {
      responses: [
        ['device name', 'test-device-' + seed + '\n'],
        ['device description', 'test-description\n']
      ],
      checks: [
        'MATRIX_DEVICE_ID',
        'MATRIX_DEVICE_SECRET',
        'matrix use test-device-' + seed
      ],
      postCheck: function(done, output) {
        output = _.flatten(output);
        var exports = _.filter(output, function(o) {
          return (o.indexOf('export') > -1)
        });
        // console.log(exports);
        // make these available
        M.DEVICE_ID = exports[0].split('=')[1].trim();
        M.DEVICE_SECRET = exports[1].split('=')[1].trim();
        done();
      }
    }, done)
  },
  useGroup: function(done) {
    if (!M.hasOwnProperty('GROUP_NAME')) {
      return done(new Error('No group.'));
    }

    console.log('Use Group', M.GROUP_NAME);

    run('matrix use ' + M.GROUP_NAME, {
      checks: ['test-group'],
      postCheck: function(done) {
        var config = fn.readConfig();
        if (!config.hasOwnProperty('group')) {
          console.log(config);
          console.log(require('os').homedir() + '/.matrix/store.json')
          return done(new Error('No Config File Found'));
        }
        return done();
      }
    }, done);
  },
  useDevice: function(done) {
    // if we haven't done the whole test, get deviceid from the config
    if (!M.hasOwnProperty('DEVICE_ID')) {
      console.log('No new device made. Using first entry from deviceMap')
      var c = fn.readConfig();

      M.DEVICE_ID = (c.device.hasOwnProperty('identifier')) ?
        c.device.identifier :
        Object.keys(c.deviceMap)[0];
    }

    console.log('Use Device', M.DEVICE_ID);

    run('matrix use ' + M.DEVICE_ID, {
      checks: ['test-device'],
      postCheck: function(done) {
        var config = fn.readConfig();
        if (!config.hasOwnProperty('device')) {
          console.log(config);
          console.log(require('os').homedir() + '/.matrix/store.json')
          return done(new Error('No Config File Found'));
        }
        var did = config.device.identifier;
        var name = config.deviceMap[did].name;
        if (name.indexOf('test-device') > -1) {
          done();
        } else {
          done('Finished, but bad device map')
        }
      }
    }, done);
  },
  removeDevice: function(done) {
    // if we haven't done the whole test, get deviceid from the config
    if (!M.hasOwnProperty('DEVICE_ID')) {
      console.log('No new device made. Using first entry from deviceMap')
      var c = fn.readConfig();

      M.DEVICE_ID = (c.device.hasOwnProperty('identifier')) ?
        c.device.identifier :
        Object.keys(c.deviceMap)[0];
    }

    console.log('Remove Device', M.DEVICE_ID);

    run('matrix remove ' + M.DEVICE_ID, {
      responses: [
        ['test-device', 'y\n']
      ],
      checks: [
        'Device successfully removed'
      ]
    }, done);
  },
  logout: function(done) {
    run('matrix logout', {
      checks: ['Logged Out Successfully'],
      postCheck: function(done) {
        var config = fn.readConfig();
        if (_.has(config, 'user')) {
          done('User Not Deleted on Logout')
        } else {
          done();
        }
      }
    }, done)
  }
}