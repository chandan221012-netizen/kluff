const { spawn } = require('child_process');
const { getScriptPath } = require('./config');
const { Logger } = require('./logger');

const PS_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

function spawnToast(job) {
  try {
    const script = getScriptPath('toast-ui.ps1');
    const payMode = (job.paymentMethod || 'counter').toLowerCase().includes('upi')
      ? 'UPI Mode - Accepted'
      : 'Cash Mode - Accepted';

    const colorStr = (job.colorMode || 'bw').toUpperCase() === 'COLOR' ? 'Color' : 'B&W';
    const cleanFilename = String(job.originalFileName || 'document.pdf').replace(/["']/g, '');

    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-JobId', String(job.jobId || 'JOB_PRINT'),
      '-Filename', cleanFilename,
      '-Price', String(job.totalPrice || 5),
      '-Pages', String(job.pageCount || 1),
      '-ColorMode', colorStr,
      '-Copies', String(job.copies || 1),
      '-PayMode', payMode
    ];

    Logger.info('[Toast]', `Spawning desktop notification toast for ${job.jobId}...`);

    // shell: false ensures cmd.exe is NEVER invoked; windowsHide: true keeps console hidden
    const child = spawn(PS_EXE, args, {
      shell: false,
      windowsHide: true,
      stdio: 'ignore'
    });

    child.unref();
  } catch (err) {
    Logger.err('[Toast]', 'Spawn error:', err.message);
  }
}

class ToastTracker {
  constructor(job) {
    this.jobId = job?.jobId;
    spawnToast(job);
  }

  step(_) {
    // Independent smooth animation runs inside toast-ui.ps1
  }
}

module.exports = { ToastTracker, spawnToast };
