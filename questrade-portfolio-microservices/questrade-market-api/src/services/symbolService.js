const Symbol = require('../models/Symbol');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');

class SymbolService {
  constructor() {
    this.authApiUrl = config.services.authApiUrl;
  }

  async searchSymbols(prefix, limit = 10) {
    try {
      // Search in local database first
      let symbols = await Symbol.searchSymbols(prefix, limit);
      
      if (symbols.length > 0) {
        return symbols;
      }
      
      // If not found locally, search in Questrade
      symbols = await this.searchSymbolsInQuestrade(prefix, limit);
      
      // Save to local database
      for (const symbol of symbols) {
        await Symbol.findOneAndUpdate(
          { symbol: symbol.symbol },
          symbol,
          { upsert: true }
        );
      }
      
      return symbols;
    } catch (error) {
      logger.error('Failed to search symbols:', error);
      throw error;
    }
  }

  async searchSymbolsInQuestrade(prefix, limit) {
    try {
      const person = await this.getAvailablePerson();
      
      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${person}`
      );
      
      const tokenData = response.data.data;
      
      const searchResponse = await axios.get(
        `${tokenData.apiServer}/v1/symbols/search?prefix=${prefix}`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        }
      );
      
      const symbols = searchResponse.data.symbols || [];
      
      return symbols.slice(0, limit).map(s => ({
        symbol: s.symbol,
        symbolId: s.symbolId,
        description: s.description,
        securityType: s.securityType,
        exchange: s.exchange,
        currency: s.currency,
        isTradable: s.isTradable,
        isQuotable: s.isQuotable,
        hasOptions: s.hasOptions
      }));
    } catch (error) {
      logger.error('Failed to search symbols in Questrade:', error);
      throw error;
    }
  }

  async getSymbolDetails(symbolId) {
    try {
      // Check local database
      let symbol = await Symbol.findOne({ symbolId });
      
      if (symbol) {
        return symbol;
      }
      
      // Fetch from Questrade
      symbol = await this.fetchSymbolFromQuestrade(symbolId);
      
      // Save to database
      if (symbol) {
        await Symbol.findOneAndUpdate(
          { symbolId },
          symbol,
          { upsert: true }
        );
      }
      
      return symbol;
    } catch (error) {
      logger.error(`Failed to get symbol details for ${symbolId}:`, error);
      throw error;
    }
  }

  async fetchSymbolFromQuestrade(symbolId) {
    try {
      const person = await this.getAvailablePerson();
      
      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${person}`
      );
      
      const tokenData = response.data.data;
      
      const symbolResponse = await axios.get(
        `${tokenData.apiServer}/v1/symbols/${symbolId}`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        }
      );
      
      const symbolData = symbolResponse.data.symbols?.[0];
      
      if (!symbolData) {
        return null;
      }
      
      return {
        symbol: symbolData.symbol,
        symbolId: symbolData.symbolId,
        description: symbolData.description,
        securityType: symbolData.securityType,
        exchange: symbolData.exchange,
        listingExchange: symbolData.listingExchange,
        isTradable: symbolData.isTradable,
        isQuotable: symbolData.isQuotable,
        hasOptions: symbolData.hasOptions,
        currency: symbolData.currency,
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error(`Failed to fetch symbol from Questrade:`, error);
      return null;
    }
  }

  async getOptionsChain(symbol, expiry) {
    // Simplified options chain
    // In production, this would fetch actual options data
    return {
      symbol,
      expiry: expiry || 'next',
      calls: [],
      puts: [],
      message: 'Options chain functionality not yet implemented'
    };
  }

  async getSymbolFundamentals(symbol) {
    // Simplified fundamentals
    // In production, this would fetch actual fundamental data
    return {
      symbol,
      marketCap: 0,
      pe: 0,
      eps: 0,
      dividend: 0,
      yield: 0,
      beta: 1.0,
      message: 'Fundamentals data not yet implemented'
    };
  }

  async syncSymbolFromQuestrade(symbol) {
    try {
      const person = await this.getAvailablePerson();
      
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
      const exactMatch = symbols.find(s => s.symbol === symbol);
      
      if (!exactMatch) {
        throw new Error(`Symbol ${symbol} not found`);
      }
      
      const symbolData = {
        symbol: exactMatch.symbol,
        symbolId: exactMatch.symbolId,
        description: exactMatch.description,
        securityType: exactMatch.securityType,
        exchange: exactMatch.exchange,
        currency: exactMatch.currency,
        isTradable: exactMatch.isTradable,
        isQuotable: exactMatch.isQuotable,
        hasOptions: exactMatch.hasOptions,
        lastUpdated: new Date()
      };
      
      await Symbol.findOneAndUpdate(
        { symbol: exactMatch.symbol },
        symbolData,
        { upsert: true }
      );
      
      return symbolData;
    } catch (error) {
      logger.error(`Failed to sync symbol ${symbol}:`, error);
      throw error;
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
}

module.exports = new SymbolService();