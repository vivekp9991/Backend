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

class AuthAPISetup {
  constructor() {
    this.mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_auth';
    this.apiUrl = `http://localhost:${process.env.PORT || 4001}/api`;
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

  async checkServerRunning() {
    try {
      const response = await axios.get(`${this.apiUrl.replace('/api', '/health')}`);
      console.log('✅ Auth API server is running');
      return true;
    } catch (error) {
      console.log('⚠️  Auth API server is not running');
      console.log('   Please start the server with: npm start');
      return false;
    }
  }

  async showWelcome() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              Questrade Auth API - Setup Wizard                 ║
║                                                                ║
║  This wizard will help you set up the authentication service  ║
║  for your Questrade Portfolio Tracker.                        ║
║                                                                ║
║  Prerequisites:                                                ║
║  1. MongoDB is running                                        ║
║  2. You have Questrade refresh tokens                         ║
║  3. The Auth API server is running (npm start)                ║
╚════════════════════════════════════════════════════════════════╝
`);
  }

  async showMainMenu() {
    console.log('\n=== Setup Menu ===');
    console.log('1. Add new person with token');
    console.log('2. List all persons');
    console.log('3. Test person connection');
    console.log('4. Update person token');
    console.log('5. Remove person');
    console.log('6. Database utilities');
    console.log('7. Exit');
    
    const choice = await question('\nSelect an option (1-7): ');
    return choice.trim();
  }

async addNewPerson() {
  console.log('\n=== Add New Person ===');
  
  const personName = await question('Enter person name: ');
  if (!personName.trim()) {
    console.log('❌ Person name cannot be empty');
    return;
  }

  // Check if person already exists
  try {
    const checkResponse = await axios.get(`${this.apiUrl}/persons/${personName.trim()}`);
    if (checkResponse.data.success) {
      console.log(`❌ Person "${personName}" already exists`);
      const updateToken = await question('Would you like to update their token instead? (yes/no): ');
      if (updateToken.toLowerCase() === 'yes') {
        return await this.updatePersonToken();
      }
      return;
    }
  } catch (error) {
    // Person doesn't exist, continue with creation
  }

  const displayName = await question('Enter display name (optional): ');
  const email = await question('Enter email (optional): ');
  
  console.log('\nGet your refresh token from:');
  console.log('https://login.questrade.com/APIAccess/UserApps.aspx');
  const refreshToken = await question('Enter Questrade refresh token: ');
  
  if (!refreshToken.trim()) {
    console.log('❌ Refresh token cannot be empty');
    return;
  }

  try {
    console.log('\n⏳ Setting up person and validating token...');
    
    const response = await axios.post(`${this.apiUrl}/persons`, {
      personName: personName.trim(),
      displayName: displayName.trim() || personName.trim(),
      email: email.trim(),
      refreshToken: refreshToken.trim()
    });

    if (response.data.success) {
      console.log('✅ Person created successfully!');
      console.log(`   Name: ${response.data.data.personName}`);
      console.log(`   Display: ${response.data.data.displayName}`);
      console.log(`   Token Status: Valid`);
      
      // Test the connection
      const testConnection = await question('\nWould you like to test the connection? (yes/no): ');
      if (testConnection.toLowerCase() === 'yes') {
        await this.testConnection();
      }
    }
  } catch (error) {
    if (error.response?.data?.error?.includes('already exists')) {
      console.log('❌ Person already exists. Use option 4 to update their token.');
    } else {
      console.log('❌ Failed to create person:', error.response?.data?.error || error.message);
    }
  }
}

  async listPersons() {
    console.log('\n=== All Persons ===');
    
    try {
      const response = await axios.get(`${this.apiUrl}/persons`);
      
      if (response.data.success && response.data.data.length > 0) {
        response.data.data.forEach((person, index) => {
          console.log(`\n${index + 1}. ${person.personName}`);
          console.log(`   Display: ${person.displayName || 'N/A'}`);
          console.log(`   Email: ${person.email || 'N/A'}`);
          console.log(`   Active: ${person.isActive ? 'Yes' : 'No'}`);
          console.log(`   Has Valid Token: ${person.hasValidToken ? 'Yes' : 'No'}`);
          console.log(`   Created: ${new Date(person.createdAt).toLocaleDateString()}`);
        });
      } else {
        console.log('No persons found.');
      }
    } catch (error) {
      console.log('❌ Failed to fetch persons:', error.message);
    }
  }

  async testConnection() {
    console.log('\n=== Test Connection ===');
    
    const personName = await question('Enter person name: ');
    if (!personName.trim()) {
      console.log('❌ Person name cannot be empty');
      return;
    }

    try {
      console.log('\n⏳ Testing connection...');
      
      const response = await axios.post(`${this.apiUrl}/auth/test-connection/${personName.trim()}`);
      
      if (response.data.success) {
        console.log('✅ Connection successful!');
        console.log(`   Server Time: ${response.data.data.serverTime}`);
        console.log(`   API Server: ${response.data.data.apiServer}`);
      }
    } catch (error) {
      console.log('❌ Connection test failed:', error.response?.data?.error || error.message);
    }
  }

  async updatePersonToken() {
    console.log('\n=== Update Person Token ===');
    
    const personName = await question('Enter person name: ');
    if (!personName.trim()) {
      console.log('❌ Person name cannot be empty');
      return;
    }

    console.log('\nGet your new refresh token from:');
    console.log('https://login.questrade.com/APIAccess/UserApps.aspx');
    const refreshToken = await question('Enter new Questrade refresh token: ');
    
    if (!refreshToken.trim()) {
      console.log('❌ Refresh token cannot be empty');
      return;
    }

    try {
      console.log('\n⏳ Updating token...');
      
      const response = await axios.post(`${this.apiUrl}/persons/${personName.trim()}/token`, {
        refreshToken: refreshToken.trim()
      });

      if (response.data.success) {
        console.log('✅ Token updated successfully!');
      }
    } catch (error) {
      console.log('❌ Failed to update token:', error.response?.data?.error || error.message);
    }
  }

  async removePerson() {
    console.log('\n=== Remove Person ===');
    
    const personName = await question('Enter person name to remove: ');
    if (!personName.trim()) {
      console.log('❌ Person name cannot be empty');
      return;
    }

    const confirm = await question(`Are you sure you want to remove "${personName}"? (yes/no): `);
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Cancelled.');
      return;
    }

    const permanent = await question('Permanent deletion? (yes/no): ');
    
    try {
      console.log('\n⏳ Removing person...');
      
      const response = await axios.delete(
        `${this.apiUrl}/persons/${personName.trim()}?permanent=${permanent.toLowerCase() === 'yes'}`
      );

      if (response.data.success) {
        console.log('✅', response.data.message);
      }
    } catch (error) {
      console.log('❌ Failed to remove person:', error.response?.data?.error || error.message);
    }
  }

  async databaseUtilities() {
    console.log('\n=== Database Utilities ===');
    console.log('1. Show statistics');
    console.log('2. Clean expired tokens');
    console.log('3. Reset database (DANGEROUS)');
    console.log('4. Back to main menu');

    const choice = await question('\nSelect option (1-4): ');

    switch (choice) {
      case '1':
        await this.showStatistics();
        break;
      case '2':
        await this.cleanExpiredTokens();
        break;
      case '3':
        await this.resetDatabase();
        break;
      case '4':
        return;
      default:
        console.log('Invalid choice');
    }
  }

  async showStatistics() {
    try {
      const response = await axios.get(`${this.apiUrl}/tokens/stats/summary`);
      
      if (response.data.success) {
        console.log('\n=== Token Statistics ===');
        console.log(`Total Tokens: ${response.data.data.total}`);
        console.log(`Active: ${response.data.data.active}`);
        console.log(`Expired: ${response.data.data.expired}`);
        console.log(`With Errors: ${response.data.data.withErrors}`);
      }
    } catch (error) {
      console.log('❌ Failed to get statistics:', error.message);
    }
  }

  async cleanExpiredTokens() {
    try {
      console.log('\n⏳ Cleaning expired tokens...');
      
      const response = await axios.delete(`${this.apiUrl}/tokens/expired`);
      
      if (response.data.success) {
        console.log('✅', response.data.message);
      }
    } catch (error) {
      console.log('❌ Failed to clean tokens:', error.message);
    }
  }

  async resetDatabase() {
    console.log('\n⚠️  WARNING: This will delete ALL data!');
    const confirm1 = await question('Type "DELETE ALL DATA" to confirm: ');
    
    if (confirm1 !== 'DELETE ALL DATA') {
      console.log('Cancelled.');
      return;
    }

    try {
      console.log('\n⏳ Resetting database...');
      
      const Person = require('../src/models/Person');
      const Token = require('../src/models/Token');
      
      await Person.deleteMany({});
      await Token.deleteMany({});
      
      console.log('✅ Database reset complete');
    } catch (error) {
      console.log('❌ Failed to reset database:', error.message);
    }
  }

  async run() {
    try {
      await this.showWelcome();
      
      // Check if we can connect to database
      const dbConnected = await this.connectDatabase();
      if (!dbConnected) {
        console.log('\n❌ Cannot proceed without database connection');
        console.log('Please ensure MongoDB is running and try again.');
        process.exit(1);
      }

      // Check if server is running
      const serverRunning = await this.checkServerRunning();
      if (!serverRunning) {
        const startServer = await question('\nWould you like to continue anyway? (yes/no): ');
        if (startServer.toLowerCase() !== 'yes') {
          console.log('Please start the server and run setup again.');
          process.exit(0);
        }
      }

      let running = true;
      while (running) {
        try {
          const choice = await this.showMainMenu();

          switch (choice) {
            case '1':
              await this.addNewPerson();
              break;
            case '2':
              await this.listPersons();
              break;
            case '3':
              await this.testConnection();
              break;
            case '4':
              await this.updatePersonToken();
              break;
            case '5':
              await this.removePerson();
              break;
            case '6':
              await this.databaseUtilities();
              break;
            case '7':
              running = false;
              break;
            default:
              console.log('Invalid choice. Please select 1-7.');
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
      console.log('🚀 Your Auth API is ready to use!');
      console.log('\nNext steps:');
      console.log('1. Set up the Sync API service');
      console.log('2. Set up the Portfolio API service');
      console.log('3. Set up the Market API service');

    } catch (error) {
      console.error('Setup failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
      await mongoose.connection.close();
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new AuthAPISetup();
  setup.run().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = AuthAPISetup;