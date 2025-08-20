// src/routes/allocation.js
const express = require('express');
const router = express.Router();
const allocationAnalyzer = require('../services/allocationAnalyzer');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson } = require('../middleware/validateRequest');

// Get asset allocation
router.get('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const allocation = await allocationAnalyzer.getAssetAllocation(personName);
  
  res.json({
    success: true,
    data: allocation
  });
}));

// Get sector allocation
router.get('/:personName/sector', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const sectorAllocation = await allocationAnalyzer.getSectorAllocation(personName);
  
  res.json({
    success: true,
    data: sectorAllocation
  });
}));

// Get geographic allocation
router.get('/:personName/geographic', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const geoAllocation = await allocationAnalyzer.getGeographicAllocation(personName);
  
  res.json({
    success: true,
    data: geoAllocation
  });
}));

// Get currency allocation
router.get('/:personName/currency', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const currencyAllocation = await allocationAnalyzer.getCurrencyAllocation(personName);
  
  res.json({
    success: true,
    data: currencyAllocation
  });
}));

// Get account type allocation
router.get('/:personName/account-type', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const accountTypeAllocation = await allocationAnalyzer.getAccountTypeAllocation(personName);
  
  res.json({
    success: true,
    data: accountTypeAllocation
  });
}));

// Get market cap allocation
router.get('/:personName/market-cap', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const marketCapAllocation = await allocationAnalyzer.getMarketCapAllocation(personName);
  
  res.json({
    success: true,
    data: marketCapAllocation
  });
}));

module.exports = router;