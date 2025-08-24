const mongoose = require('mongoose');

const dailyPriceSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  openPrice: {
    type: Number,
    default: 0
  },
  closePrice: {
    type: Number,
    default: 0
  },
  highPrice: {
    type: Number,
    default: 0
  },
  lowPrice: {
    type: Number,
    default: 0
  },
  lastPrice: {
    type: Number,
    required: true
  },
  previousClose: {
    type: Number,
    default: 0
  },
  volume: {
    type: Number,
    default: 0
  },
  dayChange: {
    type: Number,
    default: 0
  },
  dayChangePercent: {
    type: Number,
    default: 0
  },
  marketCap: {
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
  isMarketOpen: {
    type: Boolean,
    default: false
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

// Compound index for unique daily price per symbol
dailyPriceSchema.index({ symbol: 1, date: 1 }, { unique: true });

// Static method to get latest price for symbol
dailyPriceSchema.statics.getLatestPrice = async function(symbol) {
  return this.findOne({ symbol })
    .sort({ date: -1 })
    .lean();
};

// Static method to upsert daily price
dailyPriceSchema.statics.upsertDailyPrice = async function(symbol, priceData) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return this.findOneAndUpdate(
    { symbol, date: today },
    {
      ...priceData,
      lastUpdated: new Date()
    },
    { upsert: true, new: true }
  );
};

// Static method to get prices for multiple symbols
dailyPriceSchema.statics.getMultiplePrices = async function(symbols) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const prices = await this.find({
    symbol: { $in: symbols },
    date: today
  }).lean();
  
  // Return as map for easy lookup
  const priceMap = {};
  prices.forEach(price => {
    priceMap[price.symbol] = price;
  });
  
  return priceMap;
};

module.exports = mongoose.model('DailyPrice', dailyPriceSchema);