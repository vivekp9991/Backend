const express = require('express');
const router = express.Router();
const marketDataService = require('../services/marketDataService');
const { asyncHandler } = require('../middleware/errorHandler');
const cache = require('../middleware/cache');

// Get market status
router.get('/status', asyncHandler(async (req, res) => {
  const status = await marketDataService.getMarketStatus();
  
  res.json({
    success: true,
    data: status
  });
}));

// Get market summary
router.get('/summary', cache.middleware, asyncHandler(async (req, res) => {
  req.cacheTTL = 60; // Cache for 1 minute
  
  const summary = await marketDataService.getMarketSummary();
  
  res.json({
    success: true,
    data: summary
  });
}));

// Get market movers
router.get('/movers', cache.middleware, asyncHandler(async (req, res) => {
  const { type = 'all', limit = 10 } = req.query;
  req.cacheTTL = 30; // Cache for 30 seconds
  
  const movers = await marketDataService.getMarketMovers(type, parseInt(limit));
  
  res.json({
    success: true,
    data: movers
  });
}));

// Get sector performance
router.get('/sectors', cache.middleware, asyncHandler(async (req, res) => {
  req.cacheTTL = 300; // Cache for 5 minutes
  
  const sectors = await marketDataService.getSectorPerformance();
  
  res.json({
    success: true,
    data: sectors
  });
}));

// Get market breadth
router.get('/breadth', cache.middleware, asyncHandler(async (req, res) => {
  req.cacheTTL = 60; // Cache for 1 minute
  
  const breadth = await marketDataService.getMarketBreadth();
  
  res.json({
    success: true,
    data: breadth
  });
}));

module.exports = router;