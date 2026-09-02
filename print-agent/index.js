/**
 * KLUFF AUTOPRINT DESKTOP AGENT
 * High-performance, zero-touch Windows printing engine for retail shop counters.
 * 
 * Architecture:
 * - src/config.js             : Runtime configurations, paths, and asset unpacker
 * - src/logger.js             : Structured file & console logging with rotation
 * - src/mutex.js              : TCP mutex enforcing strictly 1 instance per PC
 * - src/hardware.js           : Motherboard UUID & hardware locking
 * - src/imageProcessor.js     : GDI BT.601 perceptual grayscale photo engine
 * - src/printerService.js     : Windows printer discovery & SumatraPDF spooler
 * - src/toastService.js       : Real-time 5-step bottom-right floating desktop toast
 * - src/activationService.js  : White & emerald green WPF terminal activation UI
 * - src/socketClient.js       : Real-time WebSocket relay & remote killswitch
 */

const { execFile } = require('child_process');
const { unpackAssets, loadConfig, saveConfig, getScriptPath } = require('./src/config');
const { Logger, notifyWindows } = require('./src/logger');
const { acquireMutex } = require('./src/mutex');
const { promptTerminalActivation } = require('./src/activationService');
const { initSocketClient, isConnected } = require('./src/socketClient');

async function main() {
  Logger.info('[Boot]', 'Initializing Kluff AutoPrint Desktop Agent...');

  // 1. Enforce single instance per computer
  const canStart = await acquireMutex();
  if (!canStart) {
    process.exit(0);
  }

  // 2. Unpack internal scripts to temp directory for PowerShell execution
  unpackAssets();

  // 3. Load or activate terminal token
  let cfg = loadConfig();

  if (!cfg.shopToken) {
    const activation = await promptTerminalActivation(cfg.serverUrl);
    if (activation && activation.shopToken) {
      cfg.shopToken = activation.shopToken;
      cfg.shopId = activation.shopId || '';
      cfg.hardwareId = activation.hardwareId || '';
      saveConfig(cfg);
      Logger.info('[Activation]', `Terminal paired to ${activation.shopName || 'Shop'}. Token saved.`);
      notifyWindows('Terminal Activated', `Linked successfully to ${activation.shopName || 'Shop'}!`);
    } else {
      Logger.warn('[Activation]', 'Activation was cancelled. Exiting.');
      process.exit(0);
    }
  }

  Logger.info('[Agent]', `Started successfully. Shop Token: ${cfg.shopToken.substring(0, 8)}...`);

  // 4. Request Windows Power Manager to keep CPU & network active 24/7 (prevents system sleep on counter PC)
  try {
    const keepAwakeScript = getScriptPath('keep-awake.ps1');
    const PS_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    execFile(PS_EXE, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', keepAwakeScript], { windowsHide: true }, () => {});
    Logger.info('[Power]', 'Windows Sleep Prevention Active: CPU and Network kept awake 24/7.');
  } catch (_) {}

  // 5. Connect real-time socket to cloud server
  initSocketClient(cfg);

  // 5. Periodic Heartbeat every 5 minutes
  setInterval(() => {
    Logger.info('[Heartbeat]', `Online=${isConnected()}`);
  }, 5 * 60 * 1000);

  // Keep event loop active permanently
  setInterval(() => {}, 60000);
}

main().catch((err) => {
  Logger.err('[Fatal]', err.stack || err.message);
  process.exit(1);
});