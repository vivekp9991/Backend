const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const moment = require('moment');

class DividendService {
  constructor() {
    this.syncApiUrl = config.services.syncApiUrl || 'http://localhost:4002/api';
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
      
      const fullUrl = `${this.syncApiUrl}${endpoint}`;
      logger.info(`[DIVIDEND] Fetching from ${fullUrl} with params:`, params);
      
      try {
        const response = await axios.get(fullUrl, { 
          params,
          timeout: 10000 // 10 second timeout
        });
        
        logger.info(`[DIVIDEND] Response received:`, {
          status: response.status,
          hasData: !!response.data,
          success: response.data?.success,
          dataLength: response.data?.data?.length || 0
        });
        
        if (response.data && response.data.success) {
          const activities = response.data.data || [];
          
          logger.info(`[DIVIDEND] Found ${activities.length} dividend activities for ${personName}${symbol ? ` (${symbol})` : ''}`);
          
          // Log sample activity for debugging
          if (activities.length > 0) {
            logger.debug(`[DIVIDEND] Sample activity:`, activities[0]);
          }
          
          // Cache the result
          this.dividendCache.set(cacheKey, {
            data: activities,
            timestamp: Date.now()
          });
          
          return activities;
        } else {
          logger.warn(`[DIVIDEND] Response not successful for ${personName}:`, response.data);
          return [];
        }
      } catch (axiosError) {
        // More detailed error logging
        if (axiosError.response) {
          logger.error(`[DIVIDEND] API responded with error for ${personName}:`, {
            status: axiosError.response.status,
            statusText: axiosError.response.statusText,
            data: axiosError.response.data
          });
        } else if (axiosError.request) {
          logger.error(`[DIVIDEND] No response received for ${personName}:`, {
            url: fullUrl,
            message: axiosError.message
          });
        } else {
          logger.error(`[DIVIDEND] Request setup error for ${personName}:`, axiosError.message);
        }
        
        // Return cached data if available, even if expired
        const cacheKey = `${personName}_${symbol || 'all'}`;
        const cached = this.dividendCache.get(cacheKey);
        if (cached) {
          logger.info(`[DIVIDEND] Returning expired cache for ${cacheKey} due to fetch error`);
          return cached.data;
        }
        
        return [];
      }
    } catch (error) {
      // Outer catch for any other errors
      logger.error(`[DIVIDEND] Unexpected error fetching activities for ${personName}:`, {
        message: error.message,
        stack: error.stack
      });
      
      return [];
    }
  }

  /**
   * Calculate dividend data for a specific symbol
   */
  async calculateDividendData(symbol, positions, currentPrice) {
    try {
      logger.info(`[DIVIDEND] Calculating dividend data for ${symbol}:`, {
        positionCount: positions?.length || 0,
        currentPrice
      });

      // Return empty dividend data if no positions
      if (!positions || positions.length === 0) {
        logger.debug(`[DIVIDEND] No positions for ${symbol}, returning empty data`);
        return this.getEmptyDividendData();
      }
      
      // Collect all person names from positions
      const personNames = [...new Set(positions.map(p => p.personName).filter(Boolean))];
      
      logger.info(`[DIVIDEND] Found ${personNames.length} persons for ${symbol}:`, personNames);
      
      if (personNames.length === 0) {
        logger.warn(`[DIVIDEND] No person names found in positions for ${symbol}`);
        return this.getEmptyDividendData();
      }
      
      // Fetch dividend activities for all persons (with error handling)
      const allDividendActivities = [];
      
      for (const personName of personNames) {
        try {
          logger.debug(`[DIVIDEND] Fetching activities for ${personName} - ${symbol}`);
          const activities = await this.fetchDividendActivities(personName, symbol);
          
          if (activities && activities.length > 0) {
            logger.info(`[DIVIDEND] Found ${activities.length} activities for ${personName} - ${symbol}`);
            allDividendActivities.push(...activities);
          } else {
            logger.debug(`[DIVIDEND] No activities found for ${personName} - ${symbol}`);
          }
        } catch (error) {
          // Individual fetch failed, continue with others
          logger.warn(`[DIVIDEND] Failed to fetch for ${personName} - ${symbol}:`, error.message);
        }
      }

      logger.info(`[DIVIDEND] Total dividend activities found for ${symbol}: ${allDividendActivities.length}`);

      // If no dividend data available, return empty structure
      if (allDividendActivities.length === 0) {
        logger.debug(`[DIVIDEND] No dividend activities found for ${symbol}`);
        return this.getEmptyDividendData();
      }

      // Calculate total dividends received
      const totalReceived = allDividendActivities.reduce((sum, activity) => {
        const amount = Math.abs(activity.netAmount || activity.grossAmount || 0);
        logger.debug(`[DIVIDEND] Activity amount for ${symbol}:`, {
          date: activity.transactionDate,
          netAmount: activity.netAmount,
          grossAmount: activity.grossAmount,
          amount: amount
        });
        return sum + amount;
      }, 0);

      logger.info(`[DIVIDEND] Total dividends received for ${symbol}: ${totalReceived}`);

      // Calculate total shares across all positions
      const totalShares = positions.reduce((sum, pos) => sum + (pos.openQuantity || 0), 0);
      
      logger.debug(`[DIVIDEND] Total shares for ${symbol}: ${totalShares}`);
      
      // Calculate weighted average cost
      let totalCost = 0;
      positions.forEach(pos => {
        const cost = pos.totalCost || (pos.openQuantity * pos.averageEntryPrice) || 0;
        totalCost += cost;
        logger.debug(`[DIVIDEND] Position cost for ${symbol}:`, {
          quantity: pos.openQuantity,
          avgPrice: pos.averageEntryPrice,
          totalCost: pos.totalCost,
          calculatedCost: cost
        });
      });
      
      const avgCostPerShare = totalShares > 0 ? totalCost / totalShares : 0;
      
      logger.debug(`[DIVIDEND] Average cost per share for ${symbol}: ${avgCostPerShare}`);

      // Group dividends by period
      const dividendsByPeriod = this.groupDividendsByPeriod(allDividendActivities);
      
      // Calculate annual dividend (last 12 months)
      const annualDividend = this.calculateAnnualDividend(allDividendActivities);
      const annualDividendPerShare = totalShares > 0 ? annualDividend / totalShares : 0;
      
      logger.info(`[DIVIDEND] Annual dividend for ${symbol}: ${annualDividend}, per share: ${annualDividendPerShare}`);
      
      // Calculate monthly dividend per share (average of last 12 months)
      const monthlyDividendPerShare = annualDividendPerShare / 12;
      
      // Calculate yields
      const yieldOnCost = avgCostPerShare > 0 ? (annualDividendPerShare / avgCostPerShare) * 100 : 0;
      const currentYield = currentPrice > 0 ? (annualDividendPerShare / currentPrice) * 100 : 0;
      
      logger.info(`[DIVIDEND] Yields for ${symbol} - On Cost: ${yieldOnCost}%, Current: ${currentYield}%`);
      
      // Get dividend history (last 10 payments)
      const dividendHistory = this.formatDividendHistory(allDividendActivities, 10);

      const result = {
        totalReceived: Math.round(totalReceived * 100) / 100,
        monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 100) / 100,
        annualDividend: Math.round(annualDividend * 100) / 100,
        annualDividendPerShare: Math.round(annualDividendPerShare * 100) / 100,
        yieldOnCost: Math.round(yieldOnCost * 100) / 100,
        currentYield: Math.round(currentYield * 100) / 100,
        dividendHistory
      };

      logger.info(`[DIVIDEND] Final dividend data for ${symbol}:`, result);

      return result;
    } catch (error) {
      logger.error(`[DIVIDEND] Failed to calculate dividend data for ${symbol}:`, {
        message: error.message,
        stack: error.stack
      });
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
      
      const amount = Math.abs(activity.netAmount || activity.grossAmount || 0);
      grouped[yearMonth].total += amount;
      grouped[yearMonth].count++;
      grouped[yearMonth].activities.push(activity);
    });
    
    logger.debug(`[DIVIDEND] Grouped dividends by period:`, Object.keys(grouped));
    
    return grouped;
  }

  /**
   * Calculate annual dividend (last 12 months)
   */
  calculateAnnualDividend(activities) {
    const twelveMonthsAgo = moment().subtract(12, 'months');
    
    logger.debug(`[DIVIDEND] Calculating annual dividend from ${twelveMonthsAgo.format('YYYY-MM-DD')}`);
    
    const recentDividends = activities.filter(activity => {
      const activityDate = moment(activity.transactionDate);
      return activityDate.isAfter(twelveMonthsAgo);
    });
    
    logger.debug(`[DIVIDEND] Found ${recentDividends.length} dividends in last 12 months`);
    
    const total = recentDividends.reduce((sum, activity) => {
      const amount = Math.abs(activity.netAmount || activity.grossAmount || 0);
      return sum + amount;
    }, 0);
    
    logger.debug(`[DIVIDEND] Total annual dividend: ${total}`);
    
    return total;
  }

  /**
   * Format dividend history for response
   */
  formatDividendHistory(activities, limit = 10) {
    // Sort by date descending and take the most recent
    const sorted = activities
      .sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate))
      .slice(0, limit);
    
    const history = sorted.map(activity => ({
      date: moment(activity.transactionDate).format('YYYY-MM-DD'),
      amount: Math.round(Math.abs(activity.netAmount || activity.grossAmount || 0) * 100) / 100
    }));
    
    logger.debug(`[DIVIDEND] Formatted ${history.length} dividend history entries`);
    
    return history;
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
      logger.debug(`[DIVIDEND] Processing dividend summary for ${symbol}`);
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