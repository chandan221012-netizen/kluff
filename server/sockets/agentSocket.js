const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const PrintJob = require('../models/PrintJob');
const Shop = require('../models/Shop'); // Ensure Shop model is imported

const connectedAgents = new Map(); // Maps shopId -> socketId

function initSocket(io) {
  // Authentication middleware for incoming Print Agent connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
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
        return next(new Error('Authentication failed: Invalid Token or JWT'));
      }
    } catch (err) {
      console.error('Socket auth error:', err.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`Print Agent connected: Device ${socket.deviceId} (Shop: ${socket.shopId})`);
    connectedAgents.set(socket.shopId, socket.id);

    await Device.updateOne(
      { deviceId: socket.deviceId },
      { status: 'ONLINE', lastSeenAt: new Date() },
      { upsert: false }
    );

    socket.on('join-job-room', (jobId) => {
      socket.join(`job_${jobId}`);
    });

    const pendingJobs = await PrintJob.find({ shopId: socket.shopId, status: 'PENDING' });
    for (const job of pendingJobs) {
      socket.emit('print-job', {
        jobId: job.jobId,
        printerId: job.printerId,
        systemPrinterName: job.systemPrinterName || 'Default Printer Name', // Physical printer name e.g. "EPSON L3150 Series"
        fileUrl: `${process.env.SERVER_URL}/${job.filePath}`,
        copies: job.copies,
        pages: job.pagesToPrint,
        colorMode: job.colorMode
      });
      job.status = 'SENT_TO_AGENT';
      await job.save();
    }

    socket.on('job-status-update', async (data) => {
      const { jobId, status, errorMessage } = data;
      const job = await PrintJob.findOne({ jobId });
      if (job) {
        job.status = status;
        if (errorMessage) job.errorMessage = errorMessage;
        await job.save();

        io.to(`job_${jobId}`).emit('customer-status-update', { jobId, status, errorMessage });
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