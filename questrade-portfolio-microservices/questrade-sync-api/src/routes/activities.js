const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const activitySync = require('../services/activitySync');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get all activities
router.get('/', asyncHandler(async (req, res) => {
  const { 
    personName, 
    accountId, 
    type, 
    symbol,
    startDate,
    endDate,
    limit = 100 
  } = req.query;
  
  const filter = {};
  if (personName) filter.personName = personName;
  if (accountId) filter.accountId = accountId;
  if (type) filter.type = type;
  if (symbol) filter.symbol = symbol;
  
  if (startDate || endDate) {
    filter.transactionDate = {};
    if (startDate) filter.transactionDate.$gte = new Date(startDate);
    if (endDate) filter.transactionDate.$lte = new Date(endDate);
  }
  
  const activities = await Activity.find(filter)
    .sort({ transactionDate: -1 })
    .limit(parseInt(limit));
  
  res.json({
    success: true,
    data: activities
  });
}));

// Get activities for a specific account
router.get('/:accountId', asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const { limit = 100 } = req.query;
  
  const activities = await activitySync.getAccountActivities(accountId, parseInt(limit));
  
  res.json({
    success: true,
    data: activities
  });
}));

// Get activities for a person
router.get('/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { limit = 100 } = req.query;
  
  const activities = await activitySync.getPersonActivities(personName, parseInt(limit));
  
  res.json({
    success: true,
    data: activities
  });
}));

// Get dividend activities for a person and symbol
router.get('/dividends/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { symbol, limit = 100 } = req.query;
  
  logger.info(`[ACTIVITIES] Getting dividend activities for ${personName}, symbol: ${symbol || 'all'}`);
  
  const filter = {
    personName,
    type: 'Dividend'
  };
  
  if (symbol) {
    filter.symbol = symbol;
  }
  
  const activities = await Activity.find(filter)
    .sort({ transactionDate: -1 })
    .limit(parseInt(limit));
  
  logger.info(`[ACTIVITIES] Found ${activities.length} dividend activities for ${personName}${symbol ? ` (${symbol})` : ''}`);
  
  // Log sample activity for debugging
  if (activities.length > 0) {
    logger.debug(`[ACTIVITIES] Sample dividend activity:`, {
      symbol: activities[0].symbol,
      date: activities[0].transactionDate,
      amount: activities[0].netAmount,
      type: activities[0].type
    });
  }
  
  res.json({
    success: true,
    data: activities
  });
}));

// Get activity summary
router.get('/summary/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { startDate, endDate } = req.query;
  
  let dateRange = null;
  if (startDate || endDate) {
    dateRange = {
      start: startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Default 1 year back
      end: endDate || new Date()
    };
  }
  
  const summary = await activitySync.getActivitySummary(
    { personName },
    dateRange
  );
  
  res.json({
    success: true,
    data: summary
  });
}));

// Get activity types
router.get('/types/list', asyncHandler(async (req, res) => {
  const types = [
    'Buy', 'Sell', 'Dividend', 'Interest', 
    'Deposit', 'Withdrawal', 'Transfer',
    'ForeignExchange', 'OptionExercise', 'OptionExpiry',
    'OptionAssignment', 'Fee', 'Tax', 'Other'
  ];
  
  res.json({
    success: true,
    data: types
  });
}));

module.exports = router;