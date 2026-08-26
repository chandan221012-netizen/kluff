const mongoose = require('mongoose');

const printJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  shopId: { type: String, required: true, ref: 'Shop' },
  printerId: { type: String, required: true, ref: 'Printer' },
  filePath: { type: String, required: true },
  originalFileName: { type: String, required: true },
  fileType: { type: String, required: true },
  pageCount: { type: Number, required: true },
  copies: { type: Number, default: 1 },
  pagesToPrint: { type: String, default: 'all' },
  colorMode: { type: String, enum: ['bw', 'color'], default: 'bw' },
  totalPrice: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'SENT_TO_AGENT', 'PRINTING', 'COMPLETED', 'FAILED', 'CANCELLED'], 
    default: 'PENDING' 
  },
  errorMessage: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('PrintJob', printJobSchema);