const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const PrintJob = require('../models/PrintJob');
const Shop = require('../models/Shop'); // Ensure Shop model is imported

const connectedAgents = new Map(); // Maps shopId -> socketId

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

      await Device.updateOne(
        { deviceId: socket.deviceId },
        { status: 'ONLINE', lastSeenAt: new Date() },
        { upsert: false }
      );
    }

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

    // ── Helper: dispatch all pending & stale SENT_TO_AGENT jobs to this agent ──
    async function dispatchPendingJobs() {
      const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
      const staleDate = new Date(Date.now() - STALE_THRESHOLD_MS);

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
        socket.emit('print-job', {
          jobId: job.jobId,
          batchId: job.batchId,
          printerId: job.printerId,
          systemPrinterName: job.systemPrinterName || 'Default Printer Name',
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

        io.to(`job_${jobId}`).emit('customer-status-update', { jobId, status, errorMessage });
        if (job.batchId) {
          io.to(`batch_${job.batchId}`).emit('batch-status-update', { jobId, batchId: job.batchId, status, errorMessage });
        }
      }
    });

    socket.on('disconnect', async () => {
      console.log(`Print Agent disconnected: Device ${socket.deviceId}`);
      connectedAgents.delete(socket.shopId);
      await Device.updateOne(
        { deviceId: socket.deviceId },
        { status: 'OFFLINE' }
      );
    });
  });
}

function getConnectedAgent(shopId) {
  return connectedAgents.get(shopId);
}

module.exports = { initSocket, getConnectedAgent };