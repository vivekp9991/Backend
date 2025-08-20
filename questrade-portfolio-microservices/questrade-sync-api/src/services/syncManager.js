const SyncLog = require('../models/SyncLog');
const accountSync = require('./accountSync');
const positionSync = require('./positionSync');
const activitySync = require('./activitySync');
const balanceSync = require('./balanceSync');
const logger = require('../utils/logger');
const axios = require('axios');
const config = require('../config/environment');

class SyncManager {
  constructor() {
    this.syncInProgress = new Map(); // Track ongoing syncs per person
  }

  // Check if sync is already in progress
  isSyncInProgress(personName) {
    return this.syncInProgress.has(personName);
  }

  // Get all active persons from Auth API
  async getActivePersons() {
    try {
      const response = await axios.get(
        `${config.authApi.url}/persons`,
        {
          headers: {
            'x-api-key': config.authApi.apiKey
          }
        }
      );
      
      return response.data.data.filter(person => 
        person.isActive && person.hasValidToken
      );
    } catch (error) {
      logger.error('Failed to get active persons:', error.message);
      throw error;
    }
  }

  // Sync all persons
  async syncAll(triggeredBy = 'manual') {
    const persons = await this.getActivePersons();
    const results = [];
    
    logger.info(`Starting sync for ${persons.length} persons`);
    
    for (const person of persons) {
      try {
        const result = await this.syncPerson(person.personName, 'full', triggeredBy);
        results.push(result);
      } catch (error) {
        logger.error(`Sync failed for ${person.personName}:`, error);
        results.push({
          personName: person.personName,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Sync specific person
  async syncPerson(personName, syncType = 'full', triggeredBy = 'manual') {
    // Check if sync is already in progress
    if (this.isSyncInProgress(personName)) {
      throw new Error(`Sync already in progress for ${personName}`);
    }
    
    // Mark sync as in progress
    this.syncInProgress.set(personName, true);
    
    // Create sync log
    const syncLog = await SyncLog.createSyncLog({
      personName,
      syncType,
      triggeredBy
    });
    
    try {
      await syncLog.markAsRunning();
      
      const recordsProcessed = {
        accounts: 0,
        positions: 0,
        balances: 0,
        activities: 0
      };
      
      // Sync accounts first (they're the foundation)
      if (syncType === 'full' || syncType === 'accounts') {
        logger.info(`Syncing accounts for ${personName}`);
        const accountResult = await accountSync.syncPersonAccounts(personName);
        recordsProcessed.accounts = accountResult.accountsSynced;
        syncLog.incrementApiCalls(accountResult.apiCalls || 1);
        
        // Get the synced accounts for further operations
        const accounts = accountResult.accounts;
        
        // Sync other data for each account
        for (const account of accounts) {
          // Sync balances
          if (syncType === 'full' || syncType === 'balances') {
            logger.info(`Syncing balances for account ${account.accountId}`);
            const balanceResult = await balanceSync.syncAccountBalances(
              personName, 
              account.accountId
            );
            recordsProcessed.balances += balanceResult.balancesSynced;
            syncLog.incrementApiCalls(balanceResult.apiCalls || 1);
          }
          
          // Sync positions
          if (syncType === 'full' || syncType === 'positions') {
            logger.info(`Syncing positions for account ${account.accountId}`);
            const positionResult = await positionSync.syncAccountPositions(
              personName,
              account.accountId
            );
            recordsProcessed.positions += positionResult.positionsSynced;
            syncLog.incrementApiCalls(positionResult.apiCalls || 1);
          }
          
          // Sync activities
          if (syncType === 'full' || syncType === 'activities') {
            logger.info(`Syncing activities for account ${account.accountId}`);
            const activityResult = await activitySync.syncAccountActivities(
              personName,
              account.accountId
            );
            recordsProcessed.activities += activityResult.activitiesSynced;
            syncLog.incrementApiCalls(activityResult.apiCalls || 1);
          }
        }
      }
      
      // Mark sync as completed
      await syncLog.markAsCompleted(recordsProcessed);
      
      logger.info(`Sync completed for ${personName}:`, recordsProcessed);
      
      return {
        success: true,
        personName,
        syncId: syncLog.syncId,
        recordsProcessed,
        duration: syncLog.duration
      };
      
    } catch (error) {
      logger.error(`Sync error for ${personName}:`, error);
      
      // Mark sync as failed
      await syncLog.markAsFailed(error);
      
      throw error;
      
    } finally {
      // Remove from in-progress tracking
      this.syncInProgress.delete(personName);
    }
  }

  // Sync specific account only
  async syncAccount(personName, accountId, syncType = 'full', triggeredBy = 'manual') {
    // Create sync log
    const syncLog = await SyncLog.createSyncLog({
      personName,
      accountId,
      syncType,
      triggeredBy
    });
    
    try {
      await syncLog.markAsRunning();
      
      const recordsProcessed = {
        balances: 0,
        positions: 0,
        activities: 0
      };
      
      // Sync balances
      if (syncType === 'full' || syncType === 'balances') {
        const balanceResult = await balanceSync.syncAccountBalances(personName, accountId);
        recordsProcessed.balances = balanceResult.balancesSynced;
        syncLog.incrementApiCalls(balanceResult.apiCalls || 1);
      }
      
      // Sync positions
      if (syncType === 'full' || syncType === 'positions') {
        const positionResult = await positionSync.syncAccountPositions(personName, accountId);
        recordsProcessed.positions = positionResult.positionsSynced;
        syncLog.incrementApiCalls(positionResult.apiCalls || 1);
      }
      
      // Sync activities
      if (syncType === 'full' || syncType === 'activities') {
        const activityResult = await activitySync.syncAccountActivities(personName, accountId);
        recordsProcessed.activities = activityResult.activitiesSynced;
        syncLog.incrementApiCalls(activityResult.apiCalls || 1);
      }
      
      await syncLog.markAsCompleted(recordsProcessed);
      
      return {
        success: true,
        accountId,
        syncId: syncLog.syncId,
        recordsProcessed
      };
      
    } catch (error) {
      await syncLog.markAsFailed(error);
      throw error;
    }
  }

  // Get sync status
  async getSyncStatus() {
    const recentSyncs = await SyncLog.getRecent(5);
    const stats = await SyncLog.getSyncStatistics({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      end: new Date()
    });
    
    const inProgress = Array.from(this.syncInProgress.keys());
    
    return {
      inProgress,
      recentSyncs: recentSyncs.map(sync => ({
        syncId: sync.syncId,
        personName: sync.personName,
        status: sync.status,
        startedAt: sync.startedAt,
        completedAt: sync.completedAt,
        duration: sync.duration,
        recordsProcessed: sync.recordsProcessed,
        errorCount: sync.errorCount
      })),
      stats24Hours: stats
    };
  }

  // Get sync history
  async getSyncHistory(filter = {}, limit = 50) {
    const query = {};
    
    if (filter.personName) {
      query.personName = filter.personName;
    }
    
    if (filter.status) {
      query.status = filter.status;
    }
    
    if (filter.syncType) {
      query.syncType = filter.syncType;
    }
    
    if (filter.startDate || filter.endDate) {
      query.startedAt = {};
      if (filter.startDate) {
        query.startedAt.$gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        query.startedAt.$lte = new Date(filter.endDate);
      }
    }
    
    return await SyncLog.find(query)
      .sort({ startedAt: -1 })
      .limit(limit);
  }
}

module.exports = new SyncManager();