const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const PrintJob = require('../models/PrintJob');
const Shop = require('../models/Shop'); // Ensure Shop model is imported

const connectedAgents = new Map(); // Maps shopId -> socketId

function getShopQuery(shopId) {
  if (!shopId) return { shopId: 'INVALID' };
  return mongoose.Types.ObjectId.isValid(shopId) 
    ? { $or: [{ shopId }, { _id: shopId }] }
    : { shopId };
}

function resolveTargetPrinter(routing, job) {
  if (!routing) return job?.systemPrinterName || '';
  const ps = (job?.paperSize || '').toUpperCase();
  if (ps === 'A1' && routing.a1Printer) return routing.a1Printer;
  if (ps === 'A2' && routing.a2Printer) return routing.a2Printer;
  if (ps === 'A3' && routing.a3Printer) return routing.a3Printer;
  if (job?.isPhoto && routing.photoPrinter) return routing.photoPrinter;
  if (job?.colorMode === 'color' && routing.colorPrinter) return routing.colorPrinter;
  if (job?.colorMode === 'bw' && routing.bwPrinter) return routing.bwPrinter;
  return routing.defaultPrinter || job?.systemPrinterName || '';
}

function initSocket(io) {
  // Authentication middleware: Authenticate print agents if token provided, allow customer connections for payment rooms
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      // If no token, check if client is a customer (browser client)
      if (!token) {
        socket.isCustomer = true;
        return next();
      }

      // 1. Development fallback check
      if (token === 'mock_dev_token_for_testing') {
        const device = await Device.findOne({ deviceId: 'DEV_WIN_001', isPaired: true });
        if (!device) return next(new Error('Device not found or not paired'));
        socket.deviceId = device.deviceId;
        socket.shopId = device.shopId;
        return next();
      }

      // 2. Shop QR Token check (UUID/raw string match)
      const shop = await Shop.findOne({ qrToken: token });
      if (shop) {
        socket.shopId = shop.shopId || shop._id.toString();
        socket.shopDbId = shop._id ? shop._id.toString() : null;
        // Fallback or assign active paired device for this shop
        const device = await Device.findOne({ shopId: socket.shopId, isPaired: true });
        socket.deviceId = device ? device.deviceId : `AGENT_${socket.shopId}`;
        return next();
      }

      // 3. JWT verification fallback
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const device = await Device.findOne({ deviceId: decoded.deviceId, isPaired: true });
        if (!device) return next(new Error('Device not found or not paired'));

        socket.deviceId = device.deviceId;
        socket.shopId = device.shopId;
        return next();
      } catch (jwtErr) {
        // If JWT fails but might be customer, let through as customer
        socket.isCustomer = true;
        return next();
      }
    } catch (err) {
      console.error('Socket auth error:', err.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    if (!socket.isCustomer && socket.deviceId) {
      console.log(`Print Agent connected: Device ${socket.deviceId} (Shop: ${socket.shopId})`);
      connectedAgents.set(socket.shopId, socket.id);
      if (socket.shopDbId) connectedAgents.set(socket.shopDbId, socket.id);
      socket.join(`shop_${socket.shopId}`);

      await Device.updateOne(
        { deviceId: socket.deviceId },
        { status: 'ONLINE', lastSeenAt: new Date() },
        { upsert: false }
      );

      // Notify dashboard that agent is online
      io.to(`shop_${socket.shopId}`).emit('agent-status-update', {
        status: 'ONLINE',
        shopId: socket.shopId,
        deviceId: socket.deviceId
      });

      // Founder Software Controls Check upon Connection
      const currentShop = await Shop.findOne(getShopQuery(socket.shopId));
      if (currentShop) {
        const sub = currentShop.subscription || {};
        const isExp = sub.expiresAt && new Date(sub.expiresAt) < new Date();
        const isQuota = sub.maxMonthlyPages > 0 && sub.currentMonthPages >= sub.maxMonthlyPages;
        const shouldLock = sub.isRemoteLocked || ((isExp || isQuota) && (sub.autoTerminateOnLimit ?? true));

        if (shouldLock) {
          const reason = sub.lockReason || (isExp ? 'Monthly subscription expired' : isQuota ? 'Monthly page quota exceeded' : 'Locked by platform administrator');
          socket.emit('agent-control-command', { action: 'LOCK', reason });
        }
      }

      // Auto-flush any pending print jobs for this shop (e.g. while agent was asleep or reconnecting)
      try {
        const pendingJobs = await PrintJob.find({
          shopId: socket.shopId,
          status: 'PENDING'
        }).sort({ createdAt: 1 });

        if (pendingJobs.length > 0) {
          console.log(`[AgentSync] Found ${pendingJobs.length} pending job(s) for shop ${socket.shopId}. Flushing to agent...`);
          const routing = currentShop?.printerRouting || {};
          for (const job of pendingJobs) {
            const targetPrinter = resolveTargetPrinter(routing, job);
            socket.emit('print-job', {
              jobId: job.jobId,
              batchId: job.batchId,
              printerId: job.printerId,
              systemPrinterName: targetPrinter || 'Default Printer Name',
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
      } catch (syncErr) {
        console.error('[AgentSync] Failed to flush pending jobs:', syncErr.message);
      }
    }

    // Active heartbeat ping-pong to keep router NAT tables open 24/7
    socket.on('agent-ping', (d) => {
      console.log(`[AgentPing] Received ping from socket ${socket.id}`);
      socket.emit('agent-pong', { serverTime: Date.now() });
    });

    // Dashboard subscribes to shop room for live agent updates
    socket.on('join-shop-room', (shopId) => {
      if (shopId) {
        socket.join(`shop_${shopId}`);
      }
    });

    // Customer binds to payment room using orderTrId or sessionId
    socket.on('join-payment-room', ({ orderId, sessionId }) => {
      const room = orderId || sessionId;
      if (room) {
        socket.join(`payment_${room}`);
        console.log(`[Socket] Customer joined payment room: payment_${room}`);
      }
    });

    socket.on('join-job-room', (jobId) => {
      socket.join(`job_${jobId}`);
    });

    socket.on('join-batch-room', (batchId) => {
      socket.join(`batch_${batchId}`);
    });

    // ── Agent reports discovered Windows printers ──
    socket.on('agent-report-printers', async (data) => {
      try {
        const printers = Array.isArray(data) ? data : (data?.printers || []);
        console.log(`[Agent] Reported ${printers.length} printer(s) for shop ${socket.shopId}`);

        await Shop.updateOne(
          getShopQuery(socket.shopId),
          { availablePrinters: printers }
        );

        // Live broadcast to Shop Dashboard
        io.to(`shop_${socket.shopId}`).emit('agent-printers-updated', {
          printers,
          shopId: socket.shopId
        });
      } catch (err) {
        console.error('Error saving reported printers:', err.message);
      }
    });

    // ── Helper: dispatch all pending & stale SENT_TO_AGENT jobs to this agent ──
    async function dispatchPendingJobs() {
      const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
      const staleDate = new Date(Date.now() - STALE_THRESHOLD_MS);

      const shop = await Shop.findOne(getShopQuery(socket.shopId));
      const routing = shop?.printerRouting || {};

      // Find PENDING jobs + SENT_TO_AGENT jobs older than 2 minutes (never confirmed)
      const missedJobs = await PrintJob.find({
        shopId: socket.shopId,
        $or: [
          { status: 'PENDING' },
          { status: 'SENT_TO_AGENT', updatedAt: { $lt: staleDate } }
        ]
      });

      if (missedJobs.length > 0) {
        console.log(`[Agent Recovery] Dispatching ${missedJobs.length} pending/stale job(s) to ${socket.deviceId}`);
      }

      for (const job of missedJobs) {
        const targetPrinter = resolveTargetPrinter(routing, job);
        socket.emit('print-job', {
          jobId: job.jobId,
          batchId: job.batchId,
          printerId: job.printerId,
          systemPrinterName: targetPrinter || job.systemPrinterName || 'Default Printer Name',
          filePath: job.filePath,
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

    // Dispatch pending jobs on initial connection
    await dispatchPendingJobs();

    // ── Agent explicitly requests missed jobs (after reconnect / startup recovery) ──
    socket.on('agent-request-pending-jobs', async () => {
      console.log(`[Agent Request] ${socket.deviceId} requested pending jobs`);
      await dispatchPendingJobs();
    });

    socket.on('job-status-update', async (data) => {
      const { jobId, status, errorMessage } = data;
      const job = await PrintJob.findOne({ jobId });
      if (job) {
        job.status = status;
        if (errorMessage) job.errorMessage = errorMessage;
        await job.save();

        if (status === 'COMPLETED') {
          try {
            const pagesPrinted = (job.pageCount || 1) * (job.copies || 1);
            const shop = await Shop.findOne(getShopQuery(job.shopId));
            if (shop) {
              if (!shop.subscription) shop.subscription = {};
              shop.subscription.currentMonthPages = (shop.subscription.currentMonthPages || 0) + pagesPrinted;
              shop.subscription.totalLifetimePages = (shop.subscription.totalLifetimePages || 0) + pagesPrinted;

              // 24-Hour / 10-Page Dual Expiry Watchdog Tracking (Applies strictly to TRIAL plan only)
              if (!shop.subscription.trial) shop.subscription.trial = {};
              const trial = shop.subscription.trial;
              const isTrialPlan = (shop.subscription.planName === 'TRIAL' || shop.subscription.status === 'TRIAL');
              if (isTrialPlan && trial.isTrial) {
                trial.pagesUsed = (trial.pagesUsed || 0) + pagesPrinted;
                const isTrialOverPages = trial.pagesUsed >= (trial.maxPages || 10);
                const isTrialOverHours = trial.expiresAt && new Date(trial.expiresAt) < new Date();
                if (isTrialOverPages || isTrialOverHours) {
                  trial.isExpired = true;
                  shop.subscription.isRemoteLocked = true;
                  shop.subscription.lockReason = isTrialOverPages
                    ? 'Free trial completed: 10 pages printed'
                    : 'Free trial completed: 24 hours expired';
                  socket.emit('agent-control-command', {
                    action: 'LOCK',
                    reason: shop.subscription.lockReason
                  });
                }
              }

              // Auto-lock if quota reached and autoTerminateOnLimit enabled
              const maxP = shop.subscription.maxMonthlyPages || 0;
              if (maxP > 0 && shop.subscription.currentMonthPages >= maxP && (shop.subscription.autoTerminateOnLimit ?? true)) {
                shop.subscription.isRemoteLocked = true;
                shop.subscription.lockReason = `Monthly quota of ${maxP} pages reached`;
                socket.emit('agent-control-command', {
                  action: 'LOCK',
                  reason: shop.subscription.lockReason
                });
              }
              await shop.save();
            }
          } catch (statErr) {
            console.error('[Usage Tracking Error]:', statErr.message);
          }
        }

        io.to(`job_${jobId}`).emit('customer-status-update', { jobId, status, errorMessage });
        if (job.batchId) {
          io.to(`batch_${job.batchId}`).emit('batch-status-update', { jobId, batchId: job.batchId, status, errorMessage });
        }
      }
    });

    socket.on('disconnect', async () => {
      if (!socket.isCustomer && socket.deviceId) {
        console.log(`Print Agent disconnected: Device ${socket.deviceId}`);
        connectedAgents.delete(socket.shopId);
        if (socket.shopDbId) connectedAgents.delete(socket.shopDbId);
        await Device.updateOne(
          { deviceId: socket.deviceId },
          { status: 'OFFLINE' }
        );

        // Notify dashboard that agent is offline
        io.to(`shop_${socket.shopId}`).emit('agent-status-update', {
          status: 'OFFLINE',
          shopId: socket.shopId,
          deviceId: socket.deviceId
        });
      }
    });
  });
}

function getConnectedAgent(shopId) {
  if (!shopId) return null;
  return connectedAgents.get(shopId) || connectedAgents.get(shopId.toString()) || null;
}

module.exports = { initSocket, getConnectedAgent, resolveTargetPrinter };