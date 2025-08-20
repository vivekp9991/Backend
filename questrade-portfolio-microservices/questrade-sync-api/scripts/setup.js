const mongoose = require('mongoose');
const readline = require('readline');
const axios = require('axios');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility function for prompting user input
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

class SyncAPISetup {
  constructor() {
    this.mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_portfolio';
    this.apiUrl = `http://localhost:${process.env.PORT || 4002}/api`;
    this.authApiUrl = process.env.AUTH_API_URL || 'http://localhost:4001/api';
  }

  async connectDatabase() {
    try {
      await mongoose.connect(this.mongoUri);
      console.log('✅ Connected to MongoDB');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      return false;
    }
  }

  async checkAuthAPI() {
    try {
      const response = await axios.get(this.authApiUrl.replace('/api', '/health'));
      console.log('✅ Auth API is accessible');
      return true;
    } catch (error) {
      console.log('❌ Auth API is not accessible at', this.authApiUrl);
      console.log('   Please ensure the Auth API is running on port 4001');
      return false;
    }
  }

  async checkServerRunning() {
    try {
      const response = await axios.get(`${this.apiUrl.replace('/api', '/health')}`);
      console.log('✅ Sync API server is running');
      return true;
    } catch (error) {
      console.log('⚠️  Sync API server is not running');
      console.log('   Please start the server with: npm start');
      return false;
    }
  }

  async getActivePersons() {
    try {
      const response = await axios.get(`${this.authApiUrl}/persons`);
      return response.data.data.filter(p => p.isActive && p.hasValidToken);
    } catch (error) {
      console.log('❌ Failed to get persons from Auth API:', error.message);
      return [];
    }
  }

  async showWelcome() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              Questrade Sync API - Setup Wizard                 ║
║                                                                ║
║  This wizard will help you set up the data synchronization    ║
║  service for your Questrade Portfolio Tracker.                ║
║                                                                ║
║  Prerequisites:                                                ║
║  1. MongoDB is running                                        ║
║  2. Auth API is running on port 4001                          ║
║  3. Valid persons with tokens configured in Auth API          ║
╚════════════════════════════════════════════════════════════════╝
`);
  }

  async showMainMenu() {
    console.log('\n=== Setup Menu ===');
    console.log('1. Check system status');
    console.log('2. Perform initial sync');
    console.log('3. Sync specific person');
    console.log('4. View sync statistics');
    console.log('5. Clear all synced data');
    console.log('6. Test sync for one account');
    console.log('7. Configure sync schedule');
    console.log('8. Exit');
    
    const choice = await question('\nSelect an option (1-8): ');
    return choice.trim();
  }

  async checkSystemStatus() {
    console.log('\n=== System Status ===');
    
    // Check MongoDB
    const dbConnected = await this.connectDatabase();
    
    // Check Auth API
    const authApiAvailable = await this.checkAuthAPI();
    
    // Check Sync API
    const syncApiRunning = await this.checkServerRunning();
    
    // Get active persons
    if (authApiAvailable) {
      const persons = await this.getActivePersons();
      console.log(`\n📊 Active persons with valid tokens: ${persons.length}`);
      
      if (persons.length > 0) {
        console.log('\nPersons ready for sync:');
        persons.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.personName} (${p.displayName || 'No display name'})`);
        });
      }
    }
    
    // Check collections
    if (dbConnected) {
      const Account = require('../src/models/Account');
      const Position = require('../src/models/Position');
      const Activity = require('../src/models/Activity');
      
      const counts = {
        accounts: await Account.countDocuments(),
        positions: await Position.countDocuments(),
        activities: await Activity.countDocuments()
      };
      
      console.log('\n📈 Current data in database:');
      console.log(`  Accounts: ${counts.accounts}`);
      console.log(`  Positions: ${counts.positions}`);
      console.log(`  Activities: ${counts.activities}`);
    }
    
    return {
      dbConnected,
      authApiAvailable,
      syncApiRunning
    };
  }

  async performInitialSync() {
    console.log('\n=== Initial Sync ===');
    
    const serverRunning = await this.checkServerRunning();
    if (!serverRunning) {
      console.log('❌ Sync API server must be running to perform sync');
      return;
    }
    
    const confirm = await question('This will sync all data for all persons. Continue? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Cancelled.');
      return;
    }
    
    try {
      console.log('\n⏳ Starting sync for all persons...');
      
      const response = await axios.post(`${this.apiUrl}/sync/all`, {
        triggeredBy: 'manual'
      });
      
      if (response.data.success) {
        const { summary, results } = response.data.data;
        
        console.log(`\n✅ Sync completed!`);
        console.log(`  Total persons: ${summary.total}`);
        console.log(`  Successful: ${summary.successful}`);
        console.log(`  Failed: ${summary.failed}`);
        
        if (results && results.length > 0) {
          console.log('\nDetails:');
          results.forEach(r => {
            if (r.success) {
              console.log(`  ✓ ${r.personName}: ${JSON.stringify(r.recordsProcessed)}`);
            } else {
              console.log(`  ✗ ${r.personName}: ${r.error}`);
            }
          });
        }
      }
    } catch (error) {
      console.log('❌ Sync failed:', error.response?.data?.error || error.message);
    }
  }

  async syncSpecificPerson() {
    console.log('\n=== Sync Specific Person ===');
    
    const persons = await this.getActivePersons();
    if (persons.length === 0) {
      console.log('No active persons found.');
      return;
    }
    
    console.log('\nAvailable persons:');
    persons.forEach((p, i) => {
      console.log(`${i + 1}. ${p.personName}`);
    });
    
    const choice = await question(`\nSelect person number (1-${persons.length}): `);
    const choiceTrimmed = choice.trim();
    
    // Validate input - must be a number
    if (!/^\d+$/.test(choiceTrimmed)) {
      console.log('❌ Invalid input. Please enter a number.');
      return;
    }
    
    const index = parseInt(choiceTrimmed) - 1;
    
    if (index < 0 || index >= persons.length) {
      console.log('❌ Invalid selection. Please select a number from the list.');
      return;
    }
    
    const person = persons[index];
    
    console.log(`\nSelected: ${person.personName}`);
    console.log('\nSync types:');
    console.log('1. Full sync (all data)');
    console.log('2. Accounts only');
    console.log('3. Positions only');
    console.log('4. Activities only');
    
    const syncTypeChoice = await question('\nSelect sync type (1-4): ');
    const syncTypeChoiceTrimmed = syncTypeChoice.trim();
    
    // Validate sync type input
    if (!/^[1-4]$/.test(syncTypeChoiceTrimmed)) {
      console.log('❌ Invalid sync type. Please select 1-4.');
      return;
    }
    
    const syncTypes = {
      '1': 'full',
      '2': 'accounts',
      '3': 'positions',
      '4': 'activities'
    };
    
    const syncType = syncTypes[syncTypeChoiceTrimmed];
    
    try {
      console.log(`\n⏳ Starting ${syncType} sync for ${person.personName}...`);
      
      const response = await axios.post(`${this.apiUrl}/sync/person/${person.personName}`, {
        syncType,
        triggeredBy: 'manual'
      });
      
      if (response.data.success) {
        console.log('✅ Sync completed!');
        console.log('  Records processed:', response.data.data.recordsProcessed);
        console.log('  Duration:', response.data.data.duration, 'ms');
      }
    } catch (error) {
      console.log('❌ Sync failed:', error.response?.data?.error || error.message);
    }
  }

  async viewSyncStatistics() {
    console.log('\n=== Sync Statistics ===');
    
    try {
      const response = await axios.get(`${this.apiUrl}/sync/status`);
      
      if (response.data.success) {
        const { inProgress, recentSyncs, stats24Hours } = response.data.data;
        
        console.log('\n📊 24-Hour Statistics:');
        console.log(`  Total syncs: ${stats24Hours.total}`);
        console.log(`  Successful: ${stats24Hours.successful}`);
        console.log(`  Failed: ${stats24Hours.failed}`);
        console.log(`  Partial: ${stats24Hours.partial}`);
        console.log(`  Success rate: ${stats24Hours.successRate?.toFixed(1)}%`);
        console.log(`  Average duration: ${(stats24Hours.averageDuration / 1000).toFixed(1)}s`);
        
        if (inProgress.length > 0) {
          console.log('\n⏳ Currently syncing:');
          inProgress.forEach(p => console.log(`  - ${p}`));
        }
        
        if (recentSyncs.length > 0) {
          console.log('\n📝 Recent syncs:');
          recentSyncs.forEach(sync => {
            const duration = sync.duration ? `${(sync.duration / 1000).toFixed(1)}s` : 'N/A';
            console.log(`  ${sync.personName} - ${sync.status} (${duration})`);
          });
        }
      }
    } catch (error) {
      console.log('❌ Failed to get statistics:', error.message);
    }
  }

  async clearAllData() {
    console.log('\n⚠️  WARNING: This will delete ALL synced data!');
    const confirm1 = await question('Type "DELETE ALL DATA" to confirm: ');
    
    if (confirm1 !== 'DELETE ALL DATA') {
      console.log('Cancelled.');
      return;
    }
    
    try {
      console.log('\n⏳ Clearing all data...');
      
      const Account = require('../src/models/Account');
      const Position = require('../src/models/Position');
      const Balance = require('../src/models/Balance');
      const Activity = require('../src/models/Activity');
      const SyncLog = require('../src/models/SyncLog');
      
      await Account.deleteMany({});
      await Position.deleteMany({});
      await Balance.deleteMany({});
      await Activity.deleteMany({});
      await SyncLog.deleteMany({});
      
      console.log('✅ All data cleared');
    } catch (error) {
      console.log('❌ Failed to clear data:', error.message);
    }
  }

  async testSyncForOneAccount() {
    console.log('\n=== Test Sync for One Account ===');
    
    const persons = await this.getActivePersons();
    if (persons.length === 0) {
      console.log('No active persons found.');
      return;
    }
    
    console.log('\nAvailable persons:');
    persons.forEach((p, i) => {
      console.log(`${i + 1}. ${p.personName}`);
    });
    
    const personChoice = await question(`\nSelect person number (1-${persons.length}): `);
    const personChoiceTrimmed = personChoice.trim();
    
    // Validate input - must be a number
    if (!/^\d+$/.test(personChoiceTrimmed)) {
      console.log('❌ Invalid input. Please enter a number.');
      return;
    }
    
    const personIndex = parseInt(personChoiceTrimmed) - 1;
    
    if (personIndex < 0 || personIndex >= persons.length) {
      console.log('❌ Invalid selection. Please select a number from the list.');
      return;
    }
    
    const person = persons[personIndex];
    
    try {
      // Get accounts for this person
      const accountsResponse = await axios.get(`${this.apiUrl}/accounts/${person.personName}`);
      const accounts = accountsResponse.data.data;
      
      if (!accounts || accounts.length === 0) {
        console.log('No accounts found for this person. Please sync accounts first.');
        return;
      }
      
      console.log(`\nAccounts for ${person.personName}:`);
      accounts.forEach((acc, i) => {
        console.log(`${i + 1}. ${acc.type} - ${acc.number} (${acc.accountId})`);
      });
      
      const accountChoice = await question(`\nSelect account number (1-${accounts.length}): `);
      const accountChoiceTrimmed = accountChoice.trim();
      
      // Validate account selection
      if (!/^\d+$/.test(accountChoiceTrimmed)) {
        console.log('❌ Invalid input. Please enter a number.');
        return;
      }
      
      const accountIndex = parseInt(accountChoiceTrimmed) - 1;
      
      if (accountIndex < 0 || accountIndex >= accounts.length) {
        console.log('❌ Invalid selection. Please select a number from the list.');
        return;
      }
      
      const account = accounts[accountIndex];
      
      console.log(`\n⏳ Testing sync for account ${account.accountId}...`);
      
      const syncResponse = await axios.post(
        `${this.apiUrl}/sync/account/${person.personName}/${account.accountId}`,
        {
          syncType: 'full',
          triggeredBy: 'manual'
        }
      );
      
      if (syncResponse.data.success) {
        console.log('✅ Test sync completed!');
        console.log('  Records processed:', syncResponse.data.data.recordsProcessed);
      }
    } catch (error) {
      console.log('❌ Test sync failed:', error.response?.data?.error || error.message);
    }
  }

  async configureSyncSchedule() {
    console.log('\n=== Configure Sync Schedule ===');
    
    const currentInterval = process.env.SYNC_INTERVAL_MINUTES || 15;
    const currentEnabled = process.env.ENABLE_AUTO_SYNC === 'true';
    
    console.log(`\nCurrent configuration:`);
    console.log(`  Auto-sync enabled: ${currentEnabled}`);
    console.log(`  Interval: ${currentInterval} minutes`);
    
    console.log('\n⚠️  To change these settings:');
    console.log('1. Edit the .env file');
    console.log('2. Set ENABLE_AUTO_SYNC=true or false');
    console.log('3. Set SYNC_INTERVAL_MINUTES to desired interval');
    console.log('4. Restart the Sync API server');
    
    const runNow = await question('\nRun a scheduled sync now? (yes/no): ');
    
    if (runNow.toLowerCase() === 'yes') {
      try {
        console.log('\n⏳ Running scheduled sync...');
        
        const response = await axios.post(`${this.apiUrl}/sync/all`, {
          triggeredBy: 'scheduled'
        });
        
        if (response.data.success) {
          console.log('✅ Scheduled sync completed');
        }
      } catch (error) {
        console.log('❌ Scheduled sync failed:', error.message);
      }
    }
  }

  async run() {
    try {
      await this.showWelcome();
      
      // Initial system check
      const status = await this.checkSystemStatus();
      
      if (!status.dbConnected) {
        console.log('\n❌ Cannot proceed without database connection');
        console.log('Please ensure MongoDB is running and try again.');
        process.exit(1);
      }
      
      if (!status.authApiAvailable) {
        console.log('\n❌ Cannot proceed without Auth API');
        console.log('Please start the Auth API on port 4001 and try again.');
        process.exit(1);
      }
      
      let running = true;
      while (running) {
        try {
          const choice = await this.showMainMenu();
          
          switch (choice) {
            case '1':
              await this.checkSystemStatus();
              break;
            case '2':
              await this.performInitialSync();
              break;
            case '3':
              await this.syncSpecificPerson();
              break;
            case '4':
              await this.viewSyncStatistics();
              break;
            case '5':
              await this.clearAllData();
              break;
            case '6':
              await this.testSyncForOneAccount();
              break;
            case '7':
              await this.configureSyncSchedule();
              break;
            case '8':
              running = false;
              break;
            default:
              console.log('Invalid choice. Please select 1-8.');
          }
          
          if (running) {
            await question('\nPress Enter to continue...');
          }
          
        } catch (error) {
          console.log('\n❌ An error occurred:', error.message);
          await question('\nPress Enter to continue...');
        }
      }
      
      console.log('\n👋 Setup complete!');
      console.log('🚀 Your Sync API is ready to use!');
      console.log('\nNext steps:');
      console.log('1. Ensure the Sync API server is running: npm start');
      console.log('2. Data will sync automatically based on your schedule');
      console.log('3. Set up the Portfolio API for calculations');
      console.log('4. Set up the Market API for real-time data');
      
    } catch (error) {
      console.error('Setup failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
      }
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new SyncAPISetup();
  setup.run().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = SyncAPISetup;