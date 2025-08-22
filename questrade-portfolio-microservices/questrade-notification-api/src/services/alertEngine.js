const Alert = require('../models/Alert');
const AlertRule = require('../models/AlertRule');
const notificationSender = require('./notificationSender');
const axios = require('axios');
const config = require('../config/environment');
const logger = require('../utils/logger');

class AlertEngine {
  constructor() {
    this.marketApiUrl = config.services.marketApiUrl;
    this.portfolioApiUrl = config.services.portfolioApiUrl;
  }

  // Check all active alert rules
  async checkAllRules() {
    try {
      const rules = await AlertRule.getEnabledRules();
      logger.info(`Checking ${rules.length} alert rules`);
      
      const results = [];
      
      for (const rule of rules) {
        try {
          const result = await this.checkRule(rule);
          results.push(result);
        } catch (error) {
          logger.error(`Error checking rule ${rule._id}:`, error);
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Error checking alert rules:', error);
      throw error;
    }
  }

  // Check individual rule
  async checkRule(rule) {
    try {
      // Check if rule can trigger
      if (!rule.canTrigger()) {
        return { ruleId: rule._id, triggered: false, reason: 'Cannot trigger' };
      }
      
      // Get current value based on rule type
      const currentValue = await this.getCurrentValue(rule);
      
      if (currentValue === null) {
        return { ruleId: rule._id, triggered: false, reason: 'No data' };
      }
      
      // Check if condition is met
      const conditionMet = this.checkCondition(
        currentValue,
        rule.conditions.operator,
        rule.conditions.threshold,
        rule.conditions.secondaryThreshold
      );
      
      if (conditionMet) {
        // Create alert
        const alert = await this.createAlert(rule, currentValue);
        
        // Record trigger
        await rule.recordTrigger();
        
        // Send notifications
        await this.sendAlertNotifications(alert);
        
        return {
          ruleId: rule._id,
          triggered: true,
          alertId: alert.alertId,
          value: currentValue
        };
      }
      
      return { ruleId: rule._id, triggered: false, value: currentValue };
      
    } catch (error) {
      logger.error(`Error checking rule ${rule._id}:`, error);
      throw error;
    }
  }

  // Get current value for rule
  async getCurrentValue(rule) {
    try {
      switch (rule.type) {
        case 'price':
          return await this.getPriceValue(rule.conditions.symbol);
        
        case 'percentage':
          return await this.getPercentageChange(
            rule.conditions.symbol,
            rule.conditions.timeframe
          );
        
        case 'portfolio':
          return await this.getPortfolioValue(
            rule.personName,
            rule.conditions.metric
          );
        
        case 'volume':
          return await this.getVolumeValue(rule.conditions.symbol);
        
        default:
          return null;
      }
    } catch (error) {
      logger.error('Error getting current value:', error);
      return null;
    }
  }

  // Get price value from market API
  async getPriceValue(symbol) {
    try {
      const response = await axios.get(`${this.marketApiUrl}/quotes/${symbol}`);
      return response.data.data.lastTradePrice;
    } catch (error) {
      logger.error(`Error getting price for ${symbol}:`, error);
      return null;
    }
  }

  // Get percentage change
  async getPercentageChange(symbol, timeframe = '1D') {
    try {
      const response = await axios.get(`${this.marketApiUrl}/quotes/${symbol}`);
      const quote = response.data.data;
      
      // For now, return day change percentage
      return quote.dayChangePercent || 0;
    } catch (error) {
      logger.error(`Error getting percentage change for ${symbol}:`, error);
      return null;
    }
  }

  // Get portfolio value
  async getPortfolioValue(personName, metric) {
    try {
      const response = await axios.get(
        `${this.portfolioApiUrl}/portfolio/${personName}/summary`
      );
      
      const summary = response.data.data;
      
      switch (metric) {
        case 'totalValue':
          return summary.totalValue;
        case 'dayChange':
          return summary.dayChange?.percentage || 0;
        case 'totalGainLoss':
          return summary.totalGainLoss || 0;
        default:
          return null;
      }
    } catch (error) {
      logger.error(`Error getting portfolio value for ${personName}:`, error);
      return null;
    }
  }

  // Get volume value
  async getVolumeValue(symbol) {
    try {
      const response = await axios.get(`${this.marketApiUrl}/quotes/${symbol}`);
      return response.data.data.volume;
    } catch (error) {
      logger.error(`Error getting volume for ${symbol}:`, error);
      return null;
    }
  }

  // Check if condition is met
  checkCondition(currentValue, operator, threshold, secondaryThreshold = null) {
    const thresholdNum = parseFloat(threshold);
    const currentNum = parseFloat(currentValue);
    
    switch (operator) {
      case 'above':
        return currentNum > thresholdNum;
      
      case 'below':
        return currentNum < thresholdNum;
      
      case 'equals':
        return Math.abs(currentNum - thresholdNum) < 0.001;
      
      case 'change':
        return Math.abs(currentNum) > thresholdNum;
      
      case 'increase':
        return currentNum > thresholdNum;
      
      case 'decrease':
        return currentNum < -thresholdNum;
      
      case 'between':
        const secondaryNum = parseFloat(secondaryThreshold);
        return currentNum >= thresholdNum && currentNum <= secondaryNum;
      
      default:
        return false;
    }
  }

  // Create alert from rule
  async createAlert(rule, currentValue) {
    const alert = new Alert({
      personName: rule.personName,
      ruleId: rule._id,
      type: rule.type,
      status: 'triggered',
      triggeredAt: new Date(),
      triggeredValue: currentValue,
      threshold: rule.conditions.threshold,
      condition: rule.conditions.operator,
      symbol: rule.conditions.symbol,
      metric: rule.conditions.metric,
      message: this.generateAlertMessage(rule, currentValue),
      severity: rule.notifications.priority || 'medium'
    });
    
    await alert.save();
    
    return alert;
  }

  // Create manual alert
  async createManualAlert(alertData) {
    const alert = new Alert({
      ...alertData,
      status: 'active'
    });
    
    await alert.save();
    
    return alert;
  }

  // Generate alert message
  generateAlertMessage(rule, currentValue) {
    const symbol = rule.conditions.symbol || '';
    const operator = rule.conditions.operator;
    const threshold = rule.conditions.threshold;
    
    let message = `Alert: ${rule.name}\n`;
    
    switch (rule.type) {
      case 'price':
        message += `${symbol} price is ${operator} ${threshold}. Current: ${currentValue}`;
        break;
      
      case 'percentage':
        message += `${symbol} changed ${currentValue}% (threshold: ${threshold}%)`;
        break;
      
      case 'portfolio':
        message += `Portfolio ${rule.conditions.metric} is ${operator} ${threshold}. Current: ${currentValue}`;
        break;
      
      case 'volume':
        message += `${symbol} volume is ${operator} ${threshold}. Current: ${currentValue}`;
        break;
      
      default:
        message += `Condition met: ${currentValue} is ${operator} ${threshold}`;
    }
    
    return message;
  }

  // Send alert notifications
  async sendAlertNotifications(alert) {
    try {
      // Get notification preferences
      const NotificationPreference = require('../models/NotificationPreference');
      const preferences = await NotificationPreference.findOne({
        personName: alert.personName
      });
      
      if (!preferences || !preferences.enabled) {
        logger.info(`Notifications disabled for ${alert.personName}`);
        return;
      }
      
      // Get channels from rule or use defaults
      let channels = ['inapp'];
      if (alert.ruleId) {
        const rule = await AlertRule.findById(alert.ruleId);
        if (rule && rule.notifications.channels) {
          channels = rule.notifications.channels;
        }
      }
      
      // Send to each channel
      for (const channel of channels) {
        if (preferences.canSendNotification(channel, alert.type)) {
          try {
            const notification = await notificationSender.sendNotification({
              personName: alert.personName,
              alertId: alert.alertId,
              channel,
              to: this.getRecipient(preferences, channel),
              subject: `Alert: ${alert.type}`,
              message: alert.message,
              priority: alert.severity,
              template: 'alert',
              templateData: {
                alertType: alert.type,
                message: alert.message,
                currentValue: alert.triggeredValue,
                threshold: alert.threshold,
                symbol: alert.symbol
              }
            });
            
            // Record notification sent
            await alert.addNotification(channel, notification.notificationId);
            
          } catch (error) {
            logger.error(`Failed to send ${channel} notification:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Error sending alert notifications:', error);
    }
  }

  // Get recipient for channel
  getRecipient(preferences, channel) {
    switch (channel) {
      case 'email':
        return preferences.channels.email.address;
      case 'sms':
        return preferences.channels.sms.phoneNumber;
      case 'webhook':
        return preferences.channels.webhook.url;
      default:
        return preferences.personName;
    }
  }

  // Test rule without triggering
  async testRule(rule) {
    try {
      const currentValue = await this.getCurrentValue(rule);
      
      const conditionMet = this.checkCondition(
        currentValue,
        rule.conditions.operator,
        rule.conditions.threshold,
        rule.conditions.secondaryThreshold
      );
      
      return {
        currentValue,
        threshold: rule.conditions.threshold,
        operator: rule.conditions.operator,
        conditionMet,
        canTrigger: rule.canTrigger(),
        message: this.generateAlertMessage(rule, currentValue)
      };
    } catch (error) {
      logger.error('Error testing rule:', error);
      throw error;
    }
  }
}

module.exports = new AlertEngine();