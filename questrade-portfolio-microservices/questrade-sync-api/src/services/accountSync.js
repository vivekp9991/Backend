const Account = require('../models/Account');
const questradeClient = require('./questradeClient');
const logger = require('../utils/logger');

class AccountSync {
  async syncPersonAccounts(personName) {
    try {
      // Get accounts from Questrade
      const questradeAccounts = await questradeClient.getAccounts(personName);
      
      logger.info(`Found ${questradeAccounts.length} accounts for ${personName}`);
      
      const syncedAccounts = [];
      let apiCalls = 1; // Initial getAccounts call
      
      for (const qAccount of questradeAccounts) {
        try {
          // Generate a unique accountId if not provided
          // Some Questrade responses might have 'id' field
          const accountId = qAccount.id || qAccount.number;
          
          // Get account balances for summary
          const balances = await questradeClient.getAccountBalances(personName, accountId);
          apiCalls++;
          
          // Find account by accountId OR number to handle existing records
          let account = await Account.findOne({
            $or: [
              { accountId: accountId },
              { number: qAccount.number }
            ]
          });
          
          if (!account) {
            account = new Account({
              accountId: accountId,
              number: qAccount.number,
              personName
            });
          } else {
            // Update accountId if it was using number before
            account.accountId = accountId;
          }
          
          // Update account information
          account.number = qAccount.number;
          account.type = qAccount.type;
          account.status = qAccount.status;
          account.isPrimary = qAccount.isPrimary || false;
          account.isBilling = qAccount.isBilling || false;
          account.clientAccountType = qAccount.clientAccountType;
          account.personName = personName;
          
          // Update summary from balances
          if (balances && balances.combinedBalances && balances.combinedBalances.length > 0) {
            const primaryBalance = balances.combinedBalances[0];
            
            account.summary = {
              totalEquity: primaryBalance.totalEquity || 0,
              totalEquityCAD: this.convertToCAD(primaryBalance.totalEquity, primaryBalance.currency),
              cash: primaryBalance.cash || 0,
              cashCAD: this.convertToCAD(primaryBalance.cash, primaryBalance.currency),
              marketValue: primaryBalance.marketValue || 0,
              marketValueCAD: this.convertToCAD(primaryBalance.marketValue, primaryBalance.currency),
              buyingPower: primaryBalance.buyingPower || 0,
              maintenanceExcess: primaryBalance.maintenanceExcess || 0,
              isRealTime: balances.isRealTime || false
            };
          } else if (balances && balances.perCurrencyBalances && balances.perCurrencyBalances.length > 0) {
            // Handle per-currency balances if no combined balances
            let totalEquityCAD = 0;
            let totalCashCAD = 0;
            let totalMarketValueCAD = 0;
            
            balances.perCurrencyBalances.forEach(balance => {
              totalEquityCAD += this.convertToCAD(balance.totalEquity || 0, balance.currency);
              totalCashCAD += this.convertToCAD(balance.cash || 0, balance.currency);
              totalMarketValueCAD += this.convertToCAD(balance.marketValue || 0, balance.currency);
            });
            
            account.summary = {
              totalEquity: totalEquityCAD,
              totalEquityCAD: totalEquityCAD,
              cash: totalCashCAD,
              cashCAD: totalCashCAD,
              marketValue: totalMarketValueCAD,
              marketValueCAD: totalMarketValueCAD,
              buyingPower: 0,
              maintenanceExcess: 0,
              isRealTime: balances.isRealTime || false
            };
          }
          
          account.lastSyncedAt = new Date();
          account.lastSuccessfulSync = new Date();
          
          await account.save();
          syncedAccounts.push(account);
          
          logger.info(`Synced account ${account.number} (${account.type}) for ${personName}`);
          
        } catch (error) {
          logger.error(`Error syncing account ${qAccount.number}:`, error);
          
          // Try to update error status on existing account
          const existingAccount = await Account.findOne({ 
            $or: [
              { accountId: qAccount.id || qAccount.number },
              { number: qAccount.number }
            ]
          });
          
          if (existingAccount) {
            if (!existingAccount.syncErrors) {
              existingAccount.syncErrors = [];
            }
            existingAccount.syncErrors.push({
              date: new Date(),
              error: error.message
            });
            // Keep only last 10 errors
            if (existingAccount.syncErrors.length > 10) {
              existingAccount.syncErrors = existingAccount.syncErrors.slice(-10);
            }
            await existingAccount.save();
          }
        }
      }
      
      return {
        success: true,
        accountsSynced: syncedAccounts.length,
        accounts: syncedAccounts,
        apiCalls
      };
      
    } catch (error) {
      logger.error(`Failed to sync accounts for ${personName}:`, error);
      throw error;
    }
  }
  
  // Helper method to convert to CAD (simplified - should use real exchange rate)
  convertToCAD(amount, currency) {
    if (!amount) return 0;
    if (currency === 'CAD') return amount;
    if (currency === 'USD') return amount * 1.35; // Should fetch real rate
    return amount;
  }
  
  async getAccountDetails(accountId) {
    try {
      const account = await Account.findOne({ 
        $or: [
          { accountId: accountId },
          { number: accountId }
        ]
      }).select('-syncErrors');
      
      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }
      
      return account;
    } catch (error) {
      logger.error(`Failed to get account details for ${accountId}:`, error);
      throw error;
    }
  }
  
  async getPersonAccounts(personName) {
    try {
      const accounts = await Account.getByPerson(personName);
      return accounts;
    } catch (error) {
      logger.error(`Failed to get accounts for ${personName}:`, error);
      throw error;
    }
  }
}

module.exports = new AccountSync();