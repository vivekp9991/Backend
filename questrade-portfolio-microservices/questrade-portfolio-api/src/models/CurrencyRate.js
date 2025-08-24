const mongoose = require('mongoose');

const currencyRateSchema = new mongoose.Schema({
  fromCurrency: {
    type: String,
    required: true,
    index: true
  },
  toCurrency: {
    type: String,
    required: true,
    index: true
  },
  rate: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    required: true
  },
  source: {
    type: String,
    default: 'twelvedata'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
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

// Compound index for unique currency pair
currencyRateSchema.index({ fromCurrency: 1, toCurrency: 1 }, { unique: true });

// Update timestamp on save
currencyRateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get latest rate
currencyRateSchema.statics.getLatestRate = async function(fromCurrency, toCurrency) {
  const rate = await this.findOne({
    fromCurrency,
    toCurrency
  }).sort({ timestamp: -1 });
  
  return rate;
};

// Static method to upsert rate
currencyRateSchema.statics.upsertRate = async function(fromCurrency, toCurrency, rate, timestamp) {
  return this.findOneAndUpdate(
    { fromCurrency, toCurrency },
    {
      rate,
      timestamp,
      updatedAt: new Date()
    },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('CurrencyRate', currencyRateSchema);