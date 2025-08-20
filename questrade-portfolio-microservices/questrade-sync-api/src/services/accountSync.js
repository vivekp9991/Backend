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
          // Get account balances for summary
          const balances = await questradeClient.getAccountBalances(personName, qAccount.number);
          apiCalls++;
          
          // Find or create account
          let account = await Account.findOne({ accountId: qAccount.number });
          
          if (!account) {
            account = new Account({
              accountId: qAccount.number,
              personName
            });
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
              totalEquity: primaryBalance.totalEquity,
              totalEquityCAD: this.convertToCAD(primaryBalance.totalEquity, primaryBalance.currency),
              cash: primaryBalance.cash,
              cashCAD: this.convertToCAD(primaryBalance.cash, primaryBalance.currency),
              marketValue: primaryBalance.marketValue,
              marketValueCAD: this.convertToCAD(primaryBalance.marketValue, primaryBalance.currency),
              buyingPower: primaryBalance.buyingPower,
              maintenanceExcess: primaryBalance.maintenanceExcess,
              isRealTime: balances.isRealTime || false
            };
          }
          
          account.lastSyncedAt = new Date();
          account.lastSuccessfulSync = new Date();
          
          await account.save();
          syncedAccounts.push(account);
          
          logger.info(`Synced account ${account.accountId} (${account.type}) for ${personName}`);
          
        } catch (error) {
          logger.error(`Error syncing account ${qAccount.number}:`, error);
          
          // Try to update error status on existing account
          const existingAccount = await Account.findOne({ accountId: qAccount.number });
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
      const account = await Account.findOne({ accountId })
        .select('-syncErrors');
      
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