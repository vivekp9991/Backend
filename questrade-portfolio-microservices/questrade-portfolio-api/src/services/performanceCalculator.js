const axios = require('axios');
const logger = require('../utils/logger');
const PortfolioSnapshot = require('../models/PortfolioSnapshot');
const PerformanceHistory = require('../models/PerformanceHistory');
const Decimal = require('decimal.js');
const moment = require('moment');

class PerformanceCalculator {
  constructor() {
    // Get Sync API URL from environment or use default
    this.syncApiUrl = process.env.SYNC_API_URL || 'http://localhost:4002/api';
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
   * Calculate returns for a specific period
   */
  async calculateReturns(personName, period = '1Y') {
    try {
      const dateHelpers = require('../utils/dateHelpers');
      const startDate = dateHelpers.getPeriodStartDate(period);
      const endDate = new Date();

      // Get portfolio values at start and end
      const [startSnapshot, endSnapshot] = await Promise.all([
        PortfolioSnapshot.findOne({ 
          personName, 
          snapshotDate: { $gte: startDate } 
        }).sort({ snapshotDate: 1 }),
        PortfolioSnapshot.getLatest(personName)
      ]);

      if (!startSnapshot || !endSnapshot) {
        // Fallback to current data if no snapshots
        const currentValue = await this.getCurrentPortfolioValue(personName);
        
        return {
          period,
          startDate,
          endDate,
          startValue: currentValue,
          endValue: currentValue,
          absoluteReturn: 0,
          percentageReturn: 0,
          timeWeightedReturn: 0,
          moneyWeightedReturn: 0,
          message: 'Insufficient historical data for accurate calculation'
        };
      }

      const startValue = startSnapshot.totalValueCAD;
      const endValue = endSnapshot.totalValueCAD;
      const absoluteReturn = endValue - startValue;
      const percentageReturn = startValue > 0 ? (absoluteReturn / startValue) * 100 : 0;

      // Calculate TWR and MWR
      const [twr, mwr] = await Promise.all([
        this.calculateTimeWeightedReturn(personName, startDate, endDate),
        this.calculateMoneyWeightedReturn(personName, startDate, endDate)
      ]);

      return {
        period,
        startDate,
        endDate,
        startValue,
        endValue,
        absoluteReturn,
        percentageReturn,
        timeWeightedReturn: twr,
        moneyWeightedReturn: mwr,
        annualizedReturn: this.annualizeReturn(percentageReturn / 100, startDate, endDate) * 100
      };
    } catch (error) {
      logger.error(`Error calculating returns for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Get current portfolio value
   */
  async getCurrentPortfolioValue(personName) {
    try {
      const params = { personName };
      const accountsResponse = await this.fetchFromSyncApi('/accounts/' + personName);
      
      if (!accountsResponse || !accountsResponse.data) {
        return 0;
      }

      const accounts = accountsResponse.data;
      let totalValue = 0;

      accounts.forEach(account => {
        if (account.summary) {
          totalValue += account.summary.totalEquityCAD || 0;
        }
      });

      return totalValue;
    } catch (error) {
      logger.error(`Error getting current portfolio value for ${personName}:`, error);
      return 0;
    }
  }

  /**
   * Get historical performance data
   */
  async getHistoricalPerformance(personName, startDate, endDate, interval = 'daily') {
    try {
      const snapshots = await PortfolioSnapshot.find({
        personName,
        snapshotDate: {
          $gte: startDate,
          $lte: endDate
        }
      }).sort({ snapshotDate: 1 });

      if (snapshots.length === 0) {
        return [];
      }

      const performance = [];
      let previousValue = snapshots[0].totalValueCAD;
      const initialValue = snapshots[0].totalValueCAD;

      snapshots.forEach((snapshot, index) => {
        if (index === 0) {
          performance.push({
            date: snapshot.snapshotDate,
            value: snapshot.totalValueCAD,
            dayReturn: 0,
            cumulativeReturn: 0
          });
        } else {
          const currentValue = snapshot.totalValueCAD;
          const dayReturn = previousValue > 0 
            ? ((currentValue - previousValue) / previousValue) * 100 
            : 0;
          
          const cumulativeReturn = initialValue > 0 
            ? ((currentValue - initialValue) / initialValue) * 100 
            : 0;

          performance.push({
            date: snapshot.snapshotDate,
            value: currentValue,
            dayReturn,
            cumulativeReturn
          });

          previousValue = currentValue;
        }
      });

      // Apply interval filtering if needed
      if (interval === 'weekly') {
        return this.filterByInterval(performance, 7);
      } else if (interval === 'monthly') {
        return this.filterByInterval(performance, 30);
      }

      return performance;
    } catch (error) {
      logger.error(`Error getting historical performance for ${personName}:`, error);
      return [];
    }
  }

  /**
   * Filter performance data by interval
   */
  filterByInterval(data, days) {
    if (data.length === 0) return [];
    
    const filtered = [data[0]];
    let lastDate = moment(data[0].date);

    for (let i = 1; i < data.length; i++) {
      const currentDate = moment(data[i].date);
      if (currentDate.diff(lastDate, 'days') >= days) {
        filtered.push(data[i]);
        lastDate = currentDate;
      }
    }

    // Always include the last data point
    if (filtered[filtered.length - 1] !== data[data.length - 1]) {
      filtered.push(data[data.length - 1]);
    }

    return filtered;
  }

  /**
   * Calculate Time-Weighted Return
   */
  async calculateTimeWeightedReturn(personName, startDate, endDate) {
    try {
      const snapshots = await PortfolioSnapshot.find({
        personName,
        snapshotDate: {
          $gte: startDate,
          $lte: endDate
        }
      }).sort({ snapshotDate: 1 });

      if (snapshots.length < 2) {
        return 0;
      }

      // Get cash flows to identify when money was added/removed
      const cashFlows = await this.getCashFlows(personName, startDate, endDate);

      // Calculate sub-period returns
      const subPeriodReturns = [];
      let lastValue = snapshots[0].totalValueCAD;

      for (let i = 1; i < snapshots.length; i++) {
        const currentValue = snapshots[i].totalValueCAD;
        
        // Check if there was a cash flow between snapshots
        const cashFlowAmount = this.getCashFlowBetweenDates(
          cashFlows,
          snapshots[i - 1].snapshotDate,
          snapshots[i].snapshotDate
        );

        // Adjust for cash flows
        const adjustedLastValue = lastValue + cashFlowAmount;
        
        if (adjustedLastValue > 0) {
          const periodReturn = (currentValue - adjustedLastValue) / adjustedLastValue;
          subPeriodReturns.push(periodReturn);
        }

        lastValue = currentValue;
      }

      // Geometrically link the returns
      const twr = this.geometricLinking(subPeriodReturns);
      return twr * 100;
    } catch (error) {
      logger.error(`Error calculating TWR for ${personName}:`, error);
      return 0;
    }
  }

  /**
   * Calculate Money-Weighted Return (simplified)
   */
  async calculateMoneyWeightedReturn(personName, startDate, endDate) {
    try {
      const [startSnapshot, endSnapshot] = await Promise.all([
        PortfolioSnapshot.findOne({ 
          personName, 
          snapshotDate: { $gte: startDate } 
        }).sort({ snapshotDate: 1 }),
        PortfolioSnapshot.findOne({ 
          personName, 
          snapshotDate: { $lte: endDate } 
        }).sort({ snapshotDate: -1 })
      ]);

      if (!startSnapshot || !endSnapshot) {
        return 0;
      }

      // Get cash flows
      const cashFlows = await this.getCashFlows(personName, startDate, endDate);

      // Simplified MWR calculation
      const totalInvested = startSnapshot.totalValueCAD + 
        cashFlows.filter(cf => cf.type === 'Deposit').reduce((sum, cf) => sum + cf.amount, 0);
      
      const totalWithdrawn = 
        cashFlows.filter(cf => cf.type === 'Withdrawal').reduce((sum, cf) => sum + Math.abs(cf.amount), 0);

      const netInvested = totalInvested - totalWithdrawn;
      const finalValue = endSnapshot.totalValueCAD;

      if (netInvested <= 0) return 0;

      const totalReturn = (finalValue - netInvested) / netInvested;
      
      // Annualize the return
      const days = moment(endDate).diff(moment(startDate), 'days');
      const years = days / 365;
      
      if (years > 0) {
        return (Math.pow(1 + totalReturn, 1 / years) - 1) * 100;
      }

      return totalReturn * 100;
    } catch (error) {
      logger.error(`Error calculating MWR for ${personName}:`, error);
      return 0;
    }
  }

  /**
   * Get cash flows from activities
   */
  async getCashFlows(personName, startDate, endDate) {
    try {
      const response = await this.fetchFromSyncApi('/activities/person/' + personName, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const activities = response.data || [];

      return activities
        .filter(activity => 
          activity.type === 'Deposit' || 
          activity.type === 'Withdrawal' ||
          activity.type === 'Transfer'
        )
        .map(activity => ({
          date: new Date(activity.transactionDate),
          amount: activity.netAmount || 0,
          type: activity.type
        }));
    } catch (error) {
      logger.error(`Error getting cash flows for ${personName}:`, error);
      return [];
    }
  }

  /**
   * Get cash flow amount between two dates
   */
  getCashFlowBetweenDates(cashFlows, startDate, endDate) {
    return cashFlows
      .filter(cf => cf.date > startDate && cf.date <= endDate)
      .reduce((sum, cf) => sum + cf.amount, 0);
  }

  /**
   * Geometric linking of returns
   */
  geometricLinking(returns) {
    if (returns.length === 0) return 0;
    
    let product = 1;
    for (const r of returns) {
      product *= (1 + r);
    }
    
    return product - 1;
  }

  /**
   * Annualize a return
   */
  annualizeReturn(returnValue, startDate, endDate) {
    const days = moment(endDate).diff(moment(startDate), 'days');
    const years = days / 365.0;

    if (years <= 0 || years === 1) return returnValue;

    return Math.pow(1 + returnValue, 1 / years) - 1;
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