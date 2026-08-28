const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const io = require('socket.io-client');
const { print } = require('pdf-to-printer');
const axios = require('axios');

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// Extract SumatraPDF binary out of pkg snapshot to real filesystem
function getSumatraBinaryPath() {
  const sumatraFilename = 'SumatraPDF-3.4.6-32.exe';

  // Path inside pkg snapshot
  const snapshotPath = path.join(__dirname, 'node_modules', 'pdf-to-printer', 'dist', sumatraFilename);

  // Real temp directory on target PC
  const tempDir = path.join(os.tmpdir(), 'kluff-print-agent');
  const targetPath = path.join(tempDir, sumatraFilename);

  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    if (fs.existsSync(snapshotPath) && !fs.existsSync(targetPath)) {
      fs.copyFileSync(snapshotPath, targetPath);
    }
  } catch (err) {
    console.error('[Binary Extract Error]:', err.message);
  }

  return targetPath;
}

const sumatraPdfPath = getSumatraBinaryPath();

async function getConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  console.log('=== Kluff Print Agent First-Time Setup ===\n');
  const serverUrl = await question('Enter Kluff Server URL (e.g. https://your-domain.ngrok-free.app): ');
  const shopToken = await question('Enter your Shop QR Token: ');

  rl.close();

  const config = { serverUrl: serverUrl.trim(), shopToken: shopToken.trim() };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('\nConfig saved to config.json!\n');
  return config;
}

async function startAgent() {
  const config = await getConfig();

  console.log(`[Kluff Agent] Connecting to server: ${config.serverUrl}...`);

  const socket = io(config.serverUrl, {
    transports: ['websocket', 'polling'],
    auth: {
      token: config.shopToken,
      qrToken: config.shopToken
    },
    query: {
      token: config.shopToken
    },
    extraHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });

  socket.on('connect_error', (err) => {
    console.error(`[Kluff Agent Error] Connection failed: ${err.message}`);
  });

  socket.on('error', (err) => {
    console.error(`[Kluff Agent Socket Error]: ${err.message}`);
  });

  socket.on('connect', () => {
    console.log('[Kluff Agent] Connected to Kluff Cloud Server successfully!');
  });

  socket.on('print-job', async (job) => {
    // Determine the target printer name cleanly
    let printerTarget = job.systemPrinterName;

    // Fallback logic if systemPrinterName isn't provided directly
    if (!printerTarget && job.printerId && !job.printerId.startsWith('PRINTER_')) {
      printerTarget = job.printerId;
    }

    console.log(`[Job Received] ID: ${job.jobId} | Target Printer: ${printerTarget || 'Windows Default Printer'}`);

    const tempPath = path.join(process.cwd(), `temp_${job.jobId}.pdf`);

    try {
      // Clean up targetUrl (removes any stray "SERVER_URL=" prefixes)
      let targetUrl = job.fileUrl || '';
      targetUrl = targetUrl.replace(/^SERVER_URL=/, '').trim();

      if (!targetUrl && job.filePath) {
        const cleanServer = config.serverUrl.replace(/\/$/, '');
        const cleanPath = job.filePath.replace(/^\//, '');
        targetUrl = `${cleanServer}/uploads/${cleanPath}`;
      }

      console.log(`[Downloading PDF]: ${targetUrl}`);

      const response = await axios({
        method: 'GET',
        url: targetUrl,
        responseType: 'arraybuffer',
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      });

      fs.writeFileSync(tempPath, response.data);

      // Build print options dynamically
      const printOptions = {
        copies: job.copies || 1,
        sumatraPdfPath: sumatraPdfPath
      };

      // Only pass printer parameter if we have a valid system printer name
      if (printerTarget) {
        printOptions.printer = printerTarget;
      }

      // Print PDF via Windows Spooler
      await print(tempPath, printOptions);

      console.log(`[Job Completed] ID: ${job.jobId}`);
      socket.emit('job-status-update', { jobId: job.jobId, status: 'COMPLETED' });

    } catch (err) {
      console.error(`[Job Failed] ${err.message}`);
      socket.emit('job-status-update', { jobId: job.jobId, status: 'FAILED', errorMessage: err.message });
    } finally {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) { }
      }
    }
  });

  
  socket.on('disconnect', (reason) => {
    console.log(`[Kluff Agent] Disconnected from server (${reason}). Retrying...`);
  });
}

// Global Process Error Handlers to keep process alive
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL AGENT ERROR]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL ASYNC ERROR]:', reason);
});

startAgent().catch((err) => {
  console.error('[AGENT STARTUP FAILED]:', err);
});