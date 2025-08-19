const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const config = require('./config/environment');
const database = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const personsRoutes = require('./routes/persons');
const tokensRoutes = require('./routes/tokens');

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
    service: 'questrade-auth-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealth
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/persons', personsRoutes);
app.use('/api/tokens', tokensRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Questrade Auth API',
    version: '1.0.0',
    description: 'Authentication and Token Management Service',
    endpoints: {
      auth: {
        'POST /api/auth/setup-person': 'Setup new person with token',
        'POST /api/auth/refresh-token/:personName': 'Refresh access token',
        'GET /api/auth/token-status/:personName': 'Get token status',
        'GET /api/auth/access-token/:personName': 'Get valid access token',
        'POST /api/auth/test-connection/:personName': 'Test API connection'
      },
      persons: {
        'GET /api/persons': 'List all persons',
        'GET /api/persons/:personName': 'Get person details',
        'POST /api/persons': 'Create new person',
        'PUT /api/persons/:personName': 'Update person',
        'DELETE /api/persons/:personName': 'Delete person',
        'POST /api/persons/:personName/token': 'Update person token'
      },
      tokens: {
        'GET /api/tokens': 'List all active tokens',
        'GET /api/tokens/:personName': 'Get person tokens',
        'DELETE /api/tokens/expired': 'Clean expired tokens',
        'GET /api/tokens/stats/summary': 'Token statistics'
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
    
    // Start server
    const PORT = config.server.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Questrade Auth API running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.server.environment}`);
      logger.info(`🔗 API available at: http://localhost:${PORT}/api`);
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