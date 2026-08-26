const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const PrintJob = require('../models/PrintJob');

const connectedAgents = new Map(); // Maps shopId -> socketId

function initSocket(io) {
  // Authentication middleware for incoming Print Agent connections
 // Authentication middleware for incoming Print Agent connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      let deviceId;

      // Development fallback check for testing
      if (token === 'mock_dev_token_for_testing') {
        deviceId = 'DEV_WIN_001';
      } else {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        deviceId = decoded.deviceId;
      }

      const device = await Device.findOne({ deviceId, isPaired: true });
      if (!device) {
        return next(new Error('Device not found or not paired'));
      }

      socket.deviceId = device.deviceId;
      socket.shopId = device.shopId;
      next();
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
      { status: 'ONLINE', lastSeenAt: new Date() }
    );

    // Allow customers or web dashboards to join a room for job tracking
    socket.on('join-job-room', (jobId) => {
      socket.join(`job_${jobId}`);
    });

    // Automatically dispatch pending jobs upon connection/reconnection
    const pendingJobs = await PrintJob.find({ shopId: socket.shopId, status: 'PENDING' });
    for (const job of pendingJobs) {
      socket.emit('print-job', {
        jobId: job.jobId,
        printerId: job.printerId,
        fileUrl: `${process.env.SERVER_URL}/${job.filePath}`,
        copies: job.copies,
        pages: job.pagesToPrint,
        colorMode: job.colorMode
      });
      job.status = 'SENT_TO_AGENT';
      await job.save();
    }

    // Process status updates sent back by the Print Agent
    socket.on('job-status-update', async (data) => {
      const { jobId, status, errorMessage } = data;
      const job = await PrintJob.findOne({ jobId });
      if (job) {
        job.status = status;
        if (errorMessage) job.errorMessage = errorMessage;
        await job.save();

        // Broadcast status update to the customer's live tracking page
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