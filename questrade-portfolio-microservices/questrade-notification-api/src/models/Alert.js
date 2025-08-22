const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  // Alert identification
  alertId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Owner
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  // Alert rule reference
  ruleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AlertRule',
    index: true
  },
  
  // Alert details
  type: {
    type: String,
    required: true,
    enum: ['price', 'percentage', 'portfolio', 'volume', 'news', 'custom']
  },
  
  status: {
    type: String,
    enum: ['active', 'triggered', 'acknowledged', 'expired', 'cancelled'],
    default: 'active'
  },
  
  // Trigger details
  triggeredAt: Date,
  triggeredValue: mongoose.Schema.Types.Mixed,
  threshold: mongoose.Schema.Types.Mixed,
  condition: String,
  
  // Alert data
  symbol: String,
  metric: String,
  message: String,
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Notification details
  notificationsSent: [{
    channel: String,
    sentAt: Date,
    status: String,
    notificationId: String
  }],
  
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
alertSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Generate alert ID if not set
  if (!this.alertId) {
    this.alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  next();
});

// Indexes
alertSchema.index({ personName: 1, status: 1 });
alertSchema.index({ triggeredAt: -1 });
alertSchema.index({ expiresAt: 1 });

// Method to trigger alert
alertSchema.methods.trigger = async function(value, message) {
  this.status = 'triggered';
  this.triggeredAt = new Date();
  this.triggeredValue = value;
  
  if (message) {
    this.message = message;
  }
  
  return this.save();
};

// Method to acknowledge alert
alertSchema.methods.acknowledge = function() {
  this.status = 'acknowledged';
  return this.save();
};

// Method to add notification
alertSchema.methods.addNotification = function(channel, notificationId, status = 'sent') {
  if (!this.notificationsSent) {
    this.notificationsSent = [];
  }
  
  this.notificationsSent.push({
    channel,
    sentAt: new Date(),
    status,
    notificationId
  });
  
  return this.save();
};

// Static method to get active alerts
alertSchema.statics.getActiveAlerts = function(personName = null) {
  const query = { status: 'active' };
  if (personName) {
    query.personName = personName;
  }
  
  return this.find(query).populate('ruleId');
};

// Static method to get recent alerts
alertSchema.statics.getRecentAlerts = function(personName, limit = 10) {
  return this.find({ personName })
    .sort({ triggeredAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('Alert', alertSchema);