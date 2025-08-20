require('dotenv').config();

const config = {
  server: {
    port: process.env.PORT || 4004,
    environment: process.env.NODE_ENV || 'development'
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_market'
  },
  services: {
    authApiUrl: process.env.AUTH_API_URL || 'http://localhost:4001/api',
    syncApiUrl: process.env.SYNC_API_URL || 'http://localhost:4002/api'
  },
  market: {
    enableRealTime: process.env.ENABLE_REAL_TIME === 'true',
    quoteRefreshInterval: parseInt(process.env.QUOTE_REFRESH_INTERVAL_SECONDS) || 5,
    marketDataCacheTTL: parseInt(process.env.MARKET_DATA_CACHE_TTL) || 10
  },
  rateLimit: {
    questradePerSecond: parseInt(process.env.QUESTRADE_RATE_LIMIT_PER_SECOND) || 10,
    maxSymbolsPerRequest: parseInt(process.env.MAX_SYMBOLS_PER_REQUEST) || 100
  },
  cache: {
    enabled: process.env.ENABLE_CACHE === 'true',
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS) || 10,
    redisUrl: process.env.REDIS_URL
  },
  websocket: {
    enabled: process.env.ENABLE_WEBSOCKET === 'true',
    port: parseInt(process.env.WS_PORT) || 4005
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