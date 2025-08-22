const nodemailer = require('nodemailer');
const config = require('../config/environment');
const logger = require('../utils/logger');
const formatter = require('../utils/formatter');
const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = new Map();
    this.initialize();
  }

  initialize() {
    try {
      // Configure email transporter
      this.transporter = nodemailer.createTransporter({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.password
        }
      });

      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('Email service initialization failed:', error);
        } else {
          logger.info('Email service ready');
        }
      });

      // Load templates
      this.loadTemplates();
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
    }
  }

  async loadTemplates() {
    try {
      const templateDir = path.join(__dirname, '../templates/email');
      const files = await fs.readdir(templateDir);
      
      for (const file of files) {
        if (file.endsWith('.html')) {
          const templateName = file.replace('.html', '');
          const templatePath = path.join(templateDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf-8');
          const compiledTemplate = handlebars.compile(templateContent);
          this.templates.set(templateName, compiledTemplate);
        }
      }
      
      logger.info(`Loaded ${this.templates.size} email templates`);
    } catch (error) {
      logger.error('Failed to load email templates:', error);
    }
  }

  async sendAlert(recipient, alert) {
    try {
      const template = this.templates.get('alert');
      if (!template) {
        throw new Error('Alert template not found');
      }

      const formattedData = {
        alertType: alert.type,
        alertTitle: alert.title,
        alertMessage: alert.message,
        alertSeverity: alert.severity,
        symbol: alert.symbol,
        currentValue: formatter.formatCurrency(alert.currentValue),
        thresholdValue: formatter.formatCurrency(alert.thresholdValue),
        percentageChange: formatter.formatPercentage(alert.percentageChange),
        timestamp: formatter.formatDateTime(alert.triggeredAt),
        portfolioUrl: `${config.app.frontendUrl}/portfolio`,
        unsubscribeUrl: `${config.app.frontendUrl}/unsubscribe`
      };

      const html = template(formattedData);

      const mailOptions = {
        from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
        to: recipient,
        subject: `🚨 Alert: ${alert.title}`,
        html: html,
        text: this.generatePlainText(alert)
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Alert email sent successfully', {
        messageId: result.messageId,
        recipient,
        alertId: alert.id
      });

      return result;
    } catch (error) {
      logger.error('Failed to send alert email:', error);
      throw error;
    }
  }

  async sendDailySummary(recipient, summaryData) {
    try {
      const template = this.templates.get('daily-summary');
      if (!template) {
        throw new Error('Daily summary template not found');
      }

      const formattedData = {
        userName: summaryData.userName,
        date: formatter.formatDate(new Date()),
        totalValue: formatter.formatCurrency(summaryData.totalValue),
        dailyChange: formatter.formatCurrency(summaryData.dailyChange),
        dailyChangePercent: formatter.formatPercentage(summaryData.dailyChangePercent),
        topGainers: summaryData.topGainers.map(g => ({
          ...g,
          value: formatter.formatCurrency(g.value),
          change: formatter.formatPercentage(g.change)
        })),
        topLosers: summaryData.topLosers.map(l => ({
          ...l,
          value: formatter.formatCurrency(l.value),
          change: formatter.formatPercentage(l.change)
        })),
        alerts: summaryData.alerts,
        portfolioUrl: `${config.app.frontendUrl}/portfolio`,
        settingsUrl: `${config.app.frontendUrl}/settings`
      };

      const html = template(formattedData);

      const mailOptions = {
        from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
        to: recipient,
        subject: `📊 Daily Portfolio Summary - ${formatter.formatDate(new Date())}`,
        html: html
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Daily summary email sent successfully', {
        messageId: result.messageId,
        recipient
      });

      return result;
    } catch (error) {
      logger.error('Failed to send daily summary email:', error);
      throw error;
    }
  }

  async sendPortfolioUpdate(recipient, updateData) {
    try {
      const template = this.templates.get('portfolio-update');
      if (!template) {
        throw new Error('Portfolio update template not found');
      }

      const formattedData = {
        userName: updateData.userName,
        updateType: updateData.type,
        updateTitle: updateData.title,
        updateMessage: updateData.message,
        changes: updateData.changes,
        timestamp: formatter.formatDateTime(new Date()),
        portfolioUrl: `${config.app.frontendUrl}/portfolio`
      };

      const html = template(formattedData);

      const mailOptions = {
        from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
        to: recipient,
        subject: `📈 Portfolio Update: ${updateData.title}`,
        html: html
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Portfolio update email sent successfully', {
        messageId: result.messageId,
        recipient
      });

      return result;
    } catch (error) {
      logger.error('Failed to send portfolio update email:', error);
      throw error;
    }
  }

  async sendCustomEmail(to, subject, html, text) {
    try {
      const mailOptions = {
        from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
        to,
        subject,
        html,
        text
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Custom email sent successfully', {
        messageId: result.messageId,
        to,
        subject
      });

      return result;
    } catch (error) {
      logger.error('Failed to send custom email:', error);
      throw error;
    }
  }

  generatePlainText(alert) {
    return `
Alert: ${alert.title}

Type: ${alert.type}
Severity: ${alert.severity}
Message: ${alert.message}

Symbol: ${alert.symbol}
Current Value: ${formatter.formatCurrency(alert.currentValue)}
Threshold Value: ${formatter.formatCurrency(alert.thresholdValue)}
Change: ${formatter.formatPercentage(alert.percentageChange)}

Triggered at: ${formatter.formatDateTime(alert.triggeredAt)}

View your portfolio: ${config.app.frontendUrl}/portfolio
    `.trim();
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'Email service is connected' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = new EmailService();