const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true
  },
  
  symbolId: {
    type: Number,
    index: true
  },
  
  // Price data
  lastTradePrice: Number,
  lastTradeSize: Number,
  lastTradeTick: String,
  lastTradeTime: Date,
  
  bidPrice: Number,
  bidSize: Number,
  askPrice: Number,
  askSize: Number,
  
  openPrice: Number,
  highPrice: Number,
  lowPrice: Number,
  closePrice: Number,
  
  previousClosePrice: Number,
  change: Number,
  changePercent: Number,
  
  // Volume data
  volume: Number,
  averageVolume: Number,
  volumeWeightedAveragePrice: Number,
  
  // 52-week data
  week52High: Number,
  week52Low: Number,
  week52HighDate: Date,
  week52LowDate: Date,
  
  // Market cap and fundamentals
  marketCap: Number,
  eps: Number,
  pe: Number,
  dividend: Number,
  yield: Number,
  
  // Additional fields
  exchange: String,
  currency: String,
  isHalted: Boolean,
  delay: Number,
  
  // Metadata
  isRealTime: {
    type: Boolean,
    default: false
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for unique quotes
quoteSchema.index({ symbol: 1, lastUpdated: -1 });

// TTL index for automatic cleanup (24 hours)
quoteSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 86400 });

// Virtual for price change indicators
quoteSchema.virtual('isUp').get(function() {
  return this.change > 0;
});

quoteSchema.virtual('isDown').get(function() {
  return this.change < 0;
});

// Method to check if quote is stale
quoteSchema.methods.isStale = function(seconds = 10) {
  const age = Date.now() - this.lastUpdated;
  return age > (seconds * 1000);
};

// Static method to get latest quote
quoteSchema.statics.getLatest = function(symbol) {
  return this.findOne({ symbol })
    .sort({ lastUpdated: -1 });
};

// Static method to bulk update quotes
quoteSchema.statics.bulkUpdateQuotes = async function(quotes) {
  const operations = quotes.map(quote => ({
    updateOne: {
      filter: { symbol: quote.symbol },
      update: {
        $set: {
          ...quote,
          lastUpdated: new Date()
        }
      },
      upsert: true
    }
  }));
  
  return this.bulkWrite(operations);
};

module.exports = mongoose.model('Quote', quoteSchema);