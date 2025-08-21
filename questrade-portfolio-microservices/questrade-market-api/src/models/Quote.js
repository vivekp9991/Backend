const express = require('express');
const router = express.Router();
const quoteService = require('../services/quoteService');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateSymbol, validateSymbols } = require('../middleware/validateRequest');
const cache = require('../middleware/cache');

// Get single quote
router.get('/:symbol', validateSymbol, cache.middleware, asyncHandler(async (req, res) => {
  const { symbol } = req;
  
  const quote = await quoteService.getQuote(symbol);
  
  // Ensure we're returning day change if available
  if (quote && quote.dayChange !== undefined) {
    quote.change = quote.dayChange;
    quote.changePercent = quote.dayChangePercent;
  }
  
  res.json({
    success: true,
    data: quote
  });
}));

// Get multiple quotes
router.get('/', validateSymbols, cache.middleware, asyncHandler(async (req, res) => {
  const { symbols } = req;
  
  const quotes = await quoteService.getMultipleQuotes(symbols);
  
  res.json({
    success: true,
    data: quotes
  });
}));

// Get quote stream (polling-based)
router.get('/:symbol/stream', validateSymbol, asyncHandler(async (req, res) => {
  const { symbol } = req;
  const { interval = 5000 } = req.query; // Default 5 seconds
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial quote
  const initialQuote = await quoteService.getQuote(symbol);
  res.write(`data: ${JSON.stringify(initialQuote)}\n\n`);
  
  // Set up interval for updates
  const streamInterval = setInterval(async () => {
    try {
      const quote = await quoteService.getQuote(symbol, true); // Force refresh
      res.write(`data: ${JSON.stringify(quote)}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    }
  }, parseInt(interval));
  
  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(streamInterval);
    res.end();
  });
}));

// Get historical quotes
router.get('/:symbol/history', validateSymbol, asyncHandler(async (req, res) => {
  const { symbol } = req;
  const { days = 30 } = req.query;
  
  const history = await quoteService.getHistoricalQuotes(symbol, parseInt(days));
  
  res.json({
    success: true,
    data: history
  });
}));

// Refresh quote (force update)
router.post('/:symbol/refresh', validateSymbol, asyncHandler(async (req, res) => {
  const { symbol } = req;
  
  const quote = await quoteService.refreshQuote(symbol);
  
  // Invalidate cache for this symbol
  cache.invalidatePattern(symbol);
  
  res.json({
    success: true,
    data: quote,
    message: 'Quote refreshed successfully'
  });
}));

module.exports = router;