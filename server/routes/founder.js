const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Shop = require('../models/Shop');
const Device = require('../models/Device');
const PrintJob = require('../models/PrintJob');
const { getConnectedAgent } = require('../sockets/agentSocket');

const FOUNDER_SECRET_KEY = process.env.FOUNDER_KEY || 'kluff_founder_secret_2026';
const JWT_SECRET = process.env.JWT_SECRET || 'fallbacksecret';

// ── AUTH MIDDLEWARE: REQUIRE FOUNDER ROLE ─────────────────────
function requireFounderAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Founder token required' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'FOUNDER') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Founder access required' });
    }
    req.founder = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired founder token' });
  }
}

// ── 1. POST /api/founder/auth - Master Founder Authentication ──
router.post('/auth', async (req, res) => {
  try {
    const { key, email, password } = req.body;
    
    // Authenticate via Master Key or default Founder credentials
    const isMasterKeyValid = key && key === FOUNDER_SECRET_KEY;
    const isDefaultAdmin = email === 'admin@kluff.com' && password === FOUNDER_SECRET_KEY;

    if (!isMasterKeyValid && !isDefaultAdmin) {
      return res.status(401).json({ 
        error: 'INVALID_CREDENTIALS', 
        message: 'Invalid Founder Secret Key or Credentials' 
      });
    }

    const token = jwt.sign(
      { role: 'FOUNDER', email: email || 'founder@kluff.com' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      message: 'Welcome to Founder Master Control'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 2. GET /api/founder/overview - Platform-Wide Analytics ────
router.get('/overview', requireFounderAuth, async (req, res) => {
  try {
    const shops = await Shop.find().lean();
    const totalShops = shops.length;
    const activeShops = shops.filter(s => s.isActive && !s.subscription?.isRemoteLocked).length;
    const lockedShops = shops.filter(s => s.subscription?.isRemoteLocked).length;
    const expiredShops = shops.filter(s => {
      const exp = s.subscription?.expiresAt ? new Date(s.subscription.expiresAt) : null;
      return exp && exp < new Date();
    }).length;

    const devices = await Device.find().lean();
    const totalAgents = devices.length;
    const agentsOnline = devices.filter(d => d.status === 'ONLINE').length;

    // Aggregate Completed Print Jobs
    const completedJobs = await PrintJob.find({ status: 'COMPLETED' }).lean();
    const totalPagesPrinted = completedJobs.reduce((acc, j) => acc + (j.pageCount * (j.copies || 1)), 0);
    const totalGrossRevenue = completedJobs.reduce((acc, j) => acc + (j.totalPrice || 0), 0);
    
    const bwPages = completedJobs
      .filter(j => j.colorMode === 'bw')
      .reduce((acc, j) => acc + (j.pageCount * (j.copies || 1)), 0);
    const colorPages = completedJobs
      .filter(j => j.colorMode === 'color')
      .reduce((acc, j) => acc + (j.pageCount * (j.copies || 1)), 0);

    // Today's Stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayJobs = completedJobs.filter(j => new Date(j.createdAt) >= todayStart);
    const todayPages = todayJobs.reduce((acc, j) => acc + (j.pageCount * (j.copies || 1)), 0);
    const todayRevenue = todayJobs.reduce((acc, j) => acc + (j.totalPrice || 0), 0);

    res.json({
      success: true,
      metrics: {
        totalShops,
        activeShops,
        lockedShops,
        expiredShops,
        totalAgents,
        agentsOnline,
        totalPagesPrinted,
        bwPages,
        colorPages,
        totalGrossRevenue,
        todayPages,
        todayRevenue
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 3. GET /api/founder/shops - Master Shop Directory ─────────
router.get('/shops', requireFounderAuth, async (req, res) => {
  try {
    const shops = await Shop.find().sort({ createdAt: -1 }).lean();
    const devices = await Device.find().lean();
    const printJobs = await PrintJob.find().lean();

    // Enrich each shop with device, print jobs, and subscription data
    const enrichedShops = shops.map(shop => {
      const shopDevices = devices.filter(d => d.shopId === shop.shopId);
      const primaryDevice = shopDevices[0] || null;
      const isAgentConnected = !!getConnectedAgent(shop.shopId);

      const shopJobs = printJobs.filter(j => j.shopId === shop.shopId);
      const completedJobs = shopJobs.filter(j => j.status === 'COMPLETED');
      const totalPages = completedJobs.reduce((acc, j) => acc + (j.pageCount * (j.copies || 1)), 0);
      const totalRevenue = completedJobs.reduce((acc, j) => acc + (j.totalPrice || 0), 0);

      const sub = shop.subscription || {};
      const expDate = sub.expiresAt ? new Date(sub.expiresAt) : null;
      const isExpired = expDate ? expDate < new Date() : false;
      const daysRemaining = expDate ? Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;

      const maxPages = sub.maxMonthlyPages || 0;
      const currentPages = sub.currentMonthPages || 0;
      const isQuotaExceeded = maxPages > 0 && currentPages >= maxPages;

      return {
        _id: shop._id,
        shopId: shop.shopId,
        name: shop.name,
        ownerName: shop.ownerName,
        email: shop.email,
        contactPhone: shop.contactPhone || '',
        address: shop.address || '',
        qrToken: shop.qrToken,
        pricing: shop.pricing || { bwPerPage: 2.0, colorPerPage: 10.0 },
        availablePrinters: shop.availablePrinters || [],
        printerRouting: shop.printerRouting || {},
        isActive: shop.isActive,
        createdAt: shop.createdAt,

        // Live Device Status
        device: primaryDevice ? {
          deviceId: primaryDevice.deviceId,
          deviceName: primaryDevice.deviceName,
          status: isAgentConnected ? 'ONLINE' : (primaryDevice.status || 'OFFLINE'),
          isPaired: primaryDevice.isPaired,
          lastSeenAt: primaryDevice.lastSeenAt
        } : null,
        isAgentConnected,

        // Aggregated Usage & Financials
        analytics: {
          totalJobs: shopJobs.length,
          completedJobs: completedJobs.length,
          totalPagesPrinted: totalPages,
          totalRevenue: totalRevenue
        },

        // Subscription & Quota Controls
        subscription: {
          status: sub.status || 'ACTIVE',
          planName: sub.planName || 'STARTER',
          startDate: sub.startDate,
          expiresAt: sub.expiresAt,
          daysRemaining,
          isExpired,
          maxMonthlyPages: maxPages,
          currentMonthPages: currentPages,
          totalLifetimePages: sub.totalLifetimePages || totalPages,
          autoTerminateOnLimit: sub.autoTerminateOnLimit ?? true,
          isQuotaExceeded,
          isRemoteLocked: sub.isRemoteLocked || false,
          lockReason: sub.lockReason || ''
        }
      };
    });

    res.json({
      success: true,
      total: enrichedShops.length,
      shops: enrichedShops
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 4. GET /api/founder/shops/:shopId - Single Shop Deep Drilldown ──
router.get('/shops/:shopId', requireFounderAuth, async (req, res) => {
  try {
    const shop = await Shop.findOne({ shopId: req.params.shopId }).lean();
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const devices = await Device.find({ shopId: shop.shopId }).lean();
    const recentJobs = await PrintJob.find({ shopId: shop.shopId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      shop,
      devices,
      recentJobs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 5. PUT /api/founder/shops/:shopId/subscription - Manage Plan & Quota ──
router.put('/shops/:shopId/subscription', requireFounderAuth, async (req, res) => {
  try {
    const { planName, expiresAt, maxMonthlyPages, autoTerminateOnLimit, status } = req.body;
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    if (!shop.subscription) shop.subscription = {};
    if (!shop.subscription.trial) shop.subscription.trial = {};

    if (planName) {
      shop.subscription.planName = planName;
      if (planName === 'UNLIMITED') {
        shop.subscription.maxMonthlyPages = 0; // 0 = unlimited
        shop.subscription.trial.isTrial = false;
        shop.subscription.trial.isExpired = false;
        shop.subscription.isRemoteLocked = false;
        shop.subscription.lockReason = '';
        shop.subscription.status = 'ACTIVE';
      } else if (planName !== 'TRIAL') {
        shop.subscription.trial.isTrial = false;
        shop.subscription.trial.isExpired = false;
        shop.subscription.isRemoteLocked = false;
        shop.subscription.lockReason = '';
        shop.subscription.status = 'ACTIVE';
      } else {
        shop.subscription.trial.isTrial = true;
        shop.subscription.trial.pagesUsed = 0;
        shop.subscription.trial.isExpired = false;
        shop.subscription.status = 'TRIAL';
      }
    }

    if (status) {
      shop.subscription.status = status;
      if (status === 'ACTIVE') {
        shop.subscription.isRemoteLocked = false;
        shop.subscription.lockReason = '';
      }
    }

    if (expiresAt) shop.subscription.expiresAt = new Date(expiresAt);
    if (maxMonthlyPages !== undefined) shop.subscription.maxMonthlyPages = Number(maxMonthlyPages);
    if (autoTerminateOnLimit !== undefined) shop.subscription.autoTerminateOnLimit = Boolean(autoTerminateOnLimit);

    // Check if new expiry or quota causes auto-lock
    const isNowExpired = shop.subscription.expiresAt && new Date(shop.subscription.expiresAt) < new Date();
    const isQuotaOver = shop.subscription.maxMonthlyPages > 0 && shop.subscription.currentMonthPages >= shop.subscription.maxMonthlyPages;

    const ioInstance = req.app.get('io');
    const agentSocketId = getConnectedAgent(shop.shopId);

    if ((isNowExpired || isQuotaOver) && shop.subscription.autoTerminateOnLimit) {
      shop.subscription.isRemoteLocked = true;
      shop.subscription.lockReason = isNowExpired ? 'Monthly subscription expired' : 'Monthly page quota exceeded';
      if (ioInstance && agentSocketId) {
        ioInstance.to(agentSocketId).emit('agent-control-command', {
          action: 'LOCK',
          reason: shop.subscription.lockReason
        });
      }
    } else {
      // Active and valid! Automatically unlock shop and notify agent
      shop.subscription.isRemoteLocked = false;
      shop.subscription.lockReason = '';
      if (ioInstance && agentSocketId) {
        ioInstance.to(agentSocketId).emit('agent-control-command', {
          action: 'UNLOCK',
          reason: `Subscription updated to ${shop.subscription.planName}`
        });
      }
    }

    await shop.save();

    res.json({
      success: true,
      message: 'Subscription and quota configuration updated successfully',
      subscription: shop.subscription
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 6. POST /api/founder/shops/:shopId/remote-lock - Instant Killswitch ──
router.post('/shops/:shopId/remote-lock', requireFounderAuth, async (req, res) => {
  try {
    const { lock, reason } = req.body;
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    if (!shop.subscription) shop.subscription = {};
    if (!shop.subscription.trial) shop.subscription.trial = {};

    shop.subscription.isRemoteLocked = Boolean(lock);
    shop.subscription.lockReason = lock ? (reason || 'Terminated remotely by platform founder') : '';

    if (!lock) {
      // Unlocking: If on paid plan or unlimited, ensure trial is deactivated
      if (shop.subscription.planName !== 'TRIAL') {
        shop.subscription.trial.isTrial = false;
        shop.subscription.trial.isExpired = false;
      } else {
        // If on trial and explicitly unlocked, reset trial pages counter
        shop.subscription.trial.pagesUsed = 0;
        shop.subscription.trial.isExpired = false;
      }
      shop.subscription.status = 'ACTIVE';
    }

    await shop.save();

    // Transmit instant control signal to connected Desktop Agent
    const ioInstance = req.app.get('io');
    const agentSocketId = getConnectedAgent(shop.shopId);

    if (ioInstance && agentSocketId) {
      ioInstance.to(agentSocketId).emit('agent-control-command', {
        action: lock ? 'LOCK' : 'UNLOCK',
        reason: shop.subscription.lockReason || 'Resumed by platform administration'
      });
    }

    res.json({
      success: true,
      isRemoteLocked: shop.subscription.isRemoteLocked,
      lockReason: shop.subscription.lockReason,
      message: lock ? 'Remote software killswitch ACTIVATED: Print Agent locked' : 'Remote software killswitch DEACTIVATED: Print Agent resumed'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 7. POST /api/founder/shops/:shopId/reset-quota - Reset Monthly Counter ──
router.post('/shops/:shopId/reset-quota', requireFounderAuth, async (req, res) => {
  try {
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    if (!shop.subscription) shop.subscription = {};
    if (!shop.subscription.trial) shop.subscription.trial = {};

    shop.subscription.currentMonthPages = 0;
    shop.subscription.trial.pagesUsed = 0;
    shop.subscription.trial.isExpired = false;
    shop.subscription.isRemoteLocked = false;
    shop.subscription.lockReason = '';

    const ioInstance = req.app.get('io');
    const agentSocketId = getConnectedAgent(shop.shopId);
    if (ioInstance && agentSocketId) {
      ioInstance.to(agentSocketId).emit('agent-control-command', {
        action: 'UNLOCK',
        reason: 'Monthly quota renewed'
      });
    }

    await shop.save();

    res.json({
      success: true,
      message: 'Monthly quota counter reset to 0 pages'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 8. PUT /api/founder/shops/:shopId/details - Update Shop Metadata ──
router.put('/shops/:shopId/details', requireFounderAuth, async (req, res) => {
  try {
    const { name, ownerName, email, contactPhone, address, bwPerPage, colorPerPage, isActive } = req.body;
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    if (name) shop.name = name;
    if (ownerName) shop.ownerName = ownerName;
    if (email) shop.email = email;
    if (contactPhone !== undefined) shop.contactPhone = contactPhone;
    if (address !== undefined) shop.address = address;
    if (isActive !== undefined) shop.isActive = Boolean(isActive);

    if (bwPerPage !== undefined || colorPerPage !== undefined) {
      if (!shop.pricing) shop.pricing = {};
      if (bwPerPage !== undefined) shop.pricing.bwPerPage = Number(bwPerPage);
      if (colorPerPage !== undefined) shop.pricing.colorPerPage = Number(colorPerPage);
    }

    await shop.save();

    res.json({
      success: true,
      message: 'Shop details and pricing updated successfully',
      shop
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 9. POST /api/founder/shops/:shopId/reset-token - Regenerate QR Token ──
router.post('/shops/:shopId/reset-token', requireFounderAuth, async (req, res) => {
  try {
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const newToken = `SHOP_QR_${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    shop.qrToken = newToken;
    await shop.save();

    res.json({
      success: true,
      message: 'New QR Token generated successfully',
      qrToken: newToken
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
