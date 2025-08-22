const cron = require('node-cron');
const axios = require('axios');
const config = require('../config/environment');
const logger = require('../utils/logger');
const Alert = require('../models/Alert');
const AlertRule = require('../models/AlertRule');
const alertEngine = require('./alertEngine');
const notificationSender = require('./notificationSender');

class AlertMonitor {
  constructor() {
    this.jobs = new Map();
    this.monitoring = false;
    this.checkInterval = config.monitoring.checkInterval || 60000; // 1 minute default
    this.portfolioApiUrl = config.services.portfolioApi.url;
    this.marketApiUrl = config.services.marketApi.url;
  }

  start() {
    if (this.monitoring) {
      logger.warn('Alert monitor already running');
      return;
    }

    this.monitoring = true;
    this.setupCronJobs();
    this.startRealTimeMonitoring();
    
    logger.info('Alert monitor started');
  }

  stop() {
    this.monitoring = false;
    
    // Stop all cron jobs
    for (const [jobName, job] of this.jobs) {
      job.stop();
      logger.info(`Stopped cron job: ${jobName}`);
    }
    
    this.jobs.clear();
    logger.info('Alert monitor stopped');
  }

  setupCronJobs() {
    // Check price alerts every minute during market hours
    const priceAlertJob = cron.schedule('* 9-16 * * 1-5', async () => {
      await this.checkPriceAlerts();
    }, {
      timezone: 'America/Toronto'
    });
    this.jobs.set('priceAlerts', priceAlertJob);

    // Check portfolio value alerts every 5 minutes
    const portfolioAlertJob = cron.schedule('*/5 * * * *', async () => {
      await this.checkPortfolioAlerts();
    });
    this.jobs.set('portfolioAlerts', portfolioAlertJob);

    // Send daily summaries at 5 PM ET
    const dailySummaryJob = cron.schedule('0 17 * * 1-5', async () => {
      await this.sendDailySummaries();
    }, {
      timezone: 'America/Toronto'
    });
    this.jobs.set('dailySummary', dailySummaryJob);

    // Check volume alerts every 2 minutes during market hours
    const volumeAlertJob = cron.schedule('*/2 9-16 * * 1-5', async () => {
      await this.checkVolumeAlerts();
    }, {
      timezone: 'America/Toronto'
    });
    this.jobs.set('volumeAlerts', volumeAlertJob);

    // Cleanup old notifications weekly
    const cleanupJob = cron.schedule('0 0 * * 0', async () => {
      await this.cleanupOldData();
    });
    this.jobs.set('cleanup', cleanupJob);

    logger.info(`Set up ${this.jobs.size} monitoring jobs`);
  }

  async startRealTimeMonitoring() {
    if (!this.monitoring) return;

    try {
      // Check all active rules
      await this.checkAllActiveRules();
    } catch (error) {
      logger.error('Real-time monitoring error:', error);
    }

    // Schedule next check
    if (this.monitoring) {
      setTimeout(() => this.startRealTimeMonitoring(), this.checkInterval);
    }
  }

  async checkAllActiveRules() {
    try {
      const activeRules = await AlertRule.find({ 
        enabled: true,
        status: 'active' 
      });

      logger.debug(`Checking ${activeRules.length} active rules`);

      for (const rule of activeRules) {
        try {
          await this.evaluateRule(rule);
        } catch (error) {
          logger.error(`Failed to evaluate rule ${rule._id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to check active rules:', error);
    }
  }

  async evaluateRule(rule) {
    try {
      let shouldTrigger = false;
      let alertData = {};

      switch (rule.type) {
        case 'price_change':
          const priceCheck = await this.checkPriceCondition(rule);
          shouldTrigger = priceCheck.trigger;
          alertData = priceCheck.data;
          break;

        case 'portfolio_value':
          const portfolioCheck = await this.checkPortfolioCondition(rule);
          shouldTrigger = portfolioCheck.trigger;
          alertData = portfolioCheck.data;
          break;

        case 'volume_spike':
          const volumeCheck = await this.checkVolumeCondition(rule);
          shouldTrigger = volumeCheck.trigger;
          alertData = volumeCheck.data;
          break;

        case 'technical_indicator':
          const technicalCheck = await this.checkTechnicalCondition(rule);
          shouldTrigger = technicalCheck.trigger;
          alertData = technicalCheck.data;
          break;

        case 'news_sentiment':
          const sentimentCheck = await this.checkNewsSentiment(rule);
          shouldTrigger = sentimentCheck.trigger;
          alertData = sentimentCheck.data;
          break;

        default:
          logger.warn(`Unknown rule type: ${rule.type}`);
          return;
      }

      if (shouldTrigger && !this.isInCooldown(rule)) {
        await this.triggerAlert(rule, alertData);
        await this.updateRuleCooldown(rule);
      }
    } catch (error) {
      logger.error(`Failed to evaluate rule ${rule._id}:`, error);
    }
  }

  async checkPriceCondition(rule) {
    try {
      const { symbol, condition, threshold } = rule.conditions;
      
      // Get current price from market API
      const response = await axios.get(
        `${this.marketApiUrl}/quotes/${symbol}`,
        {
          headers: { 'x-api-key': config.services.marketApi.apiKey }
        }
      );

      const currentPrice = response.data.lastTradePrice;
      const previousClose = response.data.previousClose;
      const changePercent = ((currentPrice - previousClose) / previousClose) * 100;

      let trigger = false;

      switch (condition) {
        case 'above':
          trigger = currentPrice > threshold;
          break;
        case 'below':
          trigger = currentPrice < threshold;
          break;
        case 'crosses_above':
          trigger = this.checkCrossAbove(rule, currentPrice, threshold);
          break;
        case 'crosses_below':
          trigger = this.checkCrossBelow(rule, currentPrice, threshold);
          break;
        case 'percent_change':
          trigger = Math.abs(changePercent) >= threshold;
          break;
      }

      return {
        trigger,
        data: {
          symbol,
          currentPrice,
          threshold,
          changePercent,
          condition
        }
      };
    } catch (error) {
      logger.error('Failed to check price condition:', error);
      return { trigger: false, data: {} };
    }
  }

  async checkPortfolioCondition(rule) {
    try {
      const { metric, operator, value } = rule.conditions;
      
      // Get portfolio data from portfolio API
      const response = await axios.get(
        `${this.portfolioApiUrl}/portfolio/${rule.personName}`,
        {
          headers: { 'x-api-key': config.services.portfolioApi.apiKey }
        }
      );

      const portfolio = response.data;
      let currentValue;
      let trigger = false;

      switch (metric) {
        case 'total_value':
          currentValue = portfolio.totalValue;
          break;
        case 'daily_change':
          currentValue = portfolio.dailyChange;
          break;
        case 'daily_change_percent':
          currentValue = portfolio.dailyChangePercent;
          break;
        case 'total_gain':
          currentValue = portfolio.totalGain;
          break;
        case 'total_gain_percent':
          currentValue = portfolio.totalGainPercent;
          break;
      }

      switch (operator) {
        case 'greater_than':
          trigger = currentValue > value;
          break;
        case 'less_than':
          trigger = currentValue < value;
          break;
        case 'equals':
          trigger = Math.abs(currentValue - value) < 0.01;
          break;
      }

      return {
        trigger,
        data: {
          metric,
          currentValue,
          threshold: value,
          operator
        }
      };
    } catch (error) {
      logger.error('Failed to check portfolio condition:', error);
      return { trigger: false, data: {} };
    }
  }

  async checkVolumeCondition(rule) {
    try {
      const { symbol, multiplier } = rule.conditions;
      
      // Get volume data from market API
      const response = await axios.get(
        `${this.marketApiUrl}/quotes/${symbol}`,
        {
          headers: { 'x-api-key': config.services.marketApi.apiKey }
        }
      );

      const currentVolume = response.data.volume;
      const avgVolume = response.data.averageVolume || response.data.volume;
      const volumeRatio = currentVolume / avgVolume;

      const trigger = volumeRatio >= multiplier;

      return {
        trigger,
        data: {
          symbol,
          currentVolume,
          averageVolume: avgVolume,
          volumeRatio,
          threshold: multiplier
        }
      };
    } catch (error) {
      logger.error('Failed to check volume condition:', error);
      return { trigger: false, data: {} };
    }
  }

  async checkTechnicalCondition(rule) {
    try {
      const { symbol, indicator, parameters } = rule.conditions;
      
      // Get technical indicator data
      const response = await axios.get(
        `${this.marketApiUrl}/indicators/${symbol}/${indicator}`,
        {
          headers: { 'x-api-key': config.services.marketApi.apiKey },
          params: parameters
        }
      );

      const indicatorValue = response.data.value;
      const signal = response.data.signal;

      const trigger = signal === rule.conditions.expectedSignal;

      return {
        trigger,
        data: {
          symbol,
          indicator,
          value: indicatorValue,
          signal
        }
      };
    } catch (error) {
      logger.error('Failed to check technical condition:', error);
      return { trigger: false, data: {} };
    }
  }

  async checkNewsSentiment(rule) {
    try {
      const { symbol, sentimentThreshold } = rule.conditions;
      
      // Get news sentiment from market API
      const response = await axios.get(
        `${this.marketApiUrl}/sentiment/${symbol}`,
        {
          headers: { 'x-api-key': config.services.marketApi.apiKey }
        }
      );

      const currentSentiment = response.data.sentiment;
      const trigger = Math.abs(currentSentiment) >= sentimentThreshold;

      return {
        trigger,
        data: {
          symbol,
          sentiment: currentSentiment,
          threshold: sentimentThreshold
        }
      };
    } catch (error) {
      logger.error('Failed to check news sentiment:', error);
      return { trigger: false, data: {} };
    }
  }

  async triggerAlert(rule, data) {
    try {
      // Create alert
      const alert = await alertEngine.createAlert({
        ruleId: rule._id,
        personName: rule.personName,
        type: rule.type,
        title: rule.name,
        message: this.formatAlertMessage(rule, data),
        severity: rule.severity || 'medium',
        symbol: data.symbol,
        currentValue: data.currentValue || data.currentPrice,
        thresholdValue: data.threshold,
        percentageChange: data.changePercent,
        metadata: data
      });

      // Send notifications
      await notificationSender.sendAlert(alert);

      logger.info('Alert triggered', {
        alertId: alert._id,
        ruleId: rule._id,
        type: rule.type
      });
    } catch (error) {
      logger.error('Failed to trigger alert:', error);
    }
  }

  formatAlertMessage(rule, data) {
    const templates = {
      price_change: `${data.symbol} price ${data.condition} threshold: $${data.currentPrice.toFixed(2)} (${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%)`,
      portfolio_value: `Portfolio ${data.metric.replace('_', ' ')} is ${data.operator.replace('_', ' ')} threshold: ${data.currentValue.toFixed(2)}`,
      volume_spike: `${data.symbol} volume spike detected: ${data.volumeRatio.toFixed(1)}x average volume`,
      technical_indicator: `${data.symbol} ${data.indicator} signal: ${data.signal}`,
      news_sentiment: `${data.symbol} sentiment alert: ${data.sentiment > 0 ? 'Positive' : 'Negative'} (${data.sentiment.toFixed(2)})`
    };

    return templates[rule.type] || 'Alert condition met';
  }

  isInCooldown(rule) {
    if (!rule.lastTriggered || !rule.cooldownMinutes) {
      return false;
    }

    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    const timeSinceLastTrigger = Date.now() - new Date(rule.lastTriggered).getTime();
    
    return timeSinceLastTrigger < cooldownMs;
  }

  async updateRuleCooldown(rule) {
    try {
      rule.lastTriggered = new Date();
      rule.triggerCount = (rule.triggerCount || 0) + 1;
      await rule.save();
    } catch (error) {
      logger.error('Failed to update rule cooldown:', error);
    }
  }

  checkCrossAbove(rule, currentValue, threshold) {
    // Check if value crossed above threshold since last check
    const lastValue = rule.lastCheckedValue || 0;
    rule.lastCheckedValue = currentValue;
    return lastValue <= threshold && currentValue > threshold;
  }

  checkCrossBelow(rule, currentValue, threshold) {
    // Check if value crossed below threshold since last check
    const lastValue = rule.lastCheckedValue || Infinity;
    rule.lastCheckedValue = currentValue;
    return lastValue >= threshold && currentValue < threshold;
  }

  async checkPriceAlerts() {
    logger.debug('Checking price alerts');
    const rules = await AlertRule.find({ 
      type: 'price_change',
      enabled: true 
    });

    for (const rule of rules) {
      await this.evaluateRule(rule);
    }
  }

  async checkPortfolioAlerts() {
    logger.debug('Checking portfolio alerts');
    const rules = await AlertRule.find({ 
      type: 'portfolio_value',
      enabled: true 
    });

    for (const rule of rules) {
      await this.evaluateRule(rule);
    }
  }

  async checkVolumeAlerts() {
    logger.debug('Checking volume alerts');
    const rules = await AlertRule.find({ 
      type: 'volume_spike',
      enabled: true 
    });

    for (const rule of rules) {
      await this.evaluateRule(rule);
    }
  }

  async sendDailySummaries() {
    logger.info('Sending daily summaries');
    // Implementation would go here
  }

  async cleanupOldData() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Clean up old alerts
      const deletedAlerts = await Alert.deleteMany({
        createdAt: { $lt: thirtyDaysAgo },
        status: { $in: ['read', 'dismissed'] }
      });

      logger.info(`Cleaned up ${deletedAlerts.deletedCount} old alerts`);
    } catch (error) {
      logger.error('Failed to cleanup old data:', error);
    }
  }

  getStatus() {
    return {
      monitoring: this.monitoring,
      activeJobs: Array.from(this.jobs.keys()),
      checkInterval: this.checkInterval
    };
  }
}

module.exports = new AlertMonitor();