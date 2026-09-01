const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Shop = require('../models/Shop');
const Printer = require('../models/Printer');
const QRSession = require('../models/QRSession');

const SESSION_TTL_MS = 7 * 60 * 1000; // Strict 7 minutes TTL

/**
 * POST /api/session/init
 * Issues a temporary 7-minute session token upon scanning the counter QR code.
 */
router.post('/init', async (req, res) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken) {
      return res.status(400).json({ error: 'Shop QR token is required' });
    }

    const shop = await Shop.findOne({ qrToken, isActive: true });
    if (!shop) {
      return res.status(404).json({
        error: 'SHOP_NOT_FOUND',
        message: 'Invalid or inactive shop QR code. Please scan a valid shop QR code.'
      });
    }

    const sessionToken = `SES_${uuidv4().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const session = new QRSession({
      sessionToken,
      shopId: shop.shopId,
      qrToken: shop.qrToken,
      expiresAt,
      used: false,
      lastActive: new Date()
    });
    await session.save();

    const printers = await Printer.find({ shopId: shop.shopId, status: 'ONLINE' });

    res.json({
      success: true,
      sessionToken,
      expiresAt,
      ttlSeconds: Math.floor(SESSION_TTL_MS / 1000),
      shop: {
        shopName: shop.name,
        name: shop.name,
        pricing: shop.pricing,
        printers: printers.map(p => ({
          printerId: p.printerId,
          name: p.name,
          isColorSupported: p.isColorSupported
        }))
      }
    });
  } catch (err) {
    console.error('Session init error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/session/validate/:sessionToken
 * Validates a session token. Blocks old bookmarked links, expired sessions, and already used sessions.
 */
router.get('/validate/:sessionToken', async (req, res) => {
  try {
    const { sessionToken } = req.params;
    const session = await QRSession.findOne({ sessionToken });

    if (!session) {
      return res.status(403).json({
        error: 'SESSION_EXPIRED',
        message: 'Session expired or inactive. Please scan the QR code at the shop counter to print.'
      });
    }

    if (session.used) {
      return res.status(403).json({
        error: 'SESSION_EXPIRED',
        message: 'Session expired or inactive. Please scan the QR code at the shop counter to print.'
      });
    }

    const now = new Date();
    if (now > session.expiresAt) {
      return res.status(403).json({
        error: 'SESSION_EXPIRED',
        message: 'Session expired or inactive. Please scan the QR code at the shop counter to print.'
      });
    }

    // Inactivity check: if no activity for 7 minutes
    if (now.getTime() - new Date(session.lastActive).getTime() > SESSION_TTL_MS) {
      return res.status(403).json({
        error: 'SESSION_EXPIRED',
        message: 'Session expired or inactive. Please scan the QR code at the shop counter to print.'
      });
    }

    // Update lastActive
    session.lastActive = now;
    await session.save();

    const shop = await Shop.findOne({ shopId: session.shopId, isActive: true });
    if (!shop) {
      return res.status(404).json({
        error: 'SHOP_INACTIVE',
        message: 'This shop is currently inactive.'
      });
    }

    const printers = await Printer.find({ shopId: shop.shopId, status: 'ONLINE' });
    const remainingSeconds = Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000));

    res.json({
      success: true,
      valid: true,
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
      remainingSeconds,
      shop: {
        shopName: shop.name,
        name: shop.name,
        pricing: shop.pricing,
        printers: printers.map(p => ({
          printerId: p.printerId,
          name: p.name,
          isColorSupported: p.isColorSupported
        }))
      }
    });
  } catch (err) {
    console.error('Session validate error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/session/log
 * Prints client/mobile diagnostic logs to backend terminal
 */
router.post('/log', (req, res) => {
  const { event, details } = req.body;
  console.log(`\x1b[36m[MOBILE CLIENT LOG]\x1b[0m ${event}:`, details || '');
  res.json({ ok: true });
});

module.exports = router;
