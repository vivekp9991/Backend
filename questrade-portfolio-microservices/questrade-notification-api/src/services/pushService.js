const admin = require('firebase-admin');
const webpush = require('web-push');
const config = require('../config/environment');
const logger = require('../utils/logger');
const formatter = require('../utils/formatter');

class PushService {
  constructor() {
    this.fcm = null;
    this.webPush = null;
    this.initialize();
  }

  initialize() {
    try {
      // Initialize Firebase Admin for mobile push notifications
      if (config.push.firebase.enabled) {
        this.initializeFirebase();
      }

      // Initialize Web Push for browser notifications
      if (config.push.webPush.enabled) {
        this.initializeWebPush();
      }

      logger.info('Push notification service initialized');
    } catch (error) {
      logger.error('Failed to initialize push service:', error);
    }
  }

  initializeFirebase() {
    try {
      const serviceAccount = require(config.push.firebase.serviceAccountPath);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.push.firebase.projectId
      });

      this.fcm = admin.messaging();
      logger.info('Firebase Cloud Messaging initialized');
    } catch (error) {
      logger.error('Failed to initialize Firebase:', error);
    }
  }

  initializeWebPush() {
    try {
      webpush.setVapidDetails(
        config.push.webPush.subject,
        config.push.webPush.publicKey,
        config.push.webPush.privateKey
      );

      this.webPush = webpush;
      logger.info('Web Push initialized');
    } catch (error) {
      logger.error('Failed to initialize Web Push:', error);
    }
  }

  async sendMobilePush(deviceToken, notification) {
    try {
      if (!this.fcm) {
        throw new Error('Firebase not initialized');
      }

      const message = {
        token: deviceToken,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: {
          alertId: String(notification.alertId || ''),
          type: notification.type || 'alert',
          severity: notification.severity || 'info',
          timestamp: new Date().toISOString()
        },
        android: {
          priority: 'high',
          notification: {
            icon: 'stock_ticker_update',
            color: this.getSeverityColor(notification.severity),
            sound: 'default',
            clickAction: 'OPEN_PORTFOLIO'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body
              },
              badge: notification.badge || 1,
              sound: 'default',
              category: 'PORTFOLIO_ALERT'
            }
          }
        }
      };

      const response = await this.fcm.send(message);
      
      logger.info('Mobile push notification sent', {
        messageId: response,
        deviceToken: deviceToken.substring(0, 10) + '...'
      });

      return {
        success: true,
        messageId: response
      };
    } catch (error) {
      logger.error('Failed to send mobile push notification:', error);
      throw error;
    }
  }

  async sendWebPush(subscription, notification) {
    try {
      if (!this.webPush) {
        throw new Error('Web Push not initialized');
      }

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        vibrate: [200, 100, 200],
        tag: notification.tag || 'portfolio-alert',
        requireInteraction: notification.requireInteraction || false,
        data: {
          alertId: notification.alertId,
          type: notification.type,
          url: notification.url || '/portfolio',
          timestamp: new Date().toISOString()
        },
        actions: notification.actions || [
          {
            action: 'view',
            title: 'View Portfolio'
          },
          {
            action: 'dismiss',
            title: 'Dismiss'
          }
        ]
      });

      const response = await this.webPush.sendNotification(
        subscription,
        payload
      );

      logger.info('Web push notification sent', {
        statusCode: response.statusCode,
        endpoint: subscription.endpoint.substring(0, 50) + '...'
      });

      return {
        success: true,
        statusCode: response.statusCode
      };
    } catch (error) {
      // Handle subscription expiration
      if (error.statusCode === 410) {
        logger.info('Push subscription expired, should be removed');
        return {
          success: false,
          expired: true,
          error: 'Subscription expired'
        };
      }

      logger.error('Failed to send web push notification:', error);
      throw error;
    }
  }

  async sendAlertPush(devices, alert) {
    const results = [];
    
    const notification = {
      title: `${this.getAlertEmoji(alert.severity)} ${alert.title}`,
      body: this.formatAlertBody(alert),
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      url: `/alerts/${alert.id}`,
      requireInteraction: alert.severity === 'critical',
      badge: 1
    };

    // Send to mobile devices
    for (const device of devices.mobile || []) {
      try {
        const result = await this.sendMobilePush(device.token, notification);
        results.push({
          deviceId: device.id,
          platform: 'mobile',
          success: true,
          messageId: result.messageId
        });
      } catch (error) {
        results.push({
          deviceId: device.id,
          platform: 'mobile',
          success: false,
          error: error.message
        });
      }
    }

    // Send to web browsers
    for (const device of devices.web || []) {
      try {
        const result = await this.sendWebPush(device.subscription, notification);
        results.push({
          deviceId: device.id,
          platform: 'web',
          success: result.success,
          expired: result.expired
        });
      } catch (error) {
        results.push({
          deviceId: device.id,
          platform: 'web',
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  formatAlertBody(alert) {
    let body = alert.message;
    
    if (alert.symbol) {
      body = `${alert.symbol}: ${body}`;
    }
    
    if (alert.currentValue !== undefined) {
      body += ` | Value: ${formatter.formatCurrency(alert.currentValue)}`;
    }
    
    if (alert.percentageChange !== undefined) {
      body += ` (${formatter.formatPercentage(alert.percentageChange)})`;
    }

    // Limit body length for push notifications
    const maxLength = 120;
    if (body.length > maxLength) {
      body = body.substring(0, maxLength - 3) + '...';
    }

    return body;
  }

  getAlertEmoji(severity) {
    const emojis = {
      critical: '🚨',
      high: '⚠️',
      medium: '📊',
      low: 'ℹ️',
      info: '💡'
    };
    return emojis[severity] || '📢';
  }

  getSeverityColor(severity) {
    const colors = {
      critical: '#FF0000',
      high: '#FF6600',
      medium: '#FFAA00',
      low: '#0066FF',
      info: '#00AA00'
    };
    return colors[severity] || '#666666';
  }

  async sendBatchPush(notifications) {
    try {
      const results = [];

      for (const notif of notifications) {
        try {
          const result = await this.sendAlertPush(notif.devices, notif.alert);
          results.push({
            alertId: notif.alert.id,
            results: result
          });
        } catch (error) {
          results.push({
            alertId: notif.alert.id,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to send batch push notifications:', error);
      throw error;
    }
  }

  async validateDeviceToken(token, platform) {
    try {
      if (platform === 'mobile' && this.fcm) {
        // Dry run to validate token
        await this.fcm.send({
          token: token,
          notification: {
            title: 'Test',
            body: 'Test'
          }
        }, true); // dryRun = true

        return { valid: true };
      }

      if (platform === 'web' && this.webPush) {
        // Basic validation for web push subscription
        return { 
          valid: token && 
                 typeof token === 'object' && 
                 token.endpoint && 
                 token.keys 
        };
      }

      return { valid: false, error: 'Platform not supported' };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  isEnabled() {
    return (this.fcm !== null) || (this.webPush !== null);
  }
}

module.exports = new PushService();