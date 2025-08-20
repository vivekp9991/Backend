// src/routes/analytics.js
const express = require('express');
const router = express.Router();
const riskAnalyzer = require('../services/riskAnalyzer');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson, validatePeriod } = require('../middleware/validateRequest');

// Get risk metrics
router.get('/:personName/risk', 
  validatePerson,
  validatePeriod,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { period = '1Y' } = req.query;
    
    const riskMetrics = await riskAnalyzer.calculateRiskMetrics(personName, period);
    
    res.json({
      success: true,
      data: riskMetrics
    });
}));

// Get diversification analysis
router.get('/:personName/diversification', 
  validatePerson,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    
    const diversification = await riskAnalyzer.analyzeDiversification(personName);
    
    res.json({
      success: true,
      data: diversification
    });
}));

// Get correlation matrix
router.get('/:personName/correlation', 
  validatePerson,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { symbols } = req.query;
    
    const correlationMatrix = await riskAnalyzer.getCorrelationMatrix(
      personName,
      symbols ? symbols.split(',') : null
    );
    
    res.json({
      success: true,
      data: correlationMatrix
    });
}));

// Get concentration analysis
router.get('/:personName/concentration', 
  validatePerson,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    
    const concentration = await riskAnalyzer.analyzeConcentration(personName);
    
    res.json({
      success: true,
      data: concentration
    });
}));

// Get drawdown analysis
router.get('/:personName/drawdown', 
  validatePerson,
  validatePeriod,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { period = '1Y' } = req.query;
    
    const drawdown = await riskAnalyzer.calculateDrawdown(personName, period);
    
    res.json({
      success: true,
      data: drawdown
    });
}));

module.exports = router;