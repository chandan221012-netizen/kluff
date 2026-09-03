require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const seedTestData = require('./utils/seedTestData');
const printJobRoutes = require('./routes/printJob');
const { initSocket } = require('./sockets/agentSocket');
const shopRoutes = require('./routes/shop');
const app = express();
const server = http.createServer(app);
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const { startCleanupCron } = require('./services/cleanupService');
// Initialize Socket.IO with CORS configured for dev/prod clients
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded document files statically
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Attach io instance to express app for access inside route controllers
app.set('io', io);

// API Routes
app.use('/api/session', require('./routes/session'));
app.use('/api/print-jobs', printJobRoutes);
app.use('/api/print', printJobRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/founder', require('./routes/founder'));

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// POST /api/verify-transaction - Instantly confirm payment and broadcast payment_success event
app.post('/api/verify-transaction', (req, res) => {
  const { orderId, sessionId, transactionId, amount, status = 'SUCCESS' } = req.body;
  const room = orderId || sessionId;

  if (!room) {
    return res.status(400).json({ error: 'orderId or sessionId is required' });
  }

  // Instant zero-delay WebSocket push event to customer room
  io.to(`payment_${room}`).emit('payment_success', {
    orderId,
    sessionId,
    transactionId: transactionId || `TXN_${Date.now()}`,
    amount,
    status,
    timestamp: new Date().toISOString()
  });

  console.log(`[Payment] Instant payment_success emitted to payment_${room}`);

  res.json({
    success: true,
    message: 'Payment verified and real-time event dispatched',
    room: `payment_${room}`
  });
});

// Webhook alias for payment providers
app.post('/api/payment-webhook', (req, res) => {
  const { orderId, tr, sessionId, status } = req.body;
  const targetId = orderId || tr || sessionId;

  if (targetId) {
    io.to(`payment_${targetId}`).emit('payment_success', {
      orderId: targetId,
      status: status || 'SUCCESS',
      timestamp: new Date().toISOString()
    });
    console.log(`[Webhook] payment_success emitted to payment_${targetId}`);
  }

  res.json({ received: true });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('[API Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Initialize Socket.IO connection handling
initSocket(io);

// Database Connection & Server Startup
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kluff';


mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB Connection Established');
    await seedTestData(); // Seed initial dev data
    server.listen(PORT, () => {
      console.log(`Backend Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB Connection Error:', err.message);
    process.exit(1);
  });

  // Start background document cleanup background task
startCleanupCron();