// src/routes/reports.js
const express = require('express');
const router = express.Router();
const reportGenerator = require('../services/reportGenerator');
const { asyncHandler } = require('../middleware/errorHandler');
const { 
  validatePerson, 
  validateFormat,
  validatePeriod 
} = require('../middleware/validateRequest');

// Get summary report
router.get('/:personName/summary', 
  validatePerson,
  validateFormat,
  validatePeriod,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { format = 'json', period = '1Y' } = req.query;
    
    const report = await reportGenerator.generateSummaryReport(
      personName,
      period,
      format
    );
    
    if (format === 'json') {
      res.json({
        success: true,
        data: report
      });
    } else {
      // Handle PDF/CSV download
      res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${personName}-summary.${format}"`);
      res.send(report);
    }
}));

// Get detailed report
router.get('/:personName/detailed', 
  validatePerson,
  validateFormat,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { format = 'json' } = req.query;
    
    const report = await reportGenerator.generateDetailedReport(personName, format);
    
    if (format === 'json') {
      res.json({
        success: true,
        data: report
      });
    } else {
      res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${personName}-detailed.${format}"`);
      res.send(report);
    }
}));

// Get tax report
router.get('/:personName/tax', 
  validatePerson,
  validateFormat,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { year = new Date().getFullYear(), format = 'json' } = req.query;
    
    const report = await reportGenerator.generateTaxReport(personName, year, format);
    
    if (format === 'json') {
      res.json({
        success: true,
        data: report
      });
    } else {
      res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${personName}-tax-${year}.${format}"`);
      res.send(report);
    }
}));

// Generate custom report
router.post('/:personName/custom', 
  validatePerson,
  validateFormat,
  asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { 
      sections = ['performance', 'allocation', 'holdings'],
      period = '1Y',
      format = 'json'
    } = req.body;
    
    const report = await reportGenerator.generateCustomReport(
      personName,
      sections,
      period,
      format
    );
    
    if (format === 'json') {
      res.json({
        success: true,
        data: report
      });
    } else {
      res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${personName}-custom.${format}"`);
      res.send(report);
    }
}));

module.exports = router;