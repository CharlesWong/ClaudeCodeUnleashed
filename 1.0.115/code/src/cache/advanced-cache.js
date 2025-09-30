/**
 * Claude Code Advanced Cache System
 *
 * Distributed cache with synchronization, invalidation strategies, and memory pressure handling.
 * Provides LRU eviction, TTL support, and multi-tier caching.
 *
 * Extracted from claude-code-full-extract.js (lines ~45000-45400)
 * Part of the 87% → 90% extraction phase
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Advanced Cache Manager
 * Multi-tier caching with distributed synchronization
 */
export class AdvancedCacheManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      maxSize: options.maxSize || 1000,
      maxMemory: options.maxMemory || 100 * 1024 * 1024, // 100MB
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes
      checkInterval: options.checkInterval || 60 * 1000, // 1 minute
      persistPath: options.persistPath || path.join(process.cwd(), '.cache'),
      compressionThreshold: options.compressionThreshold || 1024, // 1KB
      enableDistributed: options.enableDistributed || false
    };

    this.caches = {
      memory: new MemoryCache(this.config),
      disk: new DiskCache(this.config),
      distributed: this.config.enableDistributed ? new DistributedCache(this.config) : null
    };

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      writes: 0,
      memoryUsage: 0
    };

    this.setupMemoryMonitoring();
    this.setupEvictionStrategies();
  }

  /**
   * Set up memory pressure monitoring
   */
  setupMemoryMonitoring() {
    this.memoryMonitor = setInterval(() => {
      const usage = process.memoryUsage();
      this.stats.memoryUsage = usage.heapUsed;

      // Check memory pressure
      if (usage.heapUsed > this.config.maxMemory) {
        this.handleMemoryPressure();
      }
    }, this.config.checkInterval);
  }

  /**
   * Set up eviction strategies
   */
  setupEvictionStrategies() {
    this.evictionStrategies = new Map([
      ['lru', new LRUEvictionStrategy()],
      ['lfu', new LFUEvictionStrategy()],
      ['fifo', new FIFOEvictionStrategy()],
      ['random', new RandomEvictionStrategy()]
    ]);

    this.currentStrategy = this.evictionStrategies.get('lru');
  }

  /**
   * Get value from cache
   */
  async get(key, options = {}) {
    const cacheKey = this.generateKey(key);

    // Try memory cache first
    let value = await this.caches.memory.get(cacheKey);
    if (value !== undefined) {
      this.stats.hits++;
      this.emit('cache:hit', { key, tier: 'memory' });
      return value;
    }

    // Try disk cache
    value = await this.caches.disk.get(cacheKey);
    if (value !== undefined) {
      this.stats.hits++;
      this.emit('cache:hit', { key, tier: 'disk' });

      // Promote to memory cache
      if (options.promote !== false) {
        await this.caches.memory.set(cacheKey, value);
      }

      return value;
    }

    // Try distributed cache
    if (this.caches.distributed) {
      value = await this.caches.distributed.get(cacheKey);
      if (value !== undefined) {
        this.stats.hits++;
        this.emit('cache:hit', { key, tier: 'distributed' });

        // Promote to local caches
        if (options.promote !== false) {
          await this.caches.memory.set(cacheKey, value);
          await this.caches.disk.set(cacheKey, value);
        }

        return value;
      }
    }

    this.stats.misses++;
    this.emit('cache:miss', { key });
    return undefined;
  }

  /**
   * Set value in cache
   */
  async set(key, value, options = {}) {
    const cacheKey = this.generateKey(key);
    const ttl = options.ttl || this.config.ttl;

    this.stats.writes++;

    // Write to all cache tiers
    const promises = [
      this.caches.memory.set(cacheKey, value, ttl)
    ];

    if (options.persist !== false) {
      promises.push(this.caches.disk.set(cacheKey, value, ttl));
    }

    if (this.caches.distributed && options.distribute !== false) {
      promises.push(this.caches.distributed.set(cacheKey, value, ttl));
    }

    await Promise.all(promises);
    this.emit('cache:write', { key, size: this.getSize(value) });
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(pattern, options = {}) {
    const strategy = options.strategy || 'exact';
    const keys = await this.findKeys(pattern, strategy);

    for (const key of keys) {
      await this.delete(key);
    }

    this.emit('cache:invalidate', { pattern, count: keys.length });
    return keys.length;
  }

  /**
   * Delete cache entry
   */
  async delete(key) {
    const cacheKey = this.generateKey(key);

    const promises = [
      this.caches.memory.delete(cacheKey),
      this.caches.disk.delete(cacheKey)
    ];

    if (this.caches.distributed) {
      promises.push(this.caches.distributed.delete(cacheKey));
    }

    await Promise.all(promises);
    this.emit('cache:delete', { key });
  }

  /**
   * Clear all caches
   */
  async clear() {
    const promises = [
      this.caches.memory.clear(),
      this.caches.disk.clear()
    ];

    if (this.caches.distributed) {
      promises.push(this.caches.distributed.clear());
    }

    await Promise.all(promises);

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      writes: 0,
      memoryUsage: 0
    };

    this.emit('cache:clear');
  }

  /**
   * Handle memory pressure
   */
  async handleMemoryPressure() {
    this.emit('memory:pressure', { usage: this.stats.memoryUsage });

    // Evict items from memory cache
    const itemsToEvict = Math.ceil(this.caches.memory.size() * 0.3); // Evict 30%
    const evicted = await this.currentStrategy.evict(this.caches.memory, itemsToEvict);

    this.stats.evictions += evicted.length;
    this.emit('cache:evicted', { count: evicted.length });

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Generate cache key
   */
  generateKey(key) {
    if (typeof key === 'string') {
      return key;
    }

    const hash = createHash('sha256');
    hash.update(JSON.stringify(key));
    return hash.digest('hex');
  }

  /**
   * Find keys matching pattern
   */
  async findKeys(pattern, strategy) {
    const allKeys = new Set();

    // Gather keys from all tiers
    const memoryKeys = await this.caches.memory.keys();
    const diskKeys = await this.caches.disk.keys();

    memoryKeys.forEach(k => allKeys.add(k));
    diskKeys.forEach(k => allKeys.add(k));

    if (this.caches.distributed) {
      const distKeys = await this.caches.distributed.keys();
      distKeys.forEach(k => allKeys.add(k));
    }

    // Apply pattern matching strategy
    return Array.from(allKeys).filter(key => {
      switch (strategy) {
        case 'exact':
          return key === pattern;
        case 'prefix':
          return key.startsWith(pattern);
        case 'suffix':
          return key.endsWith(pattern);
        case 'contains':
          return key.includes(pattern);
        case 'regex':
          return new RegExp(pattern).test(key);
        default:
          return key === pattern;
      }
    });
  }

  /**
   * Get size of value
   */
  getSize(value) {
    if (Buffer.isBuffer(value)) {
      return value.length;
    }

    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return Buffer.byteLength(str);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;

    return {
      ...this.stats,
      hitRate: hitRate * 100,
      memorySize: this.caches.memory.size(),
      diskSize: this.caches.disk.size(),
      distributedSize: this.caches.distributed?.size() || 0
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
    }

    await this.clear();
  }
}

/**
 * Memory Cache Implementation
 */
export class MemoryCache {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.metadata = new Map();
  }

  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const meta = this.metadata.get(key);
    if (meta.expires && Date.now() > meta.expires) {
      this.delete(key);
      return undefined;
    }

    // Update access time for LRU
    meta.lastAccess = Date.now();
    meta.accessCount++;

    return entry;
  }

  async set(key, value, ttl) {
    this.cache.set(key, value);
    this.metadata.set(key, {
      created: Date.now(),
      lastAccess: Date.now(),
      accessCount: 1,
      expires: ttl ? Date.now() + ttl : null
    });

    // Check size limit
    if (this.cache.size > this.config.maxSize) {
      // Remove oldest entry (simple FIFO for now)
      const firstKey = this.cache.keys().next().value;
      this.delete(firstKey);
    }
  }

  async delete(key) {
    this.cache.delete(key);
    this.metadata.delete(key);
  }

  async clear() {
    this.cache.clear();
    this.metadata.clear();
  }

  async keys() {
    return Array.from(this.cache.keys());
  }

  size() {
    return this.cache.size;
  }

  getMetadata(key) {
    return this.metadata.get(key);
  }
}

/**
 * Disk Cache Implementation
 */
export class DiskCache {
  constructor(config) {
    this.config = config;
    this.cachePath = config.persistPath;
    this.index = new Map();
    this.initialize();
  }

  async initialize() {
    await fs.mkdir(this.cachePath, { recursive: true });
    await this.loadIndex();
  }

  async get(key) {
    const entry = this.index.get(key);
    if (!entry) return undefined;

    if (entry.expires && Date.now() > entry.expires) {
      await this.delete(key);
      return undefined;
    }

    try {
      const filePath = this.getFilePath(key);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return undefined;
    }
  }

  async set(key, value, ttl) {
    const filePath = this.getFilePath(key);
    const data = JSON.stringify(value);

    await fs.writeFile(filePath, data);

    this.index.set(key, {
      path: filePath,
      size: Buffer.byteLength(data),
      created: Date.now(),
      expires: ttl ? Date.now() + ttl : null
    });

    await this.saveIndex();
  }

  async delete(key) {
    const entry = this.index.get(key);
    if (!entry) return;

    try {
      await fs.unlink(entry.path);
    } catch (error) {
      // File may not exist
    }

    this.index.delete(key);
    await this.saveIndex();
  }

  async clear() {
    for (const [key] of this.index) {
      await this.delete(key);
    }

    this.index.clear();
    await this.saveIndex();
  }

  async keys() {
    return Array.from(this.index.keys());
  }

  size() {
    return this.index.size;
  }

  getFilePath(key) {
    return path.join(this.cachePath, `${key}.cache`);
  }

  async loadIndex() {
    try {
      const indexPath = path.join(this.cachePath, 'index.json');
      const data = await fs.readFile(indexPath, 'utf8');
      const index = JSON.parse(data);

      this.index = new Map(Object.entries(index));
    } catch (error) {
      // Index doesn't exist yet
    }
  }

  async saveIndex() {
    const indexPath = path.join(this.cachePath, 'index.json');
    const index = Object.fromEntries(this.index);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }
}

/**
 * Distributed Cache Implementation (stub)
 */
export class DistributedCache {
  constructor(config) {
    this.config = config;
    this.nodes = new Map();
  }

  async get(key) {
    // Would connect to distributed cache nodes
    return undefined;
  }

  async set(key, value, ttl) {
    // Would sync to distributed cache nodes
  }

  async delete(key) {
    // Would delete from distributed cache nodes
  }

  async clear() {
    // Would clear distributed cache nodes
  }

  async keys() {
    return [];
  }

  size() {
    return 0;
  }
}

/**
 * Eviction Strategies
 */
export class LRUEvictionStrategy {
  async evict(cache, count) {
    const entries = [];

    for (const key of cache.keys()) {
      const meta = cache.getMetadata(key);
      entries.push({ key, lastAccess: meta.lastAccess });
    }

    // Sort by least recently used
    entries.sort((a, b) => a.lastAccess - b.lastAccess);

    const toEvict = entries.slice(0, count);
    for (const { key } of toEvict) {
      await cache.delete(key);
    }

    return toEvict.map(e => e.key);
  }
}

export class LFUEvictionStrategy {
  async evict(cache, count) {
    const entries = [];

    for (const key of cache.keys()) {
      const meta = cache.getMetadata(key);
      entries.push({ key, accessCount: meta.accessCount });
    }

    // Sort by least frequently used
    entries.sort((a, b) => a.accessCount - b.accessCount);

    const toEvict = entries.slice(0, count);
    for (const { key } of toEvict) {
      await cache.delete(key);
    }

    return toEvict.map(e => e.key);
  }
}

export class FIFOEvictionStrategy {
  async evict(cache, count) {
    const entries = [];

    for (const key of cache.keys()) {
      const meta = cache.getMetadata(key);
      entries.push({ key, created: meta.created });
    }

    // Sort by creation time (oldest first)
    entries.sort((a, b) => a.created - b.created);

    const toEvict = entries.slice(0, count);
    for (const { key } of toEvict) {
      await cache.delete(key);
    }

    return toEvict.map(e => e.key);
  }
}

export class RandomEvictionStrategy {
  async evict(cache, count) {
    const keys = await cache.keys();
    const toEvict = [];

    for (let i = 0; i < Math.min(count, keys.length); i++) {
      const randomIndex = Math.floor(Math.random() * keys.length);
      const key = keys[randomIndex];
      await cache.delete(key);
      toEvict.push(key);
      keys.splice(randomIndex, 1);
    }

    return toEvict;
  }
}

// Export convenience functions
export function createAdvancedCache(options) {
  return new AdvancedCacheManager(options);
}

// Default cache instance
export const defaultCache = new AdvancedCacheManager();