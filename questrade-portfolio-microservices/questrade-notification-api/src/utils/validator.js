// src/utils/validator.js
const validator = {
  isEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  isPhoneNumber(phone) {
    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '');
    
    // Check if it's a valid North American phone number
    return cleaned.length === 10 || (cleaned.length === 11 && cleaned[0] === '1');
  },

  formatPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+${cleaned}`;
    }
    
    return phone;
  },

  isValidSymbol(symbol) {
    // Check if it's a valid stock symbol (1-5 uppercase letters)
    const symbolRegex = /^[A-Z]{1,5}$/;
    return symbolRegex.test(symbol);
  },

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  isValidWebhookUrl(url) {
    if (!this.isValidUrl(url)) return false;
    
    const urlObj = new URL(url);
    // Must be HTTPS in production
    if (process.env.NODE_ENV === 'production' && urlObj.protocol !== 'https:') {
      return false;
    }
    
    // Cannot be localhost in production
    if (process.env.NODE_ENV === 'production' && 
        (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1')) {
      return false;
    }
    
    return true;
  },

  isValidAlertType(type) {
    const validTypes = [
      'price_change',
      'portfolio_value',
      'volume_spike',
      'technical_indicator',
      'news_sentiment'
    ];
    
    return validTypes.includes(type);
  },

  isValidSeverity(severity) {
    const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
    return validSeverities.includes(severity);
  },

  isValidNotificationChannel(channel) {
    const validChannels = ['email', 'sms', 'push', 'webhook'];
    return validChannels.includes(channel);
  },

  validateAlertRule(rule) {
    const errors = [];
    
    if (!rule.name || rule.name.length < 3) {
      errors.push('Rule name must be at least 3 characters');
    }
    
    if (!this.isValidAlertType(rule.type)) {
      errors.push('Invalid alert type');
    }
    
    if (!rule.conditions || typeof rule.conditions !== 'object') {
      errors.push('Rule conditions are required');
    }
    
    // Type-specific validation
    switch (rule.type) {
      case 'price_change':
        if (!rule.conditions.symbol || !this.isValidSymbol(rule.conditions.symbol)) {
          errors.push('Valid stock symbol required');
        }
        if (typeof rule.conditions.threshold !== 'number') {
          errors.push('Threshold must be a number');
        }
        break;
        
      case 'portfolio_value':
        if (!rule.conditions.metric) {
          errors.push('Portfolio metric required');
        }
        if (typeof rule.conditions.value !== 'number') {
          errors.push('Value must be a number');
        }
        break;
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  },

  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove any HTML tags
    return input.replace(/<[^>]*>/g, '').trim();
  }
};

module.exports = validator;