const express = require('express');
const router = express.Router();
const Position = require('../models/Position');
const positionSync = require('../services/positionSync');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get all positions (aggregated across all accounts and persons)
router.get('/', asyncHandler(async (req, res) => {
  const { personName, symbol, accountId, aggregated = 'true' } = req.query;
  
  const filter = {};
  if (personName) filter.personName = personName;
  if (symbol) filter.symbol = symbol;
  if (accountId) filter.accountId = accountId;
  
  // By default, aggregate positions across accounts
  if (aggregated === 'true' && !accountId) {
    const positions = await Position.getAggregatedPositions(filter);
    
    res.json({
      success: true,
      aggregated: true,
      data: positions
    });
  } else {
    // Return raw positions without aggregation
    const positions = await Position.find(filter)
      .sort({ currentMarketValue: -1 });
    
    res.json({
      success: true,
      aggregated: false,
      data: positions
    });
  }
}));

// Get positions for a specific account (no aggregation)
router.get('/:accountId', asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  
  const positions = await positionSync.getAccountPositions(accountId);
  
  res.json({
    success: true,
    aggregated: false,
    data: positions
  });
}));

// Get positions for a person (aggregated across their accounts)
router.get('/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { aggregated = 'true' } = req.query;
  
  if (aggregated === 'true') {
    // Get aggregated positions for this person
    const positions = await Position.getAggregatedByPerson(personName);
    
    res.json({
      success: true,
      aggregated: true,
      personName: personName,
      data: positions
    });
  } else {
    // Get raw positions without aggregation
    const positions = await positionSync.getPersonPositions(personName);
    
    res.json({
      success: true,
      aggregated: false,
      personName: personName,
      data: positions
    });
  }
}));

// Get portfolio summary
router.get('/summary/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const summary = await positionSync.getPortfolioSummary({ personName });
  
  res.json({
    success: true,
    data: summary
  });
}));

// Get position details (raw position for specific account/symbol)
router.get('/detail/:accountId/:symbol', asyncHandler(async (req, res) => {
  const { accountId, symbol } = req.params;
  
  const position = await Position.findOne({ accountId, symbol });
  
  if (!position) {
    return res.status(404).json({
      success: false,
      error: 'Position not found'
    });
  }
  
  res.json({
    success: true,
    data: position
  });
}));

// Get top positions by value (aggregated)
router.get('/top/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { limit = 10 } = req.query;
  
  // Get aggregated positions for the person
  const positions = await Position.getAggregatedByPerson(personName);
  
  // Sort by market value and limit
  const topPositions = positions
    .sort((a, b) => b.currentMarketValue - a.currentMarketValue)
    .slice(0, parseInt(limit));
  
  res.json({
    success: true,
    aggregated: true,
    data: topPositions
  });
}));

// Get positions with P&L summary (aggregated)
router.get('/pnl/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  // Get aggregated positions
  const positions = await Position.getAggregatedByPerson(personName);
  
  const pnlSummary = {
    totalOpenPnl: 0,
    totalDayPnl: 0,
    winners: [],
    losers: [],
    biggestWinner: null,
    biggestLoser: null
  };
  
  positions.forEach(position => {
    pnlSummary.totalOpenPnl += position.openPnl || 0;
    pnlSummary.totalDayPnl += position.dayPnl || 0;
    
    if (position.openPnl > 0) {
      pnlSummary.winners.push(position);
      if (!pnlSummary.biggestWinner || position.openPnl > pnlSummary.biggestWinner.openPnl) {
        pnlSummary.biggestWinner = position;
      }
    } else if (position.openPnl < 0) {
      pnlSummary.losers.push(position);
      if (!pnlSummary.biggestLoser || position.openPnl < pnlSummary.biggestLoser.openPnl) {
        pnlSummary.biggestLoser = position;
      }
    }
  });
  
  res.json({
    success: true,
    aggregated: true,
    data: pnlSummary
  });
}));

module.exports = router;