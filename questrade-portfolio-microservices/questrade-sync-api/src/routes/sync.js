const express = require('express');
const router = express.Router();
const syncManager = require('../services/syncManager');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Sync all persons
router.post('/all', asyncHandler(async (req, res) => {
  const { triggeredBy = 'manual' } = req.body;
  
  logger.info('Starting sync for all persons');
  
  const results = await syncManager.syncAll(triggeredBy);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  res.json({
    success: true,
    message: `Synced ${successful} persons successfully, ${failed} failed`,
    data: {
      results,
      summary: {
        total: results.length,
        successful,
        failed
      }
    }
  });
}));

// Sync specific person
router.post('/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { syncType = 'full', triggeredBy = 'manual' } = req.body;
  
  logger.info(`Starting ${syncType} sync for ${personName}`);
  
  const result = await syncManager.syncPerson(personName, syncType, triggeredBy);
  
  res.json({
    success: true,
    message: `Sync completed for ${personName}`,
    data: result
  });
}));

// Sync accounts for a person
router.post('/accounts/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { triggeredBy = 'manual' } = req.body;
  
  const result = await syncManager.syncPerson(personName, 'accounts', triggeredBy);
  
  res.json({
    success: true,
    message: `Account sync completed for ${personName}`,
    data: result
  });
}));

// Sync positions for a person
router.post('/positions/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { triggeredBy = 'manual' } = req.body;
  
  const result = await syncManager.syncPerson(personName, 'positions', triggeredBy);
  
  res.json({
    success: true,
    message: `Position sync completed for ${personName}`,
    data: result
  });
}));

// Sync activities for a person
router.post('/activities/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { triggeredBy = 'manual' } = req.body;
  
  const result = await syncManager.syncPerson(personName, 'activities', triggeredBy);
  
  res.json({
    success: true,
    message: `Activity sync completed for ${personName}`,
    data: result
  });
}));

// Sync specific account
router.post('/account/:personName/:accountId', asyncHandler(async (req, res) => {
  const { personName, accountId } = req.params;
  const { syncType = 'full', triggeredBy = 'manual' } = req.body;
  
  const result = await syncManager.syncAccount(personName, accountId, syncType, triggeredBy);
  
  res.json({
    success: true,
    message: `Account ${accountId} synced successfully`,
    data: result
  });
}));

// Get sync status
router.get('/status', asyncHandler(async (req, res) => {
  const status = await syncManager.getSyncStatus();
  
  res.json({
    success: true,
    data: status
  });
}));

// Get sync history
router.get('/history', asyncHandler(async (req, res) => {
  const { 
    personName, 
    status, 
    syncType,
    startDate,
    endDate,
    limit = 50 
  } = req.query;
  
  const filter = {};
  
  if (personName) filter.personName = personName;
  if (status) filter.status = status;
  if (syncType) filter.syncType = syncType;
  if (startDate) filter.startDate = startDate;
  if (endDate) filter.endDate = endDate;
  
  const history = await syncManager.getSyncHistory(filter, parseInt(limit));
  
  res.json({
    success: true,
    data: history
  });
}));

module.exports = router;