/**
 * Cache System for Claude Code
 * LRU cache implementation and memoization utilities
 * Reconstructed from usage patterns
 */

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

/**
 * LRU Cache implementation
 */
export class LRUCache {
  constructor(maxSize = 100, ttl = 0) {
    this.maxSize = maxSize;
    this.ttl = ttl; // Time to live in milliseconds
    this.cache = new Map();
    this.accessOrder = [];
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {any} Cached value or undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }

    const entry = this.cache.get(key);

    // Check if expired
    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return undefined;
    }

    // Update access order
    this.updateAccessOrder(key);

    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @returns {LRUCache} This instance for chaining
   */
  set(key, value) {
    // Remove if exists to update position
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Check size limit
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    this.accessOrder.push(key);

    return this;
  }

  /**
   * Delete from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      return true;
    }
    return false;
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache size
   * @returns {number} Number of items in cache
   */
  size() {
    return this.cache.size;
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {boolean} True if exists and not expired
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    const entry = this.cache.get(key);
    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Update access order for LRU
   * @private
   */
  updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used item
   * @private
   */
  evictLRU() {
    if (this.accessOrder.length > 0) {
      const lru = this.accessOrder.shift();
      this.cache.delete(lru);
    }
  }

  /**
   * Get all keys
   * @returns {string[]} Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  stats() {
    const now = Date.now();
    let expired = 0;

    if (this.ttl > 0) {
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > this.ttl) {
          expired++;
        }
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      expired,
      utilization: (this.cache.size / this.maxSize) * 100
    };
  }
}

/**
 * Simple in-memory cache
 */
export class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    return this.store.get(key);
  }

  set(key, value) {
    this.store.set(key, value);
    return this;
  }

  has(key) {
    return this.store.has(key);
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  size() {
    return this.store.size;
  }
}

/**
 * Memoization decorator
 * @param {Function} fn - Function to memoize
 * @param {Object} options - Memoization options
 * @returns {Function} Memoized function
 */
export function memoize(fn, options = {}) {
  const {
    maxSize = 100,
    ttl = 0,
    keyGenerator = (...args) => JSON.stringify(args),
    cache = new LRUCache(maxSize, ttl)
  } = options;

  const memoized = function (...args) {
    const key = keyGenerator(...args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn.apply(this, args);

    // Handle promises
    if (result && typeof result.then === 'function') {
      return result.then(value => {
        cache.set(key, value);
        return value;
      }).catch(error => {
        // Don't cache errors
        throw error;
      });
    }

    cache.set(key, result);
    return result;
  };

  // Add cache control methods
  memoized.cache = cache;
  memoized.clear = () => cache.clear();
  memoized.delete = (key) => cache.delete(key);

  return memoized;
}

/**
 * Response cache for API calls
 */
export class ResponseCache {
  constructor(options = {}) {
    this.cache = new LRUCache(options.maxSize || 50, options.ttl || 900000); // 15 min default
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  /**
   * Generate cache key from request
   * @param {Object} request - Request object
   * @returns {string} Cache key
   */
  generateKey(request) {
    const { method = 'GET', url, params = {}, body = null } = request;
    return `${method}:${url}:${JSON.stringify(params)}:${JSON.stringify(body)}`;
  }

  /**
   * Get cached response
   * @param {Object} request - Request object
   * @returns {any} Cached response or undefined
   */
  get(request) {
    const key = this.generateKey(request);
    const cached = this.cache.get(key);

    if (cached) {
      this.stats.hits++;
      return cached;
    }

    this.stats.misses++;
    return undefined;
  }

  /**
   * Cache response
   * @param {Object} request - Request object
   * @param {any} response - Response to cache
   * @returns {ResponseCache} This instance
   */
  set(request, response) {
    const key = this.generateKey(request);
    this.cache.set(key, response);
    this.stats.sets++;
    return this;
  }

  /**
   * Invalidate cache entries by pattern
   * @param {RegExp|Function} pattern - Pattern to match keys
   * @returns {number} Number of entries invalidated
   */
  invalidate(pattern) {
    let count = 0;
    const keys = this.cache.keys();

    for (const key of keys) {
      const shouldInvalidate =
        pattern instanceof RegExp ? pattern.test(key) :
        typeof pattern === 'function' ? pattern(key) :
        false;

      if (shouldInvalidate) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const cacheStats = this.cache.stats();
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;

    return {
      ...cacheStats,
      ...this.stats,
      hitRate: hitRate.toFixed(2) + '%'
    };
  }

  /**
   * Clear cache and reset stats
   */
  clear() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }
}

/**
 * File system cache
 */
export class FileCache {
  constructor(cacheDir = '.cache') {
    this.cacheDir = cacheDir;
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   * @private
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get cache file path
   * @private
   */
  getCachePath(key) {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * Get from file cache
   * @param {string} key - Cache key
   * @returns {any} Cached value or undefined
   */
  get(key) {
    const filePath = this.getCachePath(key);

    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Check if expired
      if (data.ttl && Date.now() - data.timestamp > data.ttl) {
        fs.unlinkSync(filePath);
        return undefined;
      }

      return data.value;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Set in file cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in ms
   */
  set(key, value, ttl = 0) {
    const filePath = this.getCachePath(key);

    const data = {
      value,
      timestamp: Date.now(),
      ttl
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Failed to write cache: ${error}`);
    }
  }

  /**
   * Delete from file cache
   * @param {string} key - Cache key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    const filePath = this.getCachePath(key);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Clear entire file cache
   */
  clear() {

    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch (error) {
      console.error(`Failed to clear cache: ${error}`);
    }
  }
}

/**
 * Create a singleton cache instance
 */
let globalCache = null;

export function getGlobalCache() {
  if (!globalCache) {
    globalCache = new LRUCache(500, 600000); // 10 minutes TTL
  }
  return globalCache;
}

export default {
  LRUCache,
  MemoryCache,
  ResponseCache,
  FileCache,
  memoize,
  getGlobalCache
};