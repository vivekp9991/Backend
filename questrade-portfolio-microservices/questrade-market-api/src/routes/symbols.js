const express = require('express');
const router = express.Router();
const symbolService = require('../services/symbolService');
const { asyncHandler } = require('../middleware/errorHandler');
const cache = require('../middleware/cache');

// Search symbols
router.get('/search', cache.middleware, asyncHandler(async (req, res) => {
  const { prefix, limit = 10 } = req.query;
  
  if (!prefix || prefix.length < 1) {
    return res.status(400).json({
      success: false,
      error: 'Search prefix must be at least 1 character'
    });
  }
  
  req.cacheTTL = 3600; // Cache for 1 hour
  
  const symbols = await symbolService.searchSymbols(prefix, parseInt(limit));
  
  res.json({
    success: true,
    data: symbols
  });
}));

// Get symbol details
router.get('/:symbolId', cache.middleware, asyncHandler(async (req, res) => {
  const { symbolId } = req.params;
  
  req.cacheTTL = 86400; // Cache for 24 hours
  
  const symbol = await symbolService.getSymbolDetails(symbolId);
  
  res.json({
    success: true,
    data: symbol
  });
}));

// Get options chain
router.get('/:symbol/options', cache.middleware, asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  const { expiry } = req.query;
  
  req.cacheTTL = 300; // Cache for 5 minutes
  
  const options = await symbolService.getOptionsChain(symbol.toUpperCase(), expiry);
  
  res.json({
    success: true,
    data: options
  });
}));

// Get symbol fundamentals
router.get('/:symbol/fundamentals', cache.middleware, asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  
  req.cacheTTL = 3600; // Cache for 1 hour
  
  const fundamentals = await symbolService.getSymbolFundamentals(symbol.toUpperCase());
  
  res.json({
    success: true,
    data: fundamentals
  });
}));

// Sync symbol from Questrade
router.post('/:symbol/sync', asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  
  const symbolData = await symbolService.syncSymbolFromQuestrade(symbol.toUpperCase());
  
  res.json({
    success: true,
    data: symbolData,
    message: 'Symbol synced successfully'
  });
}));

module.exports = router;