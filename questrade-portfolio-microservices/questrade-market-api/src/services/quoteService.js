const Quote = require('../models/Quote');
const Symbol = require('../models/Symbol');
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
      
      // Fetch fresh quote from Questrade
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
        
        // Get symbol ID
        const symbolData = await this.getSymbolId(symbol, person);
        
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
        
        return this.transformQuestradeQuote(questradeQuote);
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
        
        // Get symbol IDs
        const symbolIds = [];
        for (const symbol of symbols) {
          const symbolData = await this.getSymbolId(symbol, person);
          if (symbolData) {
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
        
        return quoteResponse.data.quotes.map(q => this.transformQuestradeQuote(q));
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

  async getSymbolId(symbol, person) {
    try {
      // Check local database first
      let symbolData = await Symbol.findOne({ symbol: symbol.toUpperCase() });
      
      if (symbolData) {
        return symbolData;
      }
      
      // Search in Questrade
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
      
      const symbols = searchResponse.data.symbols || [];
      const exactMatch = symbols.find(s => s.symbol === symbol.toUpperCase());
      
      if (exactMatch) {
        // Save to database
        symbolData = await Symbol.findOneAndUpdate(
          { symbol: exactMatch.symbol },
          {
            symbol: exactMatch.symbol,
            symbolId: exactMatch.symbolId,
            description: exactMatch.description,
            securityType: exactMatch.securityType,
            exchange: exactMatch.exchange,
            currency: exactMatch.currency
          },
          { upsert: true, new: true }
        );
        
        return symbolData;
      }
      
      return null;
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

  // ... rest of the methods remain the same ...

  // Helper function to safely parse numbers
  safeParseNumber(value, defaultValue = 0) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    const parsed = Number(value);
    return isNaN(parsed) || !isFinite(parsed) ? defaultValue : parsed;
  }

transformQuestradeQuote(questradeQuote) {
  // Safely parse all numeric values first
  const lastTradePrice = this.safeParseNumber(questradeQuote.lastTradePrice);
  const previousClosePrice = this.safeParseNumber(questradeQuote.previousClosePrice);
  
  // Calculate change and changePercent with NaN protection
  let change = 0;
  let changePercent = 0;
  
  // Debug logging for troubleshooting
  logger.debug(`Transforming quote for ${questradeQuote.symbol}:`, {
    lastTradePrice,
    previousClosePrice,
    questradeChange: questradeQuote.change,
    questradeChangePercent: questradeQuote.changePercent
  });
  
  // First check if Questrade provides these values directly
  // Note: Questrade API typically provides these fields
  if (questradeQuote.change !== undefined && questradeQuote.change !== null) {
    change = this.safeParseNumber(questradeQuote.change);
  } else if (lastTradePrice > 0 && previousClosePrice > 0) {
    // Calculate change only if we have valid prices
    change = lastTradePrice - previousClosePrice;
    // Ensure change is not NaN
    if (isNaN(change) || !isFinite(change)) {
      change = 0;
    }
  }
  
  // Check for changePercent from Questrade or calculate it
  if (questradeQuote.changePercent !== undefined && questradeQuote.changePercent !== null) {
    changePercent = this.safeParseNumber(questradeQuote.changePercent);
  } else if (previousClosePrice > 0 && !isNaN(change)) {
    // Calculate percentage change only with valid values
    changePercent = (change / previousClosePrice) * 100;
    // Ensure changePercent is not NaN or Infinity
    if (isNaN(changePercent) || !isFinite(changePercent)) {
      changePercent = 0;
    }
  }
  
  // Round to reasonable precision to avoid floating point issues
  change = Math.round(change * 100) / 100;
  changePercent = Math.round(changePercent * 100) / 100;
  
  // Also handle day change if provided separately
  const dayChange = questradeQuote.dayChange !== undefined 
    ? this.safeParseNumber(questradeQuote.dayChange) 
    : change;
  const dayChangePercent = questradeQuote.dayChangePercent !== undefined 
    ? this.safeParseNumber(questradeQuote.dayChangePercent) 
    : changePercent;
  
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
    previousClosePrice: previousClosePrice,
    change: change,
    changePercent: changePercent,
    dayChange: dayChange,
    dayChangePercent: dayChangePercent,
    volume: this.safeParseNumber(questradeQuote.volume),
    averageVolume: this.safeParseNumber(questradeQuote.averageVolume),
    volumeWeightedAveragePrice: this.safeParseNumber(questradeQuote.VWAP),
    week52High: this.safeParseNumber(questradeQuote.high52w),
    week52Low: this.safeParseNumber(questradeQuote.low52w),
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
      'previousClosePrice', 'change', 'changePercent', 'volume', 'averageVolume',
      'volumeWeightedAveragePrice', 'week52High', 'week52Low', 'delay'
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