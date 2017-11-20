/**
 * user - Checks if a valid user is set along with a valid user token, if invalid it refreshes it
 * @param {bool} exit If the process should exit on failed user validation. Defaults to true
 * @returns {bool} 
 */
function userAsync(cb) {
  if (_.isEmpty(Matrix.config.user)) {
    return cb(new Error(t('matrix.please_login')));
  } else {
    if (!token()) {
      if (!_.isEmpty(Matrix.config.user.refreshToken)) {
        Matrix.helpers.refreshToken(Matrix.config.user.refreshToken, function (err, userToken) {
          debug('Err:', err, ' Token:', userToken);
          if (err || _.isEmpty(userToken)) {
            return cb(new Error('Token refresh failed!'));
          } else {
            Matrix.config.user.token = userToken;
            Matrix.helpers.saveConfig(function (err) { 
              if (!err) return cb();
              else return cb(new Error('Unable to save new user token'));
            });
          }
        });
      } else {
        return cb(new Error('Unable to refesh token!'));
      }
    } else {
      return cb();
    }
  }
}


/**
 * user - Checks if a valid user is set along with a valid user token, if invalid it refreshes it
 * @param {bool} exit If the process should exit on failed user validation. Defaults to true
 * @returns {bool} 
 */
function user(exit) {
  var result = false;
  if (_.isEmpty(exit)) exit = true;
  if (_.isEmpty(Matrix.config.user)) {
    debug('No user found');
  } else {
    if (!token()) {
      if (!_.isEmpty(Matrix.config.user.refreshToken)) {
        var tokenData = Matrix.helpers.syncRefreshToken(Matrix.config.user.refreshToken);
        if (!_.isUndefined(tokenData.err) || _.isEmpty(tokenData.token)) {
          console.log('Token refresh failed!');
        } else {
          debug('Token refreshed!');
          Matrix.config.user.token = tokenData.token;
          var err = Matrix.helpers.syncSaveConfig();
          if (!_.isEmpty(err)) console.error('Unable to save new user token!'.red, err);
          else result = true;
        }
      } else {
        console.log('Unable to refesh token!');
      }
    } else {
      result = true;
    }
  }

  if (!result) {
    debug('Invalid token and unable to refresh it');
    console.log(t('matrix.please_login').yellow);
    if (exit) process.exit(1);
  }
  return result;
}

/**
 * device - Checks if a device is properly set
 * @param {bool} exit If the process should exit on failed user validation. Defaults to true
 * @returns {bool} 
 */
function deviceAsync(cb) {
  var err;
  if (_.isEmpty(Matrix.config.device) || _.isUndefined(Matrix.config.device.token)) {
    Matrix.loader.stop();
    console.error('matrix list devices'.grey, ' - > '.yellow + t('matrix.validate.select_device_id').yellow, '\nmatrix use\n'.grey)
    err = new Error(t('matrix.validate.no_device'));
  }
  cb(err);
}


/**
 * checkGroup - Checks if a group is properly set
 * @param {bool} exit If the process should exit on failed user validation. Defaults to true
 * @returns {bool} 
 */
function checkGroupAsync(cb) {
  var err;
  // fix if
  if (Matrix.config.groupName == null) {
    Matrix.loader.stop();
    console.error('matrix use <groupName>'.grey, ' - > '.yellow + t('matrix.validate.select_group').yellow)
    err = new Error(t('matrix.validate.no_group'));
  }
  cb(err);
}

/**
 * device - Checks if a device is properly set
 * @param {bool} exit If the process should exit on failed user validation. Defaults to true
 * @returns {bool} 
 */
function device(exit) {
  var result = true;
  if (_.isEmpty(exit)) exit = true;
  if (_.isEmpty(Matrix.config.device) || _.isUndefined(Matrix.config.device.token)) {
    Matrix.loader.stop();
    console.error(t('matrix.validate.no_device') + '\n', '\nmatrix list devices'.grey, ' - > '.yellow + t('matrix.validate.select_device_id').yellow, '\nmatrix use\n'.grey)
    result = false;
  }
  if (!result && exit) process.exit();
  return result;
}

/**
 * token - Verifies token integrity and expiration
 * returns {bool} Wether the token is valid or not
 */
function token(refresh) {
  if (_.isEmpty(refresh)) refresh = true;
  var jwt = require('jsonwebtoken');
  var token = Matrix.config.user.token;
  var result = false;
  if (!_.isUndefined(token)) {
    var decode = jwt.decode(token, { complete: true });

    if (_.isEmpty(decode)) debug('Incorrect token format');
    else {
      if (decode.payload.exp < Math.round(new Date().getTime() / 1000))
        debug('Token Expired.');
      else
        result = true;
    }
  }
  if (!result) debug('Invalid token!');
  else debug('Token ok!'.green);

  return result;
}

function isCurrentDevice(deviceId) {
  return (!_.isEmpty(Matrix.config.device) && Matrix.config.device.identifier === deviceId);
}

// 1 Invalid token
// 2 Unlisted error
// 3 Unknown error
// 4 Network timeout
//Returns a specific code for each case
function firebaseError(err) {
  if (err) {
    if (err.hasOwnProperty('code')) {
      if (err.code == 'auth/invalid-custom-token') {
        return 1;
      } else if (err.code == 'auth/network-request-failed') {
        return 4;
      } else {
        Matrix.loader.stop();
        console.log('Authentication error (' + err.code + '): ', err.message);
        return 2;
      }
    } else {
      Matrix.loader.stop();
      console.log('Authentication error: ', err);
      return 3;
    }
  } else {
    return 0;
  }
}

module.exports = {
  device: device,
  user: user,
  token: token,
  config: function(config) {
    var configHelper = require('matrix-app-config-helper')
    return configHelper.validate(config);
  },
  isCurrentDevice: isCurrentDevice,
  firebaseError: firebaseError,
  deviceAsync: deviceAsync,
  userAsync: userAsync,
  checkGroupAsync
};