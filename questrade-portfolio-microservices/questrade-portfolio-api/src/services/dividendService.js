const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const moment = require('moment');

class DividendService {
  constructor() {
    this.syncApiUrl = config.services.syncApiUrl;
  }

  /**
   * Fetch dividend activities for a person from Sync API
   */
  async fetchDividendActivities(personName, symbol = null) {
    try {
      const params = {
        personName,
        type: 'Dividend',
        limit: 1000
      };

      if (symbol) {
        params.symbol = symbol;
      }

      const response = await axios.get(`${this.syncApiUrl}/activities`, { params });
      
      if (response.data && response.data.success) {
        return response.data.data || [];
      }
      
      return [];
    } catch (error) {
      logger.error(`[DIVIDEND] Failed to fetch dividend activities for ${personName}:`, error.message);
      return [];
    }
  }

  /**
   * Calculate dividend data for a specific symbol
   */
  async calculateDividendData(symbol, positions, currentPrice) {
    try {
      // Collect all person names from positions
      const personNames = [...new Set(positions.map(p => p.personName))];
      
      // Fetch dividend activities for all persons
      const allDividendActivities = [];
      
      for (const personName of personNames) {
        const activities = await this.fetchDividendActivities(personName, symbol);
        allDividendActivities.push(...activities);
      }

      // Calculate total dividends received
      const totalReceived = allDividendActivities.reduce((sum, activity) => {
        return sum + Math.abs(activity.netAmount || activity.grossAmount || 0);
      }, 0);

      // Calculate total shares across all positions
      const totalShares = positions.reduce((sum, pos) => sum + pos.openQuantity, 0);
      
      // Calculate weighted average cost
      let totalCost = 0;
      positions.forEach(pos => {
        totalCost += pos.totalCost || (pos.openQuantity * pos.averageEntryPrice);
      });
      const avgCostPerShare = totalShares > 0 ? totalCost / totalShares : 0;

      // Group dividends by year and month
      const dividendsByPeriod = this.groupDividendsByPeriod(allDividendActivities);
      
      // Calculate annual dividend (last 12 months)
      const annualDividend = this.calculateAnnualDividend(allDividendActivities);
      const annualDividendPerShare = totalShares > 0 ? annualDividend / totalShares : 0;
      
      // Calculate monthly dividend per share (average of last 12 months)
      const monthlyDividendPerShare = annualDividendPerShare / 12;
      
      // Calculate yields
      const yieldOnCost = avgCostPerShare > 0 ? (annualDividendPerShare / avgCostPerShare) * 100 : 0;
      const currentYield = currentPrice > 0 ? (annualDividendPerShare / currentPrice) * 100 : 0;
      
      // Get dividend history (last 10 payments)
      const dividendHistory = this.formatDividendHistory(allDividendActivities, 10);

      return {
        totalReceived: Math.round(totalReceived * 100) / 100,
        monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 100) / 100,
        annualDividend: Math.round(annualDividend * 100) / 100,
        annualDividendPerShare: Math.round(annualDividendPerShare * 100) / 100,
        yieldOnCost: Math.round(yieldOnCost * 100) / 100,
        currentYield: Math.round(currentYield * 100) / 100,
        dividendHistory
      };
    } catch (error) {
      logger.error(`[DIVIDEND] Failed to calculate dividend data for ${symbol}:`, error);
      
      // Return empty dividend data on error
      return {
        totalReceived: 0,
        monthlyDividendPerShare: 0,
        annualDividend: 0,
        annualDividendPerShare: 0,
        yieldOnCost: 0,
        currentYield: 0,
        dividendHistory: []
      };
    }
  }

  /**
   * Group dividends by period for analysis
   */
  groupDividendsByPeriod(activities) {
    const grouped = {};
    
    activities.forEach(activity => {
      const date = moment(activity.transactionDate);
      const yearMonth = date.format('YYYY-MM');
      
      if (!grouped[yearMonth]) {
        grouped[yearMonth] = {
          period: yearMonth,
          total: 0,
          count: 0,
          activities: []
        };
      }
      
      grouped[yearMonth].total += Math.abs(activity.netAmount || activity.grossAmount || 0);
      grouped[yearMonth].count++;
      grouped[yearMonth].activities.push(activity);
    });
    
    return grouped;
  }

  /**
   * Calculate annual dividend (last 12 months)
   */
  calculateAnnualDividend(activities) {
    const twelveMonthsAgo = moment().subtract(12, 'months');
    
    const recentDividends = activities.filter(activity => {
      return moment(activity.transactionDate).isAfter(twelveMonthsAgo);
    });
    
    return recentDividends.reduce((sum, activity) => {
      return sum + Math.abs(activity.netAmount || activity.grossAmount || 0);
    }, 0);
  }

  /**
   * Format dividend history for response
   */
  formatDividendHistory(activities, limit = 10) {
    // Sort by date descending and take the most recent
    const sorted = activities
      .sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate))
      .slice(0, limit);
    
    return sorted.map(activity => ({
      date: moment(activity.transactionDate).format('YYYY-MM-DD'),
      amount: Math.round(Math.abs(activity.netAmount || activity.grossAmount || 0) * 100) / 100
    }));
  }

  /**
   * Calculate dividend summary for multiple symbols
   */
  async calculateDividendSummary(symbolPositionMap) {
    const dividendSummary = {};
    
    for (const [symbol, data] of symbolPositionMap.entries()) {
      dividendSummary[symbol] = await this.calculateDividendData(
        symbol,
        data.positions,
        data.currentPrice
      );
    }
    
    return dividendSummary;
  }
}

module.exports = new DividendService();