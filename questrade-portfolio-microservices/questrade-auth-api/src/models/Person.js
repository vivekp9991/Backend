const mongoose = require('mongoose');

const personSchema = new mongoose.Schema({
  personName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  displayName: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phoneNumber: String,
  
  // Settings and preferences
  preferences: {
    defaultCurrency: {
      type: String,
      default: 'CAD'
    },
    timezone: {
      type: String,
      default: 'America/Toronto'
    },
    notifications: {
      enabled: {
        type: Boolean,
        default: true
      },
      tokenExpiry: {
        type: Boolean,
        default: true
      },
      syncErrors: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // Status tracking
  isActive: {
    type: Boolean,
    default: true
  },
  hasValidToken: {
    type: Boolean,
    default: false
  },
  lastTokenRefresh: Date,
  lastTokenError: String,
  
  // Metadata
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
personSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes
personSchema.index({ personName: 1, isActive: 1 });
personSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Person', personSchema);