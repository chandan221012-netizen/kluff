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
const { getConnectedAgent } = require('../sockets/agentSocket');

// Configure disk storage for incoming uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`);
  }
});

// Multer upload middleware with mime-type & size validation
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // Max 20MB
  fileFilter: (req, file, cb) => {
    const allowedMime = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, and PNG are allowed.'));
    }
  }
});

// POST /api/print-jobs/submit - Submit document for printing
router.post('/submit', upload.single('document'), async (req, res) => {
  try {
    const { shopToken, printerId, copies = 1, colorMode = 'bw', pages = 'all' } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate shop existence and status
    const shop = await Shop.findOne({ qrToken: shopToken, isActive: true });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found or inactive' });
    }

    // Validate printer ownership
    const printer = await Printer.findOne({ printerId, shopId: shop.shopId });
    if (!printer) {
      return res.status(404).json({ error: 'Selected printer not found for this shop' });
    }

    // Calculate actual page count server-side for PDFs
    let pageCount = 1;
    if (req.file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(dataBuffer);
      pageCount = pdfData.numpages;
    }

    // Compute pricing strictly on the server (Rate * Pages * Copies)
    const rate = colorMode === 'color' ? shop.pricing.colorPerPage : shop.pricing.bwPerPage;
    const totalPrice = Number(copies) * pageCount * rate;

    const jobId = `JOB_${uuidv4().substring(0, 8).toUpperCase()}`;
    const printJob = new PrintJob({
      jobId,
      shopId: shop.shopId,
      printerId: printer.printerId,
      filePath: req.file.path.replace(/\\/g, '/'),
      originalFileName: req.file.originalname,
      fileType: req.file.mimetype,
      pageCount,
      copies: Number(copies),
      pagesToPrint: pages,
      colorMode,
      totalPrice,
      status: 'PENDING'
    });

    await printJob.save();

    // Check if the Print Agent is online and dispatch immediately
    const agentSocketId = getConnectedAgent(shop.shopId);
    if (agentSocketId) {
      req.app.get('io').to(agentSocketId).emit('print-job', {
        jobId: printJob.jobId,
        printerId: printer.printerId,
        printerName: printer.systemPrinterName,
        fileUrl: `${process.env.SERVER_URL}/${printJob.filePath}`,
        copies: printJob.copies,
        pages: printJob.pagesToPrint,
        colorMode: printJob.colorMode
      });
      printJob.status = 'SENT_TO_AGENT';
      await printJob.save();
    }

    res.json({
      success: true,
      jobId,
      totalPrice,
      pageCount,
      status: printJob.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;