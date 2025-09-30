# 第 8.3 部分：缓存和优化技术 - Claude Code 技术系列

## ⚡ 引言：高级缓存和性能优化

Claude Code 实现了复杂的缓存策略和优化技术，在最小化资源消耗的同时提供闪电般快速的响应。系统采用多级缓存、智能记忆化、延迟加载和大量微优化，共同创造了一个高性能的 CLI 体验。

这一全面的实现展示了现代 CLI 应用程序如何通过战略性缓存、高效算法和面向性能的设计模式实现近乎即时的响应。

## 🏗️ 多级缓存架构

### 分层缓存系统

```javascript
/**
 * 具有 LRU、TTL 和大小管理的多级缓存实现
 */
class MultiLevelCache {
  constructor(options = {}) {
    // L1：内存缓存（最快，最小）
    this.l1Cache = new Map();
    this.l1MaxSize = options.l1MaxSize || 100;
    this.l1TTL = options.l1TTL || 60000; // 1 分钟

    // L2：压缩内存缓存（中等速度，中等大小）
    this.l2Cache = new Map();
    this.l2MaxSize = options.l2MaxSize || 1000;
    this.l2TTL = options.l2TTL || 600000; // 10 分钟

    // L3：磁盘缓存（最慢，最大）
    this.l3Enabled = options.l3Enabled !== false;
    this.l3Path = options.l3Path || '.cache';
    this.l3MaxSize = options.l3MaxSize || 10000;
    this.l3TTL = options.l3TTL || 86400000; // 24 小时

    // 统计数据
    this.stats = {
      hits: { l1: 0, l2: 0, l3: 0 },
      misses: 0,
      sets: 0,
      evictions: { l1: 0, l2: 0, l3: 0 }
    };

    // 如果启用，初始化磁盘缓存
    if (this.l3Enabled) {
      this.initializeDiskCache();
    }
  }

  /**
   * 从缓存获取值（检查所有级别）
   */
  async get(key) {
    // 检查 L1 缓存
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && this.isValid(l1Entry, this.l1TTL)) {
      this.stats.hits.l1++;
      this.promoteTo(key, l1Entry.value, 1); // 刷新 L1
      return l1Entry.value;
    }

    // 检查 L2 缓存
    const l2Entry = this.l2Cache.get(key);
    if (l2Entry && this.isValid(l2Entry, this.l2TTL)) {
      this.stats.hits.l2++;
      const value = await this.decompress(l2Entry.value);
      this.promoteTo(key, value, 1); // 提升到 L1
      return value;
    }

    // 检查 L3 缓存（磁盘）
    if (this.l3Enabled) {
      const l3Value = await this.getFromDisk(key);
      if (l3Value) {
        this.stats.hits.l3++;
        this.promoteTo(key, l3Value, 1); // 提升到 L1
        this.promoteTo(key, l3Value, 2); // 提升到 L2
        return l3Value;
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * 在缓存中设置值（通过级别传播）
   */
  async set(key, value, options = {}) {
    this.stats.sets++;

    const entry = {
      value,
      timestamp: Date.now(),
      size: this.calculateSize(value),
      accessCount: 0
    };

    // 设置在 L1
    this.setInL1(key, entry);

    // 设置在 L2（压缩）
    if (entry.size > 1024) { // 如果 > 1KB 则压缩
      const compressed = await this.compress(value);
      this.setInL2(key, { ...entry, value: compressed });
    }

    // 为大型或重要项目设置在 L3（磁盘）
    if (this.l3Enabled && (entry.size > 10240 || options.persistent)) {
      await this.setOnDisk(key, value);
    }
  }

  /**
   * 使用 LRU 淘汰在 L1 缓存中设置
   */
  setInL1(key, entry) {
    // 如果需要则淘汰
    if (this.l1Cache.size >= this.l1MaxSize) {
      const lruKey = this.findLRU(this.l1Cache);
      this.l1Cache.delete(lruKey);
      this.stats.evictions.l1++;

      // 降级到 L2
      const demoted = this.l1Cache.get(lruKey);
      if (demoted) {
        this.setInL2(lruKey, demoted);
      }
    }

    this.l1Cache.set(key, entry);
  }

  /**
   * 使用大小感知淘汰在 L2 缓存中设置
   */
  setInL2(key, entry) {
    // 基于大小淘汰
    let currentSize = this.getCurrentL2Size();

    while (currentSize + entry.size > this.l2MaxSize * 1024) { // 大小以 KB 为单位
      const evictKey = this.findLargest(this.l2Cache);
      this.l2Cache.delete(evictKey);
      this.stats.evictions.l2++;
      currentSize = this.getCurrentL2Size();
    }

    this.l2Cache.set(key, entry);
  }

  /**
   * 将值提升到更高的缓存级别
   */
  promoteTo(key, value, level) {
    const entry = {
      value,
      timestamp: Date.now(),
      size: this.calculateSize(value),
      accessCount: 1
    };

    switch (level) {
      case 1:
        this.setInL1(key, entry);
        break;
      case 2:
        this.setInL2(key, entry);
        break;
    }
  }

  /**
   * 检查缓存条目是否有效
   */
  isValid(entry, ttl) {
    return Date.now() - entry.timestamp < ttl;
  }

  /**
   * 在缓存中查找 LRU 键
   */
  findLRU(cache) {
    let lruKey = null;
    let lruTime = Infinity;

    for (const [key, entry] of cache) {
      if (entry.timestamp < lruTime) {
        lruTime = entry.timestamp;
        lruKey = key;
      }
    }

    return lruKey;
  }

  /**
   * 压缩 L2 存储的值
   */
  async compress(value) {
    const zlib = require('zlib');
    const input = typeof value === 'string' ? value : JSON.stringify(value);
    return zlib.gzipSync(input);
  }

  /**
   * 从 L2 解压缩值
   */
  async decompress(compressed) {
    const zlib = require('zlib');
    const decompressed = zlib.gunzipSync(compressed).toString();

    try {
      return JSON.parse(decompressed);
    } catch {
      return decompressed;
    }
  }

  /**
   * 获取缓存统计数据
   */
  getStats() {
    const totalHits = this.stats.hits.l1 + this.stats.hits.l2 + this.stats.hits.l3;
    const totalRequests = totalHits + this.stats.misses;

    return {
      ...this.stats,
      hitRate: totalRequests > 0 ? (totalHits / totalRequests * 100).toFixed(2) + '%' : '0%',
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size,
      l1HitRate: (this.stats.hits.l1 / totalRequests * 100).toFixed(2) + '%',
      l2HitRate: (this.stats.hits.l2 / totalRequests * 100).toFixed(2) + '%',
      l3HitRate: (this.stats.hits.l3 / totalRequests * 100).toFixed(2) + '%'
    };
  }
}
```

### 专用的 API 响应缓存

```javascript
class APIResponseCache extends MultiLevelCache {
  constructor(options = {}) {
    super({
      l1MaxSize: 50,      // 最近的响应
      l2MaxSize: 500,     // 压缩的旧响应
      l3Enabled: true,    // 持久化到磁盘
      ...options
    });

    this.requestFingerprints = new Map();
  }

  /**
   * 从 API 请求生成缓存键
   */
  generateCacheKey(method, endpoint, params = {}, headers = {}) {
    const fingerprint = {
      method,
      endpoint,
      params: this.normalizeParams(params),
      relevantHeaders: this.extractRelevantHeaders(headers)
    };

    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(fingerprint))
      .digest('hex');
  }

  /**
   * 标准化参数以实现一致的缓存
   */
  normalizeParams(params) {
    const sorted = {};
    Object.keys(params)
      .sort()
      .forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          sorted[key] = params[key];
        }
      });
    return sorted;
  }

  /**
   * 仅提取缓存相关的标头
   */
  extractRelevantHeaders(headers) {
    const relevant = ['authorization', 'accept', 'content-type'];
    const extracted = {};

    relevant.forEach(header => {
      if (headers[header]) {
        extracted[header] = headers[header];
      }
    });

    return extracted;
  }

  /**
   * 使用智能 TTL 缓存 API 响应
   */
  async cacheResponse(request, response) {
    const cacheKey = this.generateCacheKey(
      request.method,
      request.endpoint,
      request.params,
      request.headers
    );

    // 根据端点和响应确定 TTL
    const ttl = this.determineTTL(request, response);

    // 使用元数据存储
    const cacheEntry = {
      response,
      metadata: {
        cached: Date.now(),
        ttl,
        endpoint: request.endpoint,
        statusCode: response.statusCode,
        size: JSON.stringify(response).length
      }
    };

    await this.set(cacheKey, cacheEntry, {
      persistent: response.statusCode === 200 && ttl > 3600000
    });

    // 跟踪用于失效的指纹
    this.requestFingerprints.set(request.endpoint, cacheKey);
  }

  /**
   * 确定响应的适当 TTL
   */
  determineTTL(request, response) {
    // 错误响应 - 短 TTL
    if (response.statusCode >= 400) {
      return 60000; // 1 分钟
    }

    // 静态内容 - 长 TTL
    if (request.endpoint.includes('/static/') ||
        request.endpoint.includes('/assets/')) {
      return 86400000; // 24 小时
    }

    // 用户特定内容 - 中等 TTL
    if (request.endpoint.includes('/user/') ||
        request.headers.authorization) {
      return 300000; // 5 分钟
    }

    // 默认 TTL
    return 600000; // 10 分钟
  }

  /**
   * 使相关缓存条目失效
   */
  async invalidatePattern(pattern) {
    const invalidated = [];

    // 检查所有缓存级别
    for (const [key, entry] of this.l1Cache) {
      if (key.includes(pattern) || entry.value?.metadata?.endpoint?.includes(pattern)) {
        this.l1Cache.delete(key);
        invalidated.push(key);
      }
    }

    for (const [key, entry] of this.l2Cache) {
      if (key.includes(pattern)) {
        this.l2Cache.delete(key);
        invalidated.push(key);
      }
    }

    return invalidated;
  }
}
```

## 🧮 智能记忆化

### 使用 WeakMap 的高级记忆化

```javascript
class SmartMemoizer {
  constructor() {
    this.cache = new Map();
    this.weakCache = new WeakMap();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * 使用各种策略记忆化函数
   */
  memoize(fn, options = {}) {
    const {
      maxSize = 100,
      ttl = Infinity,
      keyGenerator = this.defaultKeyGenerator,
      weak = false,
      async = false
    } = options;

    const cache = weak ? this.weakCache : this.cache;

    if (async) {
      return this.memoizeAsync(fn, cache, options);
    }

    return (...args) => {
      const key = keyGenerator(args);

      if (cache.has(key)) {
        const cached = cache.get(key);

        if (!ttl || Date.now() - cached.timestamp < ttl) {
          this.stats.hits++;
          return cached.value;
        }

        cache.delete(key);
      }

      this.stats.misses++;
      const result = fn(...args);

      // 使用元数据存储
      cache.set(key, {
        value: result,
        timestamp: Date.now(),
        hitCount: 0
      });

      // Map 缓存的 LRU 淘汰
      if (!weak && cache.size > maxSize) {
        this.evictLRU(cache);
      }

      return result;
    };
  }

  /**
   * 记忆化异步函数
   */
  memoizeAsync(fn, cache, options) {
    const pendingCache = new Map();

    return async (...args) => {
      const key = options.keyGenerator(args);

      // 检查是否已在计算
      if (pendingCache.has(key)) {
        return pendingCache.get(key);
      }

      // 检查缓存
      if (cache.has(key)) {
        const cached = cache.get(key);

        if (!options.ttl || Date.now() - cached.timestamp < options.ttl) {
          this.stats.hits++;
          return cached.value;
        }

        cache.delete(key);
      }

      // 计算并缓存 promise
      this.stats.misses++;
      const promise = fn(...args);
      pendingCache.set(key, promise);

      try {
        const result = await promise;

        cache.set(key, {
          value: result,
          timestamp: Date.now(),
          hitCount: 0
        });

        return result;
      } finally {
        pendingCache.delete(key);
      }
    };
  }

  /**
   * 默认键生成器
   */
  defaultKeyGenerator(args) {
    return JSON.stringify(args);
  }

  /**
   * LRU 淘汰
   */
  evictLRU(cache) {
    let lruKey = null;
    let lruHits = Infinity;

    for (const [key, entry] of cache) {
      if (entry.hitCount < lruHits) {
        lruHits = entry.hitCount;
        lruKey = key;
      }
    }

    if (lruKey) {
      cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this.cache.clear();
    // WeakMap 无法清除
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * 获取记忆化统计数据
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;

    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      cacheSize: this.cache.size
    };
  }
}

// 使用示例
const memoizer = new SmartMemoizer();

const expensiveFunction = memoizer.memoize(
  (n) => {
    console.log(`Computing factorial(${n})`);
    return n <= 1 ? 1 : n * expensiveFunction(n - 1);
  },
  {
    maxSize: 20,
    ttl: 60000 // 缓存 1 分钟
  }
);
```

## 🚀 延迟加载和代码分割

### 动态导入管理器

```javascript
class LazyLoadManager {
  constructor() {
    this.modules = new Map();
    this.loading = new Map();
    this.preloaded = new Set();
    this.stats = {
      loaded: 0,
      cached: 0,
      preloaded: 0,
      loadTime: []
    };
  }

  /**
   * 延迟加载模块
   */
  async load(modulePath, options = {}) {
    // 检查缓存
    if (this.modules.has(modulePath)) {
      this.stats.cached++;
      return this.modules.get(modulePath);
    }

    // 检查是否已在加载
    if (this.loading.has(modulePath)) {
      return this.loading.get(modulePath);
    }

    // 开始加载
    const startTime = performance.now();
    const loadPromise = this.performLoad(modulePath, options);
    this.loading.set(modulePath, loadPromise);

    try {
      const module = await loadPromise;
      const loadTime = performance.now() - startTime;

      // 缓存已加载的模块
      this.modules.set(modulePath, module);
      this.stats.loaded++;
      this.stats.loadTime.push(loadTime);

      return module;
    } finally {
      this.loading.delete(modulePath);
    }
  }

  /**
   * 执行实际的模块加载
   */
  async performLoad(modulePath, options) {
    if (options.webpack) {
      // Webpack 动态导入
      return import(/* webpackChunkName: "[request]" */ modulePath);
    } else {
      // Node.js 动态导入
      return import(modulePath);
    }
  }

  /**
   * 预加载模块以供将来使用
   */
  async preload(modulePaths) {
    const promises = modulePaths.map(async (path) => {
      if (!this.preloaded.has(path)) {
        this.preloaded.add(path);
        this.stats.preloaded++;

        // 在后台加载
        return this.load(path, { priority: 'low' });
      }
    });

    await Promise.all(promises);
  }

  /**
   * 并行加载多个模块
   */
  async loadMany(modulePaths) {
    return Promise.all(
      modulePaths.map(path => this.load(path))
    );
  }

  /**
   * 有条件地加载模块
   */
  async loadIf(condition, modulePath) {
    if (condition) {
      return this.load(modulePath);
    }
    return null;
  }

  /**
   * 带回退的加载
   */
  async loadWithFallback(primaryPath, fallbackPath) {
    try {
      return await this.load(primaryPath);
    } catch (error) {
      console.warn(`Failed to load ${primaryPath}, using fallback`);
      return this.load(fallbackPath);
    }
  }

  /**
   * 获取加载统计数据
   */
  getStats() {
    const avgLoadTime = this.stats.loadTime.length > 0
      ? this.stats.loadTime.reduce((a, b) => a + b, 0) / this.stats.loadTime.length
      : 0;

    return {
      ...this.stats,
      averageLoadTime: avgLoadTime.toFixed(2) + 'ms',
      cacheHitRate: this.stats.cached / (this.stats.loaded + this.stats.cached) * 100 + '%'
    };
  }
}

// 使用
const lazyLoader = new LazyLoadManager();

// 仅在需要时延迟加载工具
const loadTool = async (toolName) => {
  const tool = await lazyLoader.load(`./tools/${toolName}.js`);
  return tool.default || tool;
};

// 预加载常用工具
lazyLoader.preload([
  './tools/read.js',
  './tools/write.js',
  './tools/bash.js'
]);
```

## 🔨 字符串优化技术

### 字符串内化池

```javascript
class StringInternPool {
  constructor() {
    this.pool = new Map();
    this.stats = {
      interned: 0,
      saved: 0,
      queries: 0
    };
  }

  /**
   * 内化字符串
   */
  intern(str) {
    this.stats.queries++;

    if (this.pool.has(str)) {
      this.stats.saved++;
      return this.pool.get(str);
    }

    // 在池中存储字符串
    const interned = String(str); // 确保它是字符串
    this.pool.set(str, interned);
    this.stats.interned++;

    return interned;
  }

  /**
   * 递归内化对象中的所有字符串
   */
  internObject(obj) {
    if (typeof obj === 'string') {
      return this.intern(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.internObject(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const interned = {};

      for (const [key, value] of Object.entries(obj)) {
        interned[this.intern(key)] = this.internObject(value);
      }

      return interned;
    }

    return obj;
  }

  /**
   * 获取内存节省估算
   */
  getMemorySavings() {
    let totalOriginalSize = 0;
    let totalInternedSize = 0;

    for (const [original, ] of this.pool) {
      totalOriginalSize += original.length * 2 * this.stats.saved; // Unicode 字符
      totalInternedSize += original.length * 2; // 仅存储一次
    }

    return {
      originalSizeKB: (totalOriginalSize / 1024).toFixed(2),
      internedSizeKB: (totalInternedSize / 1024).toFixed(2),
      savedKB: ((totalOriginalSize - totalInternedSize) / 1024).toFixed(2),
      ...this.stats
    };
  }
}

// 字符串构建优化
class StringBuilder {
  constructor(initialCapacity = 16) {
    this.chunks = [];
    this.length = 0;
  }

  append(str) {
    this.chunks.push(str);
    this.length += str.length;
    return this;
  }

  toString() {
    return this.chunks.join('');
  }

  clear() {
    this.chunks = [];
    this.length = 0;
  }
}
```

## 📦 请求批处理和防抖

### 智能请求批处理器

```javascript
class RequestBatcher {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 10;
    this.batchDelay = options.batchDelay || 100;
    this.maxWaitTime = options.maxWaitTime || 1000;

    this.queue = [];
    this.timer = null;
    this.firstRequestTime = null;
    this.processing = false;

    this.stats = {
      totalRequests: 0,
      batchesSent: 0,
      averageBatchSize: 0
    };
  }

  /**
   * 将请求添加到批次
   */
  async request(data) {
    return new Promise((resolve, reject) => {
      const request = {
        data,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(request);
      this.stats.totalRequests++;

      if (!this.firstRequestTime) {
        this.firstRequestTime = Date.now();
      }

      this.scheduleBatch();
    });
  }

  /**
   * 调度批处理
   */
  scheduleBatch() {
    // 清除现有计时器
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // 检查是否应立即发送
    const shouldSendNow =
      this.queue.length >= this.batchSize ||
      (this.firstRequestTime && Date.now() - this.firstRequestTime >= this.maxWaitTime);

    if (shouldSendNow && !this.processing) {
      this.processBatch();
    } else {
      // 调度批次
      this.timer = setTimeout(() => {
        this.processBatch();
      }, this.batchDelay);
    }
  }

  /**
   * 处理当前批次
   */
  async processBatch() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    this.firstRequestTime = null;

    // 提取批次
    const batch = this.queue.splice(0, this.batchSize);
    this.stats.batchesSent++;

    // 更新平均批大小
    this.stats.averageBatchSize =
      (this.stats.averageBatchSize * (this.stats.batchesSent - 1) + batch.length) /
      this.stats.batchesSent;

    try {
      // 发送批处理请求
      const results = await this.sendBatch(batch.map(r => r.data));

      // 解析单个 promise
      batch.forEach((request, index) => {
        request.resolve(results[index]);
      });
    } catch (error) {
      // 拒绝批次中的所有 promise
      batch.forEach(request => {
        request.reject(error);
      });
    } finally {
      this.processing = false;

      // 如果队列不为空，则处理下一批
      if (this.queue.length > 0) {
        this.scheduleBatch();
      }
    }
  }

  /**
   * 发送批处理请求（在子类中覆盖）
   */
  async sendBatch(items) {
    // 模拟批处理 API 调用
    const response = await fetch('/api/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: items })
    });

    return response.json();
  }

  /**
   * 获取批处理统计数据
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      efficiency: this.stats.averageBatchSize / this.batchSize * 100 + '%'
    };
  }
}

// 带前导和尾随选项的防抖器
class SmartDebouncer {
  constructor(fn, wait, options = {}) {
    this.fn = fn;
    this.wait = wait;
    this.leading = options.leading || false;
    this.trailing = options.trailing !== false;
    this.maxWait = options.maxWait;

    this.timeout = null;
    this.lastCallTime = null;
    this.lastInvokeTime = null;
  }

  debounced(...args) {
    const now = Date.now();

    if (!this.lastCallTime) {
      this.lastCallTime = now;

      if (this.leading) {
        this.invoke(args);
      }
    }

    // 清除现有超时
    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    // 检查最大等待
    if (this.maxWait && this.lastInvokeTime) {
      const timeSinceLastInvoke = now - this.lastInvokeTime;

      if (timeSinceLastInvoke >= this.maxWait) {
        this.invoke(args);
        return;
      }
    }

    // 调度尾随调用
    if (this.trailing) {
      this.timeout = setTimeout(() => {
        this.invoke(args);
        this.timeout = null;
        this.lastCallTime = null;
      }, this.wait);
    }
  }

  invoke(args) {
    this.lastInvokeTime = Date.now();
    this.fn.apply(this, args);
  }

  cancel() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    this.lastCallTime = null;
    this.lastInvokeTime = null;
  }

  flush() {
    if (this.timeout) {
      this.invoke([]);
      this.cancel();
    }
  }
}
```

## 🎯 查询优化

### 带失效的查询结果缓存

```javascript
class QueryOptimizer {
  constructor() {
    this.queryCache = new Map();
    this.queryPlans = new Map();
    this.indexes = new Map();
    this.stats = {
      queries: 0,
      cacheHits: 0,
      optimized: 0
    };
  }

  /**
   * 执行优化的查询
   */
  async executeQuery(query, params = {}) {
    this.stats.queries++;

    // 生成查询指纹
    const fingerprint = this.generateFingerprint(query, params);

    // 检查缓存
    if (this.queryCache.has(fingerprint)) {
      const cached = this.queryCache.get(fingerprint);

      if (this.isCacheValid(cached)) {
        this.stats.cacheHits++;
        return cached.result;
      }
    }

    // 优化查询
    const optimized = this.optimizeQuery(query, params);

    if (optimized !== query) {
      this.stats.optimized++;
    }

    // 执行查询
    const result = await this.performQuery(optimized, params);

    // 缓存结果
    this.queryCache.set(fingerprint, {
      result,
      timestamp: Date.now(),
      query: optimized,
      params
    });

    return result;
  }

  /**
   * 使用查询计划和索引优化查询
   */
  optimizeQuery(query, params) {
    // 检查现有查询计划
    const planKey = this.extractQueryPattern(query);

    if (this.queryPlans.has(planKey)) {
      return this.queryPlans.get(planKey);
    }

    let optimized = query;

    // 应用优化
    optimized = this.rewriteSubqueries(optimized);
    optimized = this.useIndexes(optimized, params);
    optimized = this.eliminateRedundant(optimized);

    // 缓存查询计划
    this.queryPlans.set(planKey, optimized);

    return optimized;
  }

  /**
   * 重写子查询以获得更好的性能
   */
  rewriteSubqueries(query) {
    // 将 IN 子查询转换为 JOIN
    query = query.replace(
      /WHERE\s+(\w+)\s+IN\s+\(SELECT\s+(.*?)\)/gi,
      'JOIN ($2) ON $1'
    );

    // 在可能的情况下将 EXISTS 转换为 JOIN
    query = query.replace(
      /WHERE\s+EXISTS\s+\(SELECT\s+\*\s+FROM\s+(\w+)\s+WHERE\s+(.*?)\)/gi,
      'JOIN $1 ON $2'
    );

    return query;
  }

  /**
   * 使用可用索引
   */
  useIndexes(query, params) {
    // 检查正在查询哪些字段
    const fields = this.extractFields(query);

    for (const field of fields) {
      if (this.indexes.has(field)) {
        const index = this.indexes.get(field);

        // 添加索引提示
        query = query.replace(
          new RegExp(`FROM\\s+(\\w+)`, 'i'),
          `FROM $1 USE INDEX (${index})`
        );
      }
    }

    return query;
  }

  /**
   * 为字段创建索引
   */
  createIndex(field, data) {
    const index = new Map();

    data.forEach((item, idx) => {
      const value = item[field];

      if (!index.has(value)) {
        index.set(value, []);
      }

      index.get(value).push(idx);
    });

    this.indexes.set(field, index);
  }

  /**
   * 使相关缓存条目失效
   */
  invalidateCache(pattern) {
    const invalidated = [];

    for (const [key, entry] of this.queryCache) {
      if (entry.query.includes(pattern)) {
        this.queryCache.delete(key);
        invalidated.push(key);
      }
    }

    return invalidated;
  }

  /**
   * 生成查询指纹
   */
  generateFingerprint(query, params) {
    const normalized = query.toLowerCase().replace(/\s+/g, ' ');
    return `${normalized}::${JSON.stringify(params)}`;
  }

  /**
   * 检查缓存条目是否有效
   */
  isCacheValid(entry) {
    const age = Date.now() - entry.timestamp;
    return age < 300000; // 5 分钟
  }
}
```

## 🚀 实际优化示例

### 完整的性能优化系统

```javascript
class PerformanceOptimizationSystem {
  constructor() {
    this.cache = new MultiLevelCache();
    this.memoizer = new SmartMemoizer();
    this.lazyLoader = new LazyLoadManager();
    this.batcher = new RequestBatcher();
    this.queryOptimizer = new QueryOptimizer();
    this.stringPool = new StringInternPool();

    this.initializeOptimizations();
  }

  /**
   * 初始化所有优化系统
   */
  initializeOptimizations() {
    // 预加载关键模块
    this.preloadCriticalModules();

    // 设置请求批处理
    this.setupBatching();

    // 初始化缓存
    this.warmupCaches();

    // 优化启动
    this.optimizeStartup();
  }

  /**
   * 预加载关键模块
   */
  async preloadCriticalModules() {
    const critical = [
      './tools/read.js',
      './tools/write.js',
      './tools/bash.js',
      './api/client.js'
    ];

    await this.lazyLoader.preload(critical);
  }

  /**
   * 使用常见数据预热缓存
   */
  async warmupCaches() {
    // 预加载常见的 API 响应
    const commonEndpoints = [
      '/api/user/profile',
      '/api/config',
      '/api/tools'
    ];

    for (const endpoint of commonEndpoints) {
      try {
        const response = await fetch(endpoint);
        const data = await response.json();

        await this.cache.set(endpoint, data, {
          persistent: true
        });
      } catch (error) {
        console.debug(`Failed to warm cache for ${endpoint}`);
      }
    }
  }

  /**
   * 优化启动性能
   */
  optimizeStartup() {
    // 延迟非关键初始化
    process.nextTick(() => {
      this.initializeNonCritical();
    });

    // 为后台任务设置空闲回调
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        this.performBackgroundOptimizations();
      });
    } else {
      setTimeout(() => {
        this.performBackgroundOptimizations();
      }, 1000);
    }
  }

  /**
   * 对函数应用优化
   */
  optimize(fn, options = {}) {
    let optimized = fn;

    // 应用记忆化
    if (options.memoize) {
      optimized = this.memoizer.memoize(optimized, options.memoize);
    }

    // 应用防抖
    if (options.debounce) {
      optimized = new SmartDebouncer(
        optimized,
        options.debounce.wait,
        options.debounce
      ).debounced.bind(this);
    }

    // 应用批处理
    if (options.batch) {
      const originalFn = optimized;
      optimized = async (...args) => {
        return this.batcher.request({
          fn: originalFn,
          args
        });
      };
    }

    return optimized;
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport() {
    return {
      cache: this.cache.getStats(),
      memoization: this.memoizer.getStats(),
      lazyLoading: this.lazyLoader.getStats(),
      batching: this.batcher.getStats(),
      queryOptimization: this.queryOptimizer.stats,
      stringInterning: this.stringPool.getMemorySavings()
    };
  }
}

// 使用
const perfSystem = new PerformanceOptimizationSystem();

// 优化昂贵的函数
const optimizedSearch = perfSystem.optimize(searchFunction, {
  memoize: {
    maxSize: 100,
    ttl: 60000
  },
  debounce: {
    wait: 300,
    leading: false,
    trailing: true
  }
});
```

## 📊 总结

Claude Code 中的缓存和优化技术提供了全面的性能增强。主要成果包括：

1. **多级缓存架构**：具有 L1/L2/L3 级别和智能提升的分层缓存
2. **智能记忆化**：具有 WeakMap 支持和异步处理的高级记忆化
3. **延迟加载系统**：具有预加载和回退支持的动态模块加载
4. **请求批处理**：具有大小和时间约束的智能批处理
5. **查询优化**：查询重写、缓存和索引利用
6. **字符串优化**：字符串内化和高效的字符串构建
7. **防抖策略**：具有前导/尾随和最大等待的智能防抖
8. **性能监控**：全面的统计和报告

该实现展示了 CLI 应用程序如何通过战略性缓存、智能优化和仔细的资源管理实现卓越的性能。这些技术确保 Claude Code 在保持低资源消耗的同时提供闪电般快速的响应。

---

*下一篇 8.4 部分：性能监控和指标 - 深入探讨实时性能监控、指标收集和性能分析。*