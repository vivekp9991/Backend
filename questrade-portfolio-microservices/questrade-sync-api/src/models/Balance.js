const mongoose = require('mongoose');

const balanceSchema = new mongoose.Schema({
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
  
  // Currency
  currency: {
    type: String,
    required: true,
    enum: ['CAD', 'USD'],
    index: true
  },
  
  // Cash balances
  cash: {
    type: Number,
    default: 0
  },
  marketValue: {
    type: Number,
    default: 0
  },
  totalEquity: {
    type: Number,
    default: 0
  },
  buyingPower: {
    type: Number,
    default: 0
  },
  maintenanceExcess: {
    type: Number,
    default: 0
  },
  
  // Combined balances (if account has multiple currencies)
  combinedBalances: [{
    currency: String,
    cash: Number,
    marketValue: Number,
    totalEquity: Number,
    buyingPower: Number,
    maintenanceExcess: Number
  }],
  
  // Per-currency balances
  perCurrencyBalances: [{
    currency: String,
    cash: Number,
    marketValue: Number,
    totalEquity: Number
  }],
  
  // SOD (Start of Day) balances for P&L calculations
  sodBalances: {
    cash: Number,
    marketValue: Number,
    totalEquity: Number,
    date: Date
  },
  
  // Sync metadata
  isRealTime: {
    type: Boolean,
    default: false
  },
  lastSyncedAt: Date,
  
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
balanceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate total equity if not set
  if (!this.totalEquity && (this.cash || this.marketValue)) {
    this.totalEquity = (this.cash || 0) + (this.marketValue || 0);
  }
  
  next();
});

// Compound index for unique balance per account/currency
balanceSchema.index({ accountId: 1, currency: 1 }, { unique: true });
balanceSchema.index({ personName: 1, currency: 1 });
balanceSchema.index({ totalEquity: -1 });

// Virtual for daily P&L
balanceSchema.virtual('dailyPnl').get(function() {
  if (!this.sodBalances || !this.sodBalances.totalEquity) return 0;
  return this.totalEquity - this.sodBalances.totalEquity;
});

// Virtual for daily P&L percentage
balanceSchema.virtual('dailyPnlPercent').get(function() {
  if (!this.sodBalances || !this.sodBalances.totalEquity || this.sodBalances.totalEquity === 0) return 0;
  return ((this.totalEquity - this.sodBalances.totalEquity) / this.sodBalances.totalEquity) * 100;
});

// Method to update from Questrade data
balanceSchema.methods.updateFromQuestrade = function(questradeData) {
  Object.assign(this, {
    cash: questradeData.cash,
    marketValue: questradeData.marketValue,
    totalEquity: questradeData.totalEquity,
    buyingPower: questradeData.buyingPower,
    maintenanceExcess: questradeData.maintenanceExcess,
    isRealTime: questradeData.isRealTime || false,
    lastSyncedAt: new Date()
  });
  
  // Update combined balances if present
  if (questradeData.combinedBalances) {
    this.combinedBalances = questradeData.combinedBalances;
  }
  
  // Update per-currency balances if present
  if (questradeData.perCurrencyBalances) {
    this.perCurrencyBalances = questradeData.perCurrencyBalances;
  }
  
  return this.save();
};

// Method to set SOD balances
balanceSchema.methods.setSodBalances = function() {
  this.sodBalances = {
    cash: this.cash,
    marketValue: this.marketValue,
    totalEquity: this.totalEquity,
    date: new Date()
  };
  return this.save();
};

// Static method to get balances by account
balanceSchema.statics.getByAccount = function(accountId) {
  return this.find({ accountId })
    .sort({ currency: 1 });
};

// Static method to get all balances for a person
balanceSchema.statics.getByPerson = function(personName) {
  return this.find({ personName })
    .sort({ totalEquity: -1 });
};

// Static method to get total equity across all accounts
balanceSchema.statics.getTotalEquity = async function(filter = {}) {
  const balances = await this.find(filter);
  
  return balances.reduce((total, balance) => {
    // Convert USD to CAD (simplified - should use real exchange rate)
    const multiplier = balance.currency === 'USD' ? 1.35 : 1;
    return total + (balance.totalEquity * multiplier);
  }, 0);
};

module.exports = mongoose.model('Balance', balanceSchema);