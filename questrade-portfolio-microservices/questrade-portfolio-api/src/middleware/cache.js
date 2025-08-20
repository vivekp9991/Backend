// src/middleware/cache.js
const NodeCache = require('node-cache');
const crypto = require('crypto');
const config = require('../config/environment');
const logger = require('../utils/logger');

class CacheMiddleware {
  constructor() {
    this.cache = null;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  initialize() {
    this.cache = new NodeCache({
      stdTTL: config.cache.ttlSeconds,
      checkperiod: 60,
      useClones: false
    });

    this.cache.on('set', (key, value) => {
      this.stats.sets++;
      logger.debug(`Cache set: ${key}`);
    });

    this.cache.on('del', (key, value) => {
      this.stats.deletes++;
      logger.debug(`Cache delete: ${key}`);
    });

    this.cache.on('expired', (key, value) => {
      logger.debug(`Cache expired: ${key}`);
    });
  }

  generateKey(req) {
    const parts = [
      req.method,
      req.originalUrl || req.url,
      JSON.stringify(req.query),
      JSON.stringify(req.body || {})
    ];
    
    const hash = crypto
      .createHash('md5')
      .update(parts.join('|'))
      .digest('hex');
    
    return `cache:${hash}`;
  }

  middleware = (req, res, next) => {
    // Skip cache for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip if cache is disabled
    if (!config.cache.enabled || !this.cache) {
      return next();
    }

    // Skip if no-cache header is present
    if (req.headers['cache-control'] === 'no-cache') {
      return next();
    }

    const key = this.generateKey(req);
    const cachedData = this.cache.get(key);

    if (cachedData) {
      this.stats.hits++;
      logger.debug(`Cache hit for ${req.url}`);
      
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', key);
      
      return res.json(cachedData);
    }

    this.stats.misses++;
    logger.debug(`Cache miss for ${req.url}`);

    // Store original send
    const originalSend = res.json;

    // Override res.json
    res.json = (data) => {
      // Only cache successful responses
      if (data && data.success) {
        const ttl = req.cacheTTL || config.cache.ttlSeconds;
        this.cache.set(key, data, ttl);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-TTL', ttl);
      }

      // Call original send
      res.json = originalSend;
      return res.json(data);
    };

    next();
  };

  get(key) {
    if (!this.cache) return null;
    return this.cache.get(key);
  }

  set(key, value, ttl = config.cache.ttlSeconds) {
    if (!this.cache) return false;
    return this.cache.set(key, value, ttl);
  }

  del(key) {
    if (!this.cache) return false;
    return this.cache.del(key);
  }

  flush() {
    if (!this.cache) return;
    this.cache.flushAll();
    logger.info('Cache flushed');
  }

  invalidatePattern(pattern) {
    if (!this.cache) return;
    
    const keys = this.cache.keys();
    const toDelete = keys.filter(key => key.includes(pattern));
    
    if (toDelete.length > 0) {
      this.cache.del(toDelete);
      logger.info(`Invalidated ${toDelete.length} cache entries matching ${pattern}`);
    }
  }

  invalidatePerson(personName) {
    this.invalidatePattern(personName);
  }

  getStats() {
    if (!this.cache) {
      return { enabled: false };
    }

    const cacheStats = this.cache.getStats();
    
    return {
      enabled: true,
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      keys: cacheStats.keys,
      size: cacheStats.ksize + cacheStats.vsize
    };
  }
}

module.exports = new CacheMiddleware();