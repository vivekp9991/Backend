const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  // Sync identification
  syncId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Sync scope
  personName: {
    type: String,
    index: true
  },
  accountId: {
    type: String,
    index: true
  },
  syncType: {
    type: String,
    required: true,
    enum: ['full', 'accounts', 'positions', 'balances', 'activities', 'orders']
  },
  
  // Sync status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'partial'],
    default: 'pending'
  },
  
  // Timing
  startedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  completedAt: Date,
  duration: Number, // in milliseconds
  
  // Results
  recordsProcessed: {
    accounts: { type: Number, default: 0 },
    positions: { type: Number, default: 0 },
    balances: { type: Number, default: 0 },
    activities: { type: Number, default: 0 },
    orders: { type: Number, default: 0 }
  },
  
  // Errors
  errors: [{
    timestamp: Date,
    type: String,
    message: String,
    details: mongoose.Schema.Types.Mixed
  }],
  errorCount: {
    type: Number,
    default: 0
  },
  
  // Metadata
  triggeredBy: {
    type: String,
    enum: ['manual', 'scheduled', 'webhook', 'api'],
    default: 'manual'
  },
  apiCalls: {
    type: Number,
    default: 0
  },
  retryCount: {
    type: Number,
    default: 0
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
syncLogSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate duration if completed
  if (this.completedAt && this.startedAt) {
    this.duration = this.completedAt - this.startedAt;
  }
  
  // Update error count
  if (this.errors) {
    this.errorCount = this.errors.length;
  }
  
  next();
});

// Indexes
syncLogSchema.index({ personName: 1, startedAt: -1 });
syncLogSchema.index({ status: 1, startedAt: -1 });
syncLogSchema.index({ syncType: 1, startedAt: -1 });
syncLogSchema.index({ triggeredBy: 1, startedAt: -1 });

// Virtual for success rate
syncLogSchema.virtual('isSuccessful').get(function() {
  return this.status === 'completed' && this.errorCount === 0;
});

// Method to mark as running
syncLogSchema.methods.markAsRunning = function() {
  this.status = 'running';
  this.startedAt = new Date();
  return this.save();
};

// Method to mark as completed
syncLogSchema.methods.markAsCompleted = function(recordsProcessed = null) {
  this.status = this.errorCount > 0 ? 'partial' : 'completed';
  this.completedAt = new Date();
  
  if (recordsProcessed) {
    this.recordsProcessed = { ...this.recordsProcessed.toObject(), ...recordsProcessed };
  }
  
  return this.save();
};

// Method to mark as failed
syncLogSchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  this.completedAt = new Date();
  
  if (error) {
    this.addError('fatal', error.message || error, error);
  }
  
  return this.save();
};

// Method to add error
syncLogSchema.methods.addError = function(type, message, details = null) {
  if (!this.errors) {
    this.errors = [];
  }
  
  this.errors.push({
    timestamp: new Date(),
    type,
    message,
    details
  });
  
  this.errorCount = this.errors.length;
  
  // Don't save automatically to avoid too many DB writes
  return this;
};

// Method to increment API calls
syncLogSchema.methods.incrementApiCalls = function(count = 1) {
  this.apiCalls += count;
  // Don't save automatically
  return this;
};

// Static method to create new sync log
syncLogSchema.statics.createSyncLog = function(data) {
  const syncId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return this.create({
    syncId,
    ...data,
    status: 'pending',
    startedAt: new Date()
  });
};

// Static method to get recent sync logs
syncLogSchema.statics.getRecent = function(limit = 10, filter = {}) {
  return this.find(filter)
    .sort({ startedAt: -1 })
    .limit(limit);
};

// Static method to get sync statistics
syncLogSchema.statics.getSyncStatistics = async function(dateRange = null) {
  let query = {};
  
  if (dateRange) {
    query.startedAt = {
      $gte: new Date(dateRange.start),
      $lte: new Date(dateRange.end)
    };
  }
  
  const logs = await this.find(query);
  
  const stats = {
    total: logs.length,
    successful: 0,
    failed: 0,
    partial: 0,
    averageDuration: 0,
    totalApiCalls: 0,
    byType: {},
    byTrigger: {},
    errorRate: 0
  };
  
  let totalDuration = 0;
  let durationCount = 0;
  
  logs.forEach(log => {
    // Count by status
    if (log.status === 'completed' && log.errorCount === 0) {
      stats.successful++;
    } else if (log.status === 'failed') {
      stats.failed++;
    } else if (log.status === 'partial' || log.errorCount > 0) {
      stats.partial++;
    }
    
    // Count by type
    stats.byType[log.syncType] = (stats.byType[log.syncType] || 0) + 1;
    
    // Count by trigger
    stats.byTrigger[log.triggeredBy] = (stats.byTrigger[log.triggeredBy] || 0) + 1;
    
    // Sum API calls
    stats.totalApiCalls += log.apiCalls || 0;
    
    // Calculate average duration
    if (log.duration) {
      totalDuration += log.duration;
      durationCount++;
    }
  });
  
  // Calculate averages
  if (durationCount > 0) {
    stats.averageDuration = totalDuration / durationCount;
  }
  
  if (stats.total > 0) {
    stats.errorRate = ((stats.failed + stats.partial) / stats.total) * 100;
    stats.successRate = (stats.successful / stats.total) * 100;
  }
  
  return stats;
};

module.exports = mongoose.model('SyncLog', syncLogSchema);