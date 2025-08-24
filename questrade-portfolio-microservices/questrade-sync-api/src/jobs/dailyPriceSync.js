const marketDataService = require('../../../questrade-portfolio-api/src/services/marketDataService');
const logger = require('../utils/logger');
const cron = require('node-cron');

class DailyPriceSync {
  /**
   * Run daily price sync
   */
  async runDailySync() {
    logger.info('[DAILY PRICE SYNC] Starting daily price synchronization');
    
    try {
      await marketDataService.syncDailyPrices();
      
      logger.info('[DAILY PRICE SYNC] Daily price sync completed successfully');
      
      return {
        success: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('[DAILY PRICE SYNC] Daily price sync failed:', error);
      throw error;
    }
  }
  
  /**
   * Schedule daily price sync
   */
  scheduleDailySync() {
    // Run at 5:00 PM ET every weekday (after market close)
    cron.schedule('0 17 * * 1-5', async () => {
      logger.info('[DAILY PRICE SYNC] Scheduled daily price sync triggered');
      
      try {
        await this.runDailySync();
      } catch (error) {
        logger.error('[DAILY PRICE SYNC] Scheduled sync failed:', error);
      }
    }, {
      timezone: 'America/New_York'
    });
    
    logger.info('[DAILY PRICE SYNC] Daily price sync scheduled for 5:00 PM ET on weekdays');
  }
  
  /**
   * Run sync once (for manual execution)
   */
  async runOnce() {
    logger.info('[DAILY PRICE SYNC] Running one-time price sync');
    
    try {
      const result = await this.runDailySync();
      
      if (require.main === module) {
        console.log('Daily price sync completed:', result);
        process.exit(0);
      }
      
      return result;
    } catch (error) {
      logger.error('[DAILY PRICE SYNC] One-time sync failed:', error);
      
      if (require.main === module) {
        console.error('Daily price sync failed:', error.message);
        process.exit(1);
      }
      
      throw error;
    }
  }
}

const dailyPriceSync = new DailyPriceSync();

// If running directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--once')) {
    // Connect to database if running standalone
    const database = require('../config/database');
    database.connect().then(() => {
      dailyPriceSync.runOnce();
    });
  } else {
    console.log('Usage: node dailyPriceSync.js --once');
    process.exit(0);
  }
}

module.exports = dailyPriceSync;