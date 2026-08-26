const mongoose = require('mongoose');

const printerSchema = new mongoose.Schema({
  printerId: { type: String, required: true, unique: true },
  shopId: { type: String, required: true, ref: 'Shop' },
  name: { type: String, required: true }, // Display Name (e.g. Counter B&W)
  systemPrinterName: { type: String, required: true }, // Windows OS Name (e.g. HP LaserJet M404)
  isColorSupported: { type: Boolean, default: false },
  status: { type: String, enum: ['ONLINE', 'OFFLINE'], default: 'ONLINE' }
}, { timestamps: true });

module.exports = mongoose.model('Printer', printerSchema);