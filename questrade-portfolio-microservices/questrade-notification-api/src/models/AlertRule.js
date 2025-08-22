const mongoose = require('mongoose');

const alertRuleSchema = new mongoose.Schema({
  // Owner
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  // Rule details
  name: {
    type: String,
    required: true
  },
  
  description: String,
  
  type: {
    type: String,
    required: true,
    enum: ['price', 'percentage', 'portfolio', 'volume', 'news', 'pattern', 'custom']
  },
  
  // Conditions
  conditions: {
    symbol: String,
    metric: String,
    operator: {
      type: String,
      enum: ['above', 'below', 'equals', 'change', 'increase', 'decrease', 'between']
    },
    threshold: mongoose.Schema.Types.Mixed,
    secondaryThreshold: mongoose.Schema.Types.Mixed, // For 'between' operator
    timeframe: String, // 1D, 1W, 1M, etc.
    frequency: {
      type: String,
      enum: ['once', 'daily', 'always'],
      default: 'once'
    }
  },
  
  // Rule status
  enabled: {
    type: Boolean,
    default: true
  },
  
  // Tracking
  lastTriggered: Date,
  triggerCount: {
    type: Number,
    default: 0
  },
  lastChecked: Date,
  
  // Notification preferences
  notifications: {
    channels: [{
      type: String,
      enum: ['email', 'sms', 'push', 'webhook', 'inapp']
    }],
    cooldownMinutes: {
      type: Number,
      default: 60
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    }
  },
  
  // Schedule (optional)
  schedule: {
    enabled: Boolean,
    timezone: String,
    checkTimes: [String], // ['09:30', '16:00']
    daysOfWeek: [Number] // [1,2,3,4,5] for weekdays
  },
  
  // Expiry
  expiresAt: Date,
  
  // Metadata
  metadata: mongoose.Schema.Types.Mixed,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
alertRuleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes
alertRuleSchema.index({ personName: 1, enabled: 1 });
alertRuleSchema.index({ type: 1, enabled: 1 });
alertRuleSchema.index({ 'conditions.symbol': 1 });

// Method to check if rule can trigger
alertRuleSchema.methods.canTrigger = function() {
  // Check if enabled
  if (!this.enabled) return false;
  
  // Check expiry
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  
  // Check cooldown
  if (this.lastTriggered && this.notifications.cooldownMinutes) {
    const cooldownMs = this.notifications.cooldownMinutes * 60 * 1000;
    const timeSinceLastTrigger = Date.now() - this.lastTriggered.getTime();
    if (timeSinceLastTrigger < cooldownMs) return false;
  }
  
  // Check frequency
  if (this.conditions.frequency === 'once' && this.triggerCount > 0) {
    return false;
  }
  
  if (this.conditions.frequency === 'daily' && this.lastTriggered) {
    const today = new Date().toDateString();
    const lastTriggerDate = this.lastTriggered.toDateString();
    if (today === lastTriggerDate) return false;
  }
  
  return true;
};

// Method to record trigger
alertRuleSchema.methods.recordTrigger = function() {
  this.lastTriggered = new Date();
  this.triggerCount++;
  return this.save();
};

// Static method to get enabled rules
alertRuleSchema.statics.getEnabledRules = function(personName = null) {
  const query = { enabled: true };
  if (personName) {
    query.personName = personName;
  }
  
  return this.find(query);
};

module.exports = mongoose.model('AlertRule', alertRuleSchema);