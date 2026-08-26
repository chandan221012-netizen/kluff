const io = require('socket.io-client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { print, getPrinters } = require('pdf-to-printer');

// Load device config
let config = {};
try {
  config = require('./config.json');
} catch (err) {
  console.error('Error loading config.json. Ensure file exists.');
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const TEMP_DIR = path.join(__dirname, 'temp_print_queue');

// Ensure temporary folder exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

console.log('Starting Windows Print Agent...');
console.log(`Connecting to server at ${SERVER_URL}...`);

// Connect to WebSocket Server with device auth token
const socket = io(SERVER_URL, {
  auth: { token: config.deviceToken },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000
});

socket.on('connect', async () => {
  console.log('Connected successfully to Backend Server!');
  await logAvailablePrinters();
});

socket.on('connect_error', (err) => {
  console.error('Connection failed:', err.message);
});

socket.on('disconnect', () => {
  console.warn('Disconnected from server. Retrying connection in background...');
});

// Receive Print Job from Backend
socket.on('print-job', async (job) => {
  console.log(`\n--- New Print Job Received ---`);
  console.log(`Job ID: ${job.jobId}`);
  console.log(`Printer: ${job.printerName || job.printerId}`);
  console.log(`Copies: ${job.copies} | Color Mode: ${job.colorMode}`);

  // Notify server that printing has started
  socket.emit('job-status-update', { 
    jobId: job.jobId, 
    status: 'PRINTING' 
  });

  const tempFilePath = path.join(TEMP_DIR, `${job.jobId}.pdf`);

  try {
    // 1. Download file from backend server
    console.log(`Downloading file from: ${job.fileUrl}`);
    const response = await axios({
      url: job.fileUrl,
      method: 'GET',
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    console.log('File downloaded successfully.');

    // 2. Configure Windows printing options
    const printOptions = {
      printer: job.printerName,
      copies: Number(job.copies) || 1,
      monochrome: job.colorMode === 'bw'
    };

    if (job.pages && job.pages !== 'all') {
      printOptions.pages = job.pages;
    }

    // 3. Dispatch to Windows Spooler
    console.log(`Sending document to printer: "${job.printerName}"...`);
    await print(tempFilePath, printOptions);
    console.log(`Job ${job.jobId} completed successfully!`);

    // 4. Update status on backend
    socket.emit('job-status-update', { 
      jobId: job.jobId, 
      status: 'COMPLETED' 
    });

  } catch (err) {
    console.error(`Failed to execute print job ${job.jobId}:`, err.message);

    socket.emit('job-status-update', { 
      jobId: job.jobId, 
      status: 'FAILED', 
      errorMessage: err.message 
    });
  } finally {
    // Clean up temporary downloaded file
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('Failed to clean up temp file:', e.message);
      }
    }
  }
});

// Helper function to list installed printers on the system
async function logAvailablePrinters() {
  try {
    const printers = await getPrinters();
    console.log('\nInstalled Windows Printers detected on this PC:');
    printers.forEach((p) => console.log(` - ${p.name} (Device ID: ${p.deviceId})`));
  } catch (err) {
    console.error('Unable to fetch Windows printers:', err.message);
  }
}