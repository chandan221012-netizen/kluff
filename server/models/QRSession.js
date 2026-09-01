const mongoose = require('mongoose');

const qrSessionSchema = new mongoose.Schema({
  sessionToken: { type: String, required: true, unique: true, index: true },
  shopId: { type: String, required: true, index: true },
  qrToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  usedAt: { type: Date },
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

// Auto-cleanup sessions older than 24 hours
qrSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('QRSession', qrSessionSchema);
