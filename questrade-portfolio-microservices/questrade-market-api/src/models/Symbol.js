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
  
  // Additional information
  sector: String,
  industry: String,
  marketCap: Number,
  
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

module.exports = mongoose.model('Symbol', symbolSchema);