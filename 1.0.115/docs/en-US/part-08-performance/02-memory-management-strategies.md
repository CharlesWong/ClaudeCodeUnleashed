# Part 8.2: Memory Management Strategies - Claude Code Technical Series

## 💾 Introduction: Efficient Memory Management in CLI Applications

Memory management is crucial for Claude Code's performance, especially when handling large files, streaming API responses, and managing multiple concurrent operations. The system implements sophisticated memory optimization strategies to prevent leaks, minimize allocation overhead, and ensure efficient resource utilization across different workloads and environments.

This comprehensive implementation demonstrates how modern Node.js CLI applications can achieve optimal memory usage through careful buffer management, object pooling, and intelligent garbage collection strategies.

## 🔄 Circular Buffer Implementation

### Core CircularBuffer Class

From the recovered circular-buffer.js, the fundamental memory-efficient buffer:

```javascript
/**
 * CircularBuffer implementation for managing output streams
 * Fixed-size buffer that automatically removes oldest items when full
 */
class CircularBuffer {
  constructor(maxSize) {
    if (typeof maxSize !== 'number' || maxSize <= 0) {
      throw new Error('CircularBuffer size must be a positive number');
    }

    this.buffer = [];
    this.maxSize = maxSize;
    this.totalAdded = 0;
  }

  /**
   * Add multiple items to the buffer at once
   */
  addAll(items) {
    if (!Array.isArray(items)) {
      throw new TypeError('Items must be an array');
    }

    for (const item of items) {
      this.add(item);
    }
  }

  /**
   * Add a single item to the buffer
   * Automatically removes oldest items if buffer exceeds max size
   */
  add(item) {
    this.buffer.push(item);
    this.totalAdded++;

    // Remove oldest items if buffer exceeds max size
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get the most recent N items from the buffer
   */
  getRecent(count) {
    if (typeof count !== 'number' || count < 0) {
      throw new Error('Count must be a non-negative number');
    }

    // Return last 'count' items, or all items if count > buffer length
    return this.buffer.slice(-count);
  }

  /**
   * Get all items currently in the buffer
   */
  getAll() {
    return [...this.buffer];
  }

  /**
   * Check if the buffer is at maximum capacity
   */
  isFull() {
    return this.buffer.length === this.maxSize;
  }

  /**
   * Get total number of items ever added (including removed ones)
   */
  getTotalAdded() {
    return this.totalAdded;
  }
}
```

### Enhanced Circular Buffer with Memory Tracking

```javascript
class MemoryAwareCircularBuffer extends CircularBuffer {
  constructor(maxSize, maxMemoryMB = 100) {
    super(maxSize);
    this.maxMemory = maxMemoryMB * 1024 * 1024; // Convert to bytes
    this.currentMemory = 0;
    this.itemSizes = new Map();
  }

  /**
   * Add item with memory tracking
   */
  add(item) {
    const itemSize = this.calculateSize(item);

    // Check if adding would exceed memory limit
    while (this.currentMemory + itemSize > this.maxMemory && this.buffer.length > 0) {
      this.removeOldest();
    }

    // Add to buffer
    super.add(item);

    // Track memory usage
    const itemId = this.buffer.length - 1;
    this.itemSizes.set(itemId, itemSize);
    this.currentMemory += itemSize;
  }

  /**
   * Remove oldest item with memory tracking
   */
  removeOldest() {
    if (this.buffer.length === 0) return;

    const removed = this.buffer.shift();
    const removedSize = this.itemSizes.get(0) || 0;

    // Update memory tracking
    this.currentMemory -= removedSize;

    // Shift all size mappings
    const newSizes = new Map();
    for (const [id, size] of this.itemSizes) {
      if (id > 0) {
        newSizes.set(id - 1, size);
      }
    }
    this.itemSizes = newSizes;

    return removed;
  }

  /**
   * Calculate approximate size of an item
   */
  calculateSize(item) {
    if (typeof item === 'string') {
      return item.length * 2; // Unicode characters can be 2 bytes
    } else if (Buffer.isBuffer(item)) {
      return item.length;
    } else if (typeof item === 'object') {
      return JSON.stringify(item).length * 2;
    } else {
      return 8; // Default size for primitives
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    return {
      currentMemory: this.currentMemory,
      maxMemory: this.maxMemory,
      utilization: (this.currentMemory / this.maxMemory * 100).toFixed(2) + '%',
      itemCount: this.buffer.length,
      averageItemSize: this.buffer.length > 0
        ? Math.round(this.currentMemory / this.buffer.length)
        : 0
    };
  }
}
```

## 🏊 Object Pooling

### Generic Object Pool Implementation

```javascript
class ObjectPool {
  constructor(factory, reset, options = {}) {
    this.factory = factory;  // Function to create new objects
    this.reset = reset;      // Function to reset objects for reuse
    this.pool = [];
    this.inUse = new Set();

    this.maxSize = options.maxSize || 100;
    this.minSize = options.minSize || 10;
    this.growthRate = options.growthRate || 10;

    // Statistics
    this.stats = {
      created: 0,
      borrowed: 0,
      returned: 0,
      recycled: 0
    };

    // Pre-populate pool
    this.initialize();
  }

  /**
   * Initialize pool with minimum objects
   */
  initialize() {
    for (let i = 0; i < this.minSize; i++) {
      const obj = this.factory();
      this.pool.push(obj);
      this.stats.created++;
    }
  }

  /**
   * Borrow an object from the pool
   */
  acquire() {
    let obj;

    if (this.pool.length > 0) {
      // Reuse existing object
      obj = this.pool.pop();
      this.stats.recycled++;
    } else if (this.inUse.size < this.maxSize) {
      // Create new object if under limit
      obj = this.factory();
      this.stats.created++;
    } else {
      // Pool exhausted
      throw new Error('Object pool exhausted');
    }

    this.inUse.add(obj);
    this.stats.borrowed++;

    return obj;
  }

  /**
   * Return an object to the pool
   */
  release(obj) {
    if (!this.inUse.has(obj)) {
      throw new Error('Object not from this pool');
    }

    // Reset object for reuse
    this.reset(obj);

    // Return to pool
    this.inUse.delete(obj);
    this.pool.push(obj);
    this.stats.returned++;
  }

  /**
   * Automatically manage object lifecycle
   */
  async use(fn) {
    const obj = this.acquire();

    try {
      return await fn(obj);
    } finally {
      this.release(obj);
    }
  }

  /**
   * Shrink pool to minimum size
   */
  shrink() {
    while (this.pool.length > this.minSize) {
      this.pool.pop();
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.length,
      inUse: this.inUse.size,
      available: this.pool.length,
      totalObjects: this.pool.length + this.inUse.size
    };
  }
}

// Example: Buffer pool for file operations
const bufferPool = new ObjectPool(
  () => Buffer.allocUnsafe(64 * 1024), // 64KB buffers
  (buffer) => buffer.fill(0),           // Clear buffer on return
  { maxSize: 50, minSize: 5 }
);
```

### Specialized Buffer Pool

```javascript
class BufferPool {
  constructor() {
    this.pools = new Map(); // Size -> ObjectPool
    this.commonSizes = [
      1024,        // 1KB
      4096,        // 4KB
      16384,       // 16KB
      65536,       // 64KB
      262144,      // 256KB
      1048576      // 1MB
    ];

    // Initialize pools for common sizes
    this.initializePools();
  }

  /**
   * Initialize pools for common buffer sizes
   */
  initializePools() {
    for (const size of this.commonSizes) {
      this.pools.set(size, new ObjectPool(
        () => Buffer.allocUnsafe(size),
        (buffer) => buffer.fill(0),
        {
          maxSize: Math.max(10, Math.floor(100000 / size)), // Inversely proportional to size
          minSize: 2
        }
      ));
    }
  }

  /**
   * Get a buffer of specified size
   */
  acquire(size) {
    // Find the smallest buffer that fits
    const poolSize = this.commonSizes.find(s => s >= size);

    if (poolSize && this.pools.has(poolSize)) {
      const buffer = this.pools.get(poolSize).acquire();
      // Return a slice if the buffer is larger than needed
      return size < poolSize ? buffer.slice(0, size) : buffer;
    }

    // Fallback to direct allocation for unusual sizes
    return Buffer.allocUnsafe(size);
  }

  /**
   * Return a buffer to the pool
   */
  release(buffer) {
    const size = buffer.length;
    const poolSize = this.commonSizes.find(s => s === size);

    if (poolSize && this.pools.has(poolSize)) {
      this.pools.get(poolSize).release(buffer);
    }
    // Otherwise, let GC handle it
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const stats = {};

    for (const [size, pool] of this.pools) {
      stats[`${size}B`] = pool.getStats();
    }

    return stats;
  }
}
```

## 🗑️ Garbage Collection Optimization

### GC Monitor and Tuning

```javascript
class GarbageCollectionMonitor {
  constructor() {
    this.gcStats = {
      count: 0,
      totalDuration: 0,
      types: {},
      lastGC: null
    };

    this.setupMonitoring();
  }

  /**
   * Setup GC monitoring
   */
  setupMonitoring() {
    try {
      // Use performance observer if available
      const { PerformanceObserver, performance } = require('perf_hooks');

      const obs = new PerformanceObserver((list) => {
        const entries = list.getEntries();

        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            this.recordGC({
              type: entry.kind,
              duration: entry.duration,
              timestamp: Date.now()
            });
          }
        }
      });

      obs.observe({ entryTypes: ['gc'], buffered: false });

    } catch (error) {
      console.log('GC monitoring not available');
    }
  }

  /**
   * Record GC event
   */
  recordGC(gcInfo) {
    this.gcStats.count++;
    this.gcStats.totalDuration += gcInfo.duration;
    this.gcStats.lastGC = gcInfo;

    // Track by type
    const typeName = this.getGCTypeName(gcInfo.type);
    if (!this.gcStats.types[typeName]) {
      this.gcStats.types[typeName] = {
        count: 0,
        totalDuration: 0
      };
    }

    this.gcStats.types[typeName].count++;
    this.gcStats.types[typeName].totalDuration += gcInfo.duration;

    // Warn if GC is taking too long
    if (gcInfo.duration > 100) {
      console.warn(`Long GC pause detected: ${gcInfo.duration.toFixed(2)}ms (${typeName})`);
    }
  }

  /**
   * Get GC type name
   */
  getGCTypeName(type) {
    const types = {
      1: 'Scavenge',
      2: 'MarkSweepCompact',
      4: 'IncrementalMarking',
      8: 'ProcessWeakCallbacks',
      15: 'All'
    };

    return types[type] || `Unknown(${type})`;
  }

  /**
   * Force garbage collection (if available)
   */
  forceGC() {
    if (global.gc) {
      const before = process.memoryUsage();
      const start = Date.now();

      global.gc();

      const after = process.memoryUsage();
      const duration = Date.now() - start;

      return {
        duration,
        freed: {
          heapUsed: before.heapUsed - after.heapUsed,
          external: before.external - after.external
        }
      };
    }

    return null;
  }

  /**
   * Get GC statistics
   */
  getStats() {
    return {
      ...this.gcStats,
      averageDuration: this.gcStats.count > 0
        ? this.gcStats.totalDuration / this.gcStats.count
        : 0
    };
  }

  /**
   * Optimize GC settings
   */
  optimizeGCSettings() {
    // Adjust heap size limits based on available memory
    const totalMemory = require('os').totalmem();
    const maxHeap = Math.min(4096, Math.floor(totalMemory / 1024 / 1024 * 0.75));

    // Set V8 flags for optimization
    const v8 = require('v8');

    // Increase old space size for large applications
    v8.setFlagsFromString(`--max-old-space-size=${maxHeap}`);

    // Optimize for throughput vs latency
    if (process.env.OPTIMIZE_FOR_THROUGHPUT) {
      v8.setFlagsFromString('--optimize-for-size=false');
      v8.setFlagsFromString('--gc-interval=100');
    } else {
      // Optimize for lower latency (default)
      v8.setFlagsFromString('--optimize-for-size=true');
      v8.setFlagsFromString('--gc-global');
    }

    console.log(`GC optimized: max heap ${maxHeap}MB`);
  }
}
```

## 🔍 Memory Leak Detection

### Memory Leak Detector

```javascript
class MemoryLeakDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 100; // MB
    this.checkInterval = options.checkInterval || 60000; // 1 minute
    this.samples = [];
    this.maxSamples = options.maxSamples || 60;
    this.leakDetected = false;

    this.startMonitoring();
  }

  /**
   * Start monitoring for memory leaks
   */
  startMonitoring() {
    this.interval = setInterval(() => {
      this.checkMemory();
    }, this.checkInterval);

    // Initial sample
    this.checkMemory();
  }

  /**
   * Check memory usage
   */
  checkMemory() {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;

    const sample = {
      timestamp: Date.now(),
      heapUsed: heapUsedMB,
      rss: usage.rss / 1024 / 1024,
      external: usage.external / 1024 / 1024,
      arrayBuffers: usage.arrayBuffers / 1024 / 1024
    };

    this.samples.push(sample);

    // Keep only recent samples
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // Analyze for leaks
    this.analyzeForLeaks();
  }

  /**
   * Analyze samples for memory leak patterns
   */
  analyzeForLeaks() {
    if (this.samples.length < 10) return;

    // Calculate linear regression on heap usage
    const regression = this.calculateRegression(
      this.samples.map(s => s.timestamp),
      this.samples.map(s => s.heapUsed)
    );

    // Check if memory is consistently growing
    const growthRateMBPerHour = regression.slope * 3600000; // Convert to MB/hour

    if (growthRateMBPerHour > 50) {
      // Significant growth detected
      if (!this.leakDetected) {
        this.leakDetected = true;
        this.onLeakDetected({
          growthRate: growthRateMBPerHour,
          currentHeap: this.samples[this.samples.length - 1].heapUsed,
          samples: this.samples.slice(-10)
        });
      }
    } else if (growthRateMBPerHour < 10) {
      // Growth stabilized
      this.leakDetected = false;
    }
  }

  /**
   * Calculate linear regression
   */
  calculateRegression(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Handle leak detection
   */
  onLeakDetected(info) {
    console.error('⚠️  Memory leak detected!');
    console.error(`  Growth rate: ${info.growthRate.toFixed(2)} MB/hour`);
    console.error(`  Current heap: ${info.currentHeap.toFixed(2)} MB`);

    // Take heap snapshot if possible
    this.takeHeapSnapshot();

    // Optional: Force GC to see if it helps
    if (global.gc) {
      console.log('  Forcing garbage collection...');
      global.gc();
    }
  }

  /**
   * Take heap snapshot for analysis
   */
  async takeHeapSnapshot() {
    try {
      const v8 = require('v8');
      const fs = require('fs').promises;

      const filename = `heapdump-${Date.now()}.heapsnapshot`;
      const stream = v8.getHeapSnapshot();

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      await fs.writeFile(filename, Buffer.concat(chunks));
      console.log(`  Heap snapshot saved: ${filename}`);

    } catch (error) {
      console.error('  Failed to take heap snapshot:', error.message);
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Get memory trend analysis
   */
  getMemoryTrend() {
    if (this.samples.length < 2) {
      return { trend: 'insufficient data' };
    }

    const recent = this.samples.slice(-10);
    const older = this.samples.slice(0, 10);

    const recentAvg = recent.reduce((sum, s) => sum + s.heapUsed, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.heapUsed, 0) / older.length;

    const change = recentAvg - olderAvg;
    const changePercent = (change / olderAvg) * 100;

    return {
      trend: change > 0 ? 'increasing' : 'decreasing',
      changePercent: changePercent.toFixed(2),
      recentAverage: recentAvg.toFixed(2),
      olderAverage: olderAvg.toFixed(2)
    };
  }
}
```

## 🎯 Stream Memory Management

### Efficient Stream Buffer Management

```javascript
class StreamBufferManager {
  constructor(options = {}) {
    this.highWaterMark = options.highWaterMark || 16384; // 16KB default
    this.bufferPool = new BufferPool();
    this.activeStreams = new Map();
  }

  /**
   * Create a managed stream with optimized buffering
   */
  createManagedStream(streamId, options = {}) {
    const { Transform } = require('stream');

    const stream = new Transform({
      highWaterMark: this.highWaterMark,

      transform: (chunk, encoding, callback) => {
        // Process chunk with pooled buffers
        const buffer = this.bufferPool.acquire(chunk.length);

        try {
          chunk.copy(buffer);

          // Process buffer
          this.processBuffer(buffer, streamId);

          callback(null, buffer);
        } catch (error) {
          callback(error);
        } finally {
          // Return buffer to pool
          this.bufferPool.release(buffer);
        }
      }
    });

    // Track stream
    this.activeStreams.set(streamId, {
      stream,
      bytesProcessed: 0,
      startTime: Date.now()
    });

    // Clean up on stream end
    stream.on('end', () => {
      this.activeStreams.delete(streamId);
    });

    return stream;
  }

  /**
   * Process buffer with memory tracking
   */
  processBuffer(buffer, streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    if (streamInfo) {
      streamInfo.bytesProcessed += buffer.length;
    }
  }

  /**
   * Get stream statistics
   */
  getStreamStats(streamId) {
    const info = this.activeStreams.get(streamId);
    if (!info) return null;

    const duration = Date.now() - info.startTime;
    const throughput = info.bytesProcessed / (duration / 1000); // bytes/sec

    return {
      bytesProcessed: info.bytesProcessed,
      duration,
      throughput: (throughput / 1024 / 1024).toFixed(2) + ' MB/s'
    };
  }

  /**
   * Optimize high water marks based on performance
   */
  optimizeWaterMarks() {
    const stats = [];

    for (const [id, info] of this.activeStreams) {
      const streamStats = this.getStreamStats(id);
      if (streamStats) {
        stats.push(streamStats);
      }
    }

    if (stats.length === 0) return;

    // Calculate average throughput
    const avgThroughput = stats.reduce((sum, s) =>
      sum + parseFloat(s.throughput), 0
    ) / stats.length;

    // Adjust high water mark based on throughput
    if (avgThroughput > 10) {
      // High throughput - increase buffer size
      this.highWaterMark = Math.min(this.highWaterMark * 2, 1048576); // Max 1MB
    } else if (avgThroughput < 1) {
      // Low throughput - decrease buffer size
      this.highWaterMark = Math.max(this.highWaterMark / 2, 4096); // Min 4KB
    }
  }
}
```

## 💪 Memory-Efficient Data Structures

### Trie for String Storage

```javascript
class MemoryEfficientTrie {
  constructor() {
    this.root = Object.create(null);
    this.count = 0;
  }

  /**
   * Insert a string into the trie
   */
  insert(str) {
    let node = this.root;

    for (const char of str) {
      if (!node[char]) {
        node[char] = Object.create(null);
      }
      node = node[char];
    }

    node.$ = true; // End marker
    this.count++;
  }

  /**
   * Check if string exists
   */
  has(str) {
    let node = this.root;

    for (const char of str) {
      if (!node[char]) return false;
      node = node[char];
    }

    return node.$ === true;
  }

  /**
   * Find all strings with prefix
   */
  findWithPrefix(prefix) {
    let node = this.root;

    // Navigate to prefix node
    for (const char of prefix) {
      if (!node[char]) return [];
      node = node[char];
    }

    // Collect all strings from this node
    const results = [];
    this.collectStrings(node, prefix, results);

    return results;
  }

  /**
   * Recursively collect strings
   */
  collectStrings(node, prefix, results) {
    if (node.$ === true) {
      results.push(prefix);
    }

    for (const char in node) {
      if (char !== '$') {
        this.collectStrings(node[char], prefix + char, results);
      }
    }
  }

  /**
   * Calculate memory usage
   */
  getMemoryUsage() {
    let nodeCount = 0;
    let totalChars = 0;

    const traverse = (node) => {
      nodeCount++;
      for (const char in node) {
        if (char !== '$') {
          totalChars++;
          traverse(node[char]);
        }
      }
    };

    traverse(this.root);

    // Approximate memory usage
    const objectOverhead = 40; // bytes per object
    const stringOverhead = 2; // bytes per character

    return {
      nodeCount,
      totalChars,
      estimatedBytes: (nodeCount * objectOverhead) + (totalChars * stringOverhead),
      stringsStored: this.count
    };
  }
}
```

### Compressed String Cache

```javascript
class CompressedStringCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.compressionThreshold = options.compressionThreshold || 1024; // Compress strings > 1KB
    this.cache = new Map();
    this.lru = [];

    const zlib = require('zlib');
    this.compress = zlib.gzipSync;
    this.decompress = zlib.gunzipSync;
  }

  /**
   * Set a value in cache
   */
  set(key, value) {
    // Check if should compress
    const shouldCompress = value.length > this.compressionThreshold;

    const entry = {
      compressed: shouldCompress,
      data: shouldCompress
        ? this.compress(value)
        : value,
      size: shouldCompress
        ? this.compress(value).length
        : value.length,
      accessCount: 0,
      lastAccess: Date.now()
    };

    // LRU eviction if needed
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.updateLRU(key);
  }

  /**
   * Get a value from cache
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Update access stats
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.updateLRU(key);

    // Decompress if needed
    return entry.compressed
      ? this.decompress(entry.data).toString()
      : entry.data;
  }

  /**
   * Update LRU order
   */
  updateLRU(key) {
    const index = this.lru.indexOf(key);
    if (index > -1) {
      this.lru.splice(index, 1);
    }
    this.lru.push(key);
  }

  /**
   * Evict least recently used item
   */
  evictLRU() {
    if (this.lru.length > 0) {
      const key = this.lru.shift();
      this.cache.delete(key);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalSize = 0;
    let compressedCount = 0;
    let totalOriginalSize = 0;

    for (const entry of this.cache.values()) {
      totalSize += entry.size;
      if (entry.compressed) {
        compressedCount++;
        // Estimate original size (compression ratio typically 5-10x for text)
        totalOriginalSize += entry.size * 7;
      } else {
        totalOriginalSize += entry.size;
      }
    }

    return {
      entries: this.cache.size,
      compressedEntries: compressedCount,
      totalSizeBytes: totalSize,
      estimatedOriginalSize: totalOriginalSize,
      compressionRatio: totalOriginalSize > 0
        ? (totalOriginalSize / totalSize).toFixed(2)
        : 1,
      memorySavedMB: ((totalOriginalSize - totalSize) / 1024 / 1024).toFixed(2)
    };
  }
}
```

## 🚀 Real-World Usage Examples

### Complete Memory Management System

```javascript
class MemoryManagementSystem {
  constructor() {
    // Initialize components
    this.circularBuffer = new MemoryAwareCircularBuffer(10000, 50); // 10K items, 50MB max
    this.bufferPool = new BufferPool();
    this.gcMonitor = new GarbageCollectionMonitor();
    this.leakDetector = new MemoryLeakDetector();
    this.streamManager = new StreamBufferManager();
    this.stringCache = new CompressedStringCache();

    // Setup monitoring
    this.setupMonitoring();
  }

  /**
   * Setup comprehensive monitoring
   */
  setupMonitoring() {
    // Optimize GC settings on startup
    this.gcMonitor.optimizeGCSettings();

    // Monitor memory pressure
    setInterval(() => {
      this.checkMemoryPressure();
    }, 30000);

    // Periodic cleanup
    setInterval(() => {
      this.performCleanup();
    }, 300000); // Every 5 minutes
  }

  /**
   * Check memory pressure and take action
   */
  checkMemoryPressure() {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

    if (heapUsedPercent > 90) {
      console.warn('High memory pressure detected:', heapUsedPercent.toFixed(2) + '%');
      this.emergencyCleanup();
    } else if (heapUsedPercent > 75) {
      this.performCleanup();
    }
  }

  /**
   * Perform regular cleanup
   */
  performCleanup() {
    // Shrink object pools
    const poolStats = this.bufferPool.getStats();
    for (const [size, stats] of Object.entries(poolStats)) {
      if (stats.available > stats.inUse * 2) {
        // Too many idle buffers
        console.log(`Shrinking ${size} buffer pool`);
      }
    }

    // Clear old circular buffer items
    if (this.circularBuffer.isFull()) {
      const memStats = this.circularBuffer.getMemoryStats();
      console.log('Circular buffer memory:', memStats);
    }

    // Force GC if available
    const gcResult = this.gcMonitor.forceGC();
    if (gcResult) {
      console.log('Manual GC freed:',
        (gcResult.freed.heapUsed / 1024 / 1024).toFixed(2) + 'MB');
    }
  }

  /**
   * Emergency cleanup under memory pressure
   */
  emergencyCleanup() {
    console.warn('Emergency memory cleanup initiated');

    // Clear caches
    this.stringCache.cache.clear();

    // Clear circular buffer
    this.circularBuffer.clear();

    // Shrink all pools to minimum
    const poolStats = this.bufferPool.getStats();
    for (const [, pool] of this.bufferPool.pools) {
      pool.shrink();
    }

    // Force aggressive GC
    if (global.gc) {
      global.gc();
      global.gc(); // Run twice for thorough cleanup
    }

    // Check result
    const after = process.memoryUsage();
    console.log('Memory after cleanup:', {
      heapUsed: (after.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
      heapTotal: (after.heapTotal / 1024 / 1024).toFixed(2) + 'MB'
    });
  }

  /**
   * Get comprehensive memory report
   */
  getMemoryReport() {
    const usage = process.memoryUsage();

    return {
      process: {
        rss: (usage.rss / 1024 / 1024).toFixed(2) + 'MB',
        heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
        heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2) + 'MB',
        external: (usage.external / 1024 / 1024).toFixed(2) + 'MB',
        arrayBuffers: (usage.arrayBuffers / 1024 / 1024).toFixed(2) + 'MB'
      },
      gc: this.gcMonitor.getStats(),
      leakDetection: this.leakDetector.getMemoryTrend(),
      bufferPool: this.bufferPool.getStats(),
      circularBuffer: this.circularBuffer.getMemoryStats(),
      stringCache: this.stringCache.getStats()
    };
  }
}
```

## 📊 Summary

The Memory Management Strategies in Claude Code provide comprehensive solutions for efficient memory usage. Key achievements include:

1. **Circular Buffer Implementation**: Memory-aware circular buffers with automatic overflow handling
2. **Object Pooling**: Generic and specialized object pools for buffer reuse
3. **GC Optimization**: Monitoring, tuning, and intelligent garbage collection management
4. **Memory Leak Detection**: Proactive leak detection with heap snapshot capabilities
5. **Stream Buffer Management**: Optimized stream processing with pooled buffers
6. **Memory-Efficient Data Structures**: Trie and compressed cache implementations
7. **Memory Pressure Management**: Automatic cleanup and emergency response systems
8. **Comprehensive Monitoring**: Full memory tracking and reporting capabilities

The implementation demonstrates how CLI applications can achieve optimal memory usage through careful resource management, intelligent caching, and proactive monitoring. These strategies ensure Claude Code maintains low memory footprint while handling large-scale operations efficiently.

---

*Next in Part 8.3: Caching and Optimization Techniques - Deep dive into multi-level caching, lazy loading, and performance optimization patterns.*