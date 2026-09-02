const fs = require('fs');
const { exec } = require('child_process');
const { LOG_FILE } = require('./config');

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB rotate

function writeLog(level, tag, ...args) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${tag}] ${args.join(' ')}\n`;
  process.stdout.write(line);

  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      try { fs.renameSync(LOG_FILE, LOG_FILE + '.old'); } catch (_) {}
    }
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) {}
}

const Logger = {
  info:  (tag, ...args) => writeLog('INFO',  tag, ...args),
  warn:  (tag, ...args) => writeLog('WARN',  tag, ...args),
  err:   (tag, ...args) => writeLog('ERROR', tag, ...args),
  debug: (tag, ...args) => writeLog('DEBUG', tag, ...args)
};

function notifyWindows(title, message, iconType = 'Info') {
  // Pure GUI mode: Replaced by zero-console floating WPF card
}

module.exports = { Logger, notifyWindows };
