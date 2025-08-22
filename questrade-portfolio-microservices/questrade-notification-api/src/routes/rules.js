const express = require('express');
const router = express.Router();
const AlertRule = require('../models/AlertRule');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson, validateRuleCreation } = require('../middleware/validateRequest');

// Get all rules
router.get('/', asyncHandler(async (req, res) => {
  const { enabled, type, limit = 100 } = req.query;
  
  const filter = {};
  if (enabled !== undefined) filter.enabled = enabled === 'true';
  if (type) filter.type = type;
  
  const rules = await AlertRule.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));
  
  res.json({
    success: true,
    data: rules
  });
}));

// Get rules for a person
router.get('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const rules = await AlertRule.find({ personName })
    .sort({ createdAt: -1 });
  
  res.json({
    success: true,
    data: rules
  });
}));

// Create rule
router.post('/', validateRuleCreation, asyncHandler(async (req, res) => {
  const ruleData = req.body;
  
  const rule = new AlertRule(ruleData);
  await rule.save();
  
  res.status(201).json({
    success: true,
    data: rule,
    message: 'Alert rule created successfully'
  });
}));

// Update rule
router.put('/:ruleId', asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const updates = req.body;
  
  const rule = await AlertRule.findById(ruleId);
  
  if (!rule) {
    return res.status(404).json({
      success: false,
      error: 'Rule not found'
    });
  }
  
  Object.assign(rule, updates);
  await rule.save();
  
  res.json({
    success: true,
    data: rule,
    message: 'Rule updated successfully'
  });
}));

// Enable rule
router.post('/:ruleId/enable', asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  
  const rule = await AlertRule.findById(ruleId);
  
  if (!rule) {
    return res.status(404).json({
      success: false,
      error: 'Rule not found'
    });
  }
  
  rule.enabled = true;
  await rule.save();
  
  res.json({
    success: true,
    data: rule,
    message: 'Rule enabled'
  });
}));

// Disable rule
router.post('/:ruleId/disable', asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  
  const rule = await AlertRule.findById(ruleId);
  
  if (!rule) {
    return res.status(404).json({
      success: false,
      error: 'Rule not found'
    });
  }
  
  rule.enabled = false;
  await rule.save();
  
  res.json({
    success: true,
    data: rule,
    message: 'Rule disabled'
  });
}));

// Delete rule
router.delete('/:ruleId', asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  
  const result = await AlertRule.findByIdAndDelete(ruleId);
  
  if (!result) {
    return res.status(404).json({
      success: false,
      error: 'Rule not found'
    });
  }
  
  res.json({
    success: true,
    message: 'Rule deleted successfully'
  });
}));

// Test rule
router.post('/:ruleId/test', asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  
  const rule = await AlertRule.findById(ruleId);
  
  if (!rule) {
    return res.status(404).json({
      success: false,
      error: 'Rule not found'
    });
  }
  
  // Test the rule logic
  const alertEngine = require('../services/alertEngine');
  const result = await alertEngine.testRule(rule);
  
  res.json({
    success: true,
    data: result,
    message: 'Rule tested successfully'
  });
}));

module.exports = router;