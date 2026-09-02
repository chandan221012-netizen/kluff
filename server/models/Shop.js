const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  shopId: { type: String, required: true, unique: true }, // e.g., SHOP_8F29KX71
  name: { type: String, required: true },
  ownerName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  pricing: {
    bwPerPage: { type: Number, default: 2.0 },
    colorPerPage: { type: Number, default: 10.0 }
  },
  qrToken: { type: String, required: true, unique: true },
  availablePrinters: { type: [String], default: [] },
  printerRouting: {
    defaultPrinter: { type: String, default: '' },
    bwPrinter: { type: String, default: '' },
    colorPrinter: { type: String, default: '' },
    a3Printer: { type: String, default: '' },
    a2Printer: { type: String, default: '' },
    a1Printer: { type: String, default: '' },
    photoPrinter: { type: String, default: '' }
  },
  contactPhone: { type: String, default: '' },
  address: { type: String, default: '' },
  // ── FOUNDER SUBSCRIPTION & REMOTE SOFTWARE CONTROLS ──────────
  subscription: {
    status: { 
      type: String, 
      enum: ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'TRIAL'], 
      default: 'ACTIVE' 
    },
    planName: { 
      type: String, 
      enum: ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE', 'UNLIMITED'], 
      default: 'TRIAL' 
    },
    // ── 24-HOUR / 10-PAGE DUAL EXPIRY TRIAL WATCHDOG ───────────
    trial: {
      isTrial: { type: Boolean, default: true },
      startedAt: { type: Date, default: Date.now },
      expiresAt: { 
        type: Date, 
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // Exactly 24 hours from signup
      },
      maxPages: { type: Number, default: 10 }, // Strictly 10 pages limit
      pagesUsed: { type: Number, default: 0 },
      isExpired: { type: Boolean, default: false }
    },
    // ── HARDWARE DEVICE LOCKING (1 Token = Strictly 1 PC) ───────
    pairedHardwareId: { type: String, default: '' }, // Motherboard UUID
    pairedComputerName: { type: String, default: '' },
    pairedAt: { type: Date },
    startDate: { type: Date, default: Date.now },
    expiresAt: { 
      type: Date, 
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    maxMonthlyPages: { type: Number, default: 1000 },
    currentMonthPages: { type: Number, default: 0 },
    totalLifetimePages: { type: Number, default: 0 },
    autoTerminateOnLimit: { type: Boolean, default: true },
    isRemoteLocked: { type: Boolean, default: false }, // Remote founder software killswitch
    lockReason: { type: String, default: '' }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Shop', shopSchema);