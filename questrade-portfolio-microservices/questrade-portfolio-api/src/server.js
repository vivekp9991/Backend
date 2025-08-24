// src/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const config = require('./config/environment');
const database = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const cache = require('./middleware/cache');
const currencyService = require('./services/currencyService'); // ADD THIS

// Import routes
const portfolioRoutes = require('./routes/portfolio');
const performanceRoutes = require('./routes/performance');
const allocationRoutes = require('./routes/allocation');
const analyticsRoutes = require('./routes/analytics');
const reportsRoutes = require('./routes/reports');
const comparisonRoutes = require('./routes/comparison');

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

// Initialize cache middleware
if (config.cache.enabled) {
  app.use('/api/', cache.middleware);
}

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await database.healthCheck();
  
  res.json({
    success: true,
    service: 'questrade-portfolio-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealth,
    cache: {
      enabled: config.cache.enabled,
      ttl: config.cache.ttlSeconds
    }
  });
});

// API routes
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/allocation', allocationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/comparison', comparisonRoutes);

// Metrics endpoint
app.get('/api/metrics', async (req, res) => {
  const metrics = {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    cacheStats: cache.getStats()
  };
  
  res.json({
    success: true,
    data: metrics
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Questrade Portfolio API',
    version: '1.0.0',
    description: 'Portfolio Calculations and Analytics Service',
    endpoints: {
      portfolio: {
        'GET /api/portfolio/positions': 'Get all positions (UI compatible)', // ADD THIS
        'GET /api/portfolio/:personName': 'Get complete portfolio overview',
        'GET /api/portfolio/:personName/summary': 'Get portfolio summary',
        'GET /api/portfolio/:personName/holdings': 'Get all holdings',
        'GET /api/portfolio/:personName/value': 'Get total portfolio value',
        'GET /api/portfolio/:personName/positions': 'Get person positions'
      },
      performance: {
        'GET /api/performance/:personName': 'Get performance metrics',
        'GET /api/performance/:personName/history': 'Get historical performance',
        'GET /api/performance/:personName/returns': 'Get return calculations',
        'GET /api/performance/:personName/daily': 'Get daily performance'
      },
      allocation: {
        'GET /api/allocation/:personName': 'Get asset allocation',
        'GET /api/allocation/:personName/sector': 'Get sector allocation',
        'GET /api/allocation/:personName/geographic': 'Get geographic allocation',
        'GET /api/allocation/:personName/currency': 'Get currency allocation'
      },
      analytics: {
        'GET /api/analytics/:personName/risk': 'Get risk metrics',
        'GET /api/analytics/:personName/diversification': 'Get diversification analysis',
        'GET /api/analytics/:personName/correlation': 'Get correlation matrix',
        'GET /api/analytics/:personName/concentration': 'Get concentration analysis'
      },
      reports: {
        'GET /api/reports/:personName/summary': 'Get summary report',
        'GET /api/reports/:personName/detailed': 'Get detailed report',
        'GET /api/reports/:personName/tax': 'Get tax report',
        'POST /api/reports/:personName/custom': 'Generate custom report'
      },
      comparison: {
        'GET /api/comparison/persons': 'Compare multiple persons',
        'GET /api/comparison/:personName/benchmark': 'Compare to benchmark',
        'GET /api/comparison/:personName/period': 'Period-over-period comparison'
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
    
    // Initialize cache
    if (config.cache.enabled) {
      cache.initialize();
      logger.info('Cache initialized');
    }
    
    // Start currency service scheduled updates - ADD THIS
    currencyService.startScheduledUpdates();
    logger.info('Currency service initialized with scheduled updates');
    
    // Start server
    const PORT = config.server.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Questrade Portfolio API running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.server.environment}`);
      logger.info(`🔗 API available at: http://localhost:${PORT}/api`);
      logger.info(`💾 Cache: ${config.cache.enabled ? 'Enabled' : 'Disabled'}`);
      logger.info(`💱 Currency updates: Every 5 minutes`); // ADD THIS
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
      
      if (config.cache.enabled) {
        cache.flush();
        logger.info('Cache flushed');
      }
      
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