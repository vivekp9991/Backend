const Bull = require('bull');
const config = require('../config/environment');
const logger = require('../utils/logger');
const alertMonitor = require('../services/alertMonitor');
const AlertRule = require('../models/AlertRule');

// Create job queue
const alertQueue = new Bull('alert-checking', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password
  }
});

// Job processors
alertQueue.process('check-rule', async (job) => {
  const { ruleId } = job.data;
  
  try {
    const rule = await AlertRule.findById(ruleId);
    if (!rule || !rule.enabled) {
      logger.warn(`Rule ${ruleId} not found or disabled`);
      return { skipped: true };
    }

    await alertMonitor.evaluateRule(rule);
    
    return {
      success: true,
      ruleId,
      timestamp: new Date()
    };
  } catch (error) {
    logger.error(`Failed to process rule ${ruleId}:`, error);
    throw error;
  }
});

alertQueue.process('batch-check', async (job) => {
  const { ruleType } = job.data;
  
  try {
    const rules = await AlertRule.find({
      type: ruleType,
      enabled: true
    });

    const results = [];
    for (const rule of rules) {
      try {
        await alertMonitor.evaluateRule(rule);
        results.push({ ruleId: rule._id, success: true });
      } catch (error) {
        results.push({ ruleId: rule._id, success: false, error: error.message });
      }
    }

    return {
      type: ruleType,
      totalRules: rules.length,
      results
    };
  } catch (error) {
    logger.error(`Failed to batch check ${ruleType}:`, error);
    throw error;
  }
});

// Schedule recurring jobs
async function scheduleRecurringJobs() {
  try {
    // Check price alerts every minute during market hours
    await alertQueue.add(
      'batch-check',
      { ruleType: 'price_change' },
      {
        repeat: {
          cron: '* 9-16 * * 1-5',
          tz: 'America/Toronto'
        },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    );

    // Check portfolio alerts every 5 minutes
    await alertQueue.add(
      'batch-check',
      { ruleType: 'portfolio_value' },
      {
        repeat: {
          cron: '*/5 * * * *'
        },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    );

    // Check volume alerts every 2 minutes during market hours
    await alertQueue.add(
      'batch-check',
      { ruleType: 'volume_spike' },
      {
        repeat: {
          cron: '*/2 9-16 * * 1-5',
          tz: 'America/Toronto'
        },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    );

    // Check technical indicators every 15 minutes
    await alertQueue.add(
      'batch-check',
      { ruleType: 'technical_indicator' },
      {
        repeat: {
          cron: '*/15 * * * *'
        },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    );

    logger.info('Scheduled recurring alert checking jobs');
  } catch (error) {
    logger.error('Failed to schedule recurring jobs:', error);
  }
}

// Event handlers
alertQueue.on('completed', (job, result) => {
  logger.debug(`Job ${job.id} completed`, result);
});

alertQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed:`, err);
});

alertQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`);
});

// Utility functions
async function addAlertCheck(ruleId, delay = 0) {
  try {
    const job = await alertQueue.add(
      'check-rule',
      { ruleId },
      {
        delay,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    logger.info(`Added alert check job for rule ${ruleId}`);
    return job.id;
  } catch (error) {
    logger.error('Failed to add alert check job:', error);
    throw error;
  }
}

async function getQueueStats() {
  try {
    const [
      waitingCount,
      activeCount,
      completedCount,
      failedCount,
      delayedCount
    ] = await Promise.all([
      alertQueue.getWaitingCount(),
      alertQueue.getActiveCount(),
      alertQueue.getCompletedCount(),
      alertQueue.getFailedCount(),
      alertQueue.getDelayedCount()
    ]);

    return {
      waiting: waitingCount,
      active: activeCount,
      completed: completedCount,
      failed: failedCount,
      delayed: delayedCount
    };
  } catch (error) {
    logger.error('Failed to get queue stats:', error);
    throw error;
  }
}

async function clearQueue() {
  try {
    await alertQueue.empty();
    await alertQueue.clean(0, 'completed');
    await alertQueue.clean(0, 'failed');
    logger.info('Cleared alert queue');
  } catch (error) {
    logger.error('Failed to clear queue:', error);
    throw error;
  }
}

async function pauseQueue() {
  try {
    await alertQueue.pause();
    logger.info('Paused alert queue');
  } catch (error) {
    logger.error('Failed to pause queue:', error);
    throw error;
  }
}

async function resumeQueue() {
  try {
    await alertQueue.resume();
    logger.info('Resumed alert queue');
  } catch (error) {
    logger.error('Failed to resume queue:', error);
    throw error;
  }
}

module.exports = {
  alertQueue,
  scheduleRecurringJobs,
  addAlertCheck,
  getQueueStats,
  clearQueue,
  pauseQueue,
  resumeQueue
};