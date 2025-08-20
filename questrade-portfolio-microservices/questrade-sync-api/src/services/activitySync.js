const Activity = require('../models/Activity');
const questradeClient = require('./questradeClient');
const logger = require('../utils/logger');
const moment = require('moment');

class ActivitySync {
  async syncAccountActivities(personName, accountId, days = 30) {
    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Get activities from Questrade
      const questradeActivities = await questradeClient.getAccountActivities(
        personName,
        accountId,
        startDate,
        endDate
      );
      
      logger.info(`Found ${questradeActivities.length} activities for account ${accountId}`);
      
      const syncedActivities = [];
      
      for (const qActivity of questradeActivities) {
        try {
          // Generate unique activity ID
          const activityId = this.generateActivityId(accountId, qActivity);
          
          // Check if activity already exists
          let activity = await Activity.findOne({ activityId });
          
          if (!activity) {
            activity = new Activity({
              activityId,
              accountId,
              personName
            });
          }
          
          // Map Questrade activity type to our type
          const activityType = this.mapActivityType(qActivity.type || qActivity.action);
          
          // Update activity data
          activity.transactionDate = new Date(qActivity.transactionDate);
          activity.settlementDate = qActivity.settlementDate ? new Date(qActivity.settlementDate) : null;
          activity.tradeDate = qActivity.tradeDate ? new Date(qActivity.tradeDate) : null;
          activity.type = activityType;
          activity.action = qActivity.action;
          activity.symbol = qActivity.symbol;
          activity.symbolId = qActivity.symbolId;
          activity.description = qActivity.description;
          activity.quantity = qActivity.quantity || 0;
          activity.price = qActivity.price || 0;
          activity.grossAmount = qActivity.grossAmount || 0;
          activity.netAmount = qActivity.netAmount || 0;
          activity.commission = qActivity.commission || 0;
          activity.currency = qActivity.currency || 'CAD';
          activity.notes = qActivity.notes;
          activity.referenceNumber = qActivity.referenceNumber;
          activity.lastSyncedAt = new Date();
          
          await activity.save();
          syncedActivities.push(activity);
          
          logger.debug(`Synced activity ${activityId} for account ${accountId}`);
          
        } catch (error) {
          logger.error(`Error syncing activity:`, error);
        }
      }
      
      return {
        success: true,
        activitiesSynced: syncedActivities.length,
        activities: syncedActivities,
        apiCalls: 1
      };
      
    } catch (error) {
      logger.error(`Failed to sync activities for account ${accountId}:`, error);
      throw error;
    }
  }
  
  // Generate unique activity ID
  generateActivityId(accountId, activity) {
    const date = moment(activity.transactionDate).format('YYYYMMDD');
    const type = (activity.type || activity.action || 'unknown').toLowerCase().replace(/\s+/g, '');
    const symbol = (activity.symbol || 'nosymbol').toLowerCase();
    const amount = Math.abs(activity.netAmount || activity.grossAmount || 0).toFixed(2).replace('.', '');
    
    return `${accountId}_${date}_${type}_${symbol}_${amount}`;
  }
  
  // Map Questrade activity type to our internal type
  mapActivityType(questradeType) {
    if (!questradeType) return 'Other';
    
    const typeString = questradeType.toString().toLowerCase();
    
    if (typeString.includes('buy')) return 'Buy';
    if (typeString.includes('sell')) return 'Sell';
    if (typeString.includes('dividend')) return 'Dividend';
    if (typeString.includes('interest')) return 'Interest';
    if (typeString.includes('deposit')) return 'Deposit';
    if (typeString.includes('withdrawal')) return 'Withdrawal';
    if (typeString.includes('transfer')) return 'Transfer';
    if (typeString.includes('fx') || typeString.includes('foreign')) return 'ForeignExchange';
    if (typeString.includes('option exercise')) return 'OptionExercise';
    if (typeString.includes('option expir')) return 'OptionExpiry';
    if (typeString.includes('option assign')) return 'OptionAssignment';
    if (typeString.includes('fee')) return 'Fee';
    if (typeString.includes('tax')) return 'Tax';
    
    return 'Other';
  }
  
  async getAccountActivities(accountId, limit = 100) {
    try {
      const activities = await Activity.getByAccount(accountId, limit);
      return activities;
    } catch (error) {
      logger.error(`Failed to get activities for account ${accountId}:`, error);
      throw error;
    }
  }
  
  async getPersonActivities(personName, limit = 100) {
    try {
      const activities = await Activity.getByPerson(personName, limit);
      return activities;
    } catch (error) {
      logger.error(`Failed to get activities for ${personName}:`, error);
      throw error;
    }
  }
  
  async getActivitySummary(filter = {}, dateRange = null) {
    try {
      const summary = await Activity.getActivitySummary(filter, dateRange);
      return summary;
    } catch (error) {
      logger.error('Failed to get activity summary:', error);
      throw error;
    }
  }
}

module.exports = new ActivitySync();