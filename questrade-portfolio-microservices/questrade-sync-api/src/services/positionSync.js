const Position = require('../models/Position');
const Account = require('../models/Account');
const questradeClient = require('./questradeClient');
const logger = require('../utils/logger');

class PositionSync {
  async syncAccountPositions(personName, accountId) {
    try {
      // Get account details to include account type
      const account = await Account.findOne({ accountId });
      const accountType = account ? account.type : null;
      
      // Add debug logging
      logger.info(`[POSITION SYNC] Account type for ${accountId}: ${accountType}`);

      // Get positions from Questrade
      const questradePositions = await questradeClient.getAccountPositions(personName, accountId);
      
      logger.info(`Found ${questradePositions.length} positions for account ${accountId} (${accountType})`);
      
      // Get existing positions for this account
      const existingPositions = await Position.find({ accountId });
      const existingSymbols = new Set(existingPositions.map(p => p.symbol));
      
      const syncedPositions = [];
      const questradeSymbols = new Set();
      
      for (const qPosition of questradePositions) {
        try {
          questradeSymbols.add(qPosition.symbol);
          
          // Find or create position
          let position = await Position.findOne({
            accountId,
            symbol: qPosition.symbol
          });
          
          if (!position) {
            position = new Position({
              accountId,
              personName,
              symbol: qPosition.symbol,
              symbolId: qPosition.symbolId,
              accountType: accountType // Set account type
            });
          }
          
          // Update position data
          position.openQuantity = qPosition.openQuantity;
          position.closedQuantity = qPosition.closedQuantity || 0;
          position.currentMarketValue = qPosition.currentMarketValue;
          position.currentPrice = qPosition.currentPrice;
          position.averageEntryPrice = qPosition.averageEntryPrice;
          position.totalCost = qPosition.totalCost;
          position.openPnl = qPosition.openPnl;
          position.closedPnl = qPosition.closedPnl || 0;
          position.dayPnl = qPosition.dayPnl || 0;
          position.isRealTime = qPosition.isRealTime || false;
          position.isUnderReorg = qPosition.isUnderReorg || false;
          position.accountType = accountType; // Update account type
          position.lastSyncedAt = new Date();
          position.lastPriceUpdate = new Date();
          
          await position.save();
          syncedPositions.push(position);
          
          logger.debug(`Synced position ${position.symbol} for account ${accountId} (${accountType})`);
          
        } catch (error) {
          logger.error(`Error syncing position ${qPosition.symbol}:`, error);
        }
      }
      
      // Remove positions that no longer exist (closed positions with 0 quantity)
      const positionsToRemove = existingSymbols.size > 0 
        ? Array.from(existingSymbols).filter(symbol => !questradeSymbols.has(symbol))
        : [];
      
      if (positionsToRemove.length > 0) {
        logger.info(`Removing ${positionsToRemove.length} closed positions for account ${accountId}`);
        
        for (const symbol of positionsToRemove) {
          const position = await Position.findOne({ accountId, symbol });
          if (position && position.openQuantity === 0) {
            await Position.deleteOne({ accountId, symbol });
            logger.debug(`Removed closed position ${symbol}`);
          }
        }
      }
      
      return {
        success: true,
        positionsSynced: syncedPositions.length,
        positions: syncedPositions,
        apiCalls: 1
      };
      
    } catch (error) {
      logger.error(`Failed to sync positions for account ${accountId}:`, error);
      throw error;
    }
  }
  
  async getAccountPositions(accountId) {
    try {
      const positions = await Position.getByAccount(accountId);
      return positions;
    } catch (error) {
      logger.error(`Failed to get positions for account ${accountId}:`, error);
      throw error;
    }
  }
  
  async getPersonPositions(personName) {
    try {
      const positions = await Position.getByPerson(personName);
      return positions;
    } catch (error) {
      logger.error(`Failed to get positions for ${personName}:`, error);
      throw error;
    }
  }
  
  async getPortfolioSummary(filter = {}) {
    try {
      const summary = await Position.getPortfolioSummary(filter);
      return summary;
    } catch (error) {
      logger.error('Failed to get portfolio summary:', error);
      throw error;
    }
  }
  
  // New method to get aggregated positions
  async getAggregatedPositions(filter = {}) {
    try {
      const positions = await Position.getAggregatedPositions(filter);
      return positions;
    } catch (error) {
      logger.error('Failed to get aggregated positions:', error);
      throw error;
    }
  }
  
  // New method to get aggregated positions for a person
  async getAggregatedPersonPositions(personName) {
    try {
      const positions = await Position.getAggregatedByPerson(personName);
      return positions;
    } catch (error) {
      logger.error(`Failed to get aggregated positions for ${personName}:`, error);
      throw error;
    }
  }
}

module.exports = new PositionSync();