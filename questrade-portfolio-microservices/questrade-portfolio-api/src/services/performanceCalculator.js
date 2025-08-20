const axios = require('axios');
const logger = require('../utils/logger');

class PerformanceCalculator {
  constructor() {
    // Get Sync API URL from environment or use default
    this.syncApiUrl = process.env.SYNC_API_URL || 'http://localhost:3001/api';
  }

  /**
   * Make HTTP request to Sync API
   */
  async fetchFromSyncApi(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.syncApiUrl}${endpoint}`, { params });
      return response.data;
    } catch (error) {
      logger.error(`Error fetching from Sync API ${endpoint}:`, error.message);
      throw new Error(`Failed to fetch data from Sync API: ${error.message}`);
    }
  }

  /**
   * Calculate performance metrics for a given time period
   * @param {String} accountId - Account ID (optional)
   * @param {String} personName - Person name (optional)
   * @param {Date} startDate - Start date for calculation
   * @param {Date} endDate - End date for calculation
   */
  async calculatePerformance(accountId = null, personName = null, startDate = null, endDate = null) {
    try {
      // Prepare query parameters
      const params = {};
      if (accountId) params.accountId = accountId;
      if (personName) params.personName = personName;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      // Fetch data from Sync API
      const [positions, balances, activities] = await Promise.all([
        this.fetchFromSyncApi('/positions', params),
        this.fetchFromSyncApi('/balances', params),
        this.fetchFromSyncApi('/activities', params)
      ]);

      // Calculate metrics
      const metrics = {
        totalValue: this.calculateTotalValue(balances),
        totalCost: this.calculateTotalCost(positions),
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        realizedGainLoss: this.calculateRealizedGainLoss(activities),
        unrealizedGainLoss: this.calculateUnrealizedGainLoss(positions),
        totalDividends: this.calculateTotalDividends(activities),
        totalCommissions: this.calculateTotalCommissions(activities),
        numberOfTrades: this.countTrades(activities),
        topPerformers: this.getTopPerformers(positions, 5),
        worstPerformers: this.getWorstPerformers(positions, 5),
        positionCount: positions.length,
        accountCount: [...new Set(positions.map(p => p.accountId))].length
      };

      // Calculate total gain/loss
      metrics.totalGainLoss = metrics.realizedGainLoss + metrics.unrealizedGainLoss;
      
      // Calculate total gain/loss percentage
      if (metrics.totalCost > 0) {
        metrics.totalGainLossPercent = (metrics.totalGainLoss / metrics.totalCost) * 100;
      }

      return metrics;
    } catch (error) {
      logger.error('Error calculating performance:', error);
      throw error;
    }
  }

  /**
   * Calculate total portfolio value
   */
  calculateTotalValue(balances) {
    if (!Array.isArray(balances)) return 0;
    return balances.reduce((total, balance) => {
      return total + (balance.totalEquity || 0);
    }, 0);
  }

  /**
   * Calculate total cost basis
   */
  calculateTotalCost(positions) {
    if (!Array.isArray(positions)) return 0;
    return positions.reduce((total, position) => {
      return total + (position.totalCost || 0);
    }, 0);
  }

  /**
   * Calculate realized gain/loss from activities
   */
  calculateRealizedGainLoss(activities) {
    if (!Array.isArray(activities)) return 0;
    const sellActivities = activities.filter(a => a.type === 'Sell');
    return sellActivities.reduce((total, activity) => {
      // This is a simplified calculation
      // In reality, you'd need to match buys and sells for accurate calculation
      return total + (activity.netAmount || 0);
    }, 0);
  }

  /**
   * Calculate unrealized gain/loss from current positions
   */
  calculateUnrealizedGainLoss(positions) {
    if (!Array.isArray(positions)) return 0;
    return positions.reduce((total, position) => {
      const marketValue = position.currentMarketValue || 0;
      const cost = position.totalCost || 0;
      return total + (marketValue - cost);
    }, 0);
  }

  /**
   * Calculate total dividends received
   */
  calculateTotalDividends(activities) {
    if (!Array.isArray(activities)) return 0;
    const dividendActivities = activities.filter(a => a.type === 'Dividend');
    return dividendActivities.reduce((total, activity) => {
      return total + Math.abs(activity.netAmount || activity.grossAmount || 0);
    }, 0);
  }

  /**
   * Calculate total commissions paid
   */
  calculateTotalCommissions(activities) {
    if (!Array.isArray(activities)) return 0;
    return activities.reduce((total, activity) => {
      return total + Math.abs(activity.commission || 0);
    }, 0);
  }

  /**
   * Count number of trades
   */
  countTrades(activities) {
    if (!Array.isArray(activities)) return 0;
    return activities.filter(a => ['Buy', 'Sell'].includes(a.type)).length;
  }

  /**
   * Get top performing positions
   */
  getTopPerformers(positions, limit = 5) {
    if (!Array.isArray(positions)) return [];
    
    const positionsWithGainLoss = positions.map(position => {
      const marketValue = position.currentMarketValue || 0;
      const cost = position.totalCost || 0;
      const gainLoss = marketValue - cost;
      const gainLossPercent = cost > 0 ? (gainLoss / cost) * 100 : 0;
      
      return {
        symbol: position.symbol,
        quantity: position.openQuantity,
        marketValue,
        cost,
        gainLoss,
        gainLossPercent
      };
    });

    return positionsWithGainLoss
      .sort((a, b) => b.gainLossPercent - a.gainLossPercent)
      .slice(0, limit);
  }

  /**
   * Get worst performing positions
   */
  getWorstPerformers(positions, limit = 5) {
    if (!Array.isArray(positions)) return [];
    
    const positionsWithGainLoss = positions.map(position => {
      const marketValue = position.currentMarketValue || 0;
      const cost = position.totalCost || 0;
      const gainLoss = marketValue - cost;
      const gainLossPercent = cost > 0 ? (gainLoss / cost) * 100 : 0;
      
      return {
        symbol: position.symbol,
        quantity: position.openQuantity,
        marketValue,
        cost,
        gainLoss,
        gainLossPercent
      };
    });

    return positionsWithGainLoss
      .sort((a, b) => a.gainLossPercent - b.gainLossPercent)
      .slice(0, limit);
  }

  /**
   * Calculate daily returns
   */
  async calculateDailyReturns(accountId = null, personName = null, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const params = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      };
      if (accountId) params.accountId = accountId;
      if (personName) params.personName = personName;

      // Fetch historical data from Sync API
      const historicalData = await this.fetchFromSyncApi('/historical-balances', params);
      
      if (!historicalData || historicalData.length === 0) {
        logger.info('No historical balance data available');
        return [];
      }

      // Calculate daily returns
      const returns = [];
      for (let i = 1; i < historicalData.length; i++) {
        const prevValue = historicalData[i - 1].totalEquity;
        const currValue = historicalData[i].totalEquity;
        if (prevValue > 0) {
          const dailyReturn = ((currValue - prevValue) / prevValue) * 100;
          returns.push({
            date: historicalData[i].date,
            return: dailyReturn,
            value: currValue
          });
        }
      }

      return returns;
    } catch (error) {
      logger.error('Error calculating daily returns:', error);
      return [];
    }
  }

  /**
   * Calculate Sharpe ratio (simplified)
   */
  async calculateSharpeRatio(returns, riskFreeRate = 0.02) {
    if (!returns || returns.length === 0) {
      return 0;
    }

    const returnValues = returns.map(r => r.return || 0);
    const avgReturn = returnValues.reduce((a, b) => a + b, 0) / returnValues.length;
    const variance = returnValues.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returnValues.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    return (avgReturn - riskFreeRate) / stdDev;
  }

  /**
   * Calculate portfolio allocation
   */
  async calculateAllocation(accountId = null, personName = null) {
    try {
      const params = {};
      if (accountId) params.accountId = accountId;
      if (personName) params.personName = personName;

      const positions = await this.fetchFromSyncApi('/positions', params);
      
      if (!positions || positions.length === 0) {
        return [];
      }

      const totalValue = positions.reduce((sum, p) => sum + (p.currentMarketValue || 0), 0);
      
      if (totalValue === 0) {
        return [];
      }

      const allocation = positions.map(position => ({
        symbol: position.symbol,
        value: position.currentMarketValue || 0,
        percentage: ((position.currentMarketValue || 0) / totalValue) * 100,
        quantity: position.openQuantity
      }));

      return allocation.sort((a, b) => b.percentage - a.percentage);
    } catch (error) {
      logger.error('Error calculating allocation:', error);
      return [];
    }
  }

  /**
   * Get performance summary
   */
  async getPerformanceSummary(personName = null) {
    try {
      const params = personName ? { personName } : {};
      
      // Fetch summary from Sync API
      const summary = await this.fetchFromSyncApi('/summary', params);
      
      return summary;
    } catch (error) {
      logger.error('Error fetching performance summary:', error);
      throw error;
    }
  }
}

module.exports = new PerformanceCalculator();