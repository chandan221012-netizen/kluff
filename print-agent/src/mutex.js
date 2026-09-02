const net = require('net');
const { MUTEX_PORT } = require('./config');
const { Logger } = require('./logger');

let mutexServer = null;

function acquireMutex() {
  return new Promise((resolve) => {
    mutexServer = net.createServer();

    mutexServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        Logger.warn('[Lock]', 'Another instance of Kluff Print Agent is already running on this PC. Exiting.');
        return resolve(false);
      }
      Logger.err('[Lock]', 'Mutex error:', err.message);
      resolve(true); // Don't block startup on unexpected network error
    });

    mutexServer.once('listening', () => {
      Logger.info('[Lock]', `Mutex acquired on 127.0.0.1:${MUTEX_PORT}`);
      resolve(true);
    });

    mutexServer.listen(MUTEX_PORT, '127.0.0.1');
  });
}

module.exports = { acquireMutex };
