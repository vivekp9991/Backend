const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  // Questrade account information
  accountId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  number: {
    type: String,
    required: true,
    index: true  // Removed unique constraint as accountId is the unique identifier
  },
  type: {
    type: String,
    required: true,
    enum: [
      'Cash', 
      'Margin', 
      'TFSA', 
      'RRSP', 
      'RESP', 
      'LIRA', 
      'RIF', 
      'SRIF', 
      'LIF', 
      'LRIF', 
      'PRIF', 
      'RRIF',
      'FHSA',  // First Home Savings Account
      'LRSP',  // Locked-in RSP
      'RDSP',  // Registered Disability Savings Plan
      'DPSP',  // Deferred Profit Sharing Plan
      'Other'  // Catch-all for any new account types
    ]
  },
  status: {
    type: String,
    required: true
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  isBilling: {
    type: Boolean,
    default: false
  },
  clientAccountType: String,
  
  // Owner information
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  // Financial summary (updated during sync)
  summary: {
    totalEquity: {
      type: Number,
      default: 0
    },
    totalEquityCAD: {
      type: Number,
      default: 0
    },
    cash: {
      type: Number,
      default: 0
    },
    cashCAD: {
      type: Number,
      default: 0
    },
    marketValue: {
      type: Number,
      default: 0
    },
    marketValueCAD: {
      type: Number,
      default: 0
    },
    buyingPower: {
      type: Number,
      default: 0
    },
    maintenanceExcess: {
      type: Number,
      default: 0
    },
    isRealTime: {
      type: Boolean,
      default: false
    }
  },
  
  // Sync metadata
  lastSyncedAt: Date,
  lastSuccessfulSync: Date,
  syncErrors: [{
    date: Date,
    error: String
  }],
  
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
accountSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for performance
accountSchema.index({ personName: 1, type: 1 });
accountSchema.index({ lastSyncedAt: -1 });
accountSchema.index({ 'summary.totalEquityCAD': -1 });

// Virtual for display name
accountSchema.virtual('displayName').get(function() {
  return `${this.type} - ${this.number}`;
});

// Method to update summary
accountSchema.methods.updateSummary = function(summaryData) {
  this.summary = {
    ...this.summary.toObject(),
    ...summaryData,
    isRealTime: true
  };
  this.lastSyncedAt = new Date();
  this.lastSuccessfulSync = new Date();
  return this.save();
};

// Static method to get accounts by person
accountSchema.statics.getByPerson = function(personName) {
  return this.find({ personName })
    .sort({ isPrimary: -1, 'summary.totalEquityCAD': -1 });
};

module.exports = mongoose.model('Account', accountSchema);