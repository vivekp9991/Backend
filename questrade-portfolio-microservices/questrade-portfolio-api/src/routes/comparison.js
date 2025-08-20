// src/routes/comparison.js
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePeriod } = require('../middleware/validateRequest');
const portfolioCalculator = require('../services/portfolioCalculator');
const performanceCalculator = require('../services/performanceCalculator');

// Compare multiple persons
router.get('/persons', validatePeriod, asyncHandler(async (req, res) => {
  const { persons, period = '1Y' } = req.query;
  
  if (!persons) {
    return res.status(400).json({
      success: false,
      error: 'Persons parameter is required'
    });
  }
  
  const personList = persons.split(',');
  const comparisons = {};
  
  for (const personName of personList) {
    try {
      const [portfolio, performance] = await Promise.all([
        portfolioCalculator.getPortfolioSummary(personName),
        performanceCalculator.calculateReturns(personName, period)
      ]);
      
      comparisons[personName] = {
        totalValue: portfolio.overview.totalValue,
        dayChange: portfolio.overview.dayChange,
        returns: {
          absolute: performance.absoluteReturn,
          percentage: performance.percentageReturn,
          twr: performance.timeWeightedReturn,
          mwr: performance.moneyWeightedReturn
        }
      };
    } catch (error) {
      comparisons[personName] = {
        error: 'Unable to fetch data'
      };
    }
  }
  
  res.json({
    success: true,
    data: {
      period,
      persons: personList,
      comparisons
    }
  });
}));

// Compare to benchmark
router.get('/:personName/benchmark', 
  validatePeriod,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { benchmark = 'SPY', period = '1Y' } = req.query;
    
    const performance = await performanceCalculator.calculateReturns(personName, period);
    
    // TODO: Implement actual benchmark comparison
    const benchmarkData = {
      symbol: benchmark,
      return: 10.5, // Placeholder
      message: 'Benchmark comparison coming soon'
    };
    
    res.json({
      success: true,
      data: {
        portfolio: performance,
        benchmark: benchmarkData,
        alpha: performance.percentageReturn - benchmarkData.return
      }
    });
}));

// Period-over-period comparison
router.get('/:personName/period', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { periods = '1M,3M,6M,1Y' } = req.query;
  
  const periodList = periods.split(',');
  const comparisons = {};
  
  for (const period of periodList) {
    try {
      comparisons[period] = await performanceCalculator.calculateReturns(
        personName,
        period
      );
    } catch (error) {
      comparisons[period] = {
        error: 'Unable to calculate'
      };
    }
  }
  
  res.json({
    success: true,
    data: {
      personName,
      periods: periodList,
      comparisons
    }
  });
}));

module.exports = router;