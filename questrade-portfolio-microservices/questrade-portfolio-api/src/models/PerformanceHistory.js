// src/models/PerformanceHistory.js
const mongoose = require('mongoose');

const performanceHistorySchema = new mongoose.Schema({
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  date: {
    type: Date,
    required: true,
    index: true
  },
  
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
    required: true,
    index: true
  },
  
  // Values
  startValue: {
    type: Number,
    required: true
  },
  endValue: {
    type: Number,
    required: true
  },
  
  // Cash flows
  deposits: {
    type: Number,
    default: 0
  },
  withdrawals: {
    type: Number,
    default: 0
  },
  netCashFlow: {
    type: Number,
    default: 0
  },
  
  // Returns
  absoluteReturn: {
    type: Number,
    required: true
  },
  percentageReturn: {
    type: Number,
    required: true
  },
  timeWeightedReturn: {
    type: Number
  },
  moneyWeightedReturn: {
    type: Number
  },
  
  // Cumulative returns
  cumulativeReturn: {
    amount: Number,
    percentage: Number
  },
  
  // Risk metrics for the period
  volatility: Number,
  maxDrawdown: Number,
  
  // Benchmark comparison
  benchmarkReturn: Number,
  alpha: Number,
  
  // Best/Worst performers
  topPerformers: [{
    symbol: String,
    return: Number
  }],
  worstPerformers: [{
    symbol: String,
    return: Number
  }],
  
  // Metadata
  calculatedAt: {
    type: Date,
    default: Date.now
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for unique period records
performanceHistorySchema.index({ personName: 1, date: 1, period: 1 }, { unique: true });
performanceHistorySchema.index({ personName: 1, period: 1, date: -1 });

// Static method to get performance for period
performanceHistorySchema.statics.getPerformance = function(personName, period, limit = 100) {
  return this.find({
    personName,
    period
  })
  .sort({ date: -1 })
  .limit(limit);
};

// Static method to calculate cumulative returns
performanceHistorySchema.statics.getCumulativeReturns = async function(personName, startDate, endDate, period = 'daily') {
  const records = await this.find({
    personName,
    period,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: 1 });
  
  let cumulativeReturn = 1;
  const returns = [];
  
  records.forEach(record => {
    cumulativeReturn *= (1 + record.percentageReturn / 100);
    returns.push({
      date: record.date,
      periodReturn: record.percentageReturn,
      cumulativeReturn: (cumulativeReturn - 1) * 100
    });
  });
  
  return returns;
};

module.exports = mongoose.model('PerformanceHistory', performanceHistorySchema);