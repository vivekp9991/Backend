const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const config = require('./config/environment');
const database = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const scheduledSync = require('./jobs/scheduledSync');

// Import routes
const syncRoutes = require('./routes/sync');
const accountsRoutes = require('./routes/accounts');
const positionsRoutes = require('./routes/positions');
const activitiesRoutes = require('./routes/activities');
const statsRoutes = require('./routes/stats');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 15 minutes
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
    service: 'questrade-sync-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealth,
    syncEnabled: config.sync.enableAutoSync,
    syncInterval: config.sync.intervalMinutes
  });
});

// API routes
app.use('/api/sync', syncRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/stats', statsRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Questrade Sync API',
    version: '1.0.0',
    description: 'Data Synchronization Service',
    endpoints: {
      sync: {
        'POST /api/sync/all': 'Sync all data for all persons',
        'POST /api/sync/person/:personName': 'Sync specific person',
        'POST /api/sync/accounts/:personName': 'Sync accounts only',
        'POST /api/sync/positions/:personName': 'Sync positions only',
        'POST /api/sync/activities/:personName': 'Sync activities only',
        'GET /api/sync/status': 'Get current sync status',
        'GET /api/sync/history': 'Get sync history'
      },
      accounts: {
        'GET /api/accounts': 'List all accounts',
        'GET /api/accounts/:personName': 'Get person accounts',
        'GET /api/accounts/detail/:accountId': 'Get account details'
      },
      positions: {
        'GET /api/positions': 'List all positions',
        'GET /api/positions/:accountId': 'Get account positions'
      },
      activities: {
        'GET /api/activities': 'List all activities',
        'GET /api/activities/:accountId': 'Get account activities'
      },
      stats: {
        'GET /api/stats/sync': 'Sync statistics',
        'GET /api/stats/data': 'Data statistics',
        'GET /api/stats/errors': 'Error statistics'
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
    
    // Initialize scheduled sync if enabled
    if (config.sync.enableAutoSync) {
      const cronExpression = `*/${config.sync.intervalMinutes} * * * *`;
      
      cron.schedule(cronExpression, async () => {
        logger.info('Starting scheduled sync...');
        try {
          await scheduledSync.runScheduledSync();
        } catch (error) {
          logger.error('Scheduled sync failed:', error);
        }
      });
      
      logger.info(`Scheduled sync enabled - running every ${config.sync.intervalMinutes} minutes`);
    }
    
    // Start server
    const PORT = config.server.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Questrade Sync API running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.server.environment}`);
      logger.info(`🔗 API available at: http://localhost:${PORT}/api`);
      logger.info(`🔄 Auto-sync: ${config.sync.enableAutoSync ? 'Enabled' : 'Disabled'}`);
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