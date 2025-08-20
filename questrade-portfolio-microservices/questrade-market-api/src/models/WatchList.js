const mongoose = require('mongoose');

const watchListSchema = new mongoose.Schema({
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  name: {
    type: String,
    required: true
  },
  
  description: String,
  
  symbols: [{
    type: String,
    uppercase: true
  }],
  
  // Settings
  settings: {
    alertsEnabled: {
      type: Boolean,
      default: false
    },
    refreshInterval: {
      type: Number,
      default: 60 // seconds
    },
    sortBy: {
      type: String,
      enum: ['symbol', 'price', 'change', 'volume'],
      default: 'symbol'
    },
    sortOrder: {
      type: String,
      enum: ['asc', 'desc'],
      default: 'asc'
    }
  },
  
  // Price alerts
  alerts: [{
    symbol: String,
    type: {
      type: String,
      enum: ['above', 'below', 'change_percent']
    },
    threshold: Number,
    isActive: {
      type: Boolean,
      default: true
    },
    triggeredAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata
  isDefault: {
    type: Boolean,
    default: false
  },
  
  lastViewed: Date,
  
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
watchListSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Compound index for unique watchlist names per person
watchListSchema.index({ personName: 1, name: 1 }, { unique: true });

// Virtual for symbol count
watchListSchema.virtual('symbolCount').get(function() {
  return this.symbols ? this.symbols.length : 0;
});

// Method to add symbol
watchListSchema.methods.addSymbol = function(symbol) {
  const upperSymbol = symbol.toUpperCase();
  if (!this.symbols.includes(upperSymbol)) {
    this.symbols.push(upperSymbol);
  }
  return this.save();
};

// Method to remove symbol
watchListSchema.methods.removeSymbol = function(symbol) {
  const upperSymbol = symbol.toUpperCase();
  this.symbols = this.symbols.filter(s => s !== upperSymbol);
  return this.save();
};

// Static method to get person's watchlists
watchListSchema.statics.getByPerson = function(personName) {
  return this.find({ personName })
    .sort({ isDefault: -1, name: 1 });
};

module.exports = mongoose.model('WatchList', watchListSchema);