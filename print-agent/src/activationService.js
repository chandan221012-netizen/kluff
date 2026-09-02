const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { AGENT_DIR, getScriptPath } = require('./config');
const { Logger } = require('./logger');

const PS_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

function promptTerminalActivation(serverUrl) {
  return new Promise((resolve) => {
    const scriptPath = getScriptPath('activate-ui.ps1');
    const resultFile = path.join(AGENT_DIR, `activate_res_${Date.now()}.json`);

    Logger.info('[Activation]', 'Opening White & Emerald Green Terminal Activation Window...');

    execFile(PS_EXE, [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-ServerUrl', serverUrl,
      '-OutputFile', resultFile
    ], { windowsHide: false, timeout: 300000 }, (err) => {
      try {
        if (fs.existsSync(resultFile)) {
          const res = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
          try { fs.unlinkSync(resultFile); } catch (_) {}
          return resolve(res);
        }
      } catch (_) {}
      resolve(null);
    });
  });
}

module.exports = { promptTerminalActivation };
