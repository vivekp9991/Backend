const WatchList = require('../models/WatchList');
const quoteService = require('./quoteService');
const logger = require('../utils/logger');

class WatchlistService {
  async getUserWatchlists(personName) {
    try {
      const watchlists = await WatchList.getByPerson(personName);
      return watchlists;
    } catch (error) {
      logger.error(`Failed to get watchlists for ${personName}:`, error);
      throw error;
    }
  }

  async getWatchlist(watchlistId, personName) {
    try {
      const watchlist = await WatchList.findOne({ 
        _id: watchlistId,
        personName 
      });
      
      if (!watchlist) {
        throw new Error('Watchlist not found');
      }
      
      return watchlist;
    } catch (error) {
      logger.error(`Failed to get watchlist ${watchlistId}:`, error);
      throw error;
    }
  }

  async getWatchlistWithQuotes(watchlistId, personName) {
    try {
      const watchlist = await this.getWatchlist(watchlistId, personName);
      
      if (watchlist.symbols.length === 0) {
        return {
          ...watchlist.toObject(),
          quotes: []
        };
      }
      
      // Get quotes for all symbols
      const quotes = await quoteService.getMultipleQuotes(watchlist.symbols);
      
      // Mark as viewed
      watchlist.lastViewed = new Date();
      await watchlist.save();
      
      return {
        ...watchlist.toObject(),
        quotes
      };
    } catch (error) {
      logger.error(`Failed to get watchlist with quotes:`, error);
      throw error;
    }
  }

  async createWatchlist(personName, name, description, symbols = []) {
    try {
      const watchlist = new WatchList({
        personName,
        name,
        description,
        symbols: symbols.map(s => s.toUpperCase())
      });
      
      await watchlist.save();
      
      logger.info(`Created watchlist "${name}" for ${personName}`);
      
      return watchlist;
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('Watchlist with this name already exists');
      }
      logger.error('Failed to create watchlist:', error);
      throw error;
    }
  }

  async updateWatchlist(watchlistId, updates) {
    try {
      const watchlist = await WatchList.findById(watchlistId);
      
      if (!watchlist) {
        throw new Error('Watchlist not found');
      }
      
      // Update allowed fields
      if (updates.name) watchlist.name = updates.name;
      if (updates.description !== undefined) watchlist.description = updates.description;
      if (updates.symbols) watchlist.symbols = updates.symbols.map(s => s.toUpperCase());
      if (updates.settings) watchlist.settings = { ...watchlist.settings, ...updates.settings };
      
      await watchlist.save();
      
      return watchlist;
    } catch (error) {
      logger.error(`Failed to update watchlist ${watchlistId}:`, error);
      throw error;
    }
  }

  async addSymbolToWatchlist(watchlistId, symbol) {
    try {
      const watchlist = await WatchList.findById(watchlistId);
      
      if (!watchlist) {
        throw new Error('Watchlist not found');
      }
      
      await watchlist.addSymbol(symbol);
      
      return watchlist;
    } catch (error) {
      logger.error(`Failed to add symbol to watchlist:`, error);
      throw error;
    }
  }

  async removeSymbolFromWatchlist(watchlistId, symbol) {
    try {
      const watchlist = await WatchList.findById(watchlistId);
      
      if (!watchlist) {
        throw new Error('Watchlist not found');
      }
      
      await watchlist.removeSymbol(symbol);
      
      return watchlist;
    } catch (error) {
      logger.error(`Failed to remove symbol from watchlist:`, error);
      throw error;
    }
  }

  async deleteWatchlist(watchlistId) {
    try {
      const result = await WatchList.deleteOne({ _id: watchlistId });
      
      if (result.deletedCount === 0) {
        throw new Error('Watchlist not found');
      }
      
      logger.info(`Deleted watchlist ${watchlistId}`);
      
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete watchlist ${watchlistId}:`, error);
      throw error;
    }
  }

  async addAlert(watchlistId, symbol, type, threshold) {
    try {
      const watchlist = await WatchList.findById(watchlistId);
      
      if (!watchlist) {
        throw new Error('Watchlist not found');
      }
      
      const alert = {
        symbol: symbol.toUpperCase(),
        type,
        threshold,
        isActive: true,
        createdAt: new Date()
      };
      
      watchlist.alerts.push(alert);
      await watchlist.save();
      
      return alert;
    } catch (error) {
      logger.error('Failed to add alert:', error);
      throw error;
    }
  }

  async checkAlerts(watchlistId) {
    try {
      const watchlist = await WatchList.findById(watchlistId);
      
      if (!watchlist || !watchlist.settings.alertsEnabled) {
        return [];
      }
      
      const triggeredAlerts = [];
      
      for (const alert of watchlist.alerts) {
        if (!alert.isActive) continue;
        
        const quote = await quoteService.getQuote(alert.symbol);
        
        let triggered = false;
        
        switch (alert.type) {
          case 'above':
            triggered = quote.lastTradePrice > alert.threshold;
            break;
          case 'below':
            triggered = quote.lastTradePrice < alert.threshold;
            break;
          case 'change_percent':
            triggered = Math.abs(quote.changePercent) > alert.threshold;
            break;
        }
        
        if (triggered) {
          alert.triggeredAt = new Date();
          alert.isActive = false;
          triggeredAlerts.push({
            ...alert.toObject(),
            currentPrice: quote.lastTradePrice
          });
        }
      }
      
      if (triggeredAlerts.length > 0) {
        await watchlist.save();
      }
      
      return triggeredAlerts;
    } catch (error) {
      logger.error('Failed to check alerts:', error);
      return [];
    }
  }
}

module.exports = new WatchlistService();