// src/routes/performance.js
const express = require('express');
const router = express.Router();
const performanceCalculator = require('../services/performanceCalculator');
const { asyncHandler } = require('../middleware/errorHandler');
const { 
  validatePerson, 
  validatePeriod, 
  validateDateRange 
} = require('../middleware/validateRequest');
const logger = require('../utils/logger');

// Get performance metrics
router.get('/:personName', 
  validatePerson, 
  validatePeriod, 
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { period = '1Y', benchmark } = req.query;
    
    const performance = await performanceCalculator.calculateReturns(
      personName, 
      period
    );
    
    // Add benchmark comparison if requested
    if (benchmark) {
      // TODO: Implement benchmark comparison
      performance.benchmark = {
        symbol: benchmark,
        return: 0,
        message: 'Benchmark comparison not yet implemented'
      };
    }
    
    res.json({
      success: true,
      data: performance
    });
}));

// Get historical performance
router.get('/:personName/history', 
  validatePerson, 
  validateDateRange,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { interval = 'daily' } = req.query;
    
    const startDate = req.startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const endDate = req.endDate || new Date();
    
    const history = await performanceCalculator.getHistoricalPerformance(
      personName,
      startDate,
      endDate,
      interval
    );
    
    res.json({
      success: true,
      data: {
        personName,
        startDate,
        endDate,
        interval,
        dataPoints: history.length,
        history
      }
    });
}));

// Get return calculations
router.get('/:personName/returns', 
  validatePerson,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    
    // Calculate returns for multiple periods
    const periods = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD'];
    const returns = {};
    
    for (const period of periods) {
      try {
        returns[period] = await performanceCalculator.calculateReturns(
          personName,
          period
        );
      } catch (error) {
        returns[period] = {
          error: 'Unable to calculate',
          period
        };
      }
    }
    
    res.json({
      success: true,
      data: returns
    });
}));

// Get daily performance
router.get('/:personName/daily', 
  validatePerson,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const dailyPerformance = await performanceCalculator.getHistoricalPerformance(
      personName,
      startDate,
      new Date(),
      'daily'
    );
    
    res.json({
      success: true,
      data: {
        days: parseInt(days),
        dataPoints: dailyPerformance.length,
        performance: dailyPerformance
      }
    });
}));

module.exports = router;