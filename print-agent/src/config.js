const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_PKG = !!process.pkg;
const ROOT_DIR = IS_PKG ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const LOG_FILE = path.join(ROOT_DIR, 'agent.log');
const DEFAULT_SERVER = 'http://localhost:5000';
const MUTEX_PORT = 5055;
const MAX_JOBS = 2;

const AGENT_DIR = path.join(os.tmpdir(), 'kluff-agent');
const TMP_DIR = path.join(AGENT_DIR, 'tmp');

function ensureDirectories() {
  try { if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true }); } catch (_) {}
  try { if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (_) {}
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return {
        serverUrl: c.serverUrl || DEFAULT_SERVER,
        shopToken: c.shopToken || '',
        shopId: c.shopId || '',
        hardwareId: c.hardwareId || '',
        printers: c.printers || {}
      };
    }
  } catch (e) {
    console.error('[Config] Error loading config, using defaults:', e.message);
  }
  return {
    serverUrl: DEFAULT_SERVER,
    shopToken: '',
    shopId: '',
    hardwareId: '',
    printers: {}
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('[Config] Error saving config:', e.message);
  }
}

// Unpack bundled scripts to AGENT_DIR so PowerShell can execute them
function unpackAssets() {
  ensureDirectories();
  const scriptsToUnpack = [
    'activate-ui.ps1',
    'toast-ui.ps1',
    'convert-gray.ps1',
    'keep-awake.ps1',
    'preview-toast.ps1'
  ];
  
  for (const script of scriptsToUnpack) {
    const targetPath = path.join(AGENT_DIR, script);
    const candidatePaths = [
      path.join(ROOT_DIR, 'scripts', script),
      path.join(ROOT_DIR, script),
      path.join(__dirname, '..', 'scripts', script),
      path.join(__dirname, 'scripts', script),
      path.join(__dirname, script)
    ];

    for (const cand of candidatePaths) {
      try {
        if (fs.existsSync(cand)) {
          const content = fs.readFileSync(cand);
          fs.writeFileSync(targetPath, content);
          break;
        }
      } catch (_) {}
    }
  }
}

function getScriptPath(scriptName) {
  const tempPath = path.join(AGENT_DIR, scriptName);
  if (fs.existsSync(tempPath)) return tempPath;
  const rootPath = path.join(ROOT_DIR, 'scripts', scriptName);
  if (fs.existsSync(rootPath)) return rootPath;
  return path.join(ROOT_DIR, scriptName);
}

module.exports = {
  ROOT_DIR,
  CONFIG_PATH,
  LOG_FILE,
  DEFAULT_SERVER,
  MUTEX_PORT,
  MAX_JOBS,
  AGENT_DIR,
  TMP_DIR,
  ensureDirectories,
  loadConfig,
  saveConfig,
  unpackAssets,
  getScriptPath
};
