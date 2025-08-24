const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const moment = require('moment');

class DividendService {
  constructor() {
    this.syncApiUrl = config.services.syncApiUrl;
    this.dividendCache = new Map(); // In-memory cache for dividend data
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Fetch dividend activities for a person from Sync API
   */
  async fetchDividendActivities(personName, symbol = null) {
    try {
      // Check cache first
      const cacheKey = `${personName}_${symbol || 'all'}`;
      const cached = this.dividendCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
        logger.debug(`[DIVIDEND] Using cached data for ${cacheKey}`);
        return cached.data;
      }
      
      // Use the correct endpoint for dividend activities
      const endpoint = `/activities/dividends/${personName}`;
      const params = symbol ? { symbol } : {};
      
      logger.debug(`[DIVIDEND] Fetching from ${this.syncApiUrl}${endpoint}`);
      
      const response = await axios.get(`${this.syncApiUrl}${endpoint}`, { 
        params,
        timeout: 10000 // 10 second timeout
      });
      
      if (response.data && response.data.success) {
        const activities = response.data.data || [];
        
        // Cache the result
        this.dividendCache.set(cacheKey, {
          data: activities,
          timestamp: Date.now()
        });
        
        return activities;
      }
      
      return [];
    } catch (error) {
      // Log error but don't throw - return empty array to continue
      logger.error(`[DIVIDEND] Failed to fetch dividend activities for ${personName}:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // Return cached data if available, even if expired
      const cacheKey = `${personName}_${symbol || 'all'}`;
      const cached = this.dividendCache.get(cacheKey);
      if (cached) {
        logger.info(`[DIVIDEND] Returning expired cache for ${cacheKey} due to fetch error`);
        return cached.data;
      }
      
      return [];
    }
  }

  /**
   * Calculate dividend data for a specific symbol
   */
  async calculateDividendData(symbol, positions, currentPrice) {
    try {
      // Return empty dividend data if no positions
      if (!positions || positions.length === 0) {
        return this.getEmptyDividendData();
      }
      
      // Collect all person names from positions
      const personNames = [...new Set(positions.map(p => p.personName).filter(Boolean))];
      
      if (personNames.length === 0) {
        return this.getEmptyDividendData();
      }
      
      // Fetch dividend activities for all persons (with error handling)
      const allDividendActivities = [];
      
      for (const personName of personNames) {
        try {
          const activities = await this.fetchDividendActivities(personName, symbol);
          allDividendActivities.push(...activities);
        } catch (error) {
          // Individual fetch failed, continue with others
          logger.debug(`[DIVIDEND] Skipping ${personName} due to fetch error`);
        }
      }

      // If no dividend data available, return empty structure
      if (allDividendActivities.length === 0) {
        return this.getEmptyDividendData();
      }

      // Calculate total dividends received
      const totalReceived = allDividendActivities.reduce((sum, activity) => {
        return sum + Math.abs(activity.netAmount || activity.grossAmount || 0);
      }, 0);

      // Calculate total shares across all positions
      const totalShares = positions.reduce((sum, pos) => sum + (pos.openQuantity || 0), 0);
      
      // Calculate weighted average cost
      let totalCost = 0;
      positions.forEach(pos => {
        totalCost += pos.totalCost || (pos.openQuantity * pos.averageEntryPrice) || 0;
      });
      const avgCostPerShare = totalShares > 0 ? totalCost / totalShares : 0;

      // Group dividends by period
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
      logger.error(`[DIVIDEND] Failed to calculate dividend data for ${symbol}:`, error.message);
      return this.getEmptyDividendData();
    }
  }

  /**
   * Get empty dividend data structure
   */
  getEmptyDividendData() {
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
   * Clear dividend cache (for manual refresh)
   */
  clearCache() {
    this.dividendCache.clear();
    logger.info('[DIVIDEND] Cache cleared');
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