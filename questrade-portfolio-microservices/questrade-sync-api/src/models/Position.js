const mongoose = require('mongoose');
const Decimal = require('decimal.js');

const positionSchema = new mongoose.Schema({
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
  
  // Security information
  symbol: {
    type: String,
    required: true,
    index: true
  },
  symbolId: {
    type: Number,
    required: true
  },
  
  // Position details
  openQuantity: {
    type: Number,
    required: true
  },
  closedQuantity: {
    type: Number,
    default: 0
  },
  currentMarketValue: {
    type: Number,
    default: 0
  },
  currentPrice: {
    type: Number,
    default: 0
  },
  averageEntryPrice: {
    type: Number,
    default: 0
  },
  totalCost: {
    type: Number,
    default: 0
  },
  
  // Profit/Loss calculations
  openPnl: {
    type: Number,
    default: 0
  },
  closedPnl: {
    type: Number,
    default: 0
  },
  dayPnl: {
    type: Number,
    default: 0
  },
  
  // Additional fields
  isRealTime: {
    type: Boolean,
    default: false
  },
  isUnderReorg: {
    type: Boolean,
    default: false
  },
  
  // Sync metadata
  lastSyncedAt: Date,
  lastPriceUpdate: Date,
  
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
positionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate total cost if not set
  if (this.openQuantity && this.averageEntryPrice && !this.totalCost) {
    this.totalCost = new Decimal(this.openQuantity)
      .mul(this.averageEntryPrice)
      .toNumber();
  }
  
  // Calculate open P&L
  if (this.currentMarketValue && this.totalCost) {
    this.openPnl = new Decimal(this.currentMarketValue)
      .minus(this.totalCost)
      .toNumber();
  }
  
  next();
});

// Indexes
positionSchema.index({ accountId: 1, symbol: 1 }, { unique: true });
positionSchema.index({ personName: 1, symbol: 1 });
positionSchema.index({ currentMarketValue: -1 });
positionSchema.index({ openPnl: -1 });

// Virtual for P&L percentage
positionSchema.virtual('openPnlPercent').get(function() {
  if (!this.totalCost || this.totalCost === 0) return 0;
  return (this.openPnl / this.totalCost) * 100;
});

// Method to update from Questrade data
positionSchema.methods.updateFromQuestrade = function(questradeData) {
  Object.assign(this, {
    openQuantity: questradeData.openQuantity,
    closedQuantity: questradeData.closedQuantity || 0,
    currentMarketValue: questradeData.currentMarketValue,
    currentPrice: questradeData.currentPrice,
    averageEntryPrice: questradeData.averageEntryPrice,
    totalCost: questradeData.totalCost,
    openPnl: questradeData.openPnl,
    closedPnl: questradeData.closedPnl || 0,
    dayPnl: questradeData.dayPnl || 0,
    isRealTime: questradeData.isRealTime || false,
    isUnderReorg: questradeData.isUnderReorg || false,
    lastSyncedAt: new Date(),
    lastPriceUpdate: new Date()
  });
  
  return this.save();
};

// Static method to get positions by account
positionSchema.statics.getByAccount = function(accountId) {
  return this.find({ accountId })
    .sort({ currentMarketValue: -1 });
};

// Static method to get all positions for a person
positionSchema.statics.getByPerson = function(personName) {
  return this.find({ personName })
    .sort({ currentMarketValue: -1 });
};

// Static method to calculate portfolio summary
positionSchema.statics.getPortfolioSummary = async function(filter = {}) {
  const positions = await this.find(filter);
  
  const summary = positions.reduce((acc, pos) => {
    acc.totalMarketValue = new Decimal(acc.totalMarketValue)
      .plus(pos.currentMarketValue || 0)
      .toNumber();
    acc.totalCost = new Decimal(acc.totalCost)
      .plus(pos.totalCost || 0)
      .toNumber();
    acc.totalOpenPnl = new Decimal(acc.totalOpenPnl)
      .plus(pos.openPnl || 0)
      .toNumber();
    acc.totalDayPnl = new Decimal(acc.totalDayPnl)
      .plus(pos.dayPnl || 0)
      .toNumber();
    acc.positionCount++;
    
    return acc;
  }, {
    totalMarketValue: 0,
    totalCost: 0,
    totalOpenPnl: 0,
    totalDayPnl: 0,
    positionCount: 0
  });
  
  // Calculate percentage
  if (summary.totalCost > 0) {
    summary.totalOpenPnlPercent = (summary.totalOpenPnl / summary.totalCost) * 100;
  } else {
    summary.totalOpenPnlPercent = 0;
  }
  
  return summary;
};

module.exports = mongoose.model('Position', positionSchema);