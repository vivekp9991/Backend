const express = require('express');
const router = express.Router();
const Position = require('../models/Position');
const positionSync = require('../services/positionSync');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get all positions
router.get('/', asyncHandler(async (req, res) => {
  const { personName, symbol, accountId } = req.query;
  
  const filter = {};
  if (personName) filter.personName = personName;
  if (symbol) filter.symbol = symbol;
  if (accountId) filter.accountId = accountId;
  
  const positions = await Position.find(filter)
    .sort({ currentMarketValue: -1 });
  
  res.json({
    success: true,
    data: positions
  });
}));

// Get positions for a specific account
router.get('/:accountId', asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  
  const positions = await positionSync.getAccountPositions(accountId);
  
  res.json({
    success: true,
    data: positions
  });
}));

// Get positions for a person
router.get('/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const positions = await positionSync.getPersonPositions(personName);
  
  res.json({
    success: true,
    data: positions
  });
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

// Get position details
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

// Get top positions by value
router.get('/top/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { limit = 10 } = req.query;
  
  const positions = await Position.find({ personName })
    .sort({ currentMarketValue: -1 })
    .limit(parseInt(limit));
  
  res.json({
    success: true,
    data: positions
  });
}));

// Get positions with P&L summary
router.get('/pnl/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const positions = await Position.find({ personName });
  
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
    data: pnlSummary
  });
}));

module.exports = router;