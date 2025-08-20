// src/routes/portfolio.js
const express = require('express');
const router = express.Router();
const portfolioCalculator = require('../services/portfolioCalculator');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson } = require('../middleware/validateRequest');
const logger = require('../utils/logger');

// Get complete portfolio overview
router.get('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const portfolio = await portfolioCalculator.getPortfolioSummary(personName);
  
  res.json({
    success: true,
    data: portfolio
  });
}));

// Get portfolio summary
router.get('/:personName/summary', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const summary = await portfolioCalculator.getPortfolioSummary(personName);
  
  res.json({
    success: true,
    data: {
      totalValue: summary.overview.totalValue,
      dayChange: summary.overview.dayChange,
      holdingsCount: summary.holdings.count,
      accountCount: summary.accounts.length,
      lastUpdated: summary.overview.lastUpdated
    }
  });
}));

// Get all holdings
router.get('/:personName/holdings', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { sortBy = 'value', order = 'desc' } = req.query;
  
  const holdings = await portfolioCalculator.calculateHoldings(personName);
  
  // Sort holdings
  holdings.holdings.sort((a, b) => {
    let compareValue = 0;
    
    switch(sortBy) {
      case 'symbol':
        compareValue = a.symbol.localeCompare(b.symbol);
        break;
      case 'value':
        compareValue = b.marketValue - a.marketValue;
        break;
      case 'percentage':
        compareValue = b.percentage - a.percentage;
        break;
      case 'pnl':
        compareValue = b.unrealizedPnL - a.unrealizedPnL;
        break;
      default:
        compareValue = b.marketValue - a.marketValue;
    }
    
    return order === 'asc' ? -compareValue : compareValue;
  });
  
  res.json({
    success: true,
    data: holdings
  });
}));

// Get portfolio value
router.get('/:personName/value', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const value = await portfolioCalculator.calculatePortfolioValue(personName);
  
  res.json({
    success: true,
    data: value
  });
}));

// Create new snapshot
router.post('/:personName/snapshot', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const snapshot = await portfolioCalculator.createSnapshot(personName);
  
  res.json({
    success: true,
    message: 'Snapshot created successfully',
    data: snapshot
  });
}));

module.exports = router;