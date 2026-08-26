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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Attach io instance to express app for access inside route controllers
app.set('io', io);

// API Routes
app.use('/api/print-jobs', printJobRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
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