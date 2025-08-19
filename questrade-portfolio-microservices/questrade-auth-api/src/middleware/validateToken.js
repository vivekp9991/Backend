const jwt = require('jsonwebtoken');
const config = require('../config/environment');
const logger = require('../utils/logger');

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  try {
    const decoded = jwt.verify(apiKey, config.security.jwtSecret);
    req.apiClient = decoded;
    next();
  } catch (error) {
    logger.error('Invalid API key:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid API key'
    });
  }
};

const validatePersonAccess = (req, res, next) => {
  const personName = req.params.personName || req.body.personName || req.query.personName;
  
  if (!personName) {
    return res.status(400).json({
      success: false,
      error: 'Person name is required'
    });
  }

  req.personName = personName;
  next();
};

module.exports = {
  validateApiKey,
  validatePersonAccess
};