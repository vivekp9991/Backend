const syncManager = require('../services/syncManager');
const logger = require('../utils/logger');
const config = require('../config/environment');

class ScheduledSync {
  async runScheduledSync() {
    logger.info('Starting scheduled sync job');
    
    try {
      const results = await syncManager.syncAll('scheduled');
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      logger.info(`Scheduled sync completed: ${successful} successful, ${failed} failed`);
      
      return {
        success: true,
        results,
        summary: {
          total: results.length,
          successful,
          failed
        }
      };
      
    } catch (error) {
      logger.error('Scheduled sync failed:', error);
      throw error;
    }
  }
  
  // Run sync once (for manual execution)
  async runOnce() {
    logger.info('Running one-time sync');
    
    // Connect to database if running standalone
    if (require.main === module) {
      const database = require('../config/database');
      await database.connect();
    }
    
    try {
      const result = await this.runScheduledSync();
      
      if (require.main === module) {
        console.log('Sync completed:', result.summary);
        process.exit(0);
      }
      
      return result;
      
    } catch (error) {
      logger.error('One-time sync failed:', error);
      
      if (require.main === module) {
        console.error('Sync failed:', error.message);
        process.exit(1);
      }
      
      throw error;
    }
  }
}

const scheduledSync = new ScheduledSync();

// If running directly (npm run sync:once)
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--once')) {
    scheduledSync.runOnce();
  } else {
    console.log('Usage: node scheduledSync.js --once');
    process.exit(0);
  }
}

module.exports = scheduledSync;