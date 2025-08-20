const express = require('express');
const router = express.Router();
const watchlistService = require('../services/watchlistService');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson } = require('../middleware/validateRequest');

// Get user watchlists
router.get('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req;
  
  const watchlists = await watchlistService.getUserWatchlists(personName);
  
  res.json({
    success: true,
    data: watchlists
  });
}));

// Get specific watchlist
router.get('/:personName/:watchlistId', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req;
  const { watchlistId } = req.params;
  
  const watchlist = await watchlistService.getWatchlist(watchlistId, personName);
  
  res.json({
    success: true,
    data: watchlist
  });
}));

// Get watchlist with quotes
router.get('/:personName/:watchlistId/quotes', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req;
  const { watchlistId } = req.params;
  
  const watchlistWithQuotes = await watchlistService.getWatchlistWithQuotes(
    watchlistId,
    personName
  );
  
  res.json({
    success: true,
    data: watchlistWithQuotes
  });
}));

// Create watchlist
router.post('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req;
  const { name, description, symbols = [] } = req.body;
  
  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'Watchlist name is required'
    });
  }
  
  const watchlist = await watchlistService.createWatchlist(
    personName,
    name,
    description,
    symbols
  );
  
  res.status(201).json({
    success: true,
    data: watchlist,
    message: 'Watchlist created successfully'
  });
}));

// Update watchlist
router.put('/:watchlistId', asyncHandler(async (req, res) => {
  const { watchlistId } = req.params;
  const updates = req.body;
  
  const watchlist = await watchlistService.updateWatchlist(watchlistId, updates);
  
  res.json({
    success: true,
    data: watchlist,
    message: 'Watchlist updated successfully'
  });
}));

// Add symbol to watchlist
router.post('/:watchlistId/symbols', asyncHandler(async (req, res) => {
  const { watchlistId } = req.params;
  const { symbol } = req.body;
  
  if (!symbol) {
    return res.status(400).json({
      success: false,
      error: 'Symbol is required'
    });
  }
  
  const watchlist = await watchlistService.addSymbolToWatchlist(
    watchlistId,
    symbol.toUpperCase()
  );
  
  res.json({
    success: true,
    data: watchlist,
    message: 'Symbol added to watchlist'
  });
}));

// Remove symbol from watchlist
router.delete('/:watchlistId/symbols/:symbol', asyncHandler(async (req, res) => {
  const { watchlistId, symbol } = req.params;
  
  const watchlist = await watchlistService.removeSymbolFromWatchlist(
    watchlistId,
    symbol.toUpperCase()
  );
  
  res.json({
    success: true,
    data: watchlist,
    message: 'Symbol removed from watchlist'
  });
}));

// Delete watchlist
router.delete('/:watchlistId', asyncHandler(async (req, res) => {
  const { watchlistId } = req.params;
  
  await watchlistService.deleteWatchlist(watchlistId);
  
  res.json({
    success: true,
    message: 'Watchlist deleted successfully'
  });
}));

// Set up alerts
router.post('/:watchlistId/alerts', asyncHandler(async (req, res) => {
  const { watchlistId } = req.params;
  const { symbol, type, threshold } = req.body;
  
  if (!symbol || !type || threshold === undefined) {
    return res.status(400).json({
      success: false,
      error: 'Symbol, type, and threshold are required'
    });
  }
  
  const alert = await watchlistService.addAlert(
    watchlistId,
    symbol.toUpperCase(),
    type,
    threshold
  );
  
  res.json({
    success: true,
    data: alert,
    message: 'Alert created successfully'
  });
}));

module.exports = router;