require('dotenv').config();

const config = {
  server: {
    port: process.env.PORT || 4001,  // Changed from 3001 to 4001
    environment: process.env.NODE_ENV || 'development'
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_auth'
  },
  questrade: {
    authUrl: process.env.QUESTRADE_AUTH_URL || 'https://login.questrade.com'
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY,
    jwtSecret: process.env.JWT_SECRET || 'default-secret-key'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
  }
};

// Validate required environment variables
const requiredEnvVars = ['ENCRYPTION_KEY'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

module.exports = config;