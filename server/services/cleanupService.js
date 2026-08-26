const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const PrintJob = require('../models/PrintJob');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Scheduled task: Runs every 15 minutes
const startCleanupCron = () => {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[CRON] Running automated document cleanup...');

    try {
      const files = fs.readdirSync(UPLOADS_DIR);
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;

      for (const file of files) {
        if (file === '.gitkeep') continue;

        const filePath = path.join(UPLOADS_DIR, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        // Find associated job record in database
        const job = await PrintJob.findOne({ filePath: file });

        // Delete if job is COMPLETED/FAILED OR file is older than 1 hour
        const isJobDone = job && (job.status === 'COMPLETED' || job.status === 'FAILED');
        const isExpired = fileAge > ONE_HOUR;

        if (isJobDone || isExpired) {
          fs.unlinkSync(filePath);
          console.log(`[CRON] Deleted file: ${file}`);
        }
      }
    } catch (err) {
      console.error('[CRON Error] Failed during document cleanup:', err.message);
    }
  });
};

module.exports = { startCleanupCron };