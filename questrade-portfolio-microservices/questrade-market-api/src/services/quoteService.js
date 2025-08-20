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
      logger.error(`Failed to get quote for ${symbol}:`, error);
      
      // Try to return cached quote even if stale
      const cachedQuote = await Quote.getLatest(symbol);
      if (cachedQuote) {
        logger.warn(`Returning stale quote for ${symbol} due to error`);
        return cachedQuote;
      }
      
      throw error;
    }
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
      logger.error('Failed to get multiple quotes:', error);
      throw error;
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
        logger.error(`Failed to fetch quote from Questrade for ${symbol}:`, error);
        throw error;
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
        logger.error('Failed to fetch multiple quotes from Questrade:', error);
        throw error;
      }
    });
  }

  transformQuestradeQuote(questradeQuote) {
    return {
      symbol: questradeQuote.symbol,
      symbolId: questradeQuote.symbolId,
      lastTradePrice: questradeQuote.lastTradePrice,
      lastTradeSize: questradeQuote.lastTradeSize,
      lastTradeTick: questradeQuote.lastTradeTick,
      lastTradeTime: questradeQuote.lastTradeTime ? new Date(questradeQuote.lastTradeTime) : null,
      bidPrice: questradeQuote.bidPrice,
      bidSize: questradeQuote.bidSize,
      askPrice: questradeQuote.askPrice,
      askSize: questradeQuote.askSize,
      openPrice: questradeQuote.openPrice,
      highPrice: questradeQuote.highPrice,
      lowPrice: questradeQuote.lowPrice,
      closePrice: questradeQuote.closePrice,
      previousClosePrice: questradeQuote.previousClosePrice,
      change: questradeQuote.lastTradePrice - questradeQuote.previousClosePrice,
      changePercent: questradeQuote.previousClosePrice > 0 
        ? ((questradeQuote.lastTradePrice - questradeQuote.previousClosePrice) / questradeQuote.previousClosePrice) * 100 
        : 0,
      volume: questradeQuote.volume,
      averageVolume: questradeQuote.averageVolume,
      volumeWeightedAveragePrice: questradeQuote.VWAP,
      week52High: questradeQuote.high52w,
      week52Low: questradeQuote.low52w,
      exchange: questradeQuote.exchange,
      isHalted: questradeQuote.isHalted,
      delay: questradeQuote.delay,
      isRealTime: !questradeQuote.delay || questradeQuote.delay === 0,
      lastUpdated: new Date()
    };
  }

  async saveQuote(quote) {
    try {
      await Quote.findOneAndUpdate(
        { symbol: quote.symbol },
        quote,
        { upsert: true, new: true }
      );
    } catch (error) {
      logger.error('Failed to save quote:', error);
    }
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
      logger.error(`Failed to get symbol ID for ${symbol}:`, error);
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
      logger.error('Failed to get available person:', error);
      throw error;
    }
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
}

module.exports = new QuoteService();