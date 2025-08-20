const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  // Account reference
  accountId: {
    type: String,
    required: true,
    index: true
  },
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  // Activity identification
  activityId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Transaction details
  transactionDate: {
    type: Date,
    required: true,
    index: true
  },
  settlementDate: Date,
  tradeDate: Date,
  
  // Activity type
  type: {
    type: String,
    required: true,
    enum: [
      'Buy', 'Sell', 'Dividend', 'Interest', 
      'Deposit', 'Withdrawal', 'Transfer',
      'ForeignExchange', 'OptionExercise', 'OptionExpiry',
      'OptionAssignment', 'Fee', 'Tax', 'Other'
    ]
  },
  action: String,
  
  // Security information
  symbol: {
    type: String,
    index: true
  },
  symbolId: Number,
  description: String,
  
  // Transaction amounts
  quantity: {
    type: Number,
    default: 0
  },
  price: {
    type: Number,
    default: 0
  },
  grossAmount: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    default: 0
  },
  commission: {
    type: Number,
    default: 0
  },
  
  // Currency
  currency: {
    type: String,
    default: 'CAD'
  },
  
  // Additional details
  notes: String,
  referenceNumber: String,
  
  // Sync metadata
  lastSyncedAt: Date,
  
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
activitySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes
activitySchema.index({ accountId: 1, transactionDate: -1 });
activitySchema.index({ personName: 1, transactionDate: -1 });
activitySchema.index({ symbol: 1, transactionDate: -1 });
activitySchema.index({ type: 1, transactionDate: -1 });

// Virtual for transaction value
activitySchema.virtual('transactionValue').get(function() {
  if (this.quantity && this.price) {
    return Math.abs(this.quantity * this.price);
  }
  return Math.abs(this.netAmount || this.grossAmount || 0);
});

// Method to update from Questrade data
activitySchema.methods.updateFromQuestrade = function(questradeData) {
  Object.assign(this, {
    transactionDate: new Date(questradeData.transactionDate),
    settlementDate: questradeData.settlementDate ? new Date(questradeData.settlementDate) : null,
    tradeDate: questradeData.tradeDate ? new Date(questradeData.tradeDate) : null,
    type: this.mapActivityType(questradeData.type || questradeData.action),
    action: questradeData.action,
    symbol: questradeData.symbol,
    symbolId: questradeData.symbolId,
    description: questradeData.description,
    quantity: questradeData.quantity || 0,
    price: questradeData.price || 0,
    grossAmount: questradeData.grossAmount || 0,
    netAmount: questradeData.netAmount || 0,
    commission: questradeData.commission || 0,
    currency: questradeData.currency || 'CAD',
    notes: questradeData.notes,
    referenceNumber: questradeData.referenceNumber,
    lastSyncedAt: new Date()
  });
  
  return this.save();
};

// Helper method to map Questrade activity types to our types
activitySchema.methods.mapActivityType = function(questradeType) {
  const typeMap = {
    'Buy': 'Buy',
    'Sell': 'Sell',
    'Dividend': 'Dividend',
    'Interest': 'Interest',
    'Deposit': 'Deposit',
    'Withdrawal': 'Withdrawal',
    'Transfer': 'Transfer',
    'FX': 'ForeignExchange',
    'Foreign Exchange': 'ForeignExchange',
    'Option Exercise': 'OptionExercise',
    'Option Expiry': 'OptionExpiry',
    'Option Assignment': 'OptionAssignment',
    'Fee': 'Fee',
    'Tax': 'Tax'
  };
  
  return typeMap[questradeType] || 'Other';
};

// Static method to get activities by account
activitySchema.statics.getByAccount = function(accountId, limit = 100) {
  return this.find({ accountId })
    .sort({ transactionDate: -1 })
    .limit(limit);
};

// Static method to get activities by person
activitySchema.statics.getByPerson = function(personName, limit = 100) {
  return this.find({ personName })
    .sort({ transactionDate: -1 })
    .limit(limit);
};

// Static method to get activities by date range
activitySchema.statics.getByDateRange = function(startDate, endDate, filter = {}) {
  return this.find({
    ...filter,
    transactionDate: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort({ transactionDate: -1 });
};

// Static method to get activity summary
activitySchema.statics.getActivitySummary = async function(filter = {}, dateRange = null) {
  let query = filter;
  
  if (dateRange) {
    query.transactionDate = {
      $gte: new Date(dateRange.start),
      $lte: new Date(dateRange.end)
    };
  }
  
  const activities = await this.find(query);
  
  const summary = {
    totalTransactions: activities.length,
    byType: {},
    totalBuys: 0,
    totalSells: 0,
    totalDividends: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalCommissions: 0
  };
  
  activities.forEach(activity => {
    // Count by type
    summary.byType[activity.type] = (summary.byType[activity.type] || 0) + 1;
    
    // Sum amounts by type
    switch(activity.type) {
      case 'Buy':
        summary.totalBuys += Math.abs(activity.netAmount || 0);
        break;
      case 'Sell':
        summary.totalSells += Math.abs(activity.netAmount || 0);
        break;
      case 'Dividend':
        summary.totalDividends += Math.abs(activity.netAmount || 0);
        break;
      case 'Deposit':
        summary.totalDeposits += Math.abs(activity.netAmount || 0);
        break;
      case 'Withdrawal':
        summary.totalWithdrawals += Math.abs(activity.netAmount || 0);
        break;
    }
    
    summary.totalCommissions += Math.abs(activity.commission || 0);
  });
  
  return summary;
};

module.exports = mongoose.model('Activity', activitySchema);