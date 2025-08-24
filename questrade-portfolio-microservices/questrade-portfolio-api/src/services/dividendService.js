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
   * Calculate dividend data for a specific symbol (UPDATED)
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
      const activityMap = new Map(); // To track unique dividends and aggregate them
      
      for (const personName of personNames) {
        try {
          logger.debug(`[DIVIDEND] Fetching activities for ${personName} - ${symbol}`);
          const activities = await this.fetchDividendActivities(personName, symbol);
          
          if (activities && activities.length > 0) {
            logger.info(`[DIVIDEND] Found ${activities.length} activities for ${personName} - ${symbol}`);
            
            // Process activities and aggregate by date
            activities.forEach(activity => {
              const dateKey = moment(activity.transactionDate).format('YYYY-MM-DD');
              const amount = Math.abs(activity.netAmount || activity.grossAmount || 0);
              
              if (activityMap.has(dateKey)) {
                // If we already have a dividend for this date, add to it
                const existing = activityMap.get(dateKey);
                existing.amount += amount;
                existing.accounts.push({
                  personName: personName,
                  accountId: activity.accountId,
                  amount: amount
                });
              } else {
                // New dividend date
                activityMap.set(dateKey, {
                  date: activity.transactionDate,
                  amount: amount,
                  accounts: [{
                    personName: personName,
                    accountId: activity.accountId,
                    amount: amount
                  }]
                });
              }
            });
            
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
      logger.info(`[DIVIDEND] Unique dividend dates: ${activityMap.size}`);

      // If no dividend data available, return empty structure
      if (activityMap.size === 0) {
        logger.debug(`[DIVIDEND] No dividend activities found for ${symbol}`);
        return this.getEmptyDividendData();
      }

      // Calculate total dividends received (aggregated)
      let totalReceived = 0;
      activityMap.forEach(dividend => {
        totalReceived += dividend.amount;
      });

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

      // Calculate payment frequency and amounts (UPDATED LOGIC)
      const dividendDates = Array.from(activityMap.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Get the most recent dividend payment for per-share calculation
      const mostRecentDividend = dividendDates[dividendDates.length - 1];
      const mostRecentDividendPerShare = totalShares > 0 ? 
        mostRecentDividend.amount / totalShares : 0;
      
      logger.info(`[DIVIDEND] Most recent dividend for ${symbol}: ${mostRecentDividend.amount} on ${moment(mostRecentDividend.date).format('YYYY-MM-DD')}`);
      logger.info(`[DIVIDEND] Most recent dividend per share: ${mostRecentDividendPerShare}`);
      
      // Determine payment frequency
      let paymentFrequency = 12; // Default to monthly
      let monthlyDividendPerShare = mostRecentDividendPerShare; // Assume most recent payment is the regular payment
      
      if (dividendDates.length >= 2) {
        // Calculate average days between payments
        let totalDaysBetween = 0;
        let gapCount = 0;
        
        for (let i = 1; i < dividendDates.length; i++) {
          const daysBetween = moment(dividendDates[i].date).diff(moment(dividendDates[i-1].date), 'days');
          if (daysBetween > 0) {
            totalDaysBetween += daysBetween;
            gapCount++;
          }
        }
        
        if (gapCount > 0) {
          const avgDaysBetween = totalDaysBetween / gapCount;
          logger.info(`[DIVIDEND] Average days between payments: ${avgDaysBetween}`);
          
          // Determine frequency based on average days between payments
          if (avgDaysBetween <= 35) {
            paymentFrequency = 12; // Monthly
            monthlyDividendPerShare = mostRecentDividendPerShare;
          } else if (avgDaysBetween <= 100) {
            paymentFrequency = 4; // Quarterly
            monthlyDividendPerShare = mostRecentDividendPerShare / 3; // Convert quarterly to monthly
          } else if (avgDaysBetween <= 200) {
            paymentFrequency = 2; // Semi-annual
            monthlyDividendPerShare = mostRecentDividendPerShare / 6; // Convert semi-annual to monthly
          } else {
            paymentFrequency = 1; // Annual
            monthlyDividendPerShare = mostRecentDividendPerShare / 12; // Convert annual to monthly
          }
        }
      }
      
      logger.info(`[DIVIDEND] Detected payment frequency: ${paymentFrequency} times per year`);
      logger.info(`[DIVIDEND] Monthly dividend per share: ${monthlyDividendPerShare}`);
      
      // Calculate annual dividend based on actual payment frequency
      const annualDividendPerShare = mostRecentDividendPerShare * paymentFrequency;
      const annualDividend = annualDividendPerShare * totalShares;
      
      logger.info(`[DIVIDEND] Annual dividend for ${symbol}: ${annualDividend}, per share: ${annualDividendPerShare}`);
      
      // Calculate yields
      const yieldOnCost = avgCostPerShare > 0 ? (annualDividendPerShare / avgCostPerShare) * 100 : 0;
      const currentYield = currentPrice > 0 ? (annualDividendPerShare / currentPrice) * 100 : 0;
      
      logger.info(`[DIVIDEND] Yields for ${symbol} - On Cost: ${yieldOnCost}%, Current: ${currentYield}%`);
      
      // Format dividend history (aggregated by date)
      const dividendHistory = dividendDates
        .slice(-10) // Last 10 payments
        .reverse() // Most recent first
        .map(dividend => ({
          date: moment(dividend.date).format('YYYY-MM-DD'),
          amount: Math.round(dividend.amount * 100) / 100,
          accounts: dividend.accounts.length // Show how many accounts received dividends
        }));

      const result = {
        totalReceived: Math.round(totalReceived * 100) / 100,
        monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 100) / 100,
        annualDividend: Math.round(annualDividend * 100) / 100,
        annualDividendPerShare: Math.round(annualDividendPerShare * 100) / 100,
        yieldOnCost: Math.round(yieldOnCost * 100) / 100,
        currentYield: Math.round(currentYield * 100) / 100,
        dividendHistory,
        paymentFrequency // Add this for transparency
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
      dividendHistory: [],
      paymentFrequency: 0
    };
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