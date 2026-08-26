const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  shopId: { type: String, required: true, ref: 'Shop' },
  deviceName: { type: String, default: 'Main Windows PC' },
  pairingCode: { type: String }, // Temporary 6-digit code for authentication
  deviceTokenHash: { type: String },
  isPaired: { type: Boolean, default: false },
  status: { type: String, enum: ['ONLINE', 'OFFLINE'], default: 'OFFLINE' },
  lastSeenAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);