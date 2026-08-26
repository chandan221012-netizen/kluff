const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Shop = require('../models/Shop');
const Printer = require('../models/Printer');
const PrintJob = require('../models/PrintJob');

// Authentication Middleware for Protected Routes
const authenticateShop = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. Token missing.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.shopId = decoded.shopId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// GET /api/dashboard/stats - Fetch shop stats and pricing
router.get('/stats', authenticateShop, async (req, res) => {
  try {
    const shop = await Shop.findOne({ shopId: req.shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const totalJobs = await PrintJob.countDocuments({ shopId: req.shopId });
    const completedJobs = await PrintJob.countDocuments({ shopId: req.shopId, status: 'COMPLETED' });
    
    // Revenue calculation
    const revenueData = await PrintJob.aggregate([
      { $match: { shopId: req.shopId, status: 'COMPLETED' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' } } }
    ]);

    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;
    const printers = await Printer.find({ shopId: req.shopId });

    res.json({
      shopName: shop.name,
      qrToken: shop.qrToken,
      pricing: shop.pricing,
      totalJobs,
      completedJobs,
      totalRevenue,
      printers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboard/pricing - Update per-page pricing settings
router.post('/pricing', authenticateShop, async (req, res) => {
  try {
    const { bwPerPage, colorPerPage } = req.body;

    const shop = await Shop.findOneAndUpdate(
      { shopId: req.shopId },
      { 'pricing.bwPerPage': Number(bwPerPage), 'pricing.colorPerPage': Number(colorPerPage) },
      { new: true }
    );

    res.json({ success: true, pricing: shop.pricing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboard/printers - Add a physical system printer to shop profile
router.post('/printers', authenticateShop, async (req, res) => {
  try {
    const { name, systemPrinterName, isColorSupported } = req.body;
    const printerId = `PRINTER_${uuidv4().substring(0, 8).toUpperCase()}`;

    const printer = new Printer({
      printerId,
      shopId: req.shopId,
      name,
      systemPrinterName,
      isColorSupported: Boolean(isColorSupported)
    });

    await printer.save();
    res.status(201).json({ success: true, printer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;