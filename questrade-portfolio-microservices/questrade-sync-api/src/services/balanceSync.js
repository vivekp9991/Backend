const Balance = require('../models/Balance');
const questradeClient = require('./questradeClient');
const logger = require('../utils/logger');

class BalanceSync {
  async syncAccountBalances(personName, accountId) {
    try {
      // Get balances from Questrade
      const questradeBalances = await questradeClient.getAccountBalances(personName, accountId);
      
      logger.info(`Syncing balances for account ${accountId}`);
      
      const syncedBalances = [];
      
      // Process combined balances (main account currencies)
      if (questradeBalances.combinedBalances) {
        for (const qBalance of questradeBalances.combinedBalances) {
          try {
            // Find or create balance record
            let balance = await Balance.findOne({
              accountId,
              currency: qBalance.currency
            });
            
            const isNewDay = this.isNewTradingDay(balance);
            
            if (!balance) {
              balance = new Balance({
                accountId,
                personName,
                currency: qBalance.currency
              });
            }
            
            // Set SOD balances if it's a new trading day
            if (isNewDay) {
              balance.sodBalances = {
                cash: balance.cash || 0,
                marketValue: balance.marketValue || 0,
                totalEquity: balance.totalEquity || 0,
                date: new Date()
              };
            }
            
            // Update balance data
            balance.cash = qBalance.cash;
            balance.marketValue = qBalance.marketValue;
            balance.totalEquity = qBalance.totalEquity;
            balance.buyingPower = qBalance.buyingPower;
            balance.maintenanceExcess = qBalance.maintenanceExcess;
            balance.isRealTime = questradeBalances.isRealTime || false;
            balance.lastSyncedAt = new Date();
            
            // Store all combined balances
            balance.combinedBalances = questradeBalances.combinedBalances;
            
            // Store per-currency balances if available
            if (questradeBalances.perCurrencyBalances) {
              balance.perCurrencyBalances = questradeBalances.perCurrencyBalances;
            }
            
            await balance.save();
            syncedBalances.push(balance);
            
            logger.debug(`Synced ${qBalance.currency} balance for account ${accountId}`);
            
          } catch (error) {
            logger.error(`Error syncing ${qBalance.currency} balance:`, error);
          }
        }
      }
      
      // Process per-currency balances if no combined balances
      if (!questradeBalances.combinedBalances && questradeBalances.perCurrencyBalances) {
        for (const qBalance of questradeBalances.perCurrencyBalances) {
          try {
            let balance = await Balance.findOne({
              accountId,
              currency: qBalance.currency
            });
            
            if (!balance) {
              balance = new Balance({
                accountId,
                personName,
                currency: qBalance.currency
              });
            }
            
            balance.cash = qBalance.cash;
            balance.marketValue = qBalance.marketValue;
            balance.totalEquity = qBalance.totalEquity;
            balance.isRealTime = questradeBalances.isRealTime || false;
            balance.lastSyncedAt = new Date();
            
            await balance.save();
            syncedBalances.push(balance);
            
          } catch (error) {
            logger.error(`Error syncing per-currency balance:`, error);
          }
        }
      }
      
      return {
        success: true,
        balancesSynced: syncedBalances.length,
        balances: syncedBalances,
        apiCalls: 1
      };
      
    } catch (error) {
      logger.error(`Failed to sync balances for account ${accountId}:`, error);
      throw error;
    }
  }
  
  // Check if it's a new trading day
  isNewTradingDay(balance) {
    if (!balance || !balance.sodBalances || !balance.sodBalances.date) {
      return true;
    }
    
    const lastSodDate = new Date(balance.sodBalances.date);
    const today = new Date();
    
    // Simple check - if it's a different day
    return lastSodDate.toDateString() !== today.toDateString();
  }
  
  async getAccountBalances(accountId) {
    try {
      const balances = await Balance.getByAccount(accountId);
      return balances;
    } catch (error) {
      logger.error(`Failed to get balances for account ${accountId}:`, error);
      throw error;
    }
  }
  
  async getPersonBalances(personName) {
    try {
      const balances = await Balance.getByPerson(personName);
      return balances;
    } catch (error) {
      logger.error(`Failed to get balances for ${personName}:`, error);
      throw error;
    }
  }
  
  async getTotalEquity(filter = {}) {
    try {
      const totalEquity = await Balance.getTotalEquity(filter);
      return totalEquity;
    } catch (error) {
      logger.error('Failed to get total equity:', error);
      throw error;
    }
  }
}

module.exports = new BalanceSync();