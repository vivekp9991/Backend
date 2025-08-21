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

class MarketAPISetup {
  constructor() {
    this.mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_market';
    this.apiUrl = `http://localhost:${process.env.PORT || 4004}/api`;
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
    
    return true;
  }

  async checkServerRunning() {
    try {
      const response = await axios.get(`${this.apiUrl.replace('/api', '/health')}`);
      console.log('✅ Market API server is running');
      return true;
    } catch (error) {
      console.log('⚠️  Market API server is not running');
      console.log('   Please start the server with: npm start');
      return false;
    }
  }

  async showWelcome() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              Questrade Market API - Setup Wizard               ║
║                                                                ║
║  This wizard will help you set up the market data service     ║
║  for your Questrade Portfolio Tracker.                        ║
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
    console.log('2. Test quote retrieval');
    console.log('3. Search symbols');
    console.log('4. Create sample watchlist');
    console.log('5. Test market status');
    console.log('6. Clear cache');
    console.log('7. Initialize popular symbols');
    console.log('8. Exit');
    
    const choice = await question('\nSelect an option (1-8): ');
    return choice.trim();
  }

  async checkSystemStatus() {
    console.log('\n=== System Status ===');
    
    const dbConnected = await this.connectDatabase();
    const depsAvailable = await this.checkDependencies();
    const serverRunning = await this.checkServerRunning();
    
    if (dbConnected) {
      const Symbol = require('../src/models/Symbol');
      const Quote = require('../src/models/Quote');
      const WatchList = require('../src/models/WatchList');
      
      const counts = {
        symbols: await Symbol.countDocuments(),
        quotes: await Quote.countDocuments(),
        watchlists: await WatchList.countDocuments()
      };
      
      console.log('\n📊 Current data in database:');
      console.log(`  Symbols: ${counts.symbols}`);
      console.log(`  Cached Quotes: ${counts.quotes}`);
      console.log(`  Watchlists: ${counts.watchlists}`);
    }
    
    return {
      dbConnected,
      depsAvailable,
      serverRunning
    };
  }

  async testQuoteRetrieval() {
  console.log('\n=== Test Quote Retrieval ===');
  
  const symbol = await question('Enter symbol (e.g., AAPL, SPY): ');
  
  if (!symbol.trim()) {
    console.log('❌ Symbol cannot be empty');
    return;
  }
  
  try {
    console.log(`\n⏳ Fetching quote for ${symbol.toUpperCase()}...`);
    
    const response = await axios.get(`${this.apiUrl}/quotes/${symbol.toUpperCase()}`);
    
    if (response.data.success) {
      const quote = response.data.data;
      console.log('\n✅ Quote retrieved successfully!');
      console.log(`  Symbol: ${quote.symbol}`);
      console.log(`  Last Price: $${quote.lastTradePrice}`);
      console.log(`  Previous Close: $${quote.previousClosePrice}`);
      console.log(`  Day Change: ${quote.dayChange >= 0 ? '+' : ''}$${quote.dayChange.toFixed(2)} (${quote.dayChangePercent >= 0 ? '+' : ''}${quote.dayChangePercent.toFixed(2)}%)`);
      console.log(`  Volume: ${quote.volume?.toLocaleString()}`);
      console.log(`  Bid: $${quote.bidPrice} x ${quote.bidSize}`);
      console.log(`  Ask: $${quote.askPrice} x ${quote.askSize}`);
      console.log(`  Day Range: $${quote.lowPrice} - $${quote.highPrice}`);
      console.log(`  52 Week Range: $${quote.week52Low} - $${quote.week52High}`);
      
      // Display additional data if available
      if (quote.marketCap) {
        console.log(`  Market Cap: $${(quote.marketCap / 1000000000).toFixed(2)}B`);
      }
      if (quote.pe) {
        console.log(`  P/E Ratio: ${quote.pe.toFixed(2)}`);
      }
      if (quote.dividend && quote.yield) {
        console.log(`  Dividend: $${quote.dividend.toFixed(2)} (${quote.yield.toFixed(2)}%)`);
      }
    }
  } catch (error) {
    console.log('❌ Failed to get quote:', error.response?.data?.error || error.message);
  }
}

  async searchSymbols() {
    console.log('\n=== Search Symbols ===');
    
    const prefix = await question('Enter search prefix (e.g., APP for Apple): ');
    
    if (!prefix.trim()) {
      console.log('❌ Search prefix cannot be empty');
      return;
    }
    
    try {
      console.log(`\n⏳ Searching for symbols starting with "${prefix}"...`);
      
      const response = await axios.get(`${this.apiUrl}/symbols/search`, {
        params: { prefix: prefix.toUpperCase() }
      });
      
      if (response.data.success) {
        const symbols = response.data.data;
        
        if (symbols.length === 0) {
          console.log('No symbols found');
        } else {
          console.log(`\n✅ Found ${symbols.length} symbols:`);
          symbols.forEach((sym, index) => {
            console.log(`  ${index + 1}. ${sym.symbol} - ${sym.description}`);
          });
        }
      }
    } catch (error) {
      console.log('❌ Search failed:', error.response?.data?.error || error.message);
    }
  }

  async createSampleWatchlist() {
    console.log('\n=== Create Sample Watchlist ===');
    
    const personName = await question('Enter person name: ');
    
    if (!personName.trim()) {
      console.log('❌ Person name cannot be empty');
      return;
    }
    
    const watchlistName = await question('Enter watchlist name (default: "My Watchlist"): ') || 'My Watchlist';
    
    console.log('\nEnter symbols (comma-separated, e.g., AAPL,GOOGL,MSFT):');
    const symbolsInput = await question('Symbols: ');
    
    if (!symbolsInput.trim()) {
      console.log('❌ Please enter at least one symbol');
      return;
    }
    
    const symbols = symbolsInput.split(',').map(s => s.trim().toUpperCase());
    
    try {
      console.log('\n⏳ Creating watchlist...');
      
      const response = await axios.post(`${this.apiUrl}/watchlists/${personName}`, {
        name: watchlistName,
        symbols: symbols
      });
      
      if (response.data.success) {
        console.log('✅ Watchlist created successfully!');
        console.log(`  Name: ${response.data.data.name}`);
        console.log(`  Symbols: ${response.data.data.symbols.join(', ')}`);
      }
    } catch (error) {
      console.log('❌ Failed to create watchlist:', error.response?.data?.error || error.message);
    }
  }

  async testMarketStatus() {
    console.log('\n=== Test Market Status ===');
    
    try {
      console.log('⏳ Checking market status...');
      
      const response = await axios.get(`${this.apiUrl}/markets/status`);
      
      if (response.data.success) {
        const status = response.data.data;
        console.log('\n✅ Market Status:');
        console.log(`  Current Time: ${new Date(status.currentTime).toLocaleString()}`);
        console.log(`  Market Status: ${status.isOpen ? 'OPEN' : 'CLOSED'}`);
        console.log(`  Trading Session: ${status.session}`);
        
        if (status.nextOpen) {
          console.log(`  Next Open: ${new Date(status.nextOpen).toLocaleString()}`);
        }
        if (status.nextClose) {
          console.log(`  Next Close: ${new Date(status.nextClose).toLocaleString()}`);
        }
      }
    } catch (error) {
      console.log('❌ Failed to get market status:', error.response?.data?.error || error.message);
    }
  }

  async clearCache() {
    console.log('\n=== Clear Cache ===');
    
    const confirm = await question('Clear all cached market data? (yes/no): ');
    
    if (confirm.toLowerCase() === 'yes') {
      try {
        const Quote = require('../src/models/Quote');
        await Quote.deleteMany({});
        console.log('✅ Cache cleared successfully');
      } catch (error) {
        console.log('❌ Failed to clear cache:', error.message);
      }
    }
  }

  async initializePopularSymbols() {
    console.log('\n=== Initialize Popular Symbols ===');
    
    const popularSymbols = [
      { symbol: 'SPY', description: 'SPDR S&P 500 ETF Trust', symbolId: 38980 },
      { symbol: 'QQQ', description: 'Invesco QQQ Trust', symbolId: 39123 },
      { symbol: 'AAPL', description: 'Apple Inc.', symbolId: 8049 },
      { symbol: 'MSFT', description: 'Microsoft Corporation', symbolId: 27426 },
      { symbol: 'GOOGL', description: 'Alphabet Inc.', symbolId: 625846 },
      { symbol: 'AMZN', description: 'Amazon.com Inc.', symbolId: 7410 },
      { symbol: 'TSLA', description: 'Tesla Inc.', symbolId: 38526 },
      { symbol: 'META', description: 'Meta Platforms Inc.', symbolId: 9291 },
      { symbol: 'NVDA', description: 'NVIDIA Corporation', symbolId: 29814 },
      { symbol: 'JPM', description: 'JPMorgan Chase & Co.', symbolId: 15760 }
    ];
    
    console.log('This will add popular symbols to the database for quick access.');
    const confirm = await question('Continue? (yes/no): ');
    
    if (confirm.toLowerCase() === 'yes') {
      try {
        const Symbol = require('../src/models/Symbol');
        
        for (const symbolData of popularSymbols) {
          await Symbol.findOneAndUpdate(
            { symbol: symbolData.symbol },
            symbolData,
            { upsert: true, new: true }
          );
          console.log(`  ✓ Added ${symbolData.symbol}`);
        }
        
        console.log('\n✅ Popular symbols initialized');
      } catch (error) {
        console.log('❌ Failed to initialize symbols:', error.message);
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
        process.exit(1);
      }
      
      if (!status.depsAvailable) {
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
              await this.testQuoteRetrieval();
              break;
            case '3':
              await this.searchSymbols();
              break;
            case '4':
              await this.createSampleWatchlist();
              break;
            case '5':
              await this.testMarketStatus();
              break;
            case '6':
              await this.clearCache();
              break;
            case '7':
              await this.initializePopularSymbols();
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
      console.log('🚀 Your Market API is ready to use!');
      console.log('\nNext steps:');
      console.log('1. Ensure the Market API server is running: npm start');
      console.log('2. Market data will be fetched in real-time');
      console.log('3. Create watchlists for tracking specific symbols');
      
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
  const setup = new MarketAPISetup();
  setup.run().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = MarketAPISetup;