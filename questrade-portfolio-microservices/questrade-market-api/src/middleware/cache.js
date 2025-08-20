const NodeCache = require('node-cache');
const config = require('../config/environment');
const logger = require('../utils/logger');

class CacheMiddleware {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: config.cache.ttlSeconds,
      checkperiod: 60,
      useClones: false
    });
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  generateKey(req) {
    const parts = [
      req.method,
      req.originalUrl || req.url,
      JSON.stringify(req.query),
      JSON.stringify(req.body || {})
    ];
    
    return `cache:${parts.join('|')}`;
  }

  middleware = (req, res, next) => {
    // Skip cache for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip if cache is disabled
    if (!config.cache.enabled) {
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

  invalidatePattern(pattern) {
    const keys = this.cache.keys();
    const toDelete = keys.filter(key => key.includes(pattern));
    
    if (toDelete.length > 0) {
      this.cache.del(toDelete);
      logger.info(`Invalidated ${toDelete.length} cache entries matching ${pattern}`);
    }
  }

  flush() {
    this.cache.flushAll();
    logger.info('Cache flushed');
  }

  getStats() {
    const cacheStats = this.cache.getStats();
    
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      keys: cacheStats.keys,
      size: cacheStats.ksize + cacheStats.vsize
    };
  }
}

module.exports = new CacheMiddleware();