// src/models/PortfolioSnapshot.js
const mongoose = require('mongoose');

const portfolioSnapshotSchema = new mongoose.Schema({
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  snapshotDate: {
    type: Date,
    required: true,
    index: true
  },
  
  // Portfolio values
  totalValue: {
    type: Number,
    required: true
  },
  totalValueCAD: {
    type: Number,
    required: true
  },
  totalCash: {
    type: Number,
    default: 0
  },
  totalMarketValue: {
    type: Number,
    default: 0
  },
  
  // Performance metrics
  dayChange: {
    amount: Number,
    percentage: Number
  },
  totalReturn: {
    amount: Number,
    percentage: Number
  },
  
  // Holdings summary
  holdingsCount: {
    type: Number,
    default: 0
  },
  topHoldings: [{
    symbol: String,
    value: Number,
    percentage: Number
  }],
  
  // Account breakdown - FIXED: Changed from array of strings to array of objects
  accountBreakdown: [{
    accountId: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    value: {
      type: Number,
      required: true
    },
    percentage: {
      type: Number,
      required: true
    }
  }],
  
  // Asset allocation
  assetAllocation: {
    stocks: { value: Number, percentage: Number },
    bonds: { value: Number, percentage: Number },
    cash: { value: Number, percentage: Number },
    other: { value: Number, percentage: Number }
  },
  
  // Currency exposure
  currencyExposure: [{
    currency: String,
    value: Number,
    percentage: Number
  }],
  
  // Sector allocation
  sectorAllocation: [{
    sector: String,
    value: Number,
    percentage: Number
  }],
  
  // Risk metrics
  riskMetrics: {
    volatility: Number,
    sharpeRatio: Number,
    beta: Number,
    standardDeviation: Number
  },
  
  // Metadata
  calculatedAt: {
    type: Date,
    default: Date.now
  },
  isEndOfDay: {
    type: Boolean,
    default: false
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for unique daily snapshots
portfolioSnapshotSchema.index({ personName: 1, snapshotDate: 1 }, { unique: true });
portfolioSnapshotSchema.index({ personName: 1, snapshotDate: -1 });
portfolioSnapshotSchema.index({ totalValueCAD: -1 });

// Static method to get latest snapshot
portfolioSnapshotSchema.statics.getLatest = function(personName) {
  return this.findOne({ personName })
    .sort({ snapshotDate: -1 });
};

// Static method to get snapshots for date range
portfolioSnapshotSchema.statics.getDateRange = function(personName, startDate, endDate) {
  return this.find({
    personName,
    snapshotDate: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ snapshotDate: 1 });
};

// Static method to get end-of-day snapshots
portfolioSnapshotSchema.statics.getEODSnapshots = function(personName, limit = 365) {
  return this.find({
    personName,
    isEndOfDay: true
  })
  .sort({ snapshotDate: -1 })
  .limit(limit);
};

module.exports = mongoose.model('PortfolioSnapshot', portfolioSnapshotSchema);