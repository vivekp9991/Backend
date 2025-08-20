// src/utils/mathHelpers.js
const Decimal = require('decimal.js');

class MathHelpers {
  // Calculate standard deviation
  standardDeviation(values) {
    if (!values || values.length === 0) return 0;
    
    const n = values.length;
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / n;
    
    return Math.sqrt(variance);
  }
  
  // Calculate Sharpe ratio
  sharpeRatio(returns, riskFreeRate = 0.02) {
    const avgReturn = this.average(returns);
    const stdDev = this.standardDeviation(returns);
    
    if (stdDev === 0) return 0;
    
    return (avgReturn - riskFreeRate) / stdDev;
  }
  
  // Calculate average
  average(values) {
    if (!values || values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  // Calculate percentile
  percentile(values, percentile) {
    if (!values || values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    
    if (Number.isInteger(index)) {
      return sorted[index];
    }
    
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
  
  // Calculate correlation
  correlation(x, y) {
    if (!x || !y || x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const meanX = this.average(x);
    const meanY = this.average(y);
    
    let numerator = 0;
    let denomX = 0;
    let denomY = 0;
    
    for (let i = 0; i < n; i++) {
      const diffX = x[i] - meanX;
      const diffY = y[i] - meanY;
      
      numerator += diffX * diffY;
      denomX += diffX * diffX;
      denomY += diffY * diffY;
    }
    
    const denominator = Math.sqrt(denomX * denomY);
    
    if (denominator === 0) return 0;
    
    return numerator / denominator;
  }
  
  // Format currency
  formatCurrency(value, currency = 'CAD') {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: currency
    }).format(value);
  }
  
  // Format percentage
  formatPercentage(value, decimals = 2) {
    return `${value.toFixed(decimals)}%`;
  }
  
  // Safe division
  safeDivide(numerator, denominator, defaultValue = 0) {
    if (!denominator || denominator === 0) return defaultValue;
    return numerator / denominator;
  }
  
  // Calculate compound return
  compoundReturn(returns) {
    return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  }
}

module.exports = new MathHelpers();