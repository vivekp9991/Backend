// src/middleware/validateRequest.js
const { PortfolioError } = require('./errorHandler');
const logger = require('../utils/logger');

// Validate person name parameter
const validatePerson = (req, res, next) => {
  const personName = req.params.personName || req.query.personName || req.body.personName;
  
  if (!personName) {
    throw new PortfolioError('Person name is required', 400, 'MISSING_PERSON');
  }
  
  // Sanitize person name
  req.personName = personName.trim();
  
  next();
};

// Validate date range
const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      throw new PortfolioError('Invalid start date format', 400, 'INVALID_DATE');
    }
    req.startDate = start;
  }
  
  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      throw new PortfolioError('Invalid end date format', 400, 'INVALID_DATE');
    }
    req.endDate = end;
  }
  
  if (req.startDate && req.endDate && req.startDate > req.endDate) {
    throw new PortfolioError('Start date must be before end date', 400, 'INVALID_DATE_RANGE');
  }
  
  next();
};

// Validate period parameter
const validatePeriod = (req, res, next) => {
  const validPeriods = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL', 'CUSTOM'];
  const period = req.query.period || req.body.period;
  
  if (period && !validPeriods.includes(period.toUpperCase())) {
    throw new PortfolioError(
      `Invalid period. Valid values: ${validPeriods.join(', ')}`,
      400,
      'INVALID_PERIOD'
    );
  }
  
  if (period) {
    req.period = period.toUpperCase();
  }
  
  next();
};

// Validate format parameter
const validateFormat = (req, res, next) => {
  const validFormats = ['json', 'csv', 'pdf'];
  const format = req.query.format || req.body.format || 'json';
  
  if (!validFormats.includes(format.toLowerCase())) {
    throw new PortfolioError(
      `Invalid format. Valid values: ${validFormats.join(', ')}`,
      400,
      'INVALID_FORMAT'
    );
  }
  
  req.format = format.toLowerCase();
  
  next();
};

// Validate numeric parameters
const validateNumeric = (paramName, min = null, max = null) => {
  return (req, res, next) => {
    const value = req.query[paramName] || req.body[paramName];
    
    if (value !== undefined) {
      const numValue = parseFloat(value);
      
      if (isNaN(numValue)) {
        throw new PortfolioError(
          `${paramName} must be a number`,
          400,
          'INVALID_NUMBER'
        );
      }
      
      if (min !== null && numValue < min) {
        throw new PortfolioError(
          `${paramName} must be at least ${min}`,
          400,
          'NUMBER_TOO_SMALL'
        );
      }
      
      if (max !== null && numValue > max) {
        throw new PortfolioError(
          `${paramName} must be at most ${max}`,
          400,
          'NUMBER_TOO_LARGE'
        );
      }
      
      req[paramName] = numValue;
    }
    
    next();
  };
};

// Validate pagination
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  
  if (page < 1) {
    throw new PortfolioError('Page must be at least 1', 400, 'INVALID_PAGE');
  }
  
  if (limit < 1 || limit > 1000) {
    throw new PortfolioError('Limit must be between 1 and 1000', 400, 'INVALID_LIMIT');
  }
  
  req.pagination = {
    page,
    limit,
    skip: (page - 1) * limit
  };
  
  next();
};

module.exports = {
  validatePerson,
  validateDateRange,
  validatePeriod,
  validateFormat,
  validateNumeric,
  validatePagination
};