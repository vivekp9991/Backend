const logger = require('../utils/logger');

// Token-specific error codes
const TOKEN_ERRORS = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID', 
  TOKEN_MISSING: 'TOKEN_MISSING',
  PERSON_NOT_FOUND: 'PERSON_NOT_FOUND',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  QUESTRADE_API_ERROR: 'QUESTRADE_API_ERROR'
};

// Map error to token error code
function mapToTokenError(error) {
  const message = error.message.toLowerCase();
  
  if (message.includes('expired') && message.includes('token')) {
    return TOKEN_ERRORS.TOKEN_EXPIRED;
  }
  if (message.includes('invalid') && message.includes('token')) {
    return TOKEN_ERRORS.TOKEN_INVALID;
  }
  if (message.includes('no active refresh token')) {
    return TOKEN_ERRORS.TOKEN_MISSING;
  }
  if (message.includes('person') && message.includes('not found')) {
    return TOKEN_ERRORS.PERSON_NOT_FOUND;
  }
  
  return null;
}

// Get user-friendly error message
function getUserFriendlyMessage(errorCode, originalMessage) {
  switch (errorCode) {
    case TOKEN_ERRORS.TOKEN_EXPIRED:
      return 'Your access token has expired. Please refresh it.';
    case TOKEN_ERRORS.TOKEN_INVALID:
      return 'Your authentication token is invalid. Please update your refresh token.';
    case TOKEN_ERRORS.TOKEN_MISSING:
      return 'No valid authentication token found. Please add your Questrade refresh token.';
    case TOKEN_ERRORS.PERSON_NOT_FOUND:
      return 'Person not found. Please check the person name.';
    case TOKEN_ERRORS.REFRESH_TOKEN_EXPIRED:
      return 'Your refresh token has expired. Please get a new one from Questrade.';
    case TOKEN_ERRORS.QUESTRADE_API_ERROR:
      return 'Questrade API returned an error. Please try again.';
    default:
      return originalMessage || 'An unexpected error occurred.';
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

  // Map to token error if applicable
  const tokenErrorCode = mapToTokenError(err);
  
  let statusCode = err.statusCode || 500;
  let errorResponse = {
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date()
  };

  // Enhanced response for token-related errors
  if (tokenErrorCode) {
    errorResponse = {
      ...errorResponse,
      errorCode: tokenErrorCode,
      userMessage: getUserFriendlyMessage(tokenErrorCode, err.message),
      tokenRelated: true
    };
    
    // Set appropriate status codes
    switch (tokenErrorCode) {
      case TOKEN_ERRORS.TOKEN_EXPIRED:
      case TOKEN_ERRORS.TOKEN_INVALID:
      case TOKEN_ERRORS.TOKEN_MISSING:
        statusCode = 401;
        break;
      case TOKEN_ERRORS.PERSON_NOT_FOUND:
        statusCode = 404;
        break;
      default:
        statusCode = 400;
    }
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
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFound,
  TOKEN_ERRORS
};