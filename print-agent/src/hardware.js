const { execFile } = require('child_process');
const PS_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

function getHardwareId() {
  return new Promise((resolve) => {
    const cmd = `& { try { $id = (Get-CimInstance Win32_ComputerSystemProduct).UUID; if ($id) { $id.Trim() } else { (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid } } catch { [System.Guid]::NewGuid().ToString().ToUpper() } }`;
    execFile(PS_EXE, ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err || !stdout?.trim()) {
        return resolve(process.env.COMPUTERNAME || 'UNKNOWN_HW');
      }
      resolve(stdout.trim());
    });
  });
}

function getComputerName() {
  return process.env.COMPUTERNAME || 'Shop Windows PC';
}

module.exports = { getHardwareId, getComputerName };
