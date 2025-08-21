const Quote = require('../models/Quote');
const Symbol = require('../models/Symbol');
const symbolService = require('./symbolService');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const pLimit = require('p-limit');

class QuoteService {
  constructor() {
    this.authApiUrl = config.services.authApiUrl;
    this.rateLimiter = pLimit(config.rateLimit.questradePerSecond);
  }

  async getQuote(symbol, forceRefresh = false) {
    try {
      // Check cache first
      if (!forceRefresh) {
        const cachedQuote = await Quote.getLatest(symbol);
        
        if (cachedQuote && !cachedQuote.isStale(config.market.marketDataCacheTTL)) {
          logger.debug(`Returning cached quote for ${symbol}`);
          return cachedQuote;
        }
      }
      
      // Fetch fresh quote from Questrade with symbol details
      const quote = await this.fetchQuoteFromQuestrade(symbol);
      
      // Save to cache
      await this.saveQuote(quote);
      
      return quote;
    } catch (error) {
      // Extract meaningful error information
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      const errorStatus = error.response?.status;
      
      logger.error(`Failed to get quote for ${symbol}`, {
        errorMessage,
        errorStatus,
        symbol
      });
      
      // Try to return cached quote even if stale
      const cachedQuote = await Quote.getLatest(symbol);
      if (cachedQuote) {
        logger.warn(`Returning stale quote for ${symbol} due to error`);
        return cachedQuote;
      }
      
      throw new Error(`Failed to get quote for ${symbol}: ${errorMessage}`);
    }
  }

  async fetchQuoteFromQuestrade(symbol) {
    return this.rateLimiter(async () => {
      try {
        // Get first available person token
        const person = await this.getAvailablePerson();
        
        // Get symbol ID and details (includes prevDayClosePrice)
        const symbolData = await this.getSymbolWithDetails(symbol, person);
        
        if (!symbolData) {
          throw new Error(`Symbol ${symbol} not found`);
        }
        
        // Fetch quote from Questrade
        const response = await axios.get(
          `${this.authApiUrl}/auth/access-token/${person}`
        );
        
        const tokenData = response.data.data;
        
        const quoteResponse = await axios.get(
          `${tokenData.apiServer}/v1/markets/quotes?ids=${symbolData.symbolId}`,
          {
            headers: {
              'Authorization': `Bearer ${tokenData.accessToken}`
            }
          }
        );
        
        const questradeQuote = quoteResponse.data.quotes[0];
        
        // Transform with symbol details for accurate day change
        return this.transformQuestradeQuote(questradeQuote, symbolData);
      } catch (error) {
        // Extract meaningful error information
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
        const errorStatus = error.response?.status;
        
        logger.error(`Failed to fetch quote from Questrade for ${symbol}`, {
          errorMessage,
          errorStatus,
          symbol
        });
        
        throw new Error(`Questrade API error for ${symbol}: ${errorMessage}`);
      }
    });
  }

  async fetchMultipleQuotesFromQuestrade(symbols) {
    return this.rateLimiter(async () => {
      try {
        const person = await this.getAvailablePerson();
        
        // Get symbol IDs and details for all symbols
        const symbolDataMap = new Map();
        const symbolIds = [];
        
        for (const symbol of symbols) {
          const symbolData = await this.getSymbolWithDetails(symbol, person);
          if (symbolData) {
            symbolDataMap.set(symbolData.symbolId, symbolData);
            symbolIds.push(symbolData.symbolId);
          }
        }
        
        if (symbolIds.length === 0) {
          return [];
        }
        
        // Fetch quotes from Questrade
        const response = await axios.get(
          `${this.authApiUrl}/auth/access-token/${person}`
        );
        
        const tokenData = response.data.data;
        
        const quoteResponse = await axios.get(
          `${tokenData.apiServer}/v1/markets/quotes?ids=${symbolIds.join(',')}`,
          {
            headers: {
              'Authorization': `Bearer ${tokenData.accessToken}`
            }
          }
        );
        
        // Transform each quote with its symbol details
        return quoteResponse.data.quotes.map(q => {
          const symbolData = symbolDataMap.get(q.symbolId);
          return this.transformQuestradeQuote(q, symbolData);
        });
      } catch (error) {
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
        logger.error('Failed to fetch multiple quotes from Questrade', {
          errorMessage,
          symbolCount: symbols.length
        });
        throw new Error(`Failed to fetch multiple quotes: ${errorMessage}`);
      }
    });
  }

  async getSymbolWithDetails(symbol, person) {
    try {
      // First check if we have the symbol with recent details in our database
      let symbolData = await Symbol.findOne({ symbol: symbol.toUpperCase() });
      
      // If we don't have it or it needs refresh, fetch from Questrade
      if (!symbolData || symbolData.needsDetailRefresh()) {
        symbolData = await symbolService.getSymbolDetailsBySymbol(symbol, true);
      }
      
      // If still no symbol data, try to search and get it
      if (!symbolData) {
        const searchResults = await this.searchSymbolInQuestrade(symbol, person);
        if (searchResults && searchResults.length > 0) {
          const exactMatch = searchResults.find(s => s.symbol === symbol.toUpperCase());
          if (exactMatch && exactMatch.symbolId) {
            // Fetch detailed data
            symbolData = await symbolService.getSymbolDetails(exactMatch.symbolId, true);
          }
        }
      }
      
      return symbolData;
    } catch (error) {
      logger.error(`Failed to get symbol with details for ${symbol}:`, error);
      return null;
    }
  }

  async searchSymbolInQuestrade(symbol, person) {
    try {
      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${person}`
      );
      
      const tokenData = response.data.data;
      
      const searchResponse = await axios.get(
        `${tokenData.apiServer}/v1/symbols/search?prefix=${symbol}`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        }
      );
      
      return searchResponse.data.symbols || [];
    } catch (error) {
      logger.error(`Failed to search symbol ${symbol}:`, error);
      return [];
    }
  }

  async getSymbolId(symbol, person) {
    try {
      const symbolData = await this.getSymbolWithDetails(symbol, person);
      return symbolData;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      logger.error(`Failed to get symbol ID for ${symbol}`, {
        errorMessage,
        person
      });
      return null;
    }
  }

  async getAvailablePerson() {
    try {
      const response = await axios.get(`${this.authApiUrl}/persons`);
      const persons = response.data.data.filter(p => p.isActive && p.hasValidToken);
      
      if (persons.length === 0) {
        throw new Error('No active persons with valid tokens available');
      }
      
      return persons[0].personName;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      logger.error('Failed to get available person', { errorMessage });
      throw new Error(`Failed to get available person: ${errorMessage}`);
    }
  }

  async saveQuote(quote) {
    try {
      // Validate quote data before saving
      const validatedQuote = this.validateQuoteData(quote);
      
      await Quote.findOneAndUpdate(
        { symbol: validatedQuote.symbol },
        validatedQuote,
        { upsert: true, new: true, runValidators: true }
      );
    } catch (error) {
      logger.error('Failed to save quote', {
        errorMessage: error.message,
        symbol: quote?.symbol
      });
    }
  }

  // Helper function to safely parse numbers
  safeParseNumber(value, defaultValue = 0) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    const parsed = Number(value);
    return (isNaN(parsed) || !isFinite(parsed)) ? defaultValue : parsed;
  }

  transformQuestradeQuote(questradeQuote, symbolData) {
    // Safely parse all numeric values first
    const lastTradePrice = this.safeParseNumber(questradeQuote.lastTradePrice);
    
    // Get previous close price from symbol details (this is the key!)
    const previousClosePrice = symbolData ? this.safeParseNumber(symbolData.prevDayClosePrice) : 0;
    
    // Calculate proper day change using previous close price
    let dayChange = 0;
    let dayChangePercent = 0;
    
    logger.debug(`Transforming quote for ${questradeQuote.symbol}:`, {
      lastTradePrice,
      previousClosePrice,
      symbolDataAvailable: !!symbolData
    });
    
    // Calculate day change from previous close
    if (lastTradePrice > 0 && previousClosePrice > 0) {
      dayChange = lastTradePrice - previousClosePrice;
      dayChangePercent = (dayChange / previousClosePrice) * 100;
      
      // Ensure no NaN or Infinity
      if (isNaN(dayChange) || !isFinite(dayChange)) {
        dayChange = 0;
      }
      if (isNaN(dayChangePercent) || !isFinite(dayChangePercent)) {
        dayChangePercent = 0;
      }
    }
    
    // Round to reasonable precision
    dayChange = Math.round(dayChange * 100) / 100;
    dayChangePercent = Math.round(dayChangePercent * 100) / 100;
    
    return {
      symbol: questradeQuote.symbol,
      symbolId: this.safeParseNumber(questradeQuote.symbolId, 0),
      lastTradePrice: lastTradePrice,
      lastTradeSize: this.safeParseNumber(questradeQuote.lastTradeSize),
      lastTradeTick: questradeQuote.lastTradeTick,
      lastTradeTime: questradeQuote.lastTradeTime ? new Date(questradeQuote.lastTradeTime) : null,
      bidPrice: this.safeParseNumber(questradeQuote.bidPrice),
      bidSize: this.safeParseNumber(questradeQuote.bidSize),
      askPrice: this.safeParseNumber(questradeQuote.askPrice),
      askSize: this.safeParseNumber(questradeQuote.askSize),
      openPrice: this.safeParseNumber(questradeQuote.openPrice),
      highPrice: this.safeParseNumber(questradeQuote.highPrice),
      lowPrice: this.safeParseNumber(questradeQuote.lowPrice),
      closePrice: this.safeParseNumber(questradeQuote.closePrice),
      previousClosePrice: previousClosePrice,  // This comes from symbol details!
      dayChange: dayChange,  // Calculated from prev close
      dayChangePercent: dayChangePercent,  // Calculated from prev close
      volume: this.safeParseNumber(questradeQuote.volume),
      averageVolume: symbolData ? this.safeParseNumber(symbolData.averageVol20Days) : 0,
      volumeWeightedAveragePrice: this.safeParseNumber(questradeQuote.VWAP),
      week52High: symbolData ? this.safeParseNumber(symbolData.highPrice52) : 0,
      week52Low: symbolData ? this.safeParseNumber(symbolData.lowPrice52) : 0,
      marketCap: symbolData ? this.safeParseNumber(symbolData.marketCap) : 0,
      eps: symbolData ? this.safeParseNumber(symbolData.eps) : 0,
      pe: symbolData ? this.safeParseNumber(symbolData.pe) : 0,
      dividend: symbolData ? this.safeParseNumber(symbolData.dividend) : 0,
      yield: symbolData ? this.safeParseNumber(symbolData.yield) : 0,
      exchange: questradeQuote.exchange,
      isHalted: questradeQuote.isHalted || false,
      delay: this.safeParseNumber(questradeQuote.delay),
      isRealTime: !questradeQuote.delay || questradeQuote.delay === 0,
      lastUpdated: new Date()
    };
  }

  validateQuoteData(quote) {
    // Ensure all numeric fields are valid numbers
    const validated = { ...quote };
    
    const numericFields = [
      'symbolId', 'lastTradePrice', 'lastTradeSize', 'bidPrice', 'bidSize',
      'askPrice', 'askSize', 'openPrice', 'highPrice', 'lowPrice', 'closePrice',
      'previousClosePrice', 'dayChange', 'dayChangePercent', 'volume', 'averageVolume',
      'volumeWeightedAveragePrice', 'week52High', 'week52Low', 'delay',
      'marketCap', 'eps', 'pe', 'dividend', 'yield'
    ];
    
    numericFields.forEach(field => {
      if (validated[field] !== undefined) {
        validated[field] = this.safeParseNumber(validated[field], 0);
      }
    });
    
    return validated;
  }

  async refreshQuote(symbol) {
    return this.getQuote(symbol, true);
  }

  async getHistoricalQuotes(symbol, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const quotes = await Quote.find({
      symbol: symbol.toUpperCase(),
      lastUpdated: { $gte: startDate }
    }).sort({ lastUpdated: 1 });
    
    return quotes;
  }

  async getMultipleQuotes(symbols, forceRefresh = false) {
    try {
      const quotes = [];
      
      // Check cache for each symbol
      const symbolsToFetch = [];
      
      if (!forceRefresh) {
        for (const symbol of symbols) {
          const cachedQuote = await Quote.getLatest(symbol);
          
          if (cachedQuote && !cachedQuote.isStale(config.market.marketDataCacheTTL)) {
            quotes.push(cachedQuote);
          } else {
            symbolsToFetch.push(symbol);
          }
        }
      } else {
        symbolsToFetch.push(...symbols);
      }
      
      // Fetch missing quotes
      if (symbolsToFetch.length > 0) {
        const freshQuotes = await this.fetchMultipleQuotesFromQuestrade(symbolsToFetch);
        
        // Save to cache
        await Quote.bulkUpdateQuotes(freshQuotes);
        
        quotes.push(...freshQuotes);
      }
      
      return quotes;
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      logger.error('Failed to get multiple quotes', {
        errorMessage,
        symbolCount: symbols.length
      });
      throw error;
    }
  }
}

module.exports = new QuoteService();