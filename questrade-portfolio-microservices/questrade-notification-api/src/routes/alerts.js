const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const alertEngine = require('../services/alertEngine');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson, validateAlertCreation } = require('../middleware/validateRequest');

// Get all alerts
router.get('/', asyncHandler(async (req, res) => {
  const { status, type, severity, limit = 100 } = req.query;
  
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (severity) filter.severity = severity;
  
  const alerts = await Alert.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('ruleId');
  
  res.json({
    success: true,
    data: alerts
  });
}));

// Get alerts for a person
router.get('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { status, limit = 50 } = req.query;
  
  const filter = { personName };
  if (status) filter.status = status;
  
  const alerts = await Alert.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('ruleId');
  
  res.json({
    success: true,
    data: alerts
  });
}));

// Create manual alert
router.post('/', validateAlertCreation, asyncHandler(async (req, res) => {
  const alertData = req.body;
  
  const alert = await alertEngine.createManualAlert(alertData);
  
  res.status(201).json({
    success: true,
    data: alert,
    message: 'Alert created successfully'
  });
}));

// Update alert
router.put('/:alertId', asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  const updates = req.body;
  
  const alert = await Alert.findOne({ alertId });
  
  if (!alert) {
    return res.status(404).json({
      success: false,
      error: 'Alert not found'
    });
  }
  
  Object.assign(alert, updates);
  await alert.save();
  
  res.json({
    success: true,
    data: alert,
    message: 'Alert updated successfully'
  });
}));

// Acknowledge alert
router.post('/:alertId/acknowledge', asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  
  const alert = await Alert.findOne({ alertId });
  
  if (!alert) {
    return res.status(404).json({
      success: false,
      error: 'Alert not found'
    });
  }
  
  await alert.acknowledge();
  
  res.json({
    success: true,
    data: alert,
    message: 'Alert acknowledged'
  });
}));

// Delete alert
router.delete('/:alertId', asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  
  const result = await Alert.deleteOne({ alertId });
  
  if (result.deletedCount === 0) {
    return res.status(404).json({
      success: false,
      error: 'Alert not found'
    });
  }
  
  res.json({
    success: true,
    message: 'Alert deleted successfully'
  });
}));

// Trigger alert manually (for testing)
router.post('/:alertId/trigger', asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  const { value, message } = req.body;
  
  const alert = await Alert.findOne({ alertId });
  
  if (!alert) {
    return res.status(404).json({
      success: false,
      error: 'Alert not found'
    });
  }
  
  await alert.trigger(value, message);
  
  // Send notifications
  await alertEngine.sendAlertNotifications(alert);
  
  res.json({
    success: true,
    data: alert,
    message: 'Alert triggered successfully'
  });
}));

// Get alert statistics
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const { personName } = req.query;
  
  const filter = {};
  if (personName) filter.personName = personName;
  
  const stats = await Alert.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const statsByType = await Alert.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);
  
  res.json({
    success: true,
    data: {
      byStatus: stats,
      byType: statsByType,
      total: await Alert.countDocuments(filter)
    }
  });
}));

module.exports = router;