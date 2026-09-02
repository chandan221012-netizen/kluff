const express = require('express');
const router = express.Router();
const Shop = require('../models/Shop');
const Printer = require('../models/Printer');
const Device = require('../models/Device');

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

// ── TERMINAL ACTIVATION (Hardware Lock & 24h/10-page Trial Check) ────────────
router.post('/activate-terminal', async (req, res) => {
  try {
    const { token, hardwareId, computerName, deviceName } = req.body;

    if (!token || !token.trim()) {
      return res.status(400).json({ error: 'TOKEN_REQUIRED', message: 'Shop Activation Token is required' });
    }

    if (!hardwareId || !hardwareId.trim()) {
      return res.status(400).json({ error: 'HARDWARE_ID_REQUIRED', message: 'Machine hardware ID could not be identified' });
    }

    const cleanToken = token.trim();
    const shop = await Shop.findOne({
      $or: [
        { qrToken: cleanToken },
        { shopId: cleanToken }
      ],
      isActive: true
    });

    if (!shop) {
      return res.status(404).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid Activation Token. Please check your Shop Dashboard and try again.'
      });
    }

    if (!shop.subscription) shop.subscription = {};
    const sub = shop.subscription;

    // 1. HARDWARE DEVICE LOCKING CHECK (1 Token = Strictly 1 PC)
    if (sub.pairedHardwareId && sub.pairedHardwareId !== hardwareId) {
      return res.status(403).json({
        error: 'HARDWARE_MISMATCH',
        message: `This token is already linked to another PC (${sub.pairedComputerName || 'Registered Computer'}). Each shop counter PC requires its own terminal license. Please unlink your old PC from your Shop Dashboard first.`
      });
    }

    // 2. TRIAL & SUBSCRIPTION WATCHDOG CHECK
    if (sub.isRemoteLocked) {
      return res.status(403).json({
        error: 'TERMINAL_LOCKED',
        message: sub.lockReason || 'This shop terminal has been locked by platform administration.'
      });
    }

    const trial = sub.trial || {};
    const isTrialExpired = trial.isTrial && (
      trial.isExpired ||
      trial.pagesUsed >= (trial.maxPages || 10) ||
      (trial.expiresAt && new Date(trial.expiresAt) < new Date())
    );

    if (isTrialExpired) {
      return res.status(403).json({
        error: 'TRIAL_EXPIRED',
        message: 'Your 24-hour / 10-page free trial has completed. Please activate a monthly plan from your Shop Dashboard.'
      });
    }

    // 3. PAIR HARDWARE TO THIS SHOP
    if (!sub.pairedHardwareId) {
      sub.pairedHardwareId = hardwareId;
      sub.pairedComputerName = computerName || 'Shop Windows PC';
      sub.pairedAt = new Date();
      await shop.save();
    }

    // Update Device record
    await Device.findOneAndUpdate(
      { shopId: shop.shopId },
      {
        deviceId: `DEV_${shop.shopId}`,
        shopId: shop.shopId,
        deviceName: deviceName || computerName || 'Shop Counter PC',
        hardwareId,
        computerName: computerName || '',
        isPaired: true,
        status: 'ONLINE',
        lastSeenAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      shopId: shop.shopId,
      shopName: shop.name,
      qrToken: shop.qrToken,
      pairedHardwareId: sub.pairedHardwareId,
      planName: sub.planName || 'TRIAL',
      trial: {
        isTrial: trial.isTrial ?? true,
        pagesRemaining: Math.max(0, (trial.maxPages || 10) - (trial.pagesUsed || 0)),
        maxPages: trial.maxPages || 10,
        expiresAt: trial.expiresAt
      },
      message: 'Terminal activated and securely locked to this PC.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UNLINK TERMINAL (Hardware Lock Release) ──────────────────────────────────
router.post('/unlink-terminal', async (req, res) => {
  try {
    const { shopId } = req.body;
    if (!shopId) return res.status(400).json({ error: 'shopId is required' });

    const shop = await Shop.findOne({ shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    if (shop.subscription) {
      shop.subscription.pairedHardwareId = '';
      shop.subscription.pairedComputerName = '';
      shop.subscription.pairedAt = null;
      await shop.save();
    }

    await Device.updateOne({ shopId }, { isPaired: false, status: 'OFFLINE' });

    res.json({
      success: true,
      message: 'Hardware lock released. You can now link your new computer.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;