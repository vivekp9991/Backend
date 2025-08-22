const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Notification ID
  notificationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Recipient
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  // Alert reference (optional)
  alertId: {
    type: String,
    index: true
  },
  
  // Notification details
  channel: {
    type: String,
    required: true,
    enum: ['email', 'sms', 'push', 'webhook', 'inapp']
  },
  
  status: {
    type: String,
    enum: ['pending', 'queued', 'sending', 'sent', 'delivered', 'failed', 'bounced'],
    default: 'pending'
  },
  
  // Content
  subject: String,
  message: {
    type: String,
    required: true
  },
  template: String,
  templateData: mongoose.Schema.Types.Mixed,
  
  // Recipient details
  to: {
    type: String,
    required: true
  },
  cc: [String],
  bcc: [String],
  
  // Delivery details
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  failedAt: Date,
  failureReason: String,
  
  // Retry information
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  nextRetryAt: Date,
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Tracking
  isRead: {
    type: Boolean,
    default: false
  },
  clickedLinks: [{
    url: String,
    clickedAt: Date
  }],
  
  // Provider details
  provider: String,
  providerMessageId: String,
  providerResponse: mongoose.Schema.Types.Mixed,
  
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
notificationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Generate notification ID if not set
  if (!this.notificationId) {
    this.notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  next();
});

// Indexes
notificationSchema.index({ personName: 1, status: 1 });
notificationSchema.index({ status: 1, priority: -1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ channel: 1, status: 1 });

// Method to mark as sent
notificationSchema.methods.markAsSent = function(providerResponse = null) {
  this.status = 'sent';
  this.sentAt = new Date();
  
  if (providerResponse) {
    this.providerResponse = providerResponse;
    if (providerResponse.messageId) {
      this.providerMessageId = providerResponse.messageId;
    }
  }
  
  return this.save();
};

// Method to mark as failed
notificationSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.failureReason = reason;
  this.retryCount++;
  
  // Schedule retry if not exceeded max retries
  if (this.retryCount < this.maxRetries) {
    const retryDelay = Math.pow(2, this.retryCount) * 60000; // Exponential backoff
    this.nextRetryAt = new Date(Date.now() + retryDelay);
    this.status = 'pending';
  }
  
  return this.save();
};

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to get pending notifications
notificationSchema.statics.getPendingNotifications = function(limit = 10) {
  return this.find({
    status: 'pending',
    $or: [
      { nextRetryAt: { $lte: new Date() } },
      { nextRetryAt: null }
    ]
  })
  .sort({ priority: -1, createdAt: 1 })
  .limit(limit);
};

// Static method to get notifications for person
notificationSchema.statics.getForPerson = function(personName, options = {}) {
  const query = { personName };
  
  if (options.unreadOnly) {
    query.isRead = false;
  }
  
  if (options.channel) {
    query.channel = options.channel;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

module.exports = mongoose.model('Notification', notificationSchema);