# 第 8.2 部分：内存管理策略 - Claude Code 技术系列

## 💾 引言：CLI 应用程序中的高效内存管理

内存管理对于 Claude Code 的性能至关重要，尤其是在处理大文件、流式 API 响应和管理多个并发操作时。系统实现了复杂的内存优化策略，以防止泄漏、最小化分配开销，并确保在不同工作负载和环境中实现高效的资源利用。

这一全面的实现展示了现代 Node.js CLI 应用程序如何通过仔细的缓冲区管理、对象池化和智能垃圾回收策略实现最佳内存使用。

## 🔄 循环缓冲区实现

### 核心 CircularBuffer 类

从恢复的 circular-buffer.js 中，实现了内存高效的基本缓冲区：

```javascript
/**
 * CircularBuffer 实现用于管理输出流
 * 固定大小的缓冲区，在满时自动删除最旧的项目
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
   * 一次向缓冲区添加多个项目
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
   * 向缓冲区添加单个项目
   * 如果缓冲区超过最大大小，则自动删除最旧的项目
   */
  add(item) {
    this.buffer.push(item);
    this.totalAdded++;

    // 如果缓冲区超过最大大小，则删除最旧的项目
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * 从缓冲区获取最近的 N 个项目
   */
  getRecent(count) {
    if (typeof count !== 'number' || count < 0) {
      throw new Error('Count must be a non-negative number');
    }

    // 返回最后 'count' 个项目，如果 count > 缓冲区长度则返回所有项目
    return this.buffer.slice(-count);
  }

  /**
   * 获取缓冲区中当前的所有项目
   */
  getAll() {
    return [...this.buffer];
  }

  /**
   * 检查缓冲区是否达到最大容量
   */
  isFull() {
    return this.buffer.length === this.maxSize;
  }

  /**
   * 获取曾经添加的项目总数（包括已删除的）
   */
  getTotalAdded() {
    return this.totalAdded;
  }
}
```

### 带内存跟踪的增强循环缓冲区

```javascript
class MemoryAwareCircularBuffer extends CircularBuffer {
  constructor(maxSize, maxMemoryMB = 100) {
    super(maxSize);
    this.maxMemory = maxMemoryMB * 1024 * 1024; // 转换为字节
    this.currentMemory = 0;
    this.itemSizes = new Map();
  }

  /**
   * 带内存跟踪的添加项目
   */
  add(item) {
    const itemSize = this.calculateSize(item);

    // 检查添加是否会超过内存限制
    while (this.currentMemory + itemSize > this.maxMemory && this.buffer.length > 0) {
      this.removeOldest();
    }

    // 添加到缓冲区
    super.add(item);

    // 跟踪内存使用
    const itemId = this.buffer.length - 1;
    this.itemSizes.set(itemId, itemSize);
    this.currentMemory += itemSize;
  }

  /**
   * 带内存跟踪的删除最旧项目
   */
  removeOldest() {
    if (this.buffer.length === 0) return;

    const removed = this.buffer.shift();
    const removedSize = this.itemSizes.get(0) || 0;

    // 更新内存跟踪
    this.currentMemory -= removedSize;

    // 移位所有大小映射
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
   * 计算项目的近似大小
   */
  calculateSize(item) {
    if (typeof item === 'string') {
      return item.length * 2; // Unicode 字符可以是 2 字节
    } else if (Buffer.isBuffer(item)) {
      return item.length;
    } else if (typeof item === 'object') {
      return JSON.stringify(item).length * 2;
    } else {
      return 8; // 原始类型的默认大小
    }
  }

  /**
   * 获取内存使用统计
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

## 🏊 对象池化

### 通用对象池实现

```javascript
class ObjectPool {
  constructor(factory, reset, options = {}) {
    this.factory = factory;  // 创建新对象的函数
    this.reset = reset;      // 重置对象以供重用的函数
    this.pool = [];
    this.inUse = new Set();

    this.maxSize = options.maxSize || 100;
    this.minSize = options.minSize || 10;
    this.growthRate = options.growthRate || 10;

    // 统计数据
    this.stats = {
      created: 0,
      borrowed: 0,
      returned: 0,
      recycled: 0
    };

    // 预填充池
    this.initialize();
  }

  /**
   * 使用最小对象初始化池
   */
  initialize() {
    for (let i = 0; i < this.minSize; i++) {
      const obj = this.factory();
      this.pool.push(obj);
      this.stats.created++;
    }
  }

  /**
   * 从池中借用对象
   */
  acquire() {
    let obj;

    if (this.pool.length > 0) {
      // 重用现有对象
      obj = this.pool.pop();
      this.stats.recycled++;
    } else if (this.inUse.size < this.maxSize) {
      // 如果在限制内则创建新对象
      obj = this.factory();
      this.stats.created++;
    } else {
      // 池已耗尽
      throw new Error('Object pool exhausted');
    }

    this.inUse.add(obj);
    this.stats.borrowed++;

    return obj;
  }

  /**
   * 将对象返回到池
   */
  release(obj) {
    if (!this.inUse.has(obj)) {
      throw new Error('Object not from this pool');
    }

    // 重置对象以供重用
    this.reset(obj);

    // 返回到池
    this.inUse.delete(obj);
    this.pool.push(obj);
    this.stats.returned++;
  }

  /**
   * 自动管理对象生命周期
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
   * 将池缩小到最小大小
   */
  shrink() {
    while (this.pool.length > this.minSize) {
      this.pool.pop();
    }
  }

  /**
   * 获取池统计数据
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

// 示例：用于文件操作的缓冲池
const bufferPool = new ObjectPool(
  () => Buffer.allocUnsafe(64 * 1024), // 64KB 缓冲区
  (buffer) => buffer.fill(0),           // 返回时清除缓冲区
  { maxSize: 50, minSize: 5 }
);
```

### 专用缓冲池

```javascript
class BufferPool {
  constructor() {
    this.pools = new Map(); // 大小 -> ObjectPool
    this.commonSizes = [
      1024,        // 1KB
      4096,        // 4KB
      16384,       // 16KB
      65536,       // 64KB
      262144,      // 256KB
      1048576      // 1MB
    ];

    // 为常见大小初始化池
    this.initializePools();
  }

  /**
   * 为常见缓冲区大小初始化池
   */
  initializePools() {
    for (const size of this.commonSizes) {
      this.pools.set(size, new ObjectPool(
        () => Buffer.allocUnsafe(size),
        (buffer) => buffer.fill(0),
        {
          maxSize: Math.max(10, Math.floor(100000 / size)), // 与大小成反比
          minSize: 2
        }
      ));
    }
  }

  /**
   * 获取指定大小的缓冲区
   */
  acquire(size) {
    // 找到适合的最小缓冲区
    const poolSize = this.commonSizes.find(s => s >= size);

    if (poolSize && this.pools.has(poolSize)) {
      const buffer = this.pools.get(poolSize).acquire();
      // 如果缓冲区大于所需，则返回切片
      return size < poolSize ? buffer.slice(0, size) : buffer;
    }

    // 对于不寻常的大小，回退到直接分配
    return Buffer.allocUnsafe(size);
  }

  /**
   * 将缓冲区返回到池
   */
  release(buffer) {
    const size = buffer.length;
    const poolSize = this.commonSizes.find(s => s === size);

    if (poolSize && this.pools.has(poolSize)) {
      this.pools.get(poolSize).release(buffer);
    }
    // 否则，让 GC 处理
  }

  /**
   * 获取池统计数据
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

## 🗑️ 垃圾回收优化

### GC 监控和调优

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
   * 设置 GC 监控
   */
  setupMonitoring() {
    try {
      // 如果可用，使用性能观察器
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
   * 记录 GC 事件
   */
  recordGC(gcInfo) {
    this.gcStats.count++;
    this.gcStats.totalDuration += gcInfo.duration;
    this.gcStats.lastGC = gcInfo;

    // 按类型跟踪
    const typeName = this.getGCTypeName(gcInfo.type);
    if (!this.gcStats.types[typeName]) {
      this.gcStats.types[typeName] = {
        count: 0,
        totalDuration: 0
      };
    }

    this.gcStats.types[typeName].count++;
    this.gcStats.types[typeName].totalDuration += gcInfo.duration;

    // 如果 GC 时间过长则发出警告
    if (gcInfo.duration > 100) {
      console.warn(`Long GC pause detected: ${gcInfo.duration.toFixed(2)}ms (${typeName})`);
    }
  }

  /**
   * 获取 GC 类型名称
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
   * 强制垃圾回收（如果可用）
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
   * 获取 GC 统计数据
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
   * 优化 GC 设置
   */
  optimizeGCSettings() {
    // 根据可用内存调整堆大小限制
    const totalMemory = require('os').totalmem();
    const maxHeap = Math.min(4096, Math.floor(totalMemory / 1024 / 1024 * 0.75));

    // 设置 V8 标志以进行优化
    const v8 = require('v8');

    // 为大型应用程序增加老年代空间大小
    v8.setFlagsFromString(`--max-old-space-size=${maxHeap}`);

    // 优化吞吐量与延迟
    if (process.env.OPTIMIZE_FOR_THROUGHPUT) {
      v8.setFlagsFromString('--optimize-for-size=false');
      v8.setFlagsFromString('--gc-interval=100');
    } else {
      // 优化更低的延迟（默认）
      v8.setFlagsFromString('--optimize-for-size=true');
      v8.setFlagsFromString('--gc-global');
    }

    console.log(`GC optimized: max heap ${maxHeap}MB`);
  }
}
```

## 🔍 内存泄漏检测

### 内存泄漏检测器

```javascript
class MemoryLeakDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 100; // MB
    this.checkInterval = options.checkInterval || 60000; // 1 分钟
    this.samples = [];
    this.maxSamples = options.maxSamples || 60;
    this.leakDetected = false;

    this.startMonitoring();
  }

  /**
   * 开始监控内存泄漏
   */
  startMonitoring() {
    this.interval = setInterval(() => {
      this.checkMemory();
    }, this.checkInterval);

    // 初始样本
    this.checkMemory();
  }

  /**
   * 检查内存使用
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

    // 只保留最近的样本
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // 分析泄漏
    this.analyzeForLeaks();
  }

  /**
   * 分析样本中的内存泄漏模式
   */
  analyzeForLeaks() {
    if (this.samples.length < 10) return;

    // 在堆使用上计算线性回归
    const regression = this.calculateRegression(
      this.samples.map(s => s.timestamp),
      this.samples.map(s => s.heapUsed)
    );

    // 检查内存是否持续增长
    const growthRateMBPerHour = regression.slope * 3600000; // 转换为 MB/小时

    if (growthRateMBPerHour > 50) {
      // 检测到显著增长
      if (!this.leakDetected) {
        this.leakDetected = true;
        this.onLeakDetected({
          growthRate: growthRateMBPerHour,
          currentHeap: this.samples[this.samples.length - 1].heapUsed,
          samples: this.samples.slice(-10)
        });
      }
    } else if (growthRateMBPerHour < 10) {
      // 增长稳定
      this.leakDetected = false;
    }
  }

  /**
   * 计算线性回归
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
   * 处理泄漏检测
   */
  onLeakDetected(info) {
    console.error('⚠️  Memory leak detected!');
    console.error(`  Growth rate: ${info.growthRate.toFixed(2)} MB/hour`);
    console.error(`  Current heap: ${info.currentHeap.toFixed(2)} MB`);

    // 如果可能，进行堆快照
    this.takeHeapSnapshot();

    // 可选：强制 GC 看是否有帮助
    if (global.gc) {
      console.log('  Forcing garbage collection...');
      global.gc();
    }
  }

  /**
   * 进行堆快照以供分析
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
   * 停止监控
   */
  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * 获取内存趋势分析
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

## 🎯 流内存管理

### 高效的流缓冲区管理

```javascript
class StreamBufferManager {
  constructor(options = {}) {
    this.highWaterMark = options.highWaterMark || 16384; // 默认 16KB
    this.bufferPool = new BufferPool();
    this.activeStreams = new Map();
  }

  /**
   * 创建具有优化缓冲的托管流
   */
  createManagedStream(streamId, options = {}) {
    const { Transform } = require('stream');

    const stream = new Transform({
      highWaterMark: this.highWaterMark,

      transform: (chunk, encoding, callback) => {
        // 使用池化缓冲区处理块
        const buffer = this.bufferPool.acquire(chunk.length);

        try {
          chunk.copy(buffer);

          // 处理缓冲区
          this.processBuffer(buffer, streamId);

          callback(null, buffer);
        } catch (error) {
          callback(error);
        } finally {
          // 将缓冲区返回到池
          this.bufferPool.release(buffer);
        }
      }
    });

    // 跟踪流
    this.activeStreams.set(streamId, {
      stream,
      bytesProcessed: 0,
      startTime: Date.now()
    });

    // 在流结束时清理
    stream.on('end', () => {
      this.activeStreams.delete(streamId);
    });

    return stream;
  }

  /**
   * 带内存跟踪的处理缓冲区
   */
  processBuffer(buffer, streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    if (streamInfo) {
      streamInfo.bytesProcessed += buffer.length;
    }
  }

  /**
   * 获取流统计数据
   */
  getStreamStats(streamId) {
    const info = this.activeStreams.get(streamId);
    if (!info) return null;

    const duration = Date.now() - info.startTime;
    const throughput = info.bytesProcessed / (duration / 1000); // 字节/秒

    return {
      bytesProcessed: info.bytesProcessed,
      duration,
      throughput: (throughput / 1024 / 1024).toFixed(2) + ' MB/s'
    };
  }

  /**
   * 根据性能优化高水位线
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

    // 计算平均吞吐量
    const avgThroughput = stats.reduce((sum, s) =>
      sum + parseFloat(s.throughput), 0
    ) / stats.length;

    // 根据吞吐量调整高水位线
    if (avgThroughput > 10) {
      // 高吞吐量 - 增加缓冲区大小
      this.highWaterMark = Math.min(this.highWaterMark * 2, 1048576); // 最大 1MB
    } else if (avgThroughput < 1) {
      // 低吞吐量 - 减少缓冲区大小
      this.highWaterMark = Math.max(this.highWaterMark / 2, 4096); // 最小 4KB
    }
  }
}
```

## 💪 内存高效的数据结构

### 用于字符串存储的 Trie

```javascript
class MemoryEfficientTrie {
  constructor() {
    this.root = Object.create(null);
    this.count = 0;
  }

  /**
   * 将字符串插入 trie
   */
  insert(str) {
    let node = this.root;

    for (const char of str) {
      if (!node[char]) {
        node[char] = Object.create(null);
      }
      node = node[char];
    }

    node.$ = true; // 结束标记
    this.count++;
  }

  /**
   * 检查字符串是否存在
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
   * 查找具有前缀的所有字符串
   */
  findWithPrefix(prefix) {
    let node = this.root;

    // 导航到前缀节点
    for (const char of prefix) {
      if (!node[char]) return [];
      node = node[char];
    }

    // 从此节点收集所有字符串
    const results = [];
    this.collectStrings(node, prefix, results);

    return results;
  }

  /**
   * 递归收集字符串
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
   * 计算内存使用
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

    // 近似内存使用
    const objectOverhead = 40; // 每个对象的字节数
    const stringOverhead = 2; // 每个字符的字节数

    return {
      nodeCount,
      totalChars,
      estimatedBytes: (nodeCount * objectOverhead) + (totalChars * stringOverhead),
      stringsStored: this.count
    };
  }
}
```

### 压缩字符串缓存

```javascript
class CompressedStringCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.compressionThreshold = options.compressionThreshold || 1024; // 压缩 > 1KB 的字符串
    this.cache = new Map();
    this.lru = [];

    const zlib = require('zlib');
    this.compress = zlib.gzipSync;
    this.decompress = zlib.gunzipSync;
  }

  /**
   * 在缓存中设置值
   */
  set(key, value) {
    // 检查是否应该压缩
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

    // 如果需要，LRU 淘汰
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.updateLRU(key);
  }

  /**
   * 从缓存获取值
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 更新访问统计
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.updateLRU(key);

    // 如果需要则解压缩
    return entry.compressed
      ? this.decompress(entry.data).toString()
      : entry.data;
  }

  /**
   * 更新 LRU 顺序
   */
  updateLRU(key) {
    const index = this.lru.indexOf(key);
    if (index > -1) {
      this.lru.splice(index, 1);
    }
    this.lru.push(key);
  }

  /**
   * 淘汰最近最少使用的项目
   */
  evictLRU() {
    if (this.lru.length > 0) {
      const key = this.lru.shift();
      this.cache.delete(key);
    }
  }

  /**
   * 获取缓存统计数据
   */
  getStats() {
    let totalSize = 0;
    let compressedCount = 0;
    let totalOriginalSize = 0;

    for (const entry of this.cache.values()) {
      totalSize += entry.size;
      if (entry.compressed) {
        compressedCount++;
        // 估计原始大小（文本压缩比通常为 5-10 倍）
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

## 🚀 实际使用示例

### 完整的内存管理系统

```javascript
class MemoryManagementSystem {
  constructor() {
    // 初始化组件
    this.circularBuffer = new MemoryAwareCircularBuffer(10000, 50); // 10K 项目，50MB 最大
    this.bufferPool = new BufferPool();
    this.gcMonitor = new GarbageCollectionMonitor();
    this.leakDetector = new MemoryLeakDetector();
    this.streamManager = new StreamBufferManager();
    this.stringCache = new CompressedStringCache();

    // 设置监控
    this.setupMonitoring();
  }

  /**
   * 设置全面监控
   */
  setupMonitoring() {
    // 启动时优化 GC 设置
    this.gcMonitor.optimizeGCSettings();

    // 监控内存压力
    setInterval(() => {
      this.checkMemoryPressure();
    }, 30000);

    // 定期清理
    setInterval(() => {
      this.performCleanup();
    }, 300000); // 每 5 分钟
  }

  /**
   * 检查内存压力并采取行动
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
   * 执行常规清理
   */
  performCleanup() {
    // 收缩对象池
    const poolStats = this.bufferPool.getStats();
    for (const [size, stats] of Object.entries(poolStats)) {
      if (stats.available > stats.inUse * 2) {
        // 空闲缓冲区太多
        console.log(`Shrinking ${size} buffer pool`);
      }
    }

    // 清除旧的循环缓冲区项目
    if (this.circularBuffer.isFull()) {
      const memStats = this.circularBuffer.getMemoryStats();
      console.log('Circular buffer memory:', memStats);
    }

    // 如果可用则强制 GC
    const gcResult = this.gcMonitor.forceGC();
    if (gcResult) {
      console.log('Manual GC freed:',
        (gcResult.freed.heapUsed / 1024 / 1024).toFixed(2) + 'MB');
    }
  }

  /**
   * 内存压力下的紧急清理
   */
  emergencyCleanup() {
    console.warn('Emergency memory cleanup initiated');

    // 清除缓存
    this.stringCache.cache.clear();

    // 清除循环缓冲区
    this.circularBuffer.clear();

    // 将所有池收缩到最小值
    const poolStats = this.bufferPool.getStats();
    for (const [, pool] of this.bufferPool.pools) {
      pool.shrink();
    }

    // 强制激进的 GC
    if (global.gc) {
      global.gc();
      global.gc(); // 运行两次以进行彻底清理
    }

    // 检查结果
    const after = process.memoryUsage();
    console.log('Memory after cleanup:', {
      heapUsed: (after.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
      heapTotal: (after.heapTotal / 1024 / 1024).toFixed(2) + 'MB'
    });
  }

  /**
   * 获取全面的内存报告
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

## 📊 总结

Claude Code 中的内存管理策略为高效内存使用提供了全面的解决方案。主要成果包括：

1. **循环缓冲区实现**：具有自动溢出处理的内存感知循环缓冲区
2. **对象池化**：用于缓冲区重用的通用和专用对象池
3. **GC 优化**：监控、调优和智能垃圾回收管理
4. **内存泄漏检测**：具有堆快照功能的主动泄漏检测
5. **流缓冲区管理**：使用池化缓冲区的优化流处理
6. **内存高效的数据结构**：Trie 和压缩缓存实现
7. **内存压力管理**：自动清理和紧急响应系统
8. **全面监控**：完整的内存跟踪和报告功能

该实现展示了 CLI 应用程序如何通过仔细的资源管理、智能缓存和主动监控实现最佳内存使用。这些策略确保 Claude Code 在高效处理大规模操作的同时保持低内存占用。

---

*下一篇 8.3 部分：缓存和优化技术 - 深入探讨多级缓存、延迟加载和性能优化模式。*