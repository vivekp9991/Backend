
// src/models/AssetAllocation.js
const mongoose = require('mongoose');

const assetAllocationSchema = new mongoose.Schema({
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  calculationDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  totalValue: {
    type: Number,
    required: true
  },
  
  // Asset class allocation
  byAssetClass: [{
    assetClass: {
      type: String,
      enum: ['Stocks', 'Bonds', 'Cash', 'Commodities', 'RealEstate', 'Crypto', 'Other']
    },
    value: Number,
    percentage: Number,
    holdings: Number
  }],
  
  // Sector allocation
  bySector: [{
    sector: String,
    value: Number,
    percentage: Number,
    holdings: Number,
    symbols: [String]
  }],
  
  // Geographic allocation
  byGeography: [{
    country: String,
    region: String,
    value: Number,
    percentage: Number,
    holdings: Number
  }],
  
  // Currency allocation
  byCurrency: [{
    currency: String,
    value: Number,
    valueCAD: Number,
    percentage: Number,
    holdings: Number
  }],
  
  // Account type allocation
  byAccountType: [{
    accountType: String,
    value: Number,
    percentage: Number,
    accounts: Number
  }],
  
  // Market cap allocation
  byMarketCap: [{
    category: {
      type: String,
      enum: ['Large', 'Mid', 'Small', 'Micro', 'Unknown']
    },
    value: Number,
    percentage: Number,
    holdings: Number
  }],
  
  // Concentration metrics
  concentration: {
    top1Holding: { symbol: String, percentage: Number },
    top5Holdings: { value: Number, percentage: Number },
    top10Holdings: { value: Number, percentage: Number },
    herfindahlIndex: Number  // Concentration measure
  },
  
  // Diversification metrics
  diversification: {
    numberOfHoldings: Number,
    numberOfSectors: Number,
    numberOfCurrencies: Number,
    effectiveNumberOfHoldings: Number,  // Based on concentration
    diversificationRatio: Number
  },
  
  // Rebalancing suggestions
  rebalancingSuggestions: [{
    from: String,
    to: String,
    amount: Number,
    reason: String
  }],
  
  // Metadata
  isStale: {
    type: Boolean,
    default: false
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
assetAllocationSchema.index({ personName: 1, calculationDate: -1 });
assetAllocationSchema.index({ personName: 1, isStale: 1, calculationDate: -1 });

// Update timestamp
assetAllocationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get latest allocation
assetAllocationSchema.statics.getLatest = function(personName) {
  return this.findOne({ 
    personName,
    isStale: false
  }).sort({ calculationDate: -1 });
};

// Static method to mark old allocations as stale
assetAllocationSchema.statics.markStale = function(personName) {
  return this.updateMany(
    { personName },
    { isStale: true }
  );
};

module.exports = mongoose.model('AssetAllocation', assetAllocationSchema);