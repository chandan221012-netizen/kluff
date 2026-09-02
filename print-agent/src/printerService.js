const fs = require('fs');
const path = require('path');
const { getPrinters, print } = require('pdf-to-printer');
const { TMP_DIR, ROOT_DIR } = require('./config');
const { Logger } = require('./logger');

// Locate bundled SumatraPDF binary
function getSumatraBinary() {
  const binaryName = 'SumatraPDF-3.4.6-32.exe';
  const candidates = [
    path.join(ROOT_DIR, 'node_modules', 'pdf-to-printer', 'dist', binaryName),
    path.join(__dirname, '..', 'node_modules', 'pdf-to-printer', 'dist', binaryName),
    path.join(TMP_DIR, binaryName)
  ];

  const destination = path.join(TMP_DIR, binaryName);

  for (const src of candidates) {
    if (fs.existsSync(src) && src !== destination) {
      try {
        if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
        if (!fs.existsSync(destination) || fs.statSync(destination).size === 0) {
          fs.copyFileSync(src, destination);
        }
        return destination;
      } catch (_) {}
    }
  }
  return destination;
}

const sumatraBinaryPath = getSumatraBinary();

const { execFile } = require('child_process');
const PS_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

// Discover all local and network printers configured in Windows
async function discoverPrinters() {
  return new Promise((resolve) => {
    execFile(PS_EXE, [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Printer | Select-Object Name, DeviceID, Default | ConvertTo-Json'
    ], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err || !stdout?.trim()) {
        Logger.warn('[Printers]', 'PowerShell discovery failed, returning empty list.');
        return resolve([]);
      }
      try {
        let parsed = JSON.parse(stdout.trim());
        if (!Array.isArray(parsed)) parsed = [parsed];
        const printers = parsed.map(p => ({
          name: p.Name || p.DeviceID || 'Unknown Printer',
          deviceId: p.DeviceID || p.Name,
          isDefault: Boolean(p.Default)
        }));
        resolve(printers);
      } catch (parseErr) {
        Logger.warn('[Printers]', 'JSON parse error in discovery:', parseErr.message);
        resolve([]);
      }
    });
  });
}

// Target printer router
function resolveTargetPrinter(job, printersConfig) {
  if (job.systemPrinterName && job.systemPrinterName !== 'Default Printer Name') {
    return job.systemPrinterName;
  }
  const sz = (job.paperSize || '').toUpperCase();
  const col = job.colorMode === 'color';
  const pr = printersConfig || {};

  if (sz === 'A1' && pr.a1Printer) return pr.a1Printer;
  if (sz === 'A2' && pr.a2Printer) return pr.a2Printer;
  if (sz === 'A3' && pr.a3Printer) return pr.a3Printer;
  if (job.jobType === 'photo' && pr.photoPrinter) return pr.photoPrinter;
  if (col && pr.colorPrinter) return pr.colorPrinter;
  if (!col && pr.bwPrinter) return pr.bwPrinter;
  return pr.defaultPrinter || null;
}

module.exports = {
  sumatraBinaryPath,
  discoverPrinters,
  resolveTargetPrinter,
  printDocument: print
};
