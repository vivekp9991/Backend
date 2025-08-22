const Bull = require('bull');
const config = require('../config/environment');
const logger = require('../utils/logger');
const notificationSender = require('../services/notificationSender');
const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');

// Create notification queue
const notificationQueue = new Bull('notification-processing', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password
  }
});

// Job processors
notificationQueue.process('send-notification', async (job) => {
  const { notificationId } = job.data;
  
  try {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      logger.warn(`Notification ${notificationId} not found`);
      return { skipped: true };
    }

    if (notification.status === 'sent') {
      logger.info(`Notification ${notificationId} already sent`);
      return { skipped: true };
    }

    // Get user preferences
    const preferences = await NotificationPreference.findOne({
      personName: notification.personName
    });

    if (!preferences || !preferences.enabled) {
      logger.info(`Notifications disabled for ${notification.personName}`);
      notification.status = 'skipped';
      await notification.save();
      return { skipped: true };
    }

    // Send through appropriate channels
    const results = await notificationSender.send(notification, preferences);

    // Update notification status
    notification.status = results.success ? 'sent' : 'failed';
    notification.sentAt = new Date();
    notification.deliveryResults = results;
    await notification.save();

    return results;
  } catch (error) {
    logger.error(`Failed to process notification ${notificationId}:`, error);
    
    // Update notification status
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'failed',
      error: error.message
    });
    
    throw error;
  }
});

notificationQueue.process('batch-send', async (job) => {
  const { notificationIds } = job.data;
  
  try {
    const results = [];
    
    for (const id of notificationIds) {
      try {
        const notification = await Notification.findById(id);
        if (!notification) continue;

        const preferences = await NotificationPreference.findOne({
          personName: notification.personName
        });

        if (!preferences || !preferences.enabled) {
          results.push({ id, skipped: true });
          continue;
        }

        const sendResult = await notificationSender.send(notification, preferences);
        
        notification.status = sendResult.success ? 'sent' : 'failed';
        notification.sentAt = new Date();
        notification.deliveryResults = sendResult;
        await notification.save();

        results.push({ id, ...sendResult });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }

    return {
      total: notificationIds.length,
      results
    };
  } catch (error) {
    logger.error('Failed to batch send notifications:', error);
    throw error;
  }
});

notificationQueue.process('send-daily-summary', async (job) => {
  const { personName, date } = job.data;
  
  try {
    // Get user preferences
    const preferences = await NotificationPreference.findOne({ personName });
    
    if (!preferences || !preferences.dailySummary) {
      logger.info(`Daily summary disabled for ${personName}`);
      return { skipped: true };
    }

    // Gather summary data
    const summaryData = await gatherDailySummaryData(personName, date);
    
    // Send summary through preferred channels
    const results = await notificationSender.sendDailySummary(
      personName,
      summaryData,
      preferences
    );

    // Log the summary notification
    await Notification.create({
      type: 'daily_summary',
      personName,
      title: 'Daily Portfolio Summary',
      message: `Daily summary for ${date}`,
      severity: 'info',
      status: results.success ? 'sent' : 'failed',
      sentAt: new Date(),
      metadata: summaryData
    });

    return results;
  } catch (error) {
    logger.error(`Failed to send daily summary for ${personName}:`, error);
    throw error;
  }
});

notificationQueue.process('cleanup-old', async (job) => {
  const { daysToKeep = 30 } = job.data;
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: { $in: ['sent', 'read', 'dismissed'] }
    });

    logger.info(`Cleaned up ${result.deletedCount} old notifications`);
    
    return {
      deleted: result.deletedCount,
      cutoffDate
    };
  } catch (error) {
    logger.error('Failed to cleanup old notifications:', error);
    throw error;
  }
});

// Helper functions
async function gatherDailySummaryData(personName, date) {
  try {
    // This would typically fetch data from portfolio and market APIs
    // For now, returning mock data structure
    return {
      userName: personName,
      date: date || new Date(),
      totalValue: 100000,
      dailyChange: 1500,
      dailyChangePercent: 1.5,
      topGainers: [
        { symbol: 'AAPL', value: 5000, change: 5.2 },
        { symbol: 'MSFT', value: 3000, change: 3.8 }
      ],
      topLosers: [
        { symbol: 'TSLA', value: -2000, change: -2.1 }
      ],
      alerts: []
    };
  } catch (error) {
    logger.error('Failed to gather daily summary data:', error);
    throw error;
  }
}

// Schedule recurring jobs
async function scheduleRecurringJobs() {
  try {
    // Send daily summaries at 5 PM ET
    await notificationQueue.add(
      'process-daily-summaries',
      {},
      {
        repeat: {
          cron: '0 17 * * 1-5',
          tz: 'America/Toronto'
        },
        removeOnComplete: 10,
        removeOnFail: 5
      }
    );

    // Cleanup old notifications weekly
    await notificationQueue.add(
      'cleanup-old',
      { daysToKeep: 30 },
      {
        repeat: {
          cron: '0 0 * * 0' // Sunday at midnight
        },
        removeOnComplete: 5,
        removeOnFail: 3
      }
    );

    logger.info('Scheduled recurring notification jobs');
  } catch (error) {
    logger.error('Failed to schedule recurring jobs:', error);
  }
}

// Process daily summaries for all users
notificationQueue.process('process-daily-summaries', async (job) => {
  try {
    const preferences = await NotificationPreference.find({
      enabled: true,
      dailySummary: true
    });

    const results = [];
    const date = new Date().toISOString().split('T')[0];

    for (const pref of preferences) {
      const summaryJob = await notificationQueue.add(
        'send-daily-summary',
        {
          personName: pref.personName,
          date
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      );

      results.push({
        personName: pref.personName,
        jobId: summaryJob.id
      });
    }

    return {
      total: preferences.length,
      scheduled: results
    };
  } catch (error) {
    logger.error('Failed to process daily summaries:', error);
    throw error;
  }
});

// Event handlers
notificationQueue.on('completed', (job, result) => {
  logger.debug(`Notification job ${job.id} completed`, result);
});

notificationQueue.on('failed', (job, err) => {
  logger.error(`Notification job ${job.id} failed:`, err);
});

notificationQueue.on('stalled', (job) => {
  logger.warn(`Notification job ${job.id} stalled`);
});

// Utility functions
async function addNotification(notificationId, priority = 0, delay = 0) {
  try {
    const job = await notificationQueue.add(
      'send-notification',
      { notificationId },
      {
        priority,
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

    logger.info(`Added notification job for ${notificationId}`);
    return job.id;
  } catch (error) {
    logger.error('Failed to add notification job:', error);
    throw error;
  }
}

async function batchAddNotifications(notificationIds) {
  try {
    const job = await notificationQueue.add(
      'batch-send',
      { notificationIds },
      {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    logger.info(`Added batch notification job for ${notificationIds.length} notifications`);
    return job.id;
  } catch (error) {
    logger.error('Failed to add batch notification job:', error);
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
      notificationQueue.getWaitingCount(),
      notificationQueue.getActiveCount(),
      notificationQueue.getCompletedCount(),
      notificationQueue.getFailedCount(),
      notificationQueue.getDelayedCount()
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
    await notificationQueue.empty();
    await notificationQueue.clean(0, 'completed');
    await notificationQueue.clean(0, 'failed');
    logger.info('Cleared notification queue');
  } catch (error) {
    logger.error('Failed to clear queue:', error);
    throw error;
  }
}

module.exports = {
  notificationQueue,
  scheduleRecurringJobs,
  addNotification,
  batchAddNotifications,
  getQueueStats,
  clearQueue
};