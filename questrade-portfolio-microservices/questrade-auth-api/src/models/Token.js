const mongoose = require('mongoose');
const crypto = require('crypto');

const tokenSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['refresh', 'access'],
    required: true
  },
  personName: {
    type: String,
    required: true,
    index: true
  },
  encryptedToken: {
    type: String,
    required: true
  },
  iv: {
    type: String,
    required: true
  },
  apiServer: String,
  expiresAt: {
    type: Date,
    required: true
  },
  lastUsed: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Error tracking
  lastError: String,
  errorCount: {
    type: Number,
    default: 0
  },
  lastSuccessfulUse: Date,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Encryption helpers
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  
  // Ensure key is exactly 32 bytes for AES-256
  if (key.length < 32) {
    return Buffer.from(key.padEnd(32, '0'), 'utf8');
  } else if (key.length > 32) {
    return Buffer.from(key.substring(0, 32), 'utf8');
  }
  
  return Buffer.from(key, 'utf8');
}

// Static method to create encrypted token
tokenSchema.statics.createWithToken = function(tokenData) {
  const { token, ...otherData } = tokenData;
  
  if (!token) {
    throw new Error('Token is required');
  }
  
  try {
    const algorithm = 'aes-256-cbc';
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return new this({
      ...otherData,
      encryptedToken: encrypted,
      iv: iv.toString('hex')
    });
  } catch (error) {
    console.error('Token encryption failed:', error);
    throw new Error(`Failed to encrypt token: ${error.message}`);
  }
};

// Method to decrypt token
tokenSchema.methods.getDecryptedToken = function() {
  if (!this.encryptedToken || !this.iv) {
    console.error('Missing encrypted token or IV');
    return null;
  }
  
  try {
    const algorithm = 'aes-256-cbc';
    const key = getEncryptionKey();
    const iv = Buffer.from(this.iv, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(this.encryptedToken, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Token decryption failed:', error);
    return null;
  }
};

// Mark token as used
tokenSchema.methods.markAsUsed = function() {
  this.lastUsed = new Date();
  this.lastSuccessfulUse = new Date();
  this.errorCount = 0;
  this.lastError = null;
  this.updatedAt = new Date();
  return this.save();
};

// Record error
tokenSchema.methods.recordError = function(errorMessage) {
  this.lastError = errorMessage;
  this.errorCount = (this.errorCount || 0) + 1;
  this.lastUsed = new Date();
  this.updatedAt = new Date();
  return this.save();
};

// Update timestamp before saving
tokenSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes
tokenSchema.index({ personName: 1, type: 1, isActive: 1 });
tokenSchema.index({ type: 1, isActive: 1, expiresAt: 1 });

// Unique index for active tokens
tokenSchema.index({ personName: 1, type: 1 }, { 
  unique: true,
  partialFilterExpression: { isActive: true }
});

module.exports = mongoose.model('Token', tokenSchema);