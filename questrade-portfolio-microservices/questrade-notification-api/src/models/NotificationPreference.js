const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  // Owner
  personName: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Global settings
  enabled: {
    type: Boolean,
    default: true
  },
  
  // Channel preferences
  channels: {
    email: {
      enabled: { type: Boolean, default: true },
      address: String,
      verified: { type: Boolean, default: false },
      verificationToken: String,
      verifiedAt: Date
    },
    sms: {
      enabled: { type: Boolean, default: false },
      phoneNumber: String,
      verified: { type: Boolean, default: false },
      verificationCode: String,
      verifiedAt: Date
    },
    push: {
      enabled: { type: Boolean, default: false },
      tokens: [{
        token: String,
        platform: { type: String, enum: ['ios', 'android', 'web'] },
        addedAt: Date
      }]
    },
    webhook: {
      enabled: { type: Boolean, default: false },
      url: String,
      secret: String,
      headers: mongoose.Schema.Types.Mixed
    },
    inapp: {
      enabled: { type: Boolean, default: true }
    }
  },
  
  // Alert type preferences
  alertTypes: {
    price: { enabled: true, channels: ['email', 'inapp'] },
    percentage: { enabled: true, channels: ['email', 'push'] },
    portfolio: { enabled: true, channels: ['email', 'sms'] },
    volume: { enabled: true, channels: ['inapp'] },
    news: { enabled: true, channels: ['email', 'push'] }
  },
  
  // Schedule preferences
  schedule: {
    quietHours: {
      enabled: { type: Boolean, default: false },
      startTime: String, // "22:00"
      endTime: String,   // "08:00"
      timezone: { type: String, default: 'America/Toronto' }
    },
    dailySummary: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: '18:00' },
      includePortfolio: { type: Boolean, default: true },
      includeAlerts: { type: Boolean, default: true }
    },
    weeklySummary: {
      enabled: { type: Boolean, default: false },
      dayOfWeek: { type: Number, default: 1 }, // Monday
      time: { type: String, default: '09:00' }
    }
  },
  
  // Frequency limits
  limits: {
    maxPerHour: { type: Number, default: 10 },
    maxPerDay: { type: Number, default: 50 },
    bundleAlerts: { type: Boolean, default: false },
    bundleWindowMinutes: { type: Number, default: 5 }
  },
  
  // Unsubscribe token
  unsubscribeToken: String,
  unsubscribedAt: Date,
  
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
notificationPreferenceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Generate unsubscribe token if not set
  if (!this.unsubscribeToken) {
    this.unsubscribeToken = Math.random().toString(36).substr(2, 20);
  }
  
  next();
});

// Method to check if can send notification
notificationPreferenceSchema.methods.canSendNotification = function(channel, alertType) {
  // Check if globally enabled
  if (!this.enabled) return false;
  
  // Check if unsubscribed
  if (this.unsubscribedAt) return false;
  
  // Check channel enabled
  if (!this.channels[channel] || !this.channels[channel].enabled) return false;
  
  // Check if channel is verified (for email and SMS)
  if (['email', 'sms'].includes(channel) && !this.channels[channel].verified) {
    return false;
  }
  
  // Check alert type preferences
  if (alertType && this.alertTypes[alertType]) {
    if (!this.alertTypes[alertType].enabled) return false;
    if (!this.alertTypes[alertType].channels.includes(channel)) return false;
  }
  
  // Check quiet hours
  if (this.schedule.quietHours.enabled) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    const [startHour, startMinute] = this.schedule.quietHours.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.schedule.quietHours.endTime.split(':').map(Number);
    
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;
    
    if (startTime < endTime) {
      // Same day quiet hours (e.g., 09:00 - 17:00)
      if (currentTime >= startTime && currentTime < endTime) return false;
    } else {
      // Overnight quiet hours (e.g., 22:00 - 08:00)
      if (currentTime >= startTime || currentTime < endTime) return false;
    }
  }
  
  return true;
};

// Static method to get preferences
notificationPreferenceSchema.statics.getPreferences = function(personName) {
  return this.findOne({ personName });
};

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);