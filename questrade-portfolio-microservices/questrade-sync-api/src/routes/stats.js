const express = require('express');
const router = express.Router();
const SyncLog = require('../models/SyncLog');
const Account = require('../models/Account');
const Position = require('../models/Position');
const Activity = require('../models/Activity');
const Balance = require('../models/Balance');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get sync statistics
router.get('/sync', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  let dateRange = null;
  if (startDate || endDate) {
    dateRange = {
      start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default 30 days back
      end: endDate || new Date()
    };
  }
  
  const stats = await SyncLog.getSyncStatistics(dateRange);
  
  res.json({
    success: true,
    data: stats
  });
}));

// Get data statistics
router.get('/data', asyncHandler(async (req, res) => {
  const [
    accountCount,
    positionCount,
    activityCount,
    balanceCount,
    syncLogCount
  ] = await Promise.all([
    Account.countDocuments(),
    Position.countDocuments(),
    Activity.countDocuments(),
    Balance.countDocuments(),
    SyncLog.countDocuments()
  ]);
  
  // Get unique persons
  const uniquePersons = await Account.distinct('personName');
  
  // Get last sync times
  const lastSyncs = await SyncLog.find({ status: 'completed' })
    .sort({ completedAt: -1 })
    .limit(1);
  
  const lastSuccessfulSync = lastSyncs[0]?.completedAt || null;
  
  res.json({
    success: true,
    data: {
      counts: {
        accounts: accountCount,
        positions: positionCount,
        activities: activityCount,
        balances: balanceCount,
        syncLogs: syncLogCount,
        persons: uniquePersons.length
      },
      lastSuccessfulSync,
      persons: uniquePersons
    }
  });
}));

// Get error statistics
router.get('/errors', asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));
  
  const errorLogs = await SyncLog.find({
    startedAt: { $gte: startDate },
    errorCount: { $gt: 0 }
  }).sort({ startedAt: -1 });
  
  // Group errors by type
  const errorsByType = {};
  const errorsByPerson = {};
  
  errorLogs.forEach(log => {
    // Count by person
    if (!errorsByPerson[log.personName]) {
      errorsByPerson[log.personName] = 0;
    }
    errorsByPerson[log.personName]++;
    
    // Count by error type
    if (log.errors && log.errors.length > 0) {
      log.errors.forEach(error => {
        if (!errorsByType[error.type]) {
          errorsByType[error.type] = 0;
        }
        errorsByType[error.type]++;
      });
    }
  });
  
  res.json({
    success: true,
    data: {
      totalErrors: errorLogs.length,
      errorsByType,
      errorsByPerson,
      recentErrors: errorLogs.slice(0, 10).map(log => ({
        syncId: log.syncId,
        personName: log.personName,
        syncType: log.syncType,
        errorCount: log.errorCount,
        errors: log.errors,
        startedAt: log.startedAt
      }))
    }
  });
}));

// Get person statistics
router.get('/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const [
    accounts,
    positions,
    activities,
    balances,
    syncLogs
  ] = await Promise.all([
    Account.find({ personName }),
    Position.find({ personName }),
    Activity.find({ personName }).limit(100),
    Balance.find({ personName }),
    SyncLog.find({ personName }).sort({ startedAt: -1 }).limit(10)
  ]);
  
  // Calculate totals
  const totalEquityCAD = accounts.reduce((sum, acc) => 
    sum + (acc.summary?.totalEquityCAD || 0), 0
  );
  
  const totalMarketValue = positions.reduce((sum, pos) => 
    sum + (pos.currentMarketValue || 0), 0
  );
  
  const totalOpenPnl = positions.reduce((sum, pos) => 
    sum + (pos.openPnl || 0), 0
  );
  
  res.json({
    success: true,
    data: {
      personName,
      accountCount: accounts.length,
      positionCount: positions.length,
      recentActivityCount: activities.length,
      balanceCount: balances.length,
      totalEquityCAD,
      totalMarketValue,
      totalOpenPnl,
      lastSync: syncLogs[0]?.completedAt || null,
      syncHistory: syncLogs.map(log => ({
        syncId: log.syncId,
        status: log.status,
        syncType: log.syncType,
        startedAt: log.startedAt,
        duration: log.duration
      }))
    }
  });
}));

// Get sync performance metrics
router.get('/performance', asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));
  
  const syncLogs = await SyncLog.find({
    startedAt: { $gte: startDate },
    status: { $in: ['completed', 'partial'] }
  });
  
  // Calculate performance metrics
  const metrics = {
    totalSyncs: syncLogs.length,
    averageDuration: 0,
    minDuration: Number.MAX_VALUE,
    maxDuration: 0,
    totalApiCalls: 0,
    averageApiCalls: 0,
    successRate: 0
  };
  
  let totalDuration = 0;
  let successCount = 0;
  
  syncLogs.forEach(log => {
    if (log.duration) {
      totalDuration += log.duration;
      metrics.minDuration = Math.min(metrics.minDuration, log.duration);
      metrics.maxDuration = Math.max(metrics.maxDuration, log.duration);
    }
    
    metrics.totalApiCalls += log.apiCalls || 0;
    
    if (log.status === 'completed' && log.errorCount === 0) {
      successCount++;
    }
  });
  
  if (syncLogs.length > 0) {
    metrics.averageDuration = totalDuration / syncLogs.length;
    metrics.averageApiCalls = metrics.totalApiCalls / syncLogs.length;
    metrics.successRate = (successCount / syncLogs.length) * 100;
  }
  
  if (metrics.minDuration === Number.MAX_VALUE) {
    metrics.minDuration = 0;
  }
  
  res.json({
    success: true,
    data: metrics
  });
}));

module.exports = router;