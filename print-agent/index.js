const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const url = require('url');
const { exec, execSync } = require('child_process');
const readline = require('readline');
const io = require('socket.io-client');
const { print } = require('pdf-to-printer');
const axios = require('axios');
const { PDFDocument, PageSizes } = require('pdf-lib');

// ─────────────────────────────────────────────────────────────
// PATHS & CONSTANTS
// ─────────────────────────────────────────────────────────────

const AGENT_DIR = process.cwd();
const CONFIG_PATH = path.join(AGENT_DIR, 'config.json');
const QUEUE_PATH = path.join(AGENT_DIR, 'job-queue.json');
const LOG_PATH = path.join(AGENT_DIR, 'agent.log');
const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const LOG_MAX_FILES = 3;
const MAX_CONCURRENT_JOBS = 2;
const DOWNLOAD_TIMEOUT_MS = 120000; // 120 seconds
const DOWNLOAD_MAX_RETRIES = 3;

// ─────────────────────────────────────────────────────────────
// PAPER SIZE LOOKUP
// ─────────────────────────────────────────────────────────────

const PAPER_SIZES = {
  'A4':     PageSizes.A4,         // 595.28 × 841.89
  'A3':     PageSizes.A3,         // 841.89 × 1190.55
  'A2':     [1190.55, 1684.02],
  'A1':     [1684.02, 2383.94],
  'A0':     [2383.94, 3370.39],
  'Legal':  PageSizes.Legal,      // 612 × 1008
  'Letter': PageSizes.Letter,     // 612 × 792
  'Tabloid': [792, 1224],
};

function getPaperSize(sizeStr) {
  if (!sizeStr) return PageSizes.A4;
  const key = Object.keys(PAPER_SIZES).find(
    k => k.toLowerCase() === sizeStr.toLowerCase()
  );
  return key ? PAPER_SIZES[key] : PageSizes.A4;
}

// ─────────────────────────────────────────────────────────────
// LOGGER — File + Console, Rotation
// ─────────────────────────────────────────────────────────────

class Logger {
  constructor(logPath, maxBytes, maxFiles) {
    this.logPath = logPath;
    this.maxBytes = maxBytes;
    this.maxFiles = maxFiles;
    this.memoryLogs = [];
    this.maxMemoryLogs = 200;
    this._ensureLogFile();
  }

  _ensureLogFile() {
    try {
      if (!fs.existsSync(this.logPath)) {
        fs.writeFileSync(this.logPath, '');
      }
    } catch (_) { /* best effort */ }
  }

  _rotate() {
    try {
      const stat = fs.statSync(this.logPath);
      if (stat.size < this.maxBytes) return;

      // Shift old logs: agent.log.3 → delete, .2 → .3, .1 → .2, agent.log → .1
      for (let i = this.maxFiles; i >= 1; i--) {
        const src = i === 1 ? this.logPath : `${this.logPath}.${i - 1}`;
        const dst = `${this.logPath}.${i}`;
        if (i === this.maxFiles && fs.existsSync(dst)) {
          fs.unlinkSync(dst);
        }
        if (fs.existsSync(src)) {
          fs.renameSync(src, dst);
        }
      }
      fs.writeFileSync(this.logPath, '');
    } catch (_) { /* best effort */ }
  }

  _write(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(a =>
      typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a)) : String(a)
    ).join(' ');
    const line = `[${timestamp}] [${level}] ${message}`;

    // Store in memory ring buffer for Web UI
    this.memoryLogs.push({ timestamp, level, message });
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift();
    }

    // Console
    if (level === 'ERROR' || level === 'CRITICAL') {
      console.error(line);
    } else {
      console.log(line);
    }

    // File
    try {
      this._rotate();
      fs.appendFileSync(this.logPath, line + '\n');
    } catch (_) { /* best effort */ }
  }

  getRecentLogs() {
    return [...this.memoryLogs];
  }

  info(...args) { this._write('INFO', ...args); }
  warn(...args) { this._write('WARN', ...args); }
  error(...args) { this._write('ERROR', ...args); }
  critical(...args) { this._write('CRITICAL', ...args); }
}

const log = new Logger(LOG_PATH, LOG_MAX_BYTES, LOG_MAX_FILES);

// ─────────────────────────────────────────────────────────────
// PERSISTENT JOB QUEUE
// ─────────────────────────────────────────────────────────────

class JobQueue {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        return Array.isArray(data) ? data : [];
      }
    } catch (e) {
      log.warn('[JobQueue] Corrupted queue file, resetting:', e.message);
    }
    return [];
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.queue, null, 2));
    } catch (e) {
      log.error('[JobQueue] Failed to save queue:', e.message);
    }
  }

  add(job) {
    // Avoid duplicates by jobId
    if (this.queue.some(j => j.jobId === job.jobId)) return;
    this.queue.push({ ...job, queuedAt: new Date().toISOString(), attempts: 0 });
    this._save();
    log.info(`[JobQueue] Job ${job.jobId} persisted to local queue`);
  }

  markAttempt(jobId) {
    const entry = this.queue.find(j => j.jobId === jobId);
    if (entry) {
      entry.attempts = (entry.attempts || 0) + 1;
      entry.lastAttemptAt = new Date().toISOString();
      this._save();
    }
  }

  remove(jobId) {
    this.queue = this.queue.filter(j => j.jobId !== jobId);
    this._save();
    log.info(`[JobQueue] Job ${jobId} removed from queue (completed)`);
  }

  getPending() {
    return this.queue.filter(j => (j.attempts || 0) < 5); // Max 5 local retries
  }

  getAll() {
    return [...this.queue];
  }
}

const jobQueue = new JobQueue(QUEUE_PATH);

// ─────────────────────────────────────────────────────────────
// CONCURRENCY SEMAPHORE
// ─────────────────────────────────────────────────────────────

class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.waiting = [];
  }

  acquire() {
    return new Promise(resolve => {
      if (this.current < this.max) {
        this.current++;
        resolve();
      } else {
        this.waiting.push(resolve);
      }
    });
  }

  release() {
    this.current--;
    if (this.waiting.length > 0 && this.current < this.max) {
      this.current++;
      const next = this.waiting.shift();
      next();
    }
  }
}

const printSemaphore = new Semaphore(MAX_CONCURRENT_JOBS);

// ─────────────────────────────────────────────────────────────
// IMAGE → PDF CONVERSION (Dynamic Paper Sizes)
// ─────────────────────────────────────────────────────────────

async function convertImageToPdf(imageBuffer, mimeOrExt = 'image/jpeg', paperSize = 'A4') {
  const pdfDoc = await PDFDocument.create();
  const lower = (mimeOrExt || '').toLowerCase();
  const isPng = lower.includes('png');

  let image;
  try {
    image = isPng ? await pdfDoc.embedPng(imageBuffer) : await pdfDoc.embedJpg(imageBuffer);
  } catch (embedErr) {
    try {
      image = isPng ? await pdfDoc.embedJpg(imageBuffer) : await pdfDoc.embedPng(imageBuffer);
    } catch (fallbackErr) {
      throw new Error(`Failed to embed image: ${embedErr.message}`);
    }
  }

  const [pageWidth, pageHeight] = getPaperSize(paperSize);
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const margin = 24; // ~8.5mm
  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2;

  const scale = Math.min(maxW / image.width, maxH / image.height, 1.0);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  page.drawImage(image, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });

  return await pdfDoc.save();
}

// ─────────────────────────────────────────────────────────────
// SUMATRA PDF BINARY EXTRACTION
// ─────────────────────────────────────────────────────────────

function getSumatraBinaryPath() {
  const sumatraFilename = 'SumatraPDF-3.4.6-32.exe';
  const snapshotPath = path.join(__dirname, 'node_modules', 'pdf-to-printer', 'dist', sumatraFilename);
  const tempDir = path.join(os.tmpdir(), 'kluff-print-agent');
  const targetPath = path.join(tempDir, sumatraFilename);

  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const needsExtract = !fs.existsSync(targetPath)
      || fs.statSync(targetPath).size === 0; // Re-extract if corrupted/zero bytes

    if (fs.existsSync(snapshotPath) && needsExtract) {
      fs.copyFileSync(snapshotPath, targetPath);
      log.info(`[SumatraPDF] Extracted binary to: ${targetPath}`);
    }
  } catch (err) {
    log.error('[SumatraPDF] Binary extraction error:', err.message);
  }

  return targetPath;
}

const sumatraPdfPath = getSumatraBinaryPath();

// ─────────────────────────────────────────────────────────────
// ORPHANED TEMP FILE CLEANUP
// ─────────────────────────────────────────────────────────────

function cleanupOrphanedTempFiles() {
  try {
    const files = fs.readdirSync(AGENT_DIR);
    let cleaned = 0;
    for (const f of files) {
      if (f.startsWith('temp_JOB_') && f.endsWith('.pdf')) {
        try {
          fs.unlinkSync(path.join(AGENT_DIR, f));
          cleaned++;
        } catch (_) { /* skip locked files */ }
      }
    }
    if (cleaned > 0) {
      log.info(`[Startup] Cleaned up ${cleaned} orphaned temp file(s) from previous session`);
    }
  } catch (_) { /* best effort */ }
}

// ─────────────────────────────────────────────────────────────
// DOWNLOAD WITH RETRY + EXPONENTIAL BACKOFF
// ─────────────────────────────────────────────────────────────

async function downloadWithRetry(url, maxRetries = DOWNLOAD_MAX_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`[Download] Attempt ${attempt}/${maxRetries}: ${url}`);
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      log.info(`[Download] Success — ${response.data.byteLength} bytes received`);
      return Buffer.from(response.data);
    } catch (err) {
      lastError = err;
      log.warn(`[Download] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        log.info(`[Download] Retrying in ${backoffMs / 1000}s...`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }
  throw new Error(`Download failed after ${maxRetries} attempts: ${lastError.message}`);
}

// ─────────────────────────────────────────────────────────────
// WINDOWS PRINTER DISCOVERY & HARDWARE DETECTION
// ─────────────────────────────────────────────────────────────

async function getWindowsPrinters() {
  return new Promise((resolve) => {
    // UTF-8 encoded PowerShell probe to discover all installed printers and their status
    const cmd = `powershell -NoProfile -NonInteractive -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Printer | Select-Object Name, Default, PrinterStatus, PortName | ConvertTo-Json -Compress"`;
    exec(cmd, { windowsHide: true, timeout: 10000 }, (err, stdout, stderr) => {
      if (err || !stdout || !stdout.trim()) {
        log.warn('[PrinterDiscovery] PowerShell query warning:', err ? err.message : 'Empty output');
        return resolve([]);
      }
      try {
        const raw = JSON.parse(stdout.trim());
        const list = Array.isArray(raw) ? raw : [raw];
        const printers = list.map(p => ({
          name: p.Name,
          isDefault: Boolean(p.Default),
          status: (p.PrinterStatus === 3 || p.PrinterStatus === 2 || p.PrinterStatus === 1) ? 'READY' : 'OFFLINE',
          portName: p.PortName || '',
          isVirtual: /pdf|xps|onenote|fax|nul:/i.test(p.Name + ' ' + (p.PortName || ''))
        }));
        resolve(printers);
      } catch (parseErr) {
        log.error('[PrinterDiscovery] Parse error:', parseErr.message);
        resolve([]);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

async function getConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log('=== AUTOPRINT Agent — First-Time Setup ===\n');
  const serverUrl = await question('Enter Server URL (e.g. https://your-domain.ngrok-free.app): ');
  const shopToken = await question('Enter your Shop QR Token: ');
  rl.close();

  const config = { 
    serverUrl: serverUrl.trim(), 
    shopToken: shopToken.trim(),
    printers: {}
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  log.info('Config saved to config.json');
  return config;
}

// ─────────────────────────────────────────────────────────────
// CORE JOB PROCESSOR
// ─────────────────────────────────────────────────────────────

async function processJob(job, config, socket) {
  // ── Smart Role-Based Printer Target Resolution ──
  let printerTarget = job.systemPrinterName;

  // 1. Check role-based assignments in config.printers
  if (!printerTarget && config.printers) {
    const isLargeFormat = job.paperSize && ['a3', 'a2', 'a1', 'a0'].includes(job.paperSize.toLowerCase());
    const isPhoto = job.jobType === 'photo' || (job.fileType && job.fileType.startsWith('image/'));

    if (isLargeFormat && config.printers.largeFormatPrinter) {
      printerTarget = config.printers.largeFormatPrinter;
    } else if (isPhoto && config.printers.photoPrinter) {
      printerTarget = config.printers.photoPrinter;
    } else if (job.colorMode === 'color' && config.printers.colorPrinter) {
      printerTarget = config.printers.colorPrinter;
    } else if (job.colorMode === 'bw' && config.printers.bwPrinter) {
      printerTarget = config.printers.bwPrinter;
    } else if (config.printers.defaultPrinter) {
      printerTarget = config.printers.defaultPrinter;
    }
  }

  // 2. If printerId is a raw printer name (not an internal ID)
  if (!printerTarget && job.printerId && !job.printerId.startsWith('PRINTER_') && !job.printerId.startsWith('DEFAULT_')) {
    printerTarget = job.printerId;
  }

  // 3. Fallback to configured default printer
  if (!printerTarget && config.printers?.defaultPrinter) {
    printerTarget = config.printers.defaultPrinter;
  }

  // If still empty, printerTarget remains undefined which pdf-to-printer/Sumatra routes to the Windows System Default
  log.info(`[Job Processing] ID: ${job.jobId} | Mode: ${(job.colorMode || 'bw').toUpperCase()} | Paper: ${job.paperSize || 'A4'} | Type: ${job.jobType || 'document'} | Copies: ${job.copies || 1} | Routed Printer: ${printerTarget || 'Windows System Default'}`);

  const tempPath = path.join(AGENT_DIR, `temp_${job.jobId}.pdf`);

  try {
    // Notify server: PRINTING
    if (socket && socket.connected) {
      socket.emit('job-status-update', { jobId: job.jobId, status: 'PRINTING' });
    }

    // ── Resolve file buffer ──
    let fileBuffer = null;
    let targetUrl = '';

    // Try local disk first
    if (job.filePath) {
      const normalizedPath = job.filePath.replace(/\\/g, '/');
      const candidates = [
        path.resolve(AGENT_DIR, '..', normalizedPath),
        path.resolve(AGENT_DIR, '..', 'server', normalizedPath),
        path.resolve(AGENT_DIR, normalizedPath),
        path.resolve(__dirname, '..', normalizedPath),
        path.resolve(__dirname, '..', 'server', normalizedPath),
        path.resolve(job.filePath),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          log.info(`[Local Spool] Reading from disk: ${p}`);
          fileBuffer = fs.readFileSync(p);
          break;
        }
      }
    }

    // Download from server with retry
    if (!fileBuffer) {
      if (job.filePath) {
        const cleanServer = config.serverUrl.replace(/\/$/, '');
        const cleanPath = job.filePath.replace(/\\/g, '/').replace(/^\//, '');
        targetUrl = `${cleanServer}/${cleanPath}`;
      } else if (job.fileUrl) {
        try {
          const parsed = new URL(job.fileUrl);
          const cleanServer = config.serverUrl.replace(/\/$/, '');
          targetUrl = `${cleanServer}${parsed.pathname}`;
        } catch (_) {
          targetUrl = job.fileUrl;
        }
      }

      if (!targetUrl) {
        throw new Error('No file path or URL available for this job');
      }

      fileBuffer = await downloadWithRetry(targetUrl);
    }

    // ── Smart image conversion ──
    const isImage = (
      (job.fileType && job.fileType.startsWith('image/')) ||
      (job.originalFileName && job.originalFileName.match(/\.(png|jpe?g|webp|bmp|gif)$/i)) ||
      (targetUrl && targetUrl.match(/\.(png|jpe?g|webp|bmp|gif)$/i)) ||
      job.jobType === 'photo'
    );

    if (isImage) {
      log.info(`[Pre-Processing] Converting image to ${job.paperSize || 'A4'} PDF...`);
      const pdfBytes = await convertImageToPdf(
        fileBuffer,
        job.fileType || job.originalFileName,
        job.paperSize || 'A4'
      );
      fs.writeFileSync(tempPath, Buffer.from(pdfBytes));
    } else {
      fs.writeFileSync(tempPath, fileBuffer);
    }

    // ── Build print options ──
    const printOptions = {
      copies: job.copies || 1,
      sumatraPdfPath: sumatraPdfPath,
    };

    if (printerTarget && printerTarget !== 'DEFAULT_PRINTER') {
      printOptions.printer = printerTarget;
    }

    // Paper size hint for SumatraPDF
    if (job.paperSize && job.paperSize.toLowerCase() !== 'a4') {
      printOptions.paperSize = job.paperSize;
    }

    // Duplex / print side
    if (job.printSide === 'double') {
      printOptions.side = 'duplex';
    }

    // ── Dispatch to Windows print spooler ──
    log.info(`[Spooling] Sending to printer queue (${job.copies || 1} copies)...`);
    await print(tempPath, printOptions);

    log.info(`[Job Completed] ID: ${job.jobId}`);
    if (socket && socket.connected) {
      socket.emit('job-status-update', { jobId: job.jobId, status: 'COMPLETED' });
    }

    // Remove from persistent queue on success
    jobQueue.remove(job.jobId);

  } catch (err) {
    log.error(`[Job Failed] ID: ${job.jobId} — ${err.message}`);
    jobQueue.markAttempt(job.jobId);

    if (socket && socket.connected) {
      socket.emit('job-status-update', {
        jobId: job.jobId,
        status: 'FAILED',
        errorMessage: err.message,
      });
    }
  } finally {
    // Always clean up temp file
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) { }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// RETRY QUEUED JOBS FROM PREVIOUS SESSION
// ─────────────────────────────────────────────────────────────

async function retryQueuedJobs(config, socket) {
  const pending = jobQueue.getPending();
  if (pending.length === 0) return;

  log.info(`[Startup Recovery] Found ${pending.length} incomplete job(s) in local queue — retrying...`);

  for (const job of pending) {
    await printSemaphore.acquire();
    processJob(job, config, socket)
      .catch(err => log.error(`[Queue Retry Failed] ${job.jobId}: ${err.message}`))
      .finally(() => printSemaphore.release());
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN AGENT
// ─────────────────────────────────────────────────────────────

async function startAgent() {
  log.info('════════════════════════════════════════════════════════');
  log.info('   AUTOPRINT Desktop Agent — Starting...');
  log.info('════════════════════════════════════════════════════════');

  // Cleanup orphaned temp files from previous crashed sessions
  cleanupOrphanedTempFiles();

  const config = await getConfig();
  log.info(`[Config] Server: ${config.serverUrl}`);
  log.info(`[Config] Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);

  // ── Start Dedicated Agent Web UI Server immediately ──
  const uiServer = startAgentServer(config);

  // ── Socket.IO with hardened connection settings ──
  const socket = io(config.serverUrl, {
    transports: ['websocket', 'polling'],
    auth: {
      token: config.shopToken,
      qrToken: config.shopToken,
    },
    query: {
      token: config.shopToken,
    },
    extraHeaders: {
      'ngrok-skip-browser-warning': 'true',
    },

    // ── Network Resiliency Settings ──
    reconnection: true,
    reconnectionDelay: 1000,         // Start at 1s
    reconnectionDelayMax: 30000,     // Cap at 30s
    reconnectionAttempts: Infinity,  // Never stop trying
    timeout: 60000,                  // 60s connection timeout
    pingTimeout: 60000,              // 60s before considering connection dead
    pingInterval: 25000,             // Heartbeat every 25s
  });

  // ── Connection Events ──

  socket.on('connect', async () => {
    log.info('[Agent] Connected to AUTOPRINT Cloud Server');
    log.info(`[Agent] Socket ID: ${socket.id}`);

    // Request any missed jobs from server
    socket.emit('agent-request-pending-jobs');
    log.info('[Agent] Requested pending/missed jobs from server');

    // Also retry any locally queued incomplete jobs
    await retryQueuedJobs(config, socket);
  });

  socket.on('connect_error', (err) => {
    log.error(`[Agent] Connection failed: ${err.message} — will auto-retry...`);
  });

  socket.on('error', (err) => {
    log.error(`[Agent] Socket error: ${err.message}`);
  });

  socket.io.on('reconnect', (attemptNumber) => {
    log.info(`[Agent] Reconnected after ${attemptNumber} attempt(s)`);
  });

  socket.io.on('reconnect_attempt', (attemptNumber) => {
    if (attemptNumber <= 5 || attemptNumber % 10 === 0) {
      log.info(`[Agent] Reconnection attempt #${attemptNumber}...`);
    }
  });

  socket.io.on('reconnect_error', (err) => {
    log.warn(`[Agent] Reconnect attempt failed: ${err.message}`);
  });

  socket.io.on('reconnect_failed', () => {
    log.critical('[Agent] All reconnection attempts exhausted');
  });

  socket.on('disconnect', (reason) => {
    log.warn(`[Agent] Disconnected (${reason}). Auto-reconnecting...`);
    if (reason === 'io server disconnect') {
      // Server forcefully disconnected — manually reconnect
      socket.connect();
    }
  });

  // ── Print Job Handler ──

  socket.on('print-job', async (job) => {
    log.info(`[Job Received] ID: ${job.jobId} | File: ${job.originalFileName || 'unknown'}`);

    // Immediately persist to local queue before attempting print
    jobQueue.add(job);

    // Acquire semaphore slot (waits if 2 jobs already running)
    await printSemaphore.acquire();
    try {
      await processJob(job, config, socket);
    } catch (err) {
      log.error(`[Job Error] ${job.jobId}: ${err.message}`);
    } finally {
      printSemaphore.release();
    }
  });

  // ── Periodic Health Check (every 5 minutes) ──
  setInterval(() => {
    const queueSize = jobQueue.getAll().length;
    const status = socket.connected ? 'ONLINE' : 'OFFLINE';
    log.info(`[Heartbeat] Status: ${status} | Active jobs: ${printSemaphore.current}/${MAX_CONCURRENT_JOBS} | Queued: ${queueSize}`);
  }, 5 * 60 * 1000);

  // Link socket to UI server for live status updates
  if (uiServer) uiServer.setSocket(socket);
}

// ─────────────────────────────────────────────────────────────
// DEDICATED AGENT WEB UI & LOCAL DASHBOARD (Port 5050)
// ─────────────────────────────────────────────────────────────

const AGENT_UI_PORT = process.env.AGENT_UI_PORT || 5050;

function startAgentServer(config) {
  let agentSocket = null;
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Helper: JSON response
    const sendJson = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end(JSON.stringify(data));
    };

    // Helper: read request body
    const getBody = () => new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try { resolve(JSON.parse(body || '{}')); }
        catch (_) { resolve({}); }
      });
    });

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    // ── API: Status ──
    if (pathname === '/api/status' && method === 'GET') {
      const detectedPrinters = await getWindowsPrinters();
      const defaultOsPrinter = detectedPrinters.find(p => p.isDefault)?.name || 'None';
      return sendJson(200, {
        online: agentSocket?.connected || false,
        socketId: agentSocket?.id || null,
        serverUrl: config.serverUrl,
        shopToken: config.shopToken,
        activeJobs: printSemaphore.current,
        maxConcurrent: MAX_CONCURRENT_JOBS,
        queuedJobs: jobQueue.getAll().length,
        defaultOsPrinter,
        printersConfig: config.printers || {},
        system: {
          platform: os.platform(),
          hostname: os.hostname(),
          uptimeSec: Math.floor(process.uptime()),
        }
      });
    }

    // ── API: Printers & Roles ──
    if (pathname === '/api/printers' && method === 'GET') {
      const detected = await getWindowsPrinters();
      return sendJson(200, {
        printers: detected,
        roles: config.printers || {}
      });
    }

    // ── API: Save Role Assignment ──
    if (pathname === '/api/printers/assign' && method === 'POST') {
      const { roles } = await getBody();
      if (roles && typeof roles === 'object') {
        config.printers = {
          defaultPrinter: roles.defaultPrinter || '',
          bwPrinter: roles.bwPrinter || '',
          colorPrinter: roles.colorPrinter || '',
          photoPrinter: roles.photoPrinter || '',
          largeFormatPrinter: roles.largeFormatPrinter || '',
        };
        try {
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
          log.info('[Config] Printer roles updated from Agent UI:', JSON.stringify(config.printers));
          return sendJson(200, { success: true, printers: config.printers });
        } catch (saveErr) {
          return sendJson(500, { error: 'Failed to write config.json: ' + saveErr.message });
        }
      }
      return sendJson(400, { error: 'Invalid roles object' });
    }

    // ── API: Send Test Print ──
    if (pathname === '/api/test-print' && method === 'POST') {
      const { printerName, role } = await getBody();
      const targetPrinter = printerName || config.printers?.defaultPrinter || undefined;
      
      log.info(`[Test Print] Triggered from Agent UI for printer: ${targetPrinter || 'Default'}`);

      try {
        // Generate a clean test calibration PDF using pdf-lib
        const pdfDoc = await PDFDocument.create();
        const [w, h] = PageSizes.A4;
        const page = pdfDoc.addPage([w, h]);
        
        page.drawText('AUTOPRINT AGENT — HARDWARE TEST PAGE', { x: 50, y: h - 80, size: 18 });
        page.drawText(`Printer Target: ${targetPrinter || 'Windows System Default'}`, { x: 50, y: h - 110, size: 12 });
        page.drawText(`Role Tested: ${role || 'General Test'}`, { x: 50, y: h - 130, size: 12 });
        page.drawText(`Timestamp: ${new Date().toLocaleString()}`, { x: 50, y: h - 150, size: 11 });
        page.drawText(`Host: ${os.hostname()} (${os.platform()})`, { x: 50, y: h - 170, size: 11 });
        page.drawText('Status: Hardware connection verified. Print pipeline operational.', { x: 50, y: h - 210, size: 12 });

        const pdfBytes = await pdfDoc.save();
        const testPdfPath = path.join(AGENT_DIR, `temp_TEST_${Date.now()}.pdf`);
        fs.writeFileSync(testPdfPath, Buffer.from(pdfBytes));

        const testOptions = {
          copies: 1,
          sumatraPdfPath: sumatraPdfPath
        };
        if (targetPrinter) testOptions.printer = targetPrinter;

        await print(testPdfPath, testOptions);
        try { fs.unlinkSync(testPdfPath); } catch (_) {}

        return sendJson(200, { success: true, message: `Test page spooled successfully to ${targetPrinter || 'Default Printer'}` });
      } catch (printErr) {
        log.error('[Test Print Error]:', printErr.message);
        return sendJson(500, { error: printErr.message });
      }
    }

    // ── API: Queue ──
    if (pathname === '/api/queue' && method === 'GET') {
      return sendJson(200, {
        jobs: jobQueue.getAll()
      });
    }

    // ── API: Recent Logs ──
    if (pathname === '/api/logs' && method === 'GET') {
      return sendJson(200, {
        logs: log.getRecentLogs()
      });
    }

    // ── Single-Page HTML / Modern Responsive UI ──
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(getAgentUiHtml());
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  let currentPort = Number(AGENT_UI_PORT);
  const maxPortAttempts = 10;
  let attempts = 0;

  function tryListen(port) {
    server.listen(port, '0.0.0.0', () => {
      log.info(`════════════════════════════════════════════════════════`);
      log.info(`   🌐 AGENT OPERATOR UI RUNNING AT:`);
      log.info(`   👉 http://localhost:${port}`);
      log.info(`════════════════════════════════════════════════════════`);

      // Auto-open browser in non-service mode
      if (!process.argv.includes('--headless') && !process.argv.includes('--service')) {
        const openCmd = process.platform === 'win32' ? `start http://localhost:${port}` : `xdg-open http://localhost:${port}`;
        exec(openCmd, () => {});
      }
    });
  }

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && attempts < maxPortAttempts) {
      attempts++;
      currentPort++;
      log.info(`[Agent UI Server] Port in use, trying next available port: ${currentPort}`);
      setTimeout(() => tryListen(currentPort), 200);
    } else {
      log.warn(`[Agent UI Server] Error on port ${currentPort}:`, e.message);
    }
  });

  tryListen(currentPort);

  return {
    setSocket: (s) => { agentSocket = s; }
  };
}

function getAgentUiHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AUTOPRINT Desktop Agent</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card: #111726;
      --card-hover: #161e32;
      --border: #1e293b;
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: rgba(17, 23, 38, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 16px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.35);
    }
    .brand-icon svg { width: 22px; height: 22px; stroke: white; }
    .brand-text h1 { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; }
    .brand-text p { font-size: 11px; color: var(--text-muted); font-weight: 500; }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
      transition: all 0.2s ease;
    }
    .status-online {
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.25);
    }
    .status-offline {
      background: rgba(244, 63, 94, 0.12);
      color: #fb7185;
      border-color: rgba(244, 63, 94, 0.25);
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 10px currentColor;
    }
    main {
      flex: 1;
      max-width: 1380px;
      width: 100%;
      margin: 0 auto;
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 16px;
    }
    .metric-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
      overflow: hidden;
    }
    .metric-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.4), transparent);
    }
    .metric-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-val { font-size: 26px; font-weight: 800; color: var(--text); }
    .metric-sub { font-size: 12px; color: var(--text-muted); }
    
    .grid-2col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 1024px) {
      .grid-2col { grid-template-columns: 1fr; }
    }
    
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 22px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .panel-title {
      font-size: 15px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .panel-title svg { width: 18px; height: 18px; stroke: #818cf8; }
    
    /* Hardware Printers list */
    .printer-card {
      background: rgba(22, 30, 50, 0.7);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      transition: all 0.2s;
    }
    .printer-card:hover {
      border-color: #334155;
      background: var(--card-hover);
    }
    .printer-info { display: flex; flex-direction: column; gap: 4px; }
    .printer-name { font-size: 14px; font-weight: 700; display: flex; items: center; gap: 8px; }
    .default-tag {
      font-size: 10px;
      padding: 2px 8px;
      background: rgba(99, 102, 241, 0.2);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 9999px;
      font-weight: 700;
    }
    .printer-sub { font-size: 11px; color: var(--text-muted); font-family: monospace; }
    .btn {
      padding: 8px 14px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn:active { transform: scale(0.97); }
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-secondary {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
    }
    .btn-secondary:hover { background: #334155; }
    
    /* Roles form */
    .role-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .role-label {
      font-size: 12px;
      font-weight: 700;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .role-desc { font-size: 11px; color: var(--text-muted); font-weight: 400; }
    select {
      background: #0b1120;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      width: 100%;
      outline: none;
      transition: border-color 0.2s;
    }
    select:focus { border-color: #6366f1; }
    
    /* Logs view */
    .log-container {
      background: #080c14;
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      max-height: 280px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .log-line { display: flex; gap: 8px; line-height: 1.4; }
    .log-time { color: #64748b; shrink-0: 0; }
    .log-INFO { color: #94a3b8; }
    .log-WARN { color: #fbbf24; }
    .log-ERROR { color: #f87171; }
    .log-CRITICAL { color: #ef4444; font-weight: bold; }
    
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e293b;
      color: #f8fafc;
      padding: 12px 20px;
      border-radius: 14px;
      border: 1px solid #334155;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      display: none;
      z-index: 100;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-icon">
        <svg fill="none" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
        </svg>
      </div>
      <div class="brand-text">
        <h1>AUTOPRINT Desktop Agent</h1>
        <p>Zero-Touch Hardware Print Spooler • Local Operator UI</p>
      </div>
    </div>
    <div id="statusBadge" class="status-pill status-offline">
      <div class="pulse-dot"></div>
      <span id="statusText">CONNECTING...</span>
    </div>
  </header>

  <main>
    <!-- Top KPI Grid -->
    <div class="metrics-grid">
      <div class="metric-card">
        <span class="metric-label">Cloud Server</span>
        <span id="metricServer" class="metric-val" style="font-size: 16px; word-break: break-all; font-family: monospace;">...</span>
        <span id="metricShopToken" class="metric-sub">Shop: ...</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Active Spool Queue</span>
        <span id="metricQueue" class="metric-val">0</span>
        <span class="metric-sub">Pending / in-progress print jobs</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Concurrency Semaphore</span>
        <span id="metricConcurrency" class="metric-val">0 / 2</span>
        <span class="metric-sub">Max active spool limit</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">OS Default Printer</span>
        <span id="metricDefaultPrinter" class="metric-val" style="font-size: 18px; font-family: monospace;">Detecting...</span>
        <span class="metric-sub">System default fallback</span>
      </div>
    </div>

    <!-- 2 Column Layout: Detected Printers & Role Routing Matrix -->
    <div class="grid-2col">
      
      <!-- Panel 1: Detected Physical Hardware Printers -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <svg fill="none" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
            </svg>
            Connected Windows Printers
          </div>
          <button class="btn btn-secondary" onclick="loadPrinters()">
            Refresh
          </button>
        </div>

        <div id="printersList" style="display: flex; flex-direction: column; gap: 10px;">
          <div style="color: var(--text-muted); font-size: 13px;">Probing Windows Spooler...</div>
        </div>
      </div>

      <!-- Panel 2: Role Assignment Matrix -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <svg fill="none" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
            </svg>
            Printer Role Routing Matrix
          </div>
          <button class="btn btn-primary" onclick="saveRoles()">
            Save Configuration
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px;">
          
          <div class="role-row">
            <div class="role-label">
              <span>Default General Printer</span>
              <span class="role-desc">Fallback for any unassigned jobs</span>
            </div>
            <select id="role_defaultPrinter">
              <option value="">-- Windows System Default --</option>
            </select>
          </div>

          <div class="role-row">
            <div class="role-label">
              <span>B&W Monochrome Documents</span>
              <span class="role-desc">High-speed laser or B&W tank</span>
            </div>
            <select id="role_bwPrinter">
              <option value="">-- Use Default Printer --</option>
            </select>
          </div>

          <div class="role-row">
            <div class="role-label">
              <span>Full Color Documents</span>
              <span class="role-desc">Color inkjet or color laser</span>
            </div>
            <select id="role_colorPrinter">
              <option value="">-- Use Default Printer --</option>
            </select>
          </div>

          <div class="role-row">
            <div class="role-label">
              <span>Photo & Glossy Prints</span>
              <span class="role-desc">Dedicated photo tray or high-DPI printer</span>
            </div>
            <select id="role_photoPrinter">
              <option value="">-- Use Default Printer --</option>
            </select>
          </div>

          <div class="role-row">
            <div class="role-label">
              <span>Large Format (A3, A2, A1)</span>
              <span class="role-desc">Wide-format plotter or A3 multi-function</span>
            </div>
            <select id="role_largeFormatPrinter">
              <option value="">-- Use Default Printer --</option>
            </select>
          </div>

        </div>
      </div>

    </div>

    <!-- Activity Log Panel -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          <svg fill="none" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
          </svg>
          Live Agent Activity Stream
        </div>
        <button class="btn btn-secondary" onclick="loadLogs()">Refresh Logs</button>
      </div>
      <div class="log-container" id="logBox">
        <div style="color: #64748b;">Loading recent activity...</div>
      </div>
    </div>

  </main>

  <div id="toast" class="toast">Configuration saved successfully!</div>

  <script>
    let currentPrinters = [];
    let currentRoles = {};

    function showToast(msg, isError = false) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.borderColor = isError ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.4)';
      t.style.background = isError ? '#2a1215' : '#0f241a';
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 3500);
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        // Status Badge
        const badge = document.getElementById('statusBadge');
        const text = document.getElementById('statusText');
        if (data.online) {
          badge.className = 'status-pill status-online';
          text.textContent = 'CONNECTED TO CLOUD';
        } else {
          badge.className = 'status-pill status-offline';
          text.textContent = 'DISCONNECTED (RECONNECTING)';
        }

        // Metrics
        document.getElementById('metricServer').textContent = data.serverUrl || 'N/A';
        document.getElementById('metricShopToken').textContent = 'Token: ' + (data.shopToken || 'N/A');
        document.getElementById('metricQueue').textContent = data.queuedJobs;
        document.getElementById('metricConcurrency').textContent = data.activeJobs + ' / ' + data.maxConcurrent;
        document.getElementById('metricDefaultPrinter').textContent = data.defaultOsPrinter || 'None';

        currentRoles = data.printersConfig || {};
      } catch (err) {
        console.error('Status fetch error:', err);
      }
    }

    async function loadPrinters() {
      try {
        const res = await fetch('/api/printers');
        const data = await res.json();
        currentPrinters = data.printers || [];
        currentRoles = data.roles || {};

        // Render printers list
        const container = document.getElementById('printersList');
        if (currentPrinters.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No physical or virtual printers found on this computer.</div>';
        } else {
          let html = '';
          for (let i = 0; i < currentPrinters.length; i++) {
            const p = currentPrinters[i];
            const defBadge = p.isDefault ? '<span class="default-tag">Windows Default</span>' : '';
            const virtBadge = p.isVirtual ? '<span style="font-size: 10px; color: #64748b;">(Virtual)</span>' : '';
            const safeName = encodeURIComponent(p.name);
            html += '<div class="printer-card">' +
              '<div class="printer-info">' +
                '<div class="printer-name"><span>' + escapeHtml(p.name) + '</span> ' + defBadge + ' ' + virtBadge + '</div>' +
                '<div class="printer-sub">Port: ' + escapeHtml(p.portName || 'Unknown') + ' • Status: ' + p.status + '</div>' +
              '</div>' +
              '<button class="btn btn-secondary" onclick="sendTestPrint(\\'' + safeName + '\\')">Test Print</button>' +
            '</div>';
          }
          container.innerHTML = html;
        }

        // Populate dropdowns in role matrix
        populateSelect('role_defaultPrinter', currentRoles.defaultPrinter, true);
        populateSelect('role_bwPrinter', currentRoles.bwPrinter);
        populateSelect('role_colorPrinter', currentRoles.colorPrinter);
        populateSelect('role_photoPrinter', currentRoles.photoPrinter);
        populateSelect('role_largeFormatPrinter', currentRoles.largeFormatPrinter);

      } catch (err) {
        console.error('Printers load error:', err);
      }
    }

    function populateSelect(elemId, selectedValue, isDefaultField) {
      const select = document.getElementById(elemId);
      const defaultOption = isDefaultField 
        ? '<option value="">-- Windows System Default --</option>'
        : '<option value="">-- Use Default Printer --</option>';
      
      let options = '';
      for (let i = 0; i < currentPrinters.length; i++) {
        const p = currentPrinters[i];
        const isSel = p.name === selectedValue ? 'selected' : '';
        const defLabel = p.isDefault ? ' (Default)' : '';
        options += '<option value="' + escapeHtml(p.name) + '" ' + isSel + '>' + escapeHtml(p.name) + defLabel + '</option>';
      }

      select.innerHTML = defaultOption + options;
    }

    async function saveRoles() {
      const roles = {
        defaultPrinter: document.getElementById('role_defaultPrinter').value,
        bwPrinter: document.getElementById('role_bwPrinter').value,
        colorPrinter: document.getElementById('role_colorPrinter').value,
        photoPrinter: document.getElementById('role_photoPrinter').value,
        largeFormatPrinter: document.getElementById('role_largeFormatPrinter').value,
      };

      try {
        const res = await fetch('/api/printers/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: roles })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Printer roles updated and saved to config.json!');
          fetchStatus();
        } else {
          showToast('Error: ' + (data.error || 'Failed to save'), true);
        }
      } catch (err) {
        showToast('Network error saving roles: ' + err.message, true);
      }
    }

    async function sendTestPrint(encodedPrinterName) {
      const printerName = decodeURIComponent(encodedPrinterName);
      try {
        showToast('Sending test page to "' + printerName + '"...');
        const res = await fetch('/api/test-print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printerName: printerName, role: 'Manual Calibration Test' })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message);
          loadLogs();
        } else {
          showToast('Test print failed: ' + (data.error || 'Unknown error'), true);
        }
      } catch (err) {
        showToast('Network error sending test print: ' + err.message, true);
      }
    }

    async function loadLogs() {
      try {
        const res = await fetch('/api/logs');
        const data = await res.json();
        const box = document.getElementById('logBox');
        if (!data.logs || data.logs.length === 0) {
          box.innerHTML = '<div style="color: #64748b;">No recent activity logged yet.</div>';
          return;
        }
        let html = '';
        const reversed = data.logs.slice().reverse();
        for (let i = 0; i < reversed.length; i++) {
          const l = reversed[i];
          const time = l.timestamp ? l.timestamp.split('T')[1].split('.')[0] : '';
          html += '<div class="log-line">' +
            '<span class="log-time">[' + time + ']</span>' +
            '<span class="log-' + l.level + '">[' + l.level + ']</span>' +
            '<span>' + escapeHtml(l.message) + '</span>' +
          '</div>';
        }
        box.innerHTML = html;
      } catch (err) {
        console.error('Log fetch error:', err);
      }
    }

    function escapeHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Auto-refresh loop
    fetchStatus();
    loadPrinters();
    loadLogs();
    setInterval(() => {
      fetchStatus();
      loadLogs();
    }, 4000);
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLERS — Keep process alive at all costs
// ─────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  log.critical('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  log.critical('[UNHANDLED REJECTION]', reason);
});

process.on('SIGTERM', () => {
  log.info('[Agent] Received SIGTERM — shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('[Agent] Received SIGINT — shutting down gracefully');
  process.exit(0);
});

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────

startAgent().catch((err) => {
  log.critical('[AGENT STARTUP FAILED]', err);
});