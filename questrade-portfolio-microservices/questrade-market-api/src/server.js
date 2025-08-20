const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const config = require('./config/environment');
const database = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const cache = require('./middleware/cache');
const marketHelpers = require('./utils/marketHelpers');

// Import routes
const marketsRoutes = require('./routes/markets');
const quotesRoutes = require('./routes/quotes');
const symbolsRoutes = require('./routes/symbols');
const watchlistsRoutes = require('./routes/watchlists');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await database.healthCheck();
  
  res.json({
    success: true,
    service: 'questrade-market-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealth,
    marketStatus: {
      isOpen: marketHelpers.isMarketOpen(),
      isPreMarket: marketHelpers.isPreMarket(),
      isAfterHours: marketHelpers.isAfterHours()
    },
    cache: cache.getStats()
  });
});

// API routes
app.use('/api/markets', marketsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/symbols', symbolsRoutes);
app.use('/api/watchlists', watchlistsRoutes);

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  res.json({
    success: true,
    data: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cacheStats: cache.getStats()
    }
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Questrade Market API',
    version: '1.0.0',
    description: 'Real-time Market Data and Quotes Service',
    endpoints: {
      markets: {
        'GET /api/markets/status': 'Get market status',
        'GET /api/markets/summary': 'Get market summary',
        'GET /api/markets/movers': 'Get market movers',
        'GET /api/markets/sectors': 'Get sector performance',
        'GET /api/markets/breadth': 'Get market breadth'
      },
      quotes: {
        'GET /api/quotes/:symbol': 'Get single quote',
        'GET /api/quotes': 'Get multiple quotes',
        'GET /api/quotes/:symbol/stream': 'Get quote stream',
        'GET /api/quotes/:symbol/history': 'Get historical quotes',
        'POST /api/quotes/:symbol/refresh': 'Refresh quote'
      },
      symbols: {
        'GET /api/symbols/search': 'Search symbols',
        'GET /api/symbols/:symbolId': 'Get symbol details',
        'GET /api/symbols/:symbol/options': 'Get options chain',
        'GET /api/symbols/:symbol/fundamentals': 'Get fundamentals'
      },
      watchlists: {
        'GET /api/watchlists/:personName': 'Get user watchlists',
        'POST /api/watchlists/:personName': 'Create watchlist',
        'PUT /api/watchlists/:watchlistId': 'Update watchlist',
        'DELETE /api/watchlists/:watchlistId': 'Delete watchlist'
      }
    }
  });
});

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to database
    await database.connect();
    
    // Set up scheduled jobs
    if (config.market.enableRealTime) {
      // Clear stale quotes every hour
      cron.schedule('0 * * * *', () => {
        logger.info('Clearing stale quotes...');
        cache.flush();
      });
    }
    
    // Start server
    const PORT = config.server.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Questrade Market API running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.server.environment}`);
      logger.info(`🔗 API available at: http://localhost:${PORT}/api`);
      logger.info(`💹 Real-time updates: ${config.market.enableRealTime ? 'Enabled' : 'Disabled'}`);
      logger.info(`💾 Cache: ${config.cache.enabled ? 'Enabled' : 'Disabled'}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));
    
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown handler
async function gracefulShutdown(server) {
  logger.info('Received shutdown signal, shutting down gracefully...');
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      await database.disconnect();
      logger.info('Database connection closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;