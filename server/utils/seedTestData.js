const Shop = require('../models/Shop');
const Device = require('../models/Device');
const Printer = require('../models/Printer');

async function seedTestData() {
  try {
    // Check if test shop exists
    let shop = await Shop.findOne({ shopId: 'SHOP_TEST_001' });
    if (!shop) {
      shop = await Shop.create({
        shopId: 'SHOP_TEST_001',
        name: 'Test Stationery Shop',
        ownerName: 'John Doe',
        email: 'test@shop.com',
        password: 'hashedpassword',
        qrToken: 'test-shop-token-123',
        pricing: { bwPerPage: 2, colorPerPage: 10 }
      });
      console.log('Seeded Test Shop: SHOP_TEST_001 (Token: test-shop-token-123)');
    }

    // Check if test device exists
    let device = await Device.findOne({ deviceId: 'DEV_WIN_001' });
    if (!device) {
      await Device.create({
        deviceId: 'DEV_WIN_001',
        shopId: shop.shopId,
        deviceName: 'Main Windows PC',
        isPaired: true
      });
      console.log('Seeded Test Device: DEV_WIN_001');
    }

    // Check if test printer exists
    let printer = await Printer.findOne({ printerId: 'PRINTER_TEST_001' });
    if (!printer) {
      await Printer.create({
        printerId: 'PRINTER_TEST_001',
        shopId: shop.shopId,
        name: 'Default B&W Printer',
        systemPrinterName: 'HP LaserJet Pro M404' // Change this to your exact printer name // Fallback system printer available on Windows
      });
      console.log('Seeded Test Printer: PRINTER_TEST_001 (Targeting "Microsoft Print to PDF")');
    }
  } catch (err) {
    console.error('Seeding error:', err.message);
  }
}

module.exports = seedTestData;