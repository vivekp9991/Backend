const twilio = require('twilio');
const config = require('../config/environment');
const logger = require('../utils/logger');
const formatter = require('../utils/formatter');
const fs = require('fs').promises;
const path = require('path');

class SMSService {
  constructor() {
    this.client = null;
    this.templates = new Map();
    this.initialize();
  }

  initialize() {
    try {
      if (config.sms.enabled) {
        this.client = twilio(
          config.sms.twilioAccountSid,
          config.sms.twilioAuthToken
        );
        
        logger.info('SMS service initialized with Twilio');
        this.loadTemplates();
      } else {
        logger.info('SMS service disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize SMS service:', error);
    }
  }

  async loadTemplates() {
    try {
      const templateDir = path.join(__dirname, '../templates/sms');
      const files = await fs.readdir(templateDir);
      
      for (const file of files) {
        if (file.endsWith('.txt')) {
          const templateName = file.replace('.txt', '');
          const templatePath = path.join(templateDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf-8');
          this.templates.set(templateName, templateContent);
        }
      }
      
      logger.info(`Loaded ${this.templates.size} SMS templates`);
    } catch (error) {
      logger.error('Failed to load SMS templates:', error);
    }
  }

  async sendAlert(phoneNumber, alert) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized');
      }

      const message = this.formatAlertMessage(alert);
      
      const result = await this.client.messages.create({
        body: message,
        from: config.sms.twilioPhoneNumber,
        to: phoneNumber
      });

      logger.info('SMS alert sent successfully', {
        sid: result.sid,
        to: phoneNumber,
        alertId: alert.id
      });

      return {
        success: true,
        messageId: result.sid,
        status: result.status
      };
    } catch (error) {
      logger.error('Failed to send SMS alert:', error);
      throw error;
    }
  }

  formatAlertMessage(alert) {
    const template = this.templates.get('alert') || this.getDefaultTemplate();
    
    let message = template
      .replace('{{TYPE}}', alert.type.toUpperCase())
      .replace('{{TITLE}}', alert.title)
      .replace('{{SYMBOL}}', alert.symbol || 'N/A')
      .replace('{{VALUE}}', formatter.formatCurrency(alert.currentValue))
      .replace('{{CHANGE}}', formatter.formatPercentage(alert.percentageChange))
      .replace('{{MESSAGE}}', alert.message);

    // Ensure message doesn't exceed SMS character limit
    const maxLength = 160;
    if (message.length > maxLength) {
      message = message.substring(0, maxLength - 3) + '...';
    }

    return message;
  }

  getDefaultTemplate() {
    return '🚨 {{TYPE}} Alert: {{TITLE}}\n{{SYMBOL}}: {{VALUE}} ({{CHANGE}})\n{{MESSAGE}}';
  }

  async sendCustomSMS(phoneNumber, message) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized');
      }

      // Ensure message doesn't exceed SMS limits
      const maxLength = 1600; // Twilio's max for concatenated messages
      const truncatedMessage = message.length > maxLength 
        ? message.substring(0, maxLength - 3) + '...'
        : message;

      const result = await this.client.messages.create({
        body: truncatedMessage,
        from: config.sms.twilioPhoneNumber,
        to: phoneNumber
      });

      logger.info('Custom SMS sent successfully', {
        sid: result.sid,
        to: phoneNumber
      });

      return {
        success: true,
        messageId: result.sid,
        status: result.status
      };
    } catch (error) {
      logger.error('Failed to send custom SMS:', error);
      throw error;
    }
  }

  async sendBatch(messages) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized');
      }

      const results = [];
      
      for (const msg of messages) {
        try {
          const result = await this.sendCustomSMS(msg.phoneNumber, msg.message);
          results.push({
            phoneNumber: msg.phoneNumber,
            success: true,
            messageId: result.messageId
          });
        } catch (error) {
          results.push({
            phoneNumber: msg.phoneNumber,
            success: false,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to send batch SMS:', error);
      throw error;
    }
  }

  async validatePhoneNumber(phoneNumber) {
    try {
      if (!this.client) {
        return { valid: false, error: 'SMS service not initialized' };
      }

      const lookup = await this.client.lookups.v1
        .phoneNumbers(phoneNumber)
        .fetch();

      return {
        valid: true,
        formatted: lookup.phoneNumber,
        countryCode: lookup.countryCode,
        carrier: lookup.carrier
      };
    } catch (error) {
      logger.error('Phone number validation failed:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async getMessageStatus(messageId) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized');
      }

      const message = await this.client.messages(messageId).fetch();
      
      return {
        status: message.status,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage
      };
    } catch (error) {
      logger.error('Failed to get message status:', error);
      throw error;
    }
  }

  isEnabled() {
    return config.sms.enabled && this.client !== null;
  }
}

module.exports = new SMSService();