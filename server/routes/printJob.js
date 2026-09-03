const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Shop = require('../models/Shop');
const Printer = require('../models/Printer');
const PrintJob = require('../models/PrintJob');
const QRSession = require('../models/QRSession');
const { getConnectedAgent, resolveTargetPrinter } = require('../sockets/agentSocket');

const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure disk storage for incoming uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`);
  }
});

// Multer upload middleware with mime-type & size validation
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // Max 30MB per file
  fileFilter: (req, file, cb) => {
    const allowedMime = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp'
    ];
    if (allowedMime.includes(file.mimetype) || file.originalname.match(/\.(pdf|png|jpe?g|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, and PNG documents are allowed.'));
    }
  }
});

// POST /api/print-jobs/submit or /api/print - Submit single or multiple documents for printing
const handleSubmitJob = async (req, res) => {
  try {
    const {
      shopToken,
      sessionToken,
      printerId,
      copies = 1,
      colorMode = 'bw',
      jobType = 'document',
      paperSize = 'A4',
      printSide = 'single',
      finishing = 'none',
      paymentMethod = 'counter',
      pages = 'all'
    } = req.body;

    const files = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);

    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Validate session token with 7-minute TTL & single-use protection
    let session = null;
    if (sessionToken) {
      session = await QRSession.findOne({ sessionToken });
      if (!session || session.used || new Date() > session.expiresAt) {
        return res.status(403).json({
          error: 'SESSION_EXPIRED',
          message: 'Session expired or inactive. Please scan the QR code at the shop counter to print.'
        });
      }
    }

    // Validate shop existence and status
    const shopQuery = shopToken
      ? { qrToken: shopToken, isActive: true }
      : (session ? { shopId: session.shopId, isActive: true } : null);

    if (!shopQuery) {
      return res.status(400).json({ error: 'Shop identification is required' });
    }

    const shop = await Shop.findOne(shopQuery);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found or inactive' });
    }

    // Founder Software Controls & Subscription Enforcement
    const sub = shop.subscription || {};
    if (sub.isRemoteLocked) {
      return res.status(403).json({
        error: 'SHOP_PRINTING_LOCKED',
        message: sub.lockReason || 'Printing service for this shop is temporarily suspended by platform administration.'
      });
    }

    if (sub.expiresAt && new Date(sub.expiresAt) < new Date() && (sub.autoTerminateOnLimit ?? true)) {
      return res.status(403).json({
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'This shop\'s printing subscription has expired. Please contact counter staff.'
      });
    }

    // 24-Hour / 10-Page Dual Expiry Watchdog (Applies strictly to TRIAL plan only)
    const isTrialPlan = (sub.planName === 'TRIAL' || sub.status === 'TRIAL');
    const trial = sub.trial || {};
    if (isTrialPlan && trial.isTrial) {
      const isTrialOverHours = trial.expiresAt && new Date(trial.expiresAt) < new Date();
      const isTrialOverPages = (trial.pagesUsed || 0) >= (trial.maxPages || 10);
      if (isTrialOverHours || isTrialOverPages) {
        return res.status(403).json({
          error: 'TRIAL_EXPIRED',
          message: 'The shop\'s 24-hour / 10-page free trial has completed. Counter staff is activating a monthly plan.'
        });
      }
    }

    if (sub.maxMonthlyPages > 0 && sub.currentMonthPages >= sub.maxMonthlyPages && (sub.autoTerminateOnLimit ?? true)) {
      return res.status(403).json({
        error: 'PAGE_QUOTA_EXCEEDED',
        message: 'This shop has reached its maximum monthly printing quota. Please contact counter staff.'
      });
    }

    // Validate printer ownership (if specific printer provided)
    let printer = null;
    if (printerId) {
      printer = await Printer.findOne({ printerId, shopId: shop.shopId });
    }
    if (!printer) {
      // Fallback: pick first online or available printer
      printer = await Printer.findOne({ shopId: shop.shopId });
    }

    const numCopies = Math.max(1, parseInt(copies, 10) || 1);
    let fileCopiesMap = {};
    if (req.body.fileCopies) {
      try {
        fileCopiesMap = typeof req.body.fileCopies === 'string' ? JSON.parse(req.body.fileCopies) : req.body.fileCopies;
      } catch (e) {}
    }

    const rate = colorMode === 'color' ? (shop.pricing?.colorPerPage || 10) : (shop.pricing?.bwPerPage || 2);
    
    // Paper-size multiplier
    const paperMultiplier = {
      'A4': 1.0,
      'Legal': 1.25,
      'A3': 2.0,
      'A2': 4.0,
      'A1': 8.0,
    }[paperSize] || 1.0;

    const pricePerPage = Math.round(rate * paperMultiplier * 10) / 10;
    const isDuplex = printSide === 'double';
    const duplexDiscountPerSheet = isDuplex ? Math.round(pricePerPage * 0.15 * 10) / 10 : 0;
    const finishingCost = finishing === 'staple' ? 5 : finishing === 'binding' ? 30 : 0;
    const serviceFee = 0; // No hidden service fees

    const batchId = `BATCH_${uuidv4().substring(0, 8).toUpperCase()}`;
    const createdJobs = [];
    let grandTotalPages = 0;

    // Process each uploaded file in order
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const thisFileCopies = fileCopiesMap[i] ? Math.max(1, parseInt(fileCopiesMap[i], 10)) : numCopies;
      let pageCount = 1;
      if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
        try {
          const dataBuffer = fs.readFileSync(file.path);
          const pdfData = await pdfParse(dataBuffer);
          pageCount = Math.max(1, pdfData.numpages || 1);
        } catch (pdfErr) {
          console.warn(`[PDF Parse Warning for ${file.originalname}]:`, pdfErr.message);
          pageCount = 1;
        }
      }

      const totalFilePages = pageCount * thisFileCopies;
      grandTotalPages += totalFilePages;

      const rawFileCost = pricePerPage * totalFilePages;
      const fileDiscount = isDuplex ? Math.round(duplexDiscountPerSheet * totalFilePages * 10) / 10 : 0;
      const filePrintingCost = Math.max(1, Math.round((rawFileCost - fileDiscount) * 10) / 10);
      const jobId = `JOB_${uuidv4().substring(0, 8).toUpperCase()}`;

      const printJob = new PrintJob({
        jobId,
        batchId,
        shopId: shop.shopId,
        printerId: printer ? printer.printerId : 'DEFAULT_PRINTER',
        filePath: `uploads/${file.filename}`,
        originalFileName: file.originalname,
        fileType: file.mimetype,
        jobType: jobType || 'document',
        pageCount,
        copies: thisFileCopies,
        pagesToPrint: pages,
        colorMode,
        paperSize,
        printSide,
        finishing,
        paymentMethod,
        paymentStatus: paymentMethod === 'counter' ? 'PENDING' : 'PAID',
        totalPrice: filePrintingCost,
        status: 'PENDING'
      });

      await printJob.save();
      createdJobs.push(printJob);
    }

    const totalBatchPrice = createdJobs.reduce((sum, j) => sum + j.totalPrice, 0) + finishingCost + serviceFee;

    // Dispatch jobs to connected Print Agent if online
    const agentSocketId = getConnectedAgent(shop.shopId) || getConnectedAgent(shop._id?.toString());
    const ioInstance = req.app.get('io');
    const routing = shop.printerRouting || {};

    for (const job of createdJobs) {
      if (agentSocketId && ioInstance) {
        const targetPrinter = resolveTargetPrinter(routing, job);
        ioInstance.to(agentSocketId).emit('print-job', {
          jobId: job.jobId,
          batchId: job.batchId,
          printerId: job.printerId,
          systemPrinterName: targetPrinter || (printer ? printer.systemPrinterName : undefined) || 'Default Printer Name',
          fileUrl: `${process.env.SERVER_URL || 'http://localhost:5000'}/${job.filePath}`,
          originalFileName: job.originalFileName,
          fileType: job.fileType,
          jobType: job.jobType,
          copies: job.copies,
          pages: job.pagesToPrint,
          colorMode: job.colorMode,
          paperSize: job.paperSize,
          printSide: job.printSide
        });

        job.status = 'SENT_TO_AGENT';
        await job.save();
      }
    }

    // Mark session as used (single-use protection)
    if (session) {
      session.used = true;
      session.usedAt = new Date();
      await session.save();
    }

    res.json({
      success: true,
      batchId,
      jobId: createdJobs[0]?.jobId,
      jobIds: createdJobs.map(j => j.jobId),
      totalJobs: createdJobs.length,
      totalPages: grandTotalPages,
      totalPrice: totalBatchPrice,
      status: createdJobs[0]?.status || 'PENDING',
      jobs: createdJobs
    });
  } catch (err) {
    console.error('[Submit Print Job Error]:', err);
    res.status(500).json({ error: err.message });
  }
};

router.post('/submit', upload.any(), handleSubmitJob);
router.post('/', upload.any(), handleSubmitJob);

// GET /api/print-jobs/batch/:batchId - Get real-time status of all jobs in a batch
router.get('/batch/:batchId', async (req, res) => {
  try {
    const jobs = await PrintJob.find({ batchId: req.params.batchId });
    if (!jobs || jobs.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const totalCost = jobs.reduce((sum, j) => sum + j.totalPrice, 0);
    const allCompleted = jobs.every(j => j.status === 'COMPLETED');
    const anyFailed = jobs.some(j => j.status === 'FAILED');
    const overallStatus = anyFailed ? 'FAILED' : allCompleted ? 'COMPLETED' : 'PRINTING';

    res.json({
      batchId: req.params.batchId,
      status: overallStatus,
      totalCost,
      jobs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/print-jobs/status/:jobId - Get status of a single job
router.get('/status/:jobId', async (req, res) => {
  try {
    const job = await PrintJob.findOne({ jobId: req.params.jobId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;