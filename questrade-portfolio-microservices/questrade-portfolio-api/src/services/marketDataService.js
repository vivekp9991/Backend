const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');

class MarketDataService {
  constructor() {
    this.marketApiUrl = process.env.MARKET_API_URL || 'http://localhost:4004/api';
    this.priceCache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
  }

  /**
   * Get current price for a symbol
   */
  async getCurrentPrice(symbol) {
    try {
      // Check cache first
      const cached = this.priceCache.get(symbol);
      if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
        return cached.data;
      }

      // Fetch from Market API
      const response = await axios.get(`${this.marketApiUrl}/quotes/${symbol}`);
      
      if (response.data && response.data.success && response.data.data) {
        const quote = response.data.data;
        
        const priceData = {
          currentPrice: quote.lastTradePrice || 0,
          openPrice: quote.openPrice || quote.lastTradePrice || 0,
          previousClose: quote.previousClosePrice || 0,
          dayChange: quote.dayChange || 0,
          dayChangePercent: quote.dayChangePercent || 0,
          volume: quote.volume || 0,
          timestamp: new Date()
        };

        // Cache the result
        this.priceCache.set(symbol, {
          data: priceData,
          timestamp: Date.now()
        });

        return priceData;
      }

      logger.warn(`[MARKET DATA] No price data available for ${symbol}`);
      return null;
    } catch (error) {
      logger.error(`[MARKET DATA] Failed to fetch price for ${symbol}:`, error.message);
      
      // Return cached data if available, even if stale
      const cached = this.priceCache.get(symbol);
      if (cached) {
        logger.info(`[MARKET DATA] Returning stale cached price for ${symbol}`);
        return cached.data;
      }
      
      return null;
    }
  }

  /**
   * Get prices for multiple symbols
   */
  async getMultiplePrices(symbols) {
    try {
      const uniqueSymbols = [...new Set(symbols)];
      const prices = {};

      // Try to fetch all at once from Market API
      const symbolsParam = uniqueSymbols.join(',');
      const response = await axios.get(`${this.marketApiUrl}/quotes`, {
        params: { symbols: symbolsParam }
      });

      if (response.data && response.data.success && response.data.data) {
        response.data.data.forEach(quote => {
          const priceData = {
            currentPrice: quote.lastTradePrice || 0,
            openPrice: quote.openPrice || quote.lastTradePrice || 0,
            previousClose: quote.previousClosePrice || 0,
            dayChange: quote.dayChange || 0,
            dayChangePercent: quote.dayChangePercent || 0,
            volume: quote.volume || 0,
            timestamp: new Date()
          };

          prices[quote.symbol] = priceData;

          // Update cache
          this.priceCache.set(quote.symbol, {
            data: priceData,
            timestamp: Date.now()
          });
        });
      }

      // For any missing symbols, try individual fetches
      for (const symbol of uniqueSymbols) {
        if (!prices[symbol]) {
          const price = await this.getCurrentPrice(symbol);
          if (price) {
            prices[symbol] = price;
          }
        }
      }

      return prices;
    } catch (error) {
      logger.error('[MARKET DATA] Failed to fetch multiple prices:', error.message);
      
      // Try to get individually
      const prices = {};
      for (const symbol of symbols) {
        const price = await this.getCurrentPrice(symbol);
        if (price) {
          prices[symbol] = price;
        }
      }
      
      return prices;
    }
  }

  /**
   * Clear price cache
   */
  clearCache() {
    this.priceCache.clear();
    logger.info('[MARKET DATA] Price cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.priceCache.size,
      symbols: Array.from(this.priceCache.keys())
    };
  }
}

module.exports = new MarketDataService();