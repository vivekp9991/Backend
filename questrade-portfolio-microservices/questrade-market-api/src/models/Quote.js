const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true
  },
  
  symbolId: {
    type: Number,
    index: true,
    default: 0
  },
  
  // Price data
  lastTradePrice: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'lastTradePrice must be a valid number'
    }
  },
  lastTradeSize: {
    type: Number,
    default: 0
  },
  lastTradeTick: String,
  lastTradeTime: Date,
  
  bidPrice: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'bidPrice must be a valid number'
    }
  },
  bidSize: {
    type: Number,
    default: 0
  },
  askPrice: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'askPrice must be a valid number'
    }
  },
  askSize: {
    type: Number,
    default: 0
  },
  
  openPrice: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'openPrice must be a valid number'
    }
  },
  highPrice: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'highPrice must be a valid number'
    }
  },
  lowPrice: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'lowPrice must be a valid number'
    }
  },
  closePrice: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'closePrice must be a valid number'
    }
  },
  
  // Previous close price - IMPORTANT for day change calculation
  previousClosePrice: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'previousClosePrice must be a valid number'
    }
  },
  
  // Calculated day change fields
  dayChange: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'dayChange must be a valid number'
    }
  },
  dayChangePercent: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'dayChangePercent must be a valid number'
    }
  },
  
  // Volume data
  volume: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'volume must be a valid number'
    }
  },
  averageVolume: {
    type: Number,
    default: 0
  },
  volumeWeightedAveragePrice: {
    type: Number,
    default: 0
  },
  
  // 52-week data
  week52High: {
    type: Number,
    default: 0
  },
  week52Low: {
    type: Number,
    default: 0
  },
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
  isHalted: {
    type: Boolean,
    default: false
  },
  delay: {
    type: Number,
    default: 0
  },
  
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
  return this.dayChange > 0;
});

quoteSchema.virtual('isDown').get(function() {
  return this.dayChange < 0;
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
  // Validate each quote before bulk update
  const validatedQuotes = quotes.map(quote => {
    const validated = { ...quote };
    
    // Ensure numeric fields are valid
    const numericFields = [
      'symbolId', 'lastTradePrice', 'bidPrice', 'askPrice',
      'openPrice', 'highPrice', 'lowPrice', 'closePrice',
      'previousClosePrice', 'dayChange', 'dayChangePercent', 'volume'
    ];
    
    numericFields.forEach(field => {
      if (validated[field] !== undefined) {
        const value = Number(validated[field]);
        validated[field] = (isNaN(value) || !isFinite(value)) ? 0 : value;
      }
    });
    
    return validated;
  });
  
  const operations = validatedQuotes.map(quote => ({
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

// Ensure required fields have proper defaults before saving
quoteSchema.pre('save', function(next) {
  // Helper function to validate and fix numeric values
  const validateNumber = (value, defaultValue = 0) => {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    const num = Number(value);
    return (isNaN(num) || !isFinite(num)) ? defaultValue : num;
  };
  
  // Validate all numeric fields
  this.lastTradePrice = validateNumber(this.lastTradePrice);
  this.previousClosePrice = validateNumber(this.previousClosePrice);
  this.bidPrice = validateNumber(this.bidPrice);
  this.askPrice = validateNumber(this.askPrice);
  this.openPrice = validateNumber(this.openPrice);
  this.highPrice = validateNumber(this.highPrice);
  this.lowPrice = validateNumber(this.lowPrice);
  this.closePrice = validateNumber(this.closePrice);
  this.volume = validateNumber(this.volume);
  
  // Calculate day change if we have both prices
  if (this.lastTradePrice > 0 && this.previousClosePrice > 0) {
    this.dayChange = this.lastTradePrice - this.previousClosePrice;
    this.dayChangePercent = (this.dayChange / this.previousClosePrice) * 100;
    
    // Ensure no NaN or Infinity
    if (isNaN(this.dayChange) || !isFinite(this.dayChange)) {
      this.dayChange = 0;
    }
    if (isNaN(this.dayChangePercent) || !isFinite(this.dayChangePercent)) {
      this.dayChangePercent = 0;
    }
    
    // Round to reasonable precision
    this.dayChange = Math.round(this.dayChange * 100) / 100;
    this.dayChangePercent = Math.round(this.dayChangePercent * 100) / 100;
  } else {
    this.dayChange = 0;
    this.dayChangePercent = 0;
  }
  
  next();
});

// Pre-validate hook to ensure no NaN values
quoteSchema.pre('validate', function(next) {
  const numericFields = [
    'symbolId', 'lastTradePrice', 'lastTradeSize', 'bidPrice', 'bidSize',
    'askPrice', 'askSize', 'openPrice', 'highPrice', 'lowPrice', 'closePrice',
    'previousClosePrice', 'dayChange', 'dayChangePercent',
    'volume', 'averageVolume', 'volumeWeightedAveragePrice', 'week52High', 'week52Low', 'delay'
  ];
  
  numericFields.forEach(field => {
    if (this[field] !== undefined && (isNaN(this[field]) || !isFinite(this[field]))) {
      this[field] = 0;
    }
  });
  
  next();
});

module.exports = mongoose.model('Quote', quoteSchema);