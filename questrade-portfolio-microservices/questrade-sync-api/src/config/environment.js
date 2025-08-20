require('dotenv').config();

const config = {
  server: {
    port: process.env.PORT || 4002,
    environment: process.env.NODE_ENV || 'development'
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_portfolio'
  },
  authApi: {
    url: process.env.AUTH_API_URL || 'http://localhost:4001/api',  // Changed from 3001 to 4001
    apiKey: process.env.AUTH_API_KEY
  },
  sync: {
    intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 15,
    enableAutoSync: process.env.ENABLE_AUTO_SYNC === 'true',
    maxRetries: parseInt(process.env.MAX_SYNC_RETRIES) || 3
  },
  rateLimit: {
    questradePerSecond: parseInt(process.env.QUESTRADE_RATE_LIMIT_PER_SECOND) || 5,
    maxConcurrent: parseInt(process.env.QUESTRADE_MAX_CONCURRENT_REQUESTS) || 3
  },
  cache: {
    enabled: process.env.ENABLE_CACHE === 'true',
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS) || 300
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
  }
};

module.exports = config;