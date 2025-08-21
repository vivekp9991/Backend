const winston = require('winston');
const path = require('path');

// Helper function to safely stringify objects with circular references
const safeStringify = (obj) => {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular]';
      }
      cache.add(value);
    }
    // Avoid logging sensitive or large objects
    if (key === 'request' || key === 'response' || key === 'config') {
      return '[Omitted]';
    }
    return value;
  });
};

const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      try {
        msg += ' ' + safeStringify(meta);
      } catch (error) {
        msg += ' [Error stringifying metadata]';
      }
    }
    return msg;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'questrade-market-api' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: path.join('logs', 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({
    filename: path.join('logs', 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

module.exports = logger;