const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const config = require('./config/environment');
const database = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const alertChecker = require('./jobs/alertChecker');
const notificationProcessor = require('./jobs/notificationProcessor');

// Import routes
const alertRoutes = require('./routes/alerts');
const notificationRoutes = require('./routes/notifications');
const preferenceRoutes = require('./routes/preferences');
const ruleRoutes = require('./routes/rules');
const webhookRoutes = require('./routes/webhooks');

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
    service: 'questrade-notification-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealth,
    alertEngine: config.alerts.enableEngine,
    channels: {
      email: config.email.enabled,
      sms: config.sms.enabled,
      push: config.push.enabled,
      webhooks: config.webhooks.enabled
    }
  });
});

// API routes
app.use('/api/alerts', alertRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/preferences', preferenceRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/webhooks', webhookRoutes);

// Statistics endpoint
app.get('/api/stats', async (req, res) => {
  const Alert = require('./models/Alert');
  const Notification = require('./models/Notification');
  const AlertRule = require('./models/AlertRule');
  
  const [alertCount, notificationCount, ruleCount] = await Promise.all([
    Alert.countDocuments(),
    Notification.countDocuments(),
    AlertRule.countDocuments()
  ]);
  
  res.json({
    success: true,
    data: {
      alerts: {
        total: alertCount,
        active: await Alert.countDocuments({ status: 'active' }),
        triggered: await Alert.countDocuments({ status: 'triggered' })
      },
      notifications: {
        total: notificationCount,
        sent: await Notification.countDocuments({ status: 'sent' }),
        pending: await Notification.countDocuments({ status: 'pending' }),
        failed: await Notification.countDocuments({ status: 'failed' })
      },
      rules: {
        total: ruleCount,
        enabled: await AlertRule.countDocuments({ enabled: true })
      }
    }
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Questrade Notification API',
    version: '1.0.0',
    description: 'Alerts and Notifications Service',
    endpoints: {
      alerts: {
        'GET /api/alerts': 'Get all alerts',
        'GET /api/alerts/:personName': 'Get person alerts',
        'POST /api/alerts': 'Create alert',
        'PUT /api/alerts/:alertId': 'Update alert',
        'DELETE /api/alerts/:alertId': 'Delete alert'
      },
      rules: {
        'GET /api/rules': 'Get all rules',
        'POST /api/rules': 'Create rule',
        'PUT /api/rules/:ruleId': 'Update rule',
        'DELETE /api/rules/:ruleId': 'Delete rule'
      },
      notifications: {
        'GET /api/notifications': 'Get notifications',
        'POST /api/notifications/send': 'Send notification',
        'PUT /api/notifications/:id/read': 'Mark as read'
      },
      preferences: {
        'GET /api/preferences/:personName': 'Get preferences',
        'PUT /api/preferences/:personName': 'Update preferences'
      },
      webhooks: {
        'GET /api/webhooks': 'Get webhooks',
        'POST /api/webhooks': 'Register webhook',
        'DELETE /api/webhooks/:id': 'Delete webhook'
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
    
    // Initialize scheduled jobs if enabled
    if (config.alerts.enableEngine) {
      // Alert checker - runs every 5 minutes
      const alertInterval = `*/${config.alerts.checkIntervalMinutes} * * * *`;
      cron.schedule(alertInterval, async () => {
        logger.info('Running scheduled alert check...');
        try {
          await alertChecker.checkAlerts();
        } catch (error) {
          logger.error('Alert check failed:', error);
        }
      });
      
      // Notification processor - runs every minute
      cron.schedule('* * * * *', async () => {
        try {
          await notificationProcessor.processQueue();
        } catch (error) {
          logger.error('Notification processing failed:', error);
        }
      });
      
      // Daily summary - runs at 6 PM every day
      cron.schedule('0 18 * * *', async () => {
        logger.info('Sending daily summaries...');
        try {
          await notificationProcessor.sendDailySummaries();
        } catch (error) {
          logger.error('Daily summary failed:', error);
        }
      });
      
      logger.info(`Alert engine enabled - checking every ${config.alerts.checkIntervalMinutes} minutes`);
    }
    
    // Start server
    const PORT = config.server.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Questrade Notification API running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.server.environment}`);
      logger.info(`🔗 API available at: http://localhost:${PORT}/api`);
      logger.info(`🔔 Alert Engine: ${config.alerts.enableEngine ? 'Enabled' : 'Disabled'}`);
      logger.info(`📧 Email: ${config.email.enabled ? 'Enabled' : 'Disabled'}`);
      logger.info(`📱 SMS: ${config.sms.enabled ? 'Enabled' : 'Disabled'}`);
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