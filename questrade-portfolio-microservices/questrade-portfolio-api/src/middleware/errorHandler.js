// src/middleware/errorHandler.js
const logger = require('../utils/logger');

// Custom error class for portfolio-specific errors
class PortfolioError extends Error {
  constructor(message, statusCode = 500, code = 'PORTFOLIO_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  logger.error('API Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date()
  });

  let statusCode = err.statusCode || 500;
  let errorResponse = {
    success: false,
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date()
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorResponse.code = 'VALIDATION_ERROR';
    errorResponse.details = Object.values(err.errors).map(e => e.message);
  } else if (err.name === 'CastError') {
    statusCode = 400;
    errorResponse.code = 'INVALID_ID';
    errorResponse.error = 'Invalid ID format';
  } else if (err.code === 11000) {
    statusCode = 409;
    errorResponse.code = 'DUPLICATE_ERROR';
    errorResponse.error = 'Duplicate entry found';
  }

  // Don't expose sensitive information in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorResponse.error = 'Internal server error';
    delete errorResponse.stack;
  } else if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found middleware
const notFound = (req, res, next) => {
  const error = new PortfolioError(`Not Found - ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(error);
};

// Validation error handler
const validationError = (message, field = null) => {
  const error = new PortfolioError(message, 400, 'VALIDATION_ERROR');
  if (field) {
    error.field = field;
  }
  return error;
};

// Database error handler
const databaseError = (message) => {
  return new PortfolioError(message, 503, 'DATABASE_ERROR');
};

// External service error handler
const externalServiceError = (service, message) => {
  return new PortfolioError(
    `External service error (${service}): ${message}`,
    502,
    'EXTERNAL_SERVICE_ERROR'
  );
};

module.exports = {
  PortfolioError,
  errorHandler,
  asyncHandler,
  notFound,
  validationError,
  databaseError,
  externalServiceError
};