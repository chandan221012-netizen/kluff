const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Shop = require('../models/Shop');
const Device = require('../models/Device');

// POST /api/auth/register - Register a new shop owner
router.post('/register', async (req, res) => {
  try {
    const { name, ownerName, email, password } = req.body;

    if (!name || !ownerName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingShop = await Shop.findOne({ email });
    if (existingShop) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const shopId = `SHOP_${uuidv4().substring(0, 8).toUpperCase()}`;
    const qrToken = uuidv4();

    const shop = new Shop({
      shopId,
      name,
      ownerName,
      email,
      password: hashedPassword,
      qrToken
    });

    await shop.save();

    const token = jwt.sign(
      { shopId: shop.shopId, email: shop.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      shop: {
        shopId: shop.shopId,
        name: shop.name,
        qrToken: shop.qrToken
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login - Authenticate shop owner
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const shop = await Shop.findOne({ email });
    if (!shop) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, shop.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { shopId: shop.shopId, email: shop.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      shop: {
        shopId: shop.shopId,
        name: shop.name,
        qrToken: shop.qrToken
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/generate-device-token - Generate Print Agent Auth Token for pairing
router.post('/generate-device-token', async (req, res) => {
  try {
    const { shopId, deviceName } = req.body;
    const deviceId = `DEV_${uuidv4().substring(0, 8).toUpperCase()}`;

    // Create paired device record
    const device = new Device({
      deviceId,
      shopId,
      deviceName: deviceName || 'Windows Print Agent',
      isPaired: true
    });
    await device.save();

    // Sign device JWT
    const deviceToken = jwt.sign(
      { deviceId, shopId },
      process.env.JWT_SECRET
    );

    res.json({ success: true, deviceId, deviceToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;