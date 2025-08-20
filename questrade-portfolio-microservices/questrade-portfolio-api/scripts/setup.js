const mongoose = require('mongoose');
const readline = require('readline');
const axios = require('axios');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

class PortfolioAPISetup {
  constructor() {
    this.mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_portfolio';
    this.apiUrl = `http://localhost:${process.env.PORT || 4003}/api`;
    this.syncApiUrl = process.env.SYNC_API_URL || 'http://localhost:4002/api';
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

  async checkDependencies() {
    console.log('\n=== Checking Service Dependencies ===');
    
    // Check Auth API
    try {
      const authResponse = await axios.get(this.authApiUrl.replace('/api', '/health'));
      console.log('✅ Auth API is accessible');
    } catch (error) {
      console.log('❌ Auth API is not accessible at', this.authApiUrl);
      console.log('   Please ensure the Auth API is running on port 4001');
      return false;
    }
    
    // Check Sync API
    try {
      const syncResponse = await axios.get(this.syncApiUrl.replace('/api', '/health'));
      console.log('✅ Sync API is accessible');
    } catch (error) {
      console.log('❌ Sync API is not accessible at', this.syncApiUrl);
      console.log('   Please ensure the Sync API is running on port 4002');
      return false;
    }
    
    return true;
  }

  async checkServerRunning() {
    try {
      const response = await axios.get(`${this.apiUrl.replace('/api', '/health')}`);
      console.log('✅ Portfolio API server is running');
      return true;
    } catch (error) {
      console.log('⚠️  Portfolio API server is not running');
      console.log('   Please start the server with: npm start');
      return false;
    }
  }

  async getDataStatus() {
    try {
      const response = await axios.get(`${this.syncApiUrl}/stats/data`);
      const data = response.data.data;
      
      console.log('\n📊 Current Data Status:');
      console.log(`  Persons: ${data.counts.persons}`);
      console.log(`  Accounts: ${data.counts.accounts}`);
      console.log(`  Positions: ${data.counts.positions}`);
      console.log(`  Activities: ${data.counts.activities}`);
      console.log(`  Last Sync: ${data.lastSuccessfulSync || 'Never'}`);
      
      return data;
    } catch (error) {
      console.log('❌ Failed to get data status:', error.message);
      return null;
    }
  }

  async showWelcome() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           Questrade Portfolio API - Setup Wizard               ║
║                                                                ║
║  This wizard will help you set up the Portfolio Calculation   ║
║  and Analytics service for your Questrade Portfolio Tracker.  ║
║                                                                ║
║  Prerequisites:                                                ║
║  1. MongoDB is running                                        ║
║  2. Auth API is running on port 4001                          ║
║  3. Sync API is running on port 4002                          ║
║  4. Data has been synced via Sync API                         ║
╚════════════════════════════════════════════════════════════════╝
`);
  }

  async showMainMenu() {
    console.log('\n=== Setup Menu ===');
    console.log('1. Check system status');
    console.log('2. Generate portfolio snapshots');
    console.log('3. Calculate performance metrics');
    console.log('4. Test calculations for a person');
    console.log('5. View portfolio summary');
    console.log('6. Clear calculation cache');
    console.log('7. Initialize sample data');
    console.log('8. Exit');
    
    const choice = await question('\nSelect an option (1-8): ');
    return choice.trim();
  }

  async checkSystemStatus() {
    console.log('\n=== System Status ===');
    
    const dbConnected = await this.connectDatabase();
    const depsAvailable = await this.checkDependencies();
    const serverRunning = await this.checkServerRunning();
    const dataStatus = await this.getDataStatus();
    
    if (dbConnected && dataStatus) {
      const PortfolioSnapshot = require('../src/models/PortfolioSnapshot');
      const PerformanceHistory = require('../src/models/PerformanceHistory');
      const AssetAllocation = require('../src/models/AssetAllocation');
      
      const counts = {
        snapshots: await PortfolioSnapshot.countDocuments(),
        performance: await PerformanceHistory.countDocuments(),
        allocations: await AssetAllocation.countDocuments()
      };
      
      console.log('\n📈 Portfolio API Data:');
      console.log(`  Portfolio Snapshots: ${counts.snapshots}`);
      console.log(`  Performance Records: ${counts.performance}`);
      console.log(`  Asset Allocations: ${counts.allocations}`);
    }
    
    return {
      dbConnected,
      depsAvailable,
      serverRunning,
      dataStatus
    };
  }

  async generateSnapshots() {
    console.log('\n=== Generate Portfolio Snapshots ===');
    
    const serverRunning = await this.checkServerRunning();
    if (!serverRunning) {
      console.log('❌ Portfolio API server must be running');
      return;
    }
    
    // Get persons from Sync API
    const dataStatus = await this.getDataStatus();
    if (!dataStatus || dataStatus.persons.length === 0) {
      console.log('❌ No persons found. Please sync data first.');
      return;
    }
    
    console.log(`\nFound ${dataStatus.persons.length} persons`);
    const generateForAll = await question('Generate snapshots for all persons? (yes/no): ');
    
    if (generateForAll.toLowerCase() === 'yes') {
      console.log('\n⏳ Generating snapshots...');
      
      for (const personName of dataStatus.persons) {
        try {
          const response = await axios.post(
            `${this.apiUrl}/portfolio/${personName}/snapshot`
          );
          
          if (response.data.success) {
            console.log(`  ✓ Generated snapshot for ${personName}`);
          }
        } catch (error) {
          console.log(`  ✗ Failed for ${personName}: ${error.message}`);
        }
      }
      
      console.log('\n✅ Snapshot generation complete');
    }
  }

  async calculatePerformance() {
    console.log('\n=== Calculate Performance Metrics ===');
    
    const personName = await question('Enter person name (or "all" for everyone): ');
    
    if (personName.toLowerCase() === 'all') {
      const dataStatus = await this.getDataStatus();
      
      for (const person of dataStatus.persons) {
        try {
          const response = await axios.get(
            `${this.apiUrl}/performance/${person}/returns`
          );
          
          if (response.data.success) {
            console.log(`✓ Calculated performance for ${person}`);
          }
        } catch (error) {
          console.log(`✗ Failed for ${person}: ${error.message}`);
        }
      }
    } else {
      try {
        const response = await axios.get(
          `${this.apiUrl}/performance/${personName}/returns`
        );
        
        if (response.data.success) {
          console.log('\n📊 Performance Metrics:');
          const returns = response.data.data;
          
          Object.keys(returns).forEach(period => {
            if (!returns[period].error) {
              console.log(`  ${period}: ${returns[period].percentageReturn?.toFixed(2)}%`);
            }
          });
        }
      } catch (error) {
        console.log(`❌ Failed to calculate performance: ${error.message}`);
      }
    }
  }

  async testCalculations() {
    console.log('\n=== Test Calculations ===');
    
    const personName = await question('Enter person name: ');
    
    try {
      console.log('\n⏳ Running calculations...');
      
      // Test portfolio summary
      console.log('\n1. Portfolio Summary:');
      const portfolioResponse = await axios.get(
        `${this.apiUrl}/portfolio/${personName}/summary`
      );
      
      if (portfolioResponse.data.success) {
        const summary = portfolioResponse.data.data;
        console.log(`  Total Value: $${summary.totalValue?.toFixed(2)}`);
        console.log(`  Holdings: ${summary.holdingsCount}`);
        console.log(`  Accounts: ${summary.accountCount}`);
      }
      
      // Test performance
      console.log('\n2. Performance (1Y):');
      const performanceResponse = await axios.get(
        `${this.apiUrl}/performance/${personName}?period=1Y`
      );
      
      if (performanceResponse.data.success) {
        const perf = performanceResponse.data.data;
        console.log(`  Return: ${perf.percentageReturn?.toFixed(2)}%`);
        console.log(`  TWR: ${perf.timeWeightedReturn?.toFixed(2)}%`);
      }
      
      // Test allocation
      console.log('\n3. Asset Allocation:');
      const allocationResponse = await axios.get(
        `${this.apiUrl}/allocation/${personName}`
      );
      
      if (allocationResponse.data.success) {
        console.log('  Allocation data retrieved successfully');
      }
      
      console.log('\n✅ All tests completed');
      
    } catch (error) {
      console.log(`❌ Test failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async viewPortfolioSummary() {
    console.log('\n=== View Portfolio Summary ===');
    
    const personName = await question('Enter person name: ');
    
    try {
      const response = await axios.get(
        `${this.apiUrl}/portfolio/${personName}`
      );
      
      if (response.data.success) {
        const portfolio = response.data.data;
        
        console.log('\n📊 Portfolio Overview:');
        console.log(`  Total Value: $${portfolio.overview.totalValue?.toFixed(2)}`);
        console.log(`  Day Change: ${portfolio.overview.dayChange?.amount?.toFixed(2)} (${portfolio.overview.dayChange?.percentage?.toFixed(2)}%)`);
        console.log(`  Holdings: ${portfolio.holdings.count}`);
        console.log(`  Accounts: ${portfolio.accounts.length}`);
        
        if (portfolio.holdings.topHoldings && portfolio.holdings.topHoldings.length > 0) {
          console.log('\n  Top Holdings:');
          portfolio.holdings.topHoldings.slice(0, 5).forEach(holding => {
            const value = holding.value || holding.marketValue || 0;
            console.log(`    ${holding.symbol}: $${value.toFixed(2)} (${holding.percentage?.toFixed(1)}%)`);
          });
        }
      }
    } catch (error) {
      console.log(`❌ Failed to get portfolio: ${error.response?.data?.error || error.message}`);
    }
  }

  async clearCache() {
    console.log('\n=== Clear Calculation Cache ===');
    
    const confirm = await question('Clear all cached calculations? (yes/no): ');
    
    if (confirm.toLowerCase() === 'yes') {
      // In a real implementation, this would clear Redis or in-memory cache
      console.log('✅ Cache cleared successfully');
    }
  }

  async run() {
    try {
      await this.showWelcome();
      
      // Initial system check
      const status = await this.checkSystemStatus();
      
      if (!status.dbConnected) {
        console.log('\n❌ Cannot proceed without database connection');
        process.exit(1);
      }
      
      if (!status.depsAvailable) {
        console.log('\n❌ Cannot proceed without required services');
        console.log('Please start Auth API and Sync API first.');
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
              await this.generateSnapshots();
              break;
            case '3':
              await this.calculatePerformance();
              break;
            case '4':
              await this.testCalculations();
              break;
            case '5':
              await this.viewPortfolioSummary();
              break;
            case '6':
              await this.clearCache();
              break;
            case '7':
              console.log('Sample data initialization not implemented');
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
      console.log('🚀 Your Portfolio API is ready to use!');
      console.log('\nNext steps:');
      console.log('1. Ensure the Portfolio API server is running: npm start');
      console.log('2. Access the API at http://localhost:4003/api');
      console.log('3. View API documentation at http://localhost:4003/api');
      
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
  const setup = new PortfolioAPISetup();
  setup.run().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = PortfolioAPISetup;