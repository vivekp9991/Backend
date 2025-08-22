const Notification = require('../models/Notification');
const emailService = require('./emailService');
const smsService = require('./smsService');
const pushService = require('./pushService');
const webhookService = require('./webhookService');
const logger = require('../utils/logger');

class NotificationSender {
  // Send notification
  async sendNotification(data) {
    try {
      // Create notification record
      const notification = new Notification({
        personName: data.personName,
        alertId: data.alertId,
        channel: data.channel,
        to: data.to,
        subject: data.subject,
        message: data.message,
        template: data.template,
        templateData: data.templateData,
        priority: data.priority || 'medium',
        status: 'queued'
      });
      
      await notification.save();
      
      // Process immediately for high priority
      if (data.priority === 'critical' || data.priority === 'high') {
        await this.processNotification(notification);
      }
      
      return notification;
    } catch (error) {
      logger.error('Error sending notification:', error);
      throw error;
    }
  }

  // Process notification
  async processNotification(notification) {
    try {
      notification.status = 'sending';
      await notification.save();
      
      let result;
      
      switch (notification.channel) {
        case 'email':
          result = await this.sendEmail(notification);
          break;
        
        case 'sms':
          result = await this.sendSMS(notification);
          break;
        
        case 'push':
          result = await this.sendPush(notification);
          break;
        
        case 'webhook':
          result = await this.sendWebhook(notification);
          break;
        
        case 'inapp':
          result = await this.sendInApp(notification);
          break;
        
        default:
          throw new Error(`Unknown channel: ${notification.channel}`);
      }
      
      if (result.success) {
        await notification.markAsSent(result.response);
      } else {
        await notification.markAsFailed(result.error);
      }
      
      return result;
      
    } catch (error) {
      logger.error('Error processing notification:', error);
      await notification.markAsFailed(error.message);
      throw error;
    }
  }

  // Send email
  async sendEmail(notification) {
    try {
      const result = await emailService.send({
        to: notification.to,
        subject: notification.subject,
        message: notification.message,
        template: notification.template,
        templateData: notification.templateData
      });
      
      return { success: true, response: result };
    } catch (error) {
      logger.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send SMS
  async sendSMS(notification) {
    try {
      const result = await smsService.send({
        to: notification.to,
        message: notification.message
      });
      
      return { success: true, response: result };
    } catch (error) {
      logger.error('SMS sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send push notification
  async sendPush(notification) {
    try {
      const result = await pushService.send({
        to: notification.to,
        title: notification.subject,
        body: notification.message,
        data: notification.templateData
      });
      
      return { success: true, response: result };
    } catch (error) {
      logger.error('Push notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send webhook
  async sendWebhook(notification) {
    try {
      const result = await webhookService.send({
        url: notification.to,
        data: {
          alertId: notification.alertId,
          subject: notification.subject,
          message: notification.message,
          ...notification.templateData
        }
      });
      
      return { success: true, response: result };
    } catch (error) {
      logger.error('Webhook sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send in-app notification
  async sendInApp(notification) {
    try {
      // For in-app, just mark as sent
      // The app will fetch unread notifications
      return { success: true, response: { inapp: true } };
    } catch (error) {
      logger.error('In-app notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Process notification queue
  async processQueue() {
    try {
      const notifications = await Notification.getPendingNotifications(10);
      
      logger.info(`Processing ${notifications.length} pending notifications`);
      
      for (const notification of notifications) {
        try {
          await this.processNotification(notification);
        } catch (error) {
          logger.error(`Failed to process notification ${notification.notificationId}:`, error);
        }
      }
      
      return notifications.length;
    } catch (error) {
      logger.error('Error processing notification queue:', error);
      throw error;
    }
  }

  // Send daily summaries
  async sendDailySummaries() {
    try {
      const NotificationPreference = require('../models/NotificationPreference');
      
      // Get all users with daily summary enabled
      const preferences = await NotificationPreference.find({
        'schedule.dailySummary.enabled': true
      });
      
      logger.info(`Sending daily summaries to ${preferences.length} users`);
      
      for (const pref of preferences) {
        try {
          await this.sendDailySummary(pref.personName);
        } catch (error) {
          logger.error(`Failed to send daily summary to ${pref.personName}:`, error);
        }
      }
      
    } catch (error) {
      logger.error('Error sending daily summaries:', error);
      throw error;
    }
  }

  // Send individual daily summary
  async sendDailySummary(personName) {
    try {
      // Get portfolio summary
      const axios = require('axios');
      const config = require('../config/environment');
      
      const portfolioResponse = await axios.get(
        `${config.services.portfolioApiUrl}/portfolio/${personName}/summary`
      );
      
      const portfolioData = portfolioResponse.data.data;
      
      // Get today's alerts
      const Alert = require('../models/Alert');
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const alerts = await Alert.find({
        personName,
        triggeredAt: { $gte: todayStart }
      });
      
      // Send summary email
      await this.sendNotification({
        personName,
        channel: 'email',
        to: personName, // Will be resolved to actual email
        subject: 'Daily Portfolio Summary',
        message: 'Your daily portfolio summary',
        template: 'daily-summary',
        templateData: {
          date: new Date().toLocaleDateString(),
          portfolio: portfolioData,
          alerts: alerts.map(a => ({
            type: a.type,
            message: a.message,
            time: a.triggeredAt
          }))
        },
        priority: 'low'
      });
      
    } catch (error) {
      logger.error(`Error sending daily summary to ${personName}:`, error);
      throw error;
    }
  }
}

module.exports = new NotificationSender();