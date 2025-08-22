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

class NotificationAPISetup {
  constructor() {
    this.mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_notifications';
    this.apiUrl = `http://localhost:${process.env.PORT || 4005}/api`;
    this.authApiUrl = process.env.AUTH_API_URL || 'http://localhost:4001/api';
    this.portfolioApiUrl = process.env.PORTFOLIO_API_URL || 'http://localhost:4003/api';
    this.marketApiUrl = process.env.MARKET_API_URL || 'http://localhost:4004/api';
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
    
    const services = [
      { name: 'Auth API', url: this.authApiUrl.replace('/api', '/health') },
      { name: 'Portfolio API', url: this.portfolioApiUrl.replace('/api', '/health') },
      { name: 'Market API', url: this.marketApiUrl.replace('/api', '/health') }
    ];
    
    let allAvailable = true;
    
    for (const service of services) {
      try {
        await axios.get(service.url);
        console.log(`✅ ${service.name} is accessible`);
      } catch (error) {
        console.log(`❌ ${service.name} is not accessible`);
        allAvailable = false;
      }
    }
    
    return allAvailable;
  }

  async checkServerRunning() {
    try {
      const response = await axios.get(`${this.apiUrl.replace('/api', '/health')}`);
      console.log('✅ Notification API server is running');
      return true;
    } catch (error) {
      console.log('⚠️  Notification API server is not running');
      console.log('   Please start the server with: npm start');
      return false;
    }
  }

  async showWelcome() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║          Questrade Notification API - Setup Wizard             ║
║                                                                ║
║  This wizard will help you set up the notification service    ║
║  for your Questrade Portfolio Tracker.                        ║
║                                                                ║
║  Prerequisites:                                                ║
║  1. MongoDB is running                                        ║
║  2. All other services are running                            ║
║  3. Email service credentials configured                      ║
╚════════════════════════════════════════════════════════════════╝
`);
  }

  async showMainMenu() {
    console.log('\n=== Setup Menu ===');
    console.log('1. Check system status');
    console.log('2. Create sample alert rules');
    console.log('3. Test email notification');
    console.log('4. Test SMS notification');
    console.log('5. Set up notification preferences');
    console.log('6. View alert statistics');
    console.log('7. Clear all data');
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
      const Alert = require('../src/models/Alert');
      const Notification = require('../src/models/Notification');
      const AlertRule = require('../src/models/AlertRule');
      
      const counts = {
        alerts: await Alert.countDocuments(),
        notifications: await Notification.countDocuments(),
        rules: await AlertRule.countDocuments()
      };
      
      console.log('\n📊 Current data in database:');
      console.log(`  Alerts: ${counts.alerts}`);
      console.log(`  Notifications: ${counts.notifications}`);
      console.log(`  Alert Rules: ${counts.rules}`);
    }
    
    console.log('\n📧 Notification Channels:');
    console.log(`  Email: ${process.env.ENABLE_EMAIL === 'true' ? 'Enabled' : 'Disabled'}`);
    console.log(`  SMS: ${process.env.ENABLE_SMS === 'true' ? 'Enabled' : 'Disabled'}`);
    console.log(`  Push: ${process.env.ENABLE_PUSH === 'true' ? 'Enabled' : 'Disabled'}`);
    console.log(`  Webhooks: ${process.env.ENABLE_WEBHOOKS === 'true' ? 'Enabled' : 'Disabled'}`);
    
    return {
      dbConnected,
      depsAvailable,
      serverRunning
    };
  }

  async createSampleAlertRules() {
    console.log('\n=== Create Sample Alert Rules ===');
    
    const personName = await question('Enter person name: ');
    
    const sampleRules = [
      {
        name: 'Price Alert - AAPL above $150',
        type: 'price',
        symbol: 'AAPL',
        condition: 'above',
        threshold: 150,
        enabled: true
      },
      {
        name: 'Daily Change Alert - Any stock > 5%',
        type: 'percentage',
        condition: 'change',
        threshold: 5,
        timeframe: '1D',
        enabled: true
      },
      {
        name: 'Portfolio Value Alert',
        type: 'portfolio',
        metric: 'totalValue',
        condition: 'below',
        threshold: 95000,
        enabled: true
      }
    ];
    
    console.log('\nCreating sample alert rules...');
    
    for (const rule of sampleRules) {
      try {
        const response = await axios.post(`${this.apiUrl}/rules`, {
          personName,
          ...rule
        });
        
        if (response.data.success) {
          console.log(`  ✓ Created: ${rule.name}`);
        }
      } catch (error) {
        console.log(`  ✗ Failed: ${rule.name} - ${error.message}`);
      }
    }
  }

  async testEmailNotification() {
    console.log('\n=== Test Email Notification ===');
    
    const email = await question('Enter email address: ');
    const personName = await question('Enter person name: ');
    
    try {
      console.log('\n⏳ Sending test email...');
      
      const response = await axios.post(`${this.apiUrl}/notifications/send`, {
        personName,
        channel: 'email',
        to: email,
        subject: 'Test Notification',
        message: 'This is a test notification from Questrade Portfolio Tracker',
        template: 'alert',
        data: {
          alertType: 'Test Alert',
          message: 'This is a test alert notification',
          currentValue: '$100.00',
          threshold: '$150.00'
        }
      });
      
      if (response.data.success) {
        console.log('✅ Email sent successfully!');
      }
    } catch (error) {
      console.log('❌ Failed to send email:', error.response?.data?.error || error.message);
    }
  }

  async clearAllData() {
    console.log('\n⚠️  WARNING: This will delete ALL notification data!');
    const confirm1 = await question('Type "DELETE ALL DATA" to confirm: ');
    
    if (confirm1 !== 'DELETE ALL DATA') {
      console.log('Cancelled.');
      return;
    }
    
    try {
      console.log('\n⏳ Clearing all data...');
      
      const Alert = require('../src/models/Alert');
      const Notification = require('../src/models/Notification');
      const AlertRule = require('../src/models/AlertRule');
      const NotificationPreference = require('../src/models/NotificationPreference');
      
      await Alert.deleteMany({});
      await Notification.deleteMany({});
      await AlertRule.deleteMany({});
      await NotificationPreference.deleteMany({});
      
      console.log('✅ All data cleared');
    } catch (error) {
      console.log('❌ Failed to clear data:', error.message);
    }
  }

  async run() {
    try {
      await this.showWelcome();
      
      const status = await this.checkSystemStatus();
      
      if (!status.dbConnected) {
        console.log('\n❌ Cannot proceed without database connection');
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
              await this.createSampleAlertRules();
              break;
            case '3':
              await this.testEmailNotification();
              break;
            case '4':
              console.log('SMS testing not implemented in setup');
              break;
            case '5':
              console.log('Preference setup not implemented in setup');
              break;
            case '6':
              console.log('Statistics not implemented in setup');
              break;
            case '7':
              await this.clearAllData();
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
      console.log('🚀 Your Notification API is ready to use!');
      
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
  const setup = new NotificationAPISetup();
  setup.run().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = NotificationAPISetup;