const mongoose = require('mongoose');

const marketDataSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    index: true
  },
  
  type: {
    type: String,
    enum: ['summary', 'movers', 'sectors', 'breadth'],
    required: true
  },
  
  // Market summary data
  summary: {
    totalVolume: Number,
    advancers: Number,
    decliners: Number,
    unchanged: Number,
    newHighs: Number,
    newLows: Number
  },
  
  // Market movers
  movers: {
    gainers: [{
      symbol: String,
      price: Number,
      change: Number,
      changePercent: Number,
      volume: Number
    }],
    losers: [{
      symbol: String,
      price: Number,
      change: Number,
      changePercent: Number,
      volume: Number
    }],
    mostActive: [{
      symbol: String,
      price: Number,
      volume: Number
    }]
  },
  
  // Sector performance
  sectors: [{
    name: String,
    change: Number,
    changePercent: Number,
    volume: Number,
    advancers: Number,
    decliners: Number
  }],
  
  // Market breadth indicators
  breadth: {
    advanceDeclineRatio: Number,
    upDownVolumeRatio: Number,
    highLowRatio: Number,
    percentAbove50DMA: Number,
    percentAbove200DMA: Number
  },
  
  // Metadata
  isRealTime: {
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

// Indexes
marketDataSchema.index({ date: -1, type: 1 });
marketDataSchema.index({ lastUpdated: -1 });

// Static method to get latest market data
marketDataSchema.statics.getLatest = function(type) {
  return this.findOne({ type })
    .sort({ date: -1 });
};

module.exports = mongoose.model('MarketData', marketDataSchema);