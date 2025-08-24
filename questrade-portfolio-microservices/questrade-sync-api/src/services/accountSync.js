const Account = require('../models/Account');
const questradeClient = require('./questradeClient');
const logger = require('../utils/logger');

class AccountSync {
  async syncPersonAccounts(personName) {
    try {
      // Get accounts from Questrade
      const questradeAccounts = await questradeClient.getAccounts(personName);
      
      logger.info(`[ACCOUNT SYNC] Found ${questradeAccounts.length} accounts for ${personName}`);
      
      // Log the structure of accounts received
      logger.info(`[ACCOUNT SYNC] Account data structure:`, {
        accounts: questradeAccounts.map(acc => ({
          number: acc.number,
          type: acc.type,
          status: acc.status,
          isPrimary: acc.isPrimary,
          hasId: !!acc.id,
          id: acc.id,
          allKeys: Object.keys(acc)
        }))
      });
      
      const syncedAccounts = [];
      let apiCalls = 1; // Initial getAccounts call
      
      for (const qAccount of questradeAccounts) {
        try {
          // IMPORTANT: Use account number as the unique identifier
          // Questrade may not provide a separate 'id' field
          // The account number IS the unique identifier
          const accountId = qAccount.number; // Use number as the ID
          
          logger.info(`[ACCOUNT SYNC] Processing account:`, {
            accountId: accountId,
            number: qAccount.number,
            type: qAccount.type,
            originalId: qAccount.id
          });
          
          // Get account balances for summary
          const balances = await questradeClient.getAccountBalances(personName, accountId);
          apiCalls++;
          
          // Find existing account by accountId (which is the account number)
          let account = await Account.findOne({ accountId: accountId });
          
          if (!account) {
            logger.info(`[ACCOUNT SYNC] Creating new account record for ${accountId}`);
            account = new Account({
              accountId: accountId,
              number: qAccount.number,
              personName
            });
          } else {
            logger.info(`[ACCOUNT SYNC] Updating existing account ${accountId}`);
          }
          
          // Update account information
          account.number = qAccount.number;
          account.type = this.mapAccountType(qAccount.type);  // Use the mapping function
          account.status = qAccount.status;
          account.isPrimary = qAccount.isPrimary || false;
          account.isBilling = qAccount.isBilling || false;
          account.clientAccountType = qAccount.clientAccountType;
          account.personName = personName;
          
          // Update summary from balances
          if (balances && balances.combinedBalances && balances.combinedBalances.length > 0) {
            const primaryBalance = balances.combinedBalances[0];
            
            logger.info(`[ACCOUNT SYNC] Updating balance for account ${accountId}:`, {
              currency: primaryBalance.currency,
              totalEquity: primaryBalance.totalEquity,
              cash: primaryBalance.cash,
              marketValue: primaryBalance.marketValue
            });
            
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
            logger.info(`[ACCOUNT SYNC] Using per-currency balances for account ${accountId}`);
            
            let totalEquityCAD = 0;
            let totalCashCAD = 0;
            let totalMarketValueCAD = 0;
            
            balances.perCurrencyBalances.forEach(balance => {
              logger.info(`[ACCOUNT SYNC] Processing ${balance.currency} balance:`, {
                currency: balance.currency,
                totalEquity: balance.totalEquity,
                cash: balance.cash,
                marketValue: balance.marketValue
              });
              
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
          } else {
            logger.warn(`[ACCOUNT SYNC] No balance data available for account ${accountId}`);
            // Set default values if no balance data
            account.summary = {
              totalEquity: 0,
              totalEquityCAD: 0,
              cash: 0,
              cashCAD: 0,
              marketValue: 0,
              marketValueCAD: 0,
              buyingPower: 0,
              maintenanceExcess: 0,
              isRealTime: false
            };
          }
          
          account.lastSyncedAt = new Date();
          account.lastSuccessfulSync = new Date();
          
          await account.save();
          syncedAccounts.push(account);
          
          logger.info(`[ACCOUNT SYNC] Successfully synced account ${account.number} (${account.type}) for ${personName}`);
          
        } catch (error) {
          logger.error(`[ACCOUNT SYNC] Error syncing account ${qAccount.number}:`, error);
          
          // Try to update error status on existing account
          const existingAccount = await Account.findOne({ 
            accountId: qAccount.number
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
      
      logger.info(`[ACCOUNT SYNC] Sync complete for ${personName}:`, {
        totalAccounts: questradeAccounts.length,
        syncedAccounts: syncedAccounts.length,
        apiCalls: apiCalls
      });
      
      return {
        success: true,
        accountsSynced: syncedAccounts.length,
        accounts: syncedAccounts,
        apiCalls
      };
      
    } catch (error) {
      logger.error(`[ACCOUNT SYNC] Failed to sync accounts for ${personName}:`, error);
      throw error;
    }
  }
  
  // Helper method to convert to CAD (simplified - should use real exchange rate)
  convertToCAD(amount, currency) {
    if (!amount) return 0;
    
    logger.debug(`[ACCOUNT SYNC] Converting ${amount} ${currency} to CAD`);
    
    if (currency === 'CAD') return amount;
    if (currency === 'USD') {
      const rate = 1.35; // Should fetch real rate
      const converted = amount * rate;
      logger.debug(`[ACCOUNT SYNC] USD to CAD: ${amount} * ${rate} = ${converted}`);
      return converted;
    }
    return amount;
  }
  
  async getAccountDetails(accountId) {
    try {
      const account = await Account.findOne({ 
        accountId: accountId
      }).select('-syncErrors');
      
      if (!account) {
        logger.warn(`[ACCOUNT SYNC] Account ${accountId} not found`);
        throw new Error(`Account ${accountId} not found`);
      }
      
      return account;
    } catch (error) {
      logger.error(`[ACCOUNT SYNC] Failed to get account details for ${accountId}:`, error);
      throw error;
    }
  }
  
  async getPersonAccounts(personName) {
    try {
      logger.info(`[ACCOUNT SYNC] Getting accounts for person ${personName}`);
      const accounts = await Account.getByPerson(personName);
      
      logger.info(`[ACCOUNT SYNC] Found ${accounts.length} accounts for ${personName}`);
      
      return accounts;
    } catch (error) {
      logger.error(`[ACCOUNT SYNC] Failed to get accounts for ${personName}:`, error);
      throw error;
    }
  }

  // Helper method to map account types
  mapAccountType(questradeType) {
    // Known account type mappings
    const typeMap = {
      'Cash': 'Cash',
      'Margin': 'Margin',
      'TFSA': 'TFSA',
      'RRSP': 'RRSP',
      'RESP': 'RESP',
      'LIRA': 'LIRA',
      'RIF': 'RIF',
      'SRIF': 'SRIF',
      'LIF': 'LIF',
      'LRIF': 'LRIF',
      'PRIF': 'PRIF',
      'RRIF': 'RRIF',
      'FHSA': 'FHSA',
      'LRSP': 'LRSP',
      'RDSP': 'RDSP',
      'DPSP': 'DPSP'
    };
    
    // Check if it's a known type
    if (typeMap[questradeType]) {
      return typeMap[questradeType];
    }
    
    // Log unknown type for future reference
    logger.warn(`[ACCOUNT SYNC] Unknown account type received from Questrade: ${questradeType}`);
    
    // Return 'Other' for unknown types
    return 'Other';
  }
}

module.exports = new AccountSync();