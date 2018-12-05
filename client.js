'use strict';

const net      = require('net'),
      constant = require('./constant');
const debug = require('debug')('yi-action-camera')

var socketClient = new net.Socket(),
    listeners    = [],
    connected    = false,
    connecting   = false;

// Client
var Client = exports;

Client.token = null;

Client.isConnected = function () {
    return connected;
};

Client.connect = function (ip, port) {
    return new Promise(function (resolve, reject) {
        if (connected) {
            reject('Already connected');
            return;
        }

        if (connecting) {
            reject('Already trying connecting');
            return;
        }

        connecting = true;

        var onError = function (err) {
            connecting = false;
            reject(err);
        };

        socketClient.once('error', onError);

        socketClient.connect(port, ip, function () {
            connected = true;
            connecting = false;
            socketClient.removeListener('error', onError);
            resolve();
        });
    });
};

Client.disconnect = function () {
    return new Promise(function (resolve) {
        socketClient.on('end', function () {
            resolve();
        });

        connected = false;
        Client.token = null;

        socketClient.end();
    });
};

Client.sendAction = function (action, testFunc, param, type) {
    return new Promise(function (resolve) {
        var message = {
            msg_id: action,
            token:  action == constant.action.REQUEST_TOKEN ? 0 : Client.token
        };

        if (param) {
            message.param = param;
        }

        if (type) {
            message.type = type;
        }

        sendMessage(message, testFunc, resolve);
    });
};

// On client receive data
socketClient.on('data', function (rawData) {
    debug('received ' + rawData)
    try {
      // sometimes the data is not a proper JSON but two JSON messages:
      // {"msg_id":7,"type":"start_video_record"}{"msg_id":7,"type":"streaming_start"}
      // the code below fixes this
      let data = rawData.toString().split('}{')
      for ( let i = 0; i < data.length; i++) {
        let msg = data[i];
        if (data.length > 0) {
          if (i > 0) {
            msg = '{' + msg;
          }
          if (i < data.length - 1) {
            msg = msg + '}';
          }
        }

        debug('msg: ' + msg)
        msg = JSON.parse(msg);
        listeners.filter(function (listener) {
            return !listener(msg);
        });
      }
    } catch (e) {
      debug(e);
      debg(e.stack);
      console.error('could not parse JSON: ' + data);
    }
});

// On client close
socketClient.on('close', function (had_error) {
    if (connected) {
        connected = false;
        Client.token = null;

        socketClient.destroy();

        if (had_error) {
            console.error('Transmission error');
        }
    }
});

// Send message on the socket and register a test function to get result
// Test function should return true on a valid response
function sendMessage(message, testFunc, resolve) {
    if (testFunc) {
        listeners.push(function (data) {
            var result = !!testFunc(data);

            if (result) {
                resolve(data.hasOwnProperty('param') ? data.param : null);
            }

            return result;
        });
    }

    socketClient.write(JSON.stringify(message));
}
