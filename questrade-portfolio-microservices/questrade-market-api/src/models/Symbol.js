const mongoose = require('mongoose');

const symbolSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  symbolId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  
  description: {
    type: String,
    required: true
  },
  
  // Security details
  securityType: {
    type: String,
    enum: ['Stock', 'Option', 'Bond', 'ETF', 'MutualFund', 'Index', 'Commodity', 'Forex']
  },
  
  exchange: String,
  listingExchange: String,
  
  // Trading information
  isTradable: {
    type: Boolean,
    default: true
  },
  
  isQuotable: {
    type: Boolean,
    default: true
  },
  
  hasOptions: {
    type: Boolean,
    default: false
  },
  
  currency: {
    type: String,
    default: 'USD'
  },
  
  // Market data - NEW FIELDS
  prevDayClosePrice: {
    type: Number,
    default: 0
  },
  
  highPrice52: {
    type: Number,
    default: 0
  },
  
  lowPrice52: {
    type: Number,
    default: 0
  },
  
  averageVol3Months: {
    type: Number,
    default: 0
  },
  
  averageVol20Days: {
    type: Number,
    default: 0
  },
  
  outstandingShares: {
    type: Number,
    default: 0
  },
  
  eps: {
    type: Number,
    default: 0
  },
  
  pe: {
    type: Number,
    default: 0
  },
  
  dividend: {
    type: Number,
    default: 0
  },
  
  yield: {
    type: Number,
    default: 0
  },
  
  exDate: Date,
  dividendDate: Date,
  
  marketCap: {
    type: Number,
    default: 0
  },
  
  tradeUnit: {
    type: Number,
    default: 1
  },
  
  // Additional information
  sector: String,
  industry: String,
  industrySector: String,
  industryGroup: String,
  industrySubGroup: String,
  
  // Option-specific fields
  optionType: String,
  optionRoot: String,
  optionContractDeliverables: {
    underlyingSymbol: String,
    underlyingSymbolId: Number,
    deliverableQuantity: Number
  },
  
  // Metadata
  isActive: {
    type: Boolean,
    default: true
  },
  
  lastDetailUpdate: {
    type: Date,
    default: null
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
symbolSchema.index({ description: 'text' });
symbolSchema.index({ securityType: 1 });
symbolSchema.index({ exchange: 1 });
symbolSchema.index({ isActive: 1 });

// Static method to search symbols
symbolSchema.statics.searchSymbols = function(prefix, limit = 10) {
  const regex = new RegExp(`^${prefix}`, 'i');
  
  return this.find({
    $or: [
      { symbol: regex },
      { description: regex }
    ],
    isActive: true
  })
  .limit(limit)
  .sort({ symbol: 1 });
};

// Method to check if details need refresh (older than 1 hour)
symbolSchema.methods.needsDetailRefresh = function() {
  if (!this.lastDetailUpdate) return true;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.lastDetailUpdate < oneHourAgo;
};

module.exports = mongoose.model('Symbol', symbolSchema);