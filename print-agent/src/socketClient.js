const fs = require('fs');
const path = require('path');
const axios = require('axios');
const io = require('socket.io-client');
const { AGENT_DIR, MAX_JOBS } = require('./config');
const { Logger, notifyWindows } = require('./logger');
const { discoverPrinters, resolveTargetPrinter, printDocument, sumatraBinaryPath } = require('./printerService');
const { imgToPdf } = require('./imageProcessor');
const { ToastTracker } = require('./toastService');

let activeSocket = null;
let isRemoteLocked = false;
let lockReason = '';

// Semaphore for concurrency
const concurrencySemaphore = {
  current: 0,
  max: MAX_JOBS,
  acquire() {
    if (this.current >= this.max) return false;
    this.current++;
    return true;
  },
  release() {
    if (this.current > 0) this.current--;
  }
};

// Resilient file downloader
async function downloadFile(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      Logger.info('[DL]', `Attempt ${i}/${tries}: ${url}`);
      const r = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      return Buffer.from(r.data);
    } catch (e) {
      Logger.warn('[DL]', `Attempt ${i} failed: ${e.message}`);
      if (i < tries) await new Promise(r => setTimeout(r, 1500 * i));
      else throw e;
    }
  }
}

// Process and execute print job
async function processJob(job, cfg, socket) {
  if (isRemoteLocked) {
    Logger.warn('[Job]', `Rejected ${job.jobId}: Agent is locked (${lockReason})`);
    if (socket?.connected) {
      socket.emit('job-status-update', {
        jobId: job.jobId,
        status: 'FAILED',
        errorMessage: `Shop terminal is suspended: ${lockReason}`
      });
    }
    return;
  }

  const targetPrinter = resolveTargetPrinter(job, cfg.printers);
  const tmpFile = path.join(AGENT_DIR, `temp_${job.jobId}.pdf`);
  const jobTitle = job.originalFileName || 'document.pdf';
  Logger.info('[Job]', `${job.jobId} -> ${targetPrinter || 'Default'} | ${(job.colorMode || 'bw').toUpperCase()} x${job.copies || 1}`);

  // 1. Launch real-time floating desktop toast (Step 1: File Received)
  const toast = new ToastTracker(job);

  try {
    if (socket?.connected) socket.emit('job-status-update', { jobId: job.jobId, status: 'PRINTING' });

    // Step 2: Payment Accepted
    await new Promise(r => setTimeout(r, 800));
    toast.step(2);

    // Retrieve file buffer
    let buf = null;
    if (job.filePath) {
      const cleanPath = job.filePath.replace(/\\/g, '/').replace(/^\//, '');
      const candidates = [
        path.resolve(AGENT_DIR, '..', cleanPath),
        path.resolve(AGENT_DIR, '..', 'server', cleanPath)
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) { buf = fs.readFileSync(cand); break; }
      }
      if (!buf) buf = await downloadFile(`${cfg.serverUrl.replace(/\/$/, '')}/${cleanPath}`);
    } else if (job.fileUrl) {
      let pathname;
      try { pathname = new URL(job.fileUrl).pathname; } catch (_) { pathname = job.fileUrl; }
      buf = await downloadFile(`${cfg.serverUrl.replace(/\/$/, '')}${pathname}`);
    }

    if (!buf) throw new Error('Document buffer could not be downloaded');

    // Convert image to PDF if necessary (checks mimetype, extension, and magic bytes)
    const isImage = (job.fileType || '').startsWith('image/') ||
      /\.(png|jpe?g|webp|bmp)$/i.test(job.originalFileName || '') ||
      /\.(png|jpe?g|webp|bmp)$/i.test(job.filePath || '') ||
      (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) ||
      (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50);
    fs.writeFileSync(tmpFile, isImage ? Buffer.from(await imgToPdf(buf, job.fileType || job.originalFileName, job.paperSize, job.colorMode)) : buf);

    // Step 3: Now Printing
    await new Promise(r => setTimeout(r, 600));
    toast.step(3);

    const printOptions = {
      copies: job.copies || 1,
      sumatraPdfPath: sumatraBinaryPath,
      scale: 'fit'
    };
    if (targetPrinter) printOptions.printer = targetPrinter;
    if (job.printSide === 'double') printOptions.side = 'duplex';

    try {
      await printDocument(tmpFile, printOptions);
    } catch (err) {
      Logger.warn('[Spool]', 'Retrying after 1.5s:', err.message);
      await new Promise(r => setTimeout(r, 1500));
      await printDocument(tmpFile, printOptions);
    }

    // Step 4: Files Erased
    await new Promise(r => setTimeout(r, 800));
    toast.step(4);

    // Step 5: Job Completed
    await new Promise(r => setTimeout(r, 800));
    toast.step(5);

    Logger.info('[Job]', `${job.jobId} completed successfully.`);
    if (socket?.connected) socket.emit('job-status-update', { jobId: job.jobId, status: 'COMPLETED' });
  } catch (err) {
    Logger.err('[Job]', `${job.jobId} failed: ${err.message}`);
    if (socket?.connected) socket.emit('job-status-update', { jobId: job.jobId, status: 'FAILED', errorMessage: err.message });
  } finally {
    // 2-minute safe retention so Windows Print Spooler never prints blank pages
    setTimeout(() => {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
    }, 120000);
  }
}

// Start Socket.io connection to cloud server
function initSocketClient(cfg) {
  if (activeSocket) {
    try { activeSocket.disconnect(); } catch (_) {}
  }

  Logger.info('[Socket]', `Connecting to ${cfg.serverUrl}...`);

  const socket = io(cfg.serverUrl, {
    auth: { token: cfg.shopToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 8000,
    transports: ['websocket', 'polling']
  });

  activeSocket = socket;
  let lastPongReceived = Date.now();

  socket.on('connect', async () => {
    lastPongReceived = Date.now();
    Logger.info('[Socket]', `Connected to cloud server. Socket ID: ${socket.id}`);

    // Discover and sync local Windows printers
    const printers = await discoverPrinters();
    const printerNames = printers.map(p => typeof p === 'object' ? (p.name || p.deviceId || '') : String(p)).filter(Boolean);
    Logger.info('[Printers]', `Discovered ${printers.length} printer(s). Syncing with cloud...`);
    socket.emit('printer-status', { printers: printerNames, isOnline: true });
    socket.emit('agent-report-printers', { printers: printerNames });
  });

  socket.on('agent-pong', () => {
    lastPongReceived = Date.now();
  });

  // Active Keep-Alive: Ping server every 15s to keep router NAT tables open 24/7
  setInterval(() => {
    if (activeSocket?.connected) {
      activeSocket.emit('agent-ping', { t: Date.now() });
    }
    // Dead socket detector: If no pong in 45s, drop half-open TCP connection and reconnect
    if (activeSocket?.connected && Date.now() - lastPongReceived > 45000) {
      Logger.warn('[Socket]', 'Dead socket detected (no server pong in 45s). Forcing clean reconnect...');
      lastPongReceived = Date.now();
      try { activeSocket.disconnect(); } catch (_) {}
      setTimeout(() => { if (activeSocket) activeSocket.connect(); }, 500);
    }
  }, 15000);

  // System Sleep / Wake-up Watchdog
  // If system was suspended (lid closed / sleep), elapsed time will jump > 3500ms
  let lastTickTime = Date.now();
  setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastTickTime;
    lastTickTime = now;
    if (elapsed > 3500) {
      Logger.warn('[Wakeup]', `System resumed from sleep (${Math.round(elapsed / 1000)}s sleep). Fast-reconnecting socket immediately...`);
      lastPongReceived = Date.now();
      if (activeSocket) {
        try { activeSocket.disconnect(); } catch (_) {}
        setTimeout(() => {
          if (activeSocket) activeSocket.connect();
        }, 300);
      }
    }
  }, 1000);

  // Remote founder killswitch / control commands
  socket.on('agent-control-command', (data) => {
    Logger.warn('[Control]', `Received remote command: ${data.action} | Reason: ${data.reason || 'N/A'}`);
    if (data.action === 'LOCK') {
      isRemoteLocked = true;
      lockReason = data.reason || 'Terminal suspended by platform administration';
      notifyWindows('AutoPrint Suspended', lockReason, 'Warning');
    } else if (data.action === 'UNLOCK') {
      isRemoteLocked = false;
      lockReason = '';
      Logger.info('[Control]', 'Terminal unlocked. Ready to print.');
      notifyWindows('AutoPrint Ready', 'Terminal resumed! Ready for print jobs.');
    }
  });

  // Incoming print job from customer
  socket.on('print-job', async (job) => {
    Logger.info('[Job]', `Incoming order received: ${job.jobId}`);

    if (isRemoteLocked) {
      Logger.warn('[Job]', `Rejected ${job.jobId}: Agent is locked (${lockReason})`);
      socket.emit('job-status-update', {
        jobId: job.jobId,
        status: 'FAILED',
        errorMessage: `Shop terminal suspended: ${lockReason}`
      });
      return;
    }

    if (!concurrencySemaphore.acquire()) {
      Logger.warn('[Job]', `Max concurrent jobs (${MAX_JOBS}) reached. Spooling after delay...`);
      await new Promise(r => setTimeout(r, 2500));
    }

    try {
      await processJob(job, cfg, socket);
    } finally {
      concurrencySemaphore.release();
    }
  });

  socket.on('disconnect', (reason) => {
    Logger.warn('[Socket]', `Disconnected: ${reason}`);
  });

  socket.on('connect_error', (err) => {
    Logger.warn('[Socket]', `Connection error: ${err.message}`);
  });

  return socket;
}

module.exports = { initSocketClient, isConnected: () => activeSocket?.connected || false };
