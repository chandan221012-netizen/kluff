const express = require('express');
const router = express.Router();
const Shop = require('../models/Shop');
const Printer = require('../models/Printer');

const getShopHandler = async (req, res) => {
  try {
    const shop = await Shop.findOne({ qrToken: req.params.token, isActive: true });
    if (!shop) {
      return res.status(404).json({ error: 'Invalid or expired QR code' });
    }

    const printers = await Printer.find({ shopId: shop.shopId, status: 'ONLINE' });

    res.json({
      shopName: shop.name,
      name: shop.name,
      pricing: shop.pricing,
      printers: printers.map(p => ({
        printerId: p.printerId,
        name: p.name,
        isColorSupported: p.isColorSupported
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.get('/public/:token', getShopHandler);
router.get('/:token', getShopHandler);

module.exports = router;