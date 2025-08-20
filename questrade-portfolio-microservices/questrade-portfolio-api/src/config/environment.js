// src/config/environment.js
require('dotenv').config();

const config = {
  server: {
    port: process.env.PORT || 4003,
    environment: process.env.NODE_ENV || 'development'
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_portfolio'
  },
  services: {
    syncApiUrl: process.env.SYNC_API_URL || 'http://localhost:4002/api',
    authApiUrl: process.env.AUTH_API_URL || 'http://localhost:4001/api'
  },
  cache: {
    enabled: process.env.ENABLE_CACHE === 'true',
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS) || 300,
    redisUrl: process.env.REDIS_URL
  },
  calculations: {
    batchSize: parseInt(process.env.CALCULATION_BATCH_SIZE) || 100,
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_CALCULATIONS) || 5,
    riskFreeRate: parseFloat(process.env.RISK_FREE_RATE) || 0.02,
    defaultTimePeriodDays: parseInt(process.env.DEFAULT_TIME_PERIOD_DAYS) || 365
  },
  benchmark: {
    defaultSymbol: process.env.DEFAULT_BENCHMARK || 'SPY',
    updateIntervalHours: parseInt(process.env.BENCHMARK_UPDATE_INTERVAL_HOURS) || 24
  },
  reports: {
    storagePath: process.env.REPORT_STORAGE_PATH || './reports',
    enablePdfGeneration: process.env.ENABLE_PDF_GENERATION === 'true'
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