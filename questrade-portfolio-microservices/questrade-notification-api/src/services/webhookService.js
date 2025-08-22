const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/environment');
const logger = require('../utils/logger');
const Notification = require('../models/Notification');

class WebhookService {
  constructor() {
    this.webhooks = new Map();
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000, // Start with 1 second
      backoffMultiplier: 2
    };
  }

  async registerWebhook(webhook) {
    try {
      this.webhooks.set(webhook.id, webhook);
      
      logger.info('Webhook registered', {
        webhookId: webhook.id,
        url: webhook.url,
        events: webhook.events
      });

      return webhook;
    } catch (error) {
      logger.error('Failed to register webhook:', error);
      throw error;
    }
  }

  async unregisterWebhook(webhookId) {
    try {
      const deleted = this.webhooks.delete(webhookId);
      
      if (deleted) {
        logger.info('Webhook unregistered', { webhookId });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to unregister webhook:', error);
      throw error;
    }
  }

  async triggerWebhook(event, data) {
    try {
      const webhooks = await this.getWebhooksForEvent(event);
      const results = [];

      for (const webhook of webhooks) {
        const result = await this.sendWebhook(webhook, event, data);
        results.push(result);
      }

      return results;
    } catch (error) {
      logger.error('Failed to trigger webhooks:', error);
      throw error;
    }
  }

  async sendWebhook(webhook, event, data, retryCount = 0) {
    try {
      const payload = this.buildPayload(webhook, event, data);
      const signature = this.generateSignature(payload, webhook.secret);

      const response = await axios({
        method: 'POST',
        url: webhook.url,
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Id': webhook.id,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': payload.timestamp,
          'User-Agent': 'Questrade-Notification-API/1.0'
        },
        timeout: 30000, // 30 seconds timeout
        validateStatus: (status) => status < 500 // Don't throw for 4xx errors
      });

      // Log successful webhook
      await this.logWebhookDelivery(webhook.id, event, {
        success: true,
        statusCode: response.status,
        responseTime: response.headers['x-response-time'],
        retryCount
      });

      logger.info('Webhook delivered successfully', {
        webhookId: webhook.id,
        event,
        statusCode: response.status
      });

      return {
        webhookId: webhook.id,
        success: true,
        statusCode: response.status,
        retryCount
      };
    } catch (error) {
      // Handle retry logic
      if (retryCount < this.retryConfig.maxRetries) {
        const delay = this.retryConfig.retryDelay * 
                     Math.pow(this.retryConfig.backoffMultiplier, retryCount);
        
        logger.warn(`Webhook delivery failed, retrying in ${delay}ms`, {
          webhookId: webhook.id,
          event,
          retryCount: retryCount + 1,
          error: error.message
        });

        await this.sleep(delay);
        return this.sendWebhook(webhook, event, data, retryCount + 1);
      }

      // Log failed webhook after all retries
      await this.logWebhookDelivery(webhook.id, event, {
        success: false,
        error: error.message,
        retryCount
      });

      logger.error('Webhook delivery failed after all retries', {
        webhookId: webhook.id,
        event,
        error: error.message
      });

      return {
        webhookId: webhook.id,
        success: false,
        error: error.message,
        retryCount
      };
    }
  }

  buildPayload(webhook, event, data) {
    return {
      id: crypto.randomUUID(),
      event: event,
      timestamp: new Date().toISOString(),
      webhook: {
        id: webhook.id,
        version: '1.0'
      },
      data: this.sanitizeData(data)
    };
  }

  sanitizeData(data) {
    // Remove sensitive information
    const sanitized = { ...data };
    
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
    
    const removeSensitive = (obj) => {
      for (const key in obj) {
        if (sensitiveFields.includes(key)) {
          delete obj[key];
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          removeSensitive(obj[key]);
        }
      }
      return obj;
    };

    return removeSensitive(sanitized);
  }

  generateSignature(payload, secret) {
    if (!secret) return null;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  async verifyWebhookSignature(payload, signature, secret) {
    if (!secret || !signature) return false;

    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  async getWebhooksForEvent(event) {
    const webhooks = [];
    
    for (const [id, webhook] of this.webhooks) {
      if (webhook.events.includes(event) || webhook.events.includes('*')) {
        if (webhook.active) {
          webhooks.push(webhook);
        }
      }
    }

    return webhooks;
  }

  async testWebhook(webhook) {
    try {
      const testData = {
        test: true,
        message: 'This is a test webhook from Questrade Notification API',
        timestamp: new Date().toISOString()
      };

      const result = await this.sendWebhook(
        webhook,
        'webhook.test',
        testData
      );

      return {
        success: result.success,
        statusCode: result.statusCode,
        message: result.success 
          ? 'Webhook test successful' 
          : `Webhook test failed: ${result.error}`
      };
    } catch (error) {
      logger.error('Webhook test failed:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async logWebhookDelivery(webhookId, event, details) {
    try {
      await Notification.create({
        type: 'webhook_delivery',
        personName: 'system',
        title: `Webhook: ${event}`,
        message: details.success 
          ? `Successfully delivered to webhook ${webhookId}`
          : `Failed to deliver to webhook ${webhookId}: ${details.error}`,
        severity: details.success ? 'info' : 'warning',
        metadata: {
          webhookId,
          event,
          ...details
        },
        status: details.success ? 'sent' : 'failed'
      });
    } catch (error) {
      logger.error('Failed to log webhook delivery:', error);
    }
  }

  async batchTrigger(events) {
    const results = [];

    for (const { event, data } of events) {
      try {
        const eventResults = await this.triggerWebhook(event, data);
        results.push({
          event,
          results: eventResults
        });
      } catch (error) {
        results.push({
          event,
          error: error.message
        });
      }
    }

    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getWebhookStats(webhookId) {
    // This would typically query from a database
    // For now, return mock stats
    return {
      webhookId,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      averageResponseTime: 0,
      lastDelivery: null,
      events: []
    };
  }

  async cleanupWebhooks() {
    try {
      const now = new Date();
      let cleaned = 0;

      for (const [id, webhook] of this.webhooks) {
        // Remove inactive webhooks older than 30 days
        if (!webhook.active && 
            (now - new Date(webhook.updatedAt)) > 30 * 24 * 60 * 60 * 1000) {
          this.webhooks.delete(id);
          cleaned++;
        }
      }

      logger.info(`Cleaned up ${cleaned} inactive webhooks`);
      return cleaned;
    } catch (error) {
      logger.error('Failed to cleanup webhooks:', error);
      throw error;
    }
  }
}

module.exports = new WebhookService();