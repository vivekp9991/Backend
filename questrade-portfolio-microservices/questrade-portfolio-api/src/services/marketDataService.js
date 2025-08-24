const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const DailyPrice = require('../models/DailyPrice');
const moment = require('moment');

class MarketDataService {
  constructor() {
    this.marketApiUrl = process.env.MARKET_API_URL || 'http://localhost:4004/api';
    this.syncApiUrl = process.env.SYNC_API_URL || 'http://localhost:4002/api';
  }

  /**
   * Check if market is currently open
   */
  isMarketOpen() {
    const now = moment();
    const dayOfWeek = now.day();
    const hour = now.hour();
    const minute = now.minute();
    
    // Market closed on weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    // Market hours: 9:30 AM - 4:00 PM ET
    const currentMinutes = hour * 60 + minute;
    const marketOpen = 9 * 60 + 30;
    const marketClose = 16 * 60;
    
    return currentMinutes >= marketOpen && currentMinutes < marketClose;
  }

  /**
   * Get current price for a symbol - uses daily cache when market is closed
   */
  async getCurrentPrice(symbol) {
    try {
      // Check if market is open
      const marketOpen = this.isMarketOpen();
      
      if (!marketOpen) {
        // Market is closed, use cached daily price
        const dailyPrice = await DailyPrice.getLatestPrice(symbol);
        
        if (dailyPrice) {
          logger.debug(`[MARKET DATA] Using cached price for ${symbol} (market closed)`);
          return {
            currentPrice: dailyPrice.lastPrice || 0,
            openPrice: dailyPrice.openPrice || dailyPrice.lastPrice || 0,
            previousClose: dailyPrice.previousClose || 0,
            dayChange: dailyPrice.dayChange || 0,
            dayChangePercent: dailyPrice.dayChangePercent || 0,
            volume: dailyPrice.volume || 0,
            timestamp: dailyPrice.lastUpdated,
            isMarketOpen: false,
            cached: true
          };
        }
      }
      
      // Market is open or no cached price, try to fetch from Market API
      try {
        const response = await axios.get(`${this.marketApiUrl}/quotes/${symbol}`, {
          timeout: 5000 // 5 second timeout
        });
        
        if (response.data && response.data.success && response.data.data) {
          const quote = response.data.data;
          
          const priceData = {
            currentPrice: quote.lastTradePrice || 0,
            openPrice: quote.openPrice || quote.lastTradePrice || 0,
            previousClose: quote.previousClosePrice || 0,
            dayChange: quote.dayChange || 0,
            dayChangePercent: quote.dayChangePercent || 0,
            volume: quote.volume || 0,
            timestamp: new Date(),
            isMarketOpen: marketOpen,
            cached: false
          };
          
          // Update daily price cache
          await this.updateDailyPrice(symbol, priceData);
          
          return priceData;
        }
      } catch (marketApiError) {
        logger.debug(`[MARKET DATA] Market API unavailable for ${symbol}, using cache`);
      }
      
      // Fallback to cached price if Market API fails
      const dailyPrice = await DailyPrice.getLatestPrice(symbol);
      
      if (dailyPrice) {
        return {
          currentPrice: dailyPrice.lastPrice || 0,
          openPrice: dailyPrice.openPrice || dailyPrice.lastPrice || 0,
          previousClose: dailyPrice.previousClose || 0,
          dayChange: dailyPrice.dayChange || 0,
          dayChangePercent: dailyPrice.dayChangePercent || 0,
          volume: dailyPrice.volume || 0,
          timestamp: dailyPrice.lastUpdated,
          isMarketOpen: marketOpen,
          cached: true
        };
      }
      
      // No price available
      logger.warn(`[MARKET DATA] No price data available for ${symbol}`);
      return null;
    } catch (error) {
      logger.error(`[MARKET DATA] Failed to fetch price for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get prices for multiple symbols - uses batch cache lookup
   */
  async getMultiplePrices(symbols) {
    try {
      if (!symbols || symbols.length === 0) {
        logger.debug('[MARKET DATA] No symbols provided for price fetch');
        return {};
      }
      
      const uniqueSymbols = [...new Set(symbols)];
      const marketOpen = this.isMarketOpen();
      const prices = {};
      
      if (!marketOpen) {
        // Market closed, get all prices from cache
        const cachedPrices = await DailyPrice.getMultiplePrices(uniqueSymbols);
        
        uniqueSymbols.forEach(symbol => {
          const dailyPrice = cachedPrices[symbol];
          if (dailyPrice) {
            prices[symbol] = {
              currentPrice: dailyPrice.lastPrice || 0,
              openPrice: dailyPrice.openPrice || dailyPrice.lastPrice || 0,
              previousClose: dailyPrice.previousClose || 0,
              dayChange: dailyPrice.dayChange || 0,
              dayChangePercent: dailyPrice.dayChangePercent || 0,
              volume: dailyPrice.volume || 0,
              timestamp: dailyPrice.lastUpdated,
              isMarketOpen: false,
              cached: true
            };
          }
        });
        
        logger.info(`[MARKET DATA] Returned ${Object.keys(prices).length} cached prices (market closed)`);
        return prices;
      }
      
      // Market is open, try to fetch from Market API with fallback to cache
      try {
        const symbolsParam = uniqueSymbols.join(',');
        const response = await axios.get(`${this.marketApiUrl}/quotes`, {
          params: { symbols: symbolsParam },
          timeout: 10000 // 10 second timeout
        });
        
        if (response.data && response.data.success && response.data.data) {
          for (const quote of response.data.data) {
            const priceData = {
              currentPrice: quote.lastTradePrice || 0,
              openPrice: quote.openPrice || quote.lastTradePrice || 0,
              previousClose: quote.previousClosePrice || 0,
              dayChange: quote.dayChange || 0,
              dayChangePercent: quote.dayChangePercent || 0,
              volume: quote.volume || 0,
              timestamp: new Date(),
              isMarketOpen: true,
              cached: false
            };
            
            prices[quote.symbol] = priceData;
            
            // Update daily price cache
            await this.updateDailyPrice(quote.symbol, priceData);
          }
        }
      } catch (marketApiError) {
        logger.debug('[MARKET DATA] Market API unavailable, using cache for all symbols');
      }
      
      // Fill in any missing symbols from cache
      const missingSymbols = uniqueSymbols.filter(s => !prices[s]);
      if (missingSymbols.length > 0) {
        const cachedPrices = await DailyPrice.getMultiplePrices(missingSymbols);
        
        missingSymbols.forEach(symbol => {
          const dailyPrice = cachedPrices[symbol];
          if (dailyPrice) {
            prices[symbol] = {
              currentPrice: dailyPrice.lastPrice || 0,
              openPrice: dailyPrice.openPrice || dailyPrice.lastPrice || 0,
              previousClose: dailyPrice.previousClose || 0,
              dayChange: dailyPrice.dayChange || 0,
              dayChangePercent: dailyPrice.dayChangePercent || 0,
              volume: dailyPrice.volume || 0,
              timestamp: dailyPrice.lastUpdated,
              isMarketOpen: marketOpen,
              cached: true
            };
          }
        });
      }
      
      return prices;
    } catch (error) {
      logger.error('[MARKET DATA] Failed to fetch multiple prices:', error.message);
      return {};
    }
  }

  /**
   * Update daily price cache
   */
  async updateDailyPrice(symbol, priceData) {
    try {
      await DailyPrice.upsertDailyPrice(symbol, {
        symbol,
        openPrice: priceData.openPrice,
        lastPrice: priceData.currentPrice,
        previousClose: priceData.previousClose,
        volume: priceData.volume,
        dayChange: priceData.dayChange,
        dayChangePercent: priceData.dayChangePercent,
        isMarketOpen: priceData.isMarketOpen || false
      });
    } catch (error) {
      logger.error(`[MARKET DATA] Failed to update daily price for ${symbol}:`, error.message);
    }
  }

  /**
   * Sync all position prices daily
   */
  async syncDailyPrices() {
    try {
      logger.info('[MARKET DATA] Starting daily price sync');
      
      // Get all unique symbols from positions
      const Position = require('../../questrade-sync-api/src/models/Position');
      const uniqueSymbols = await Position.distinct('symbol');
      
      if (uniqueSymbols.length === 0) {
        logger.info('[MARKET DATA] No symbols to sync');
        return;
      }
      
      logger.info(`[MARKET DATA] Syncing prices for ${uniqueSymbols.length} symbols`);
      
      // Batch process symbols
      const batchSize = 20;
      for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
        const batch = uniqueSymbols.slice(i, i + batchSize);
        
        try {
          // Fetch prices from Market API
          const symbolsParam = batch.join(',');
          const response = await axios.get(`${this.marketApiUrl}/quotes`, {
            params: { symbols: symbolsParam },
            timeout: 30000 // 30 second timeout for batch
          });
          
          if (response.data && response.data.success && response.data.data) {
            for (const quote of response.data.data) {
              await DailyPrice.upsertDailyPrice(quote.symbol, {
                symbol: quote.symbol,
                openPrice: quote.openPrice || 0,
                closePrice: quote.closePrice || quote.lastTradePrice || 0,
                highPrice: quote.highPrice || 0,
                lowPrice: quote.lowPrice || 0,
                lastPrice: quote.lastTradePrice || 0,
                previousClose: quote.previousClosePrice || 0,
                volume: quote.volume || 0,
                dayChange: quote.dayChange || 0,
                dayChangePercent: quote.dayChangePercent || 0,
                marketCap: quote.marketCap || 0,
                pe: quote.pe || 0,
                dividend: quote.dividend || 0,
                yield: quote.yield || 0,
                isMarketOpen: false
              });
            }
            
            logger.info(`[MARKET DATA] Updated prices for batch ${i / batchSize + 1}`);
          }
        } catch (batchError) {
          logger.error(`[MARKET DATA] Failed to sync batch ${i / batchSize + 1}:`, batchError.message);
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      logger.info('[MARKET DATA] Daily price sync completed');
    } catch (error) {
      logger.error('[MARKET DATA] Failed to sync daily prices:', error.message);
    }
  }

  /**
   * Clear cache (not needed with new approach)
   */
  clearCache() {
    logger.info('[MARKET DATA] Cache clear requested - using database cache');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const count = await DailyPrice.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await DailyPrice.countDocuments({ date: today });
    
    return {
      totalPrices: count,
      todayPrices: todayCount
    };
  }
}

module.exports = new MarketDataService();