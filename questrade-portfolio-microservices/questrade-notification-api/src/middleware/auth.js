const { NotificationError } = require('./errorHandler');

// Simple API key authentication (you can enhance this)
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  // In production, validate against stored API keys
  if (process.env.NODE_ENV === 'production' && !apiKey) {
    throw new NotificationError('API key required', 401, 'UNAUTHORIZED');
  }
  
  next();
};

// Check if person has access to resource
const authorize = (req, res, next) => {
  // In production, implement proper authorization
  // For now, just pass through
  next();
};

module.exports = {
  authenticate,
  authorize
};