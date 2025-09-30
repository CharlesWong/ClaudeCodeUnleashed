/**
 * Claude Code Memory Management System
 *
 * Heap monitoring, garbage collection optimization, and memory leak detection.
 * Provides memory pressure handling and resource cleanup.
 *
 * Extracted from claude-code-full-extract.js (lines ~45750-46050)
 * Part of the 87% → 90% extraction phase
 */

import { EventEmitter } from 'events';
import v8 from 'v8';
import { performance } from 'perf_hooks';

/**
 * Memory Manager
 * Monitors and manages application memory usage
 */
export class MemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      maxHeapUsed: options.maxHeapUsed || 512 * 1024 * 1024, // 512MB
      maxRss: options.maxRss || 1024 * 1024 * 1024, // 1GB
      checkInterval: options.checkInterval || 30000, // 30 seconds
      gcThreshold: options.gcThreshold || 0.8, // 80% of max
      enableAutoGC: options.enableAutoGC !== false,
      enableLeakDetection: options.enableLeakDetection || false,
      leakGrowthThreshold: options.leakGrowthThreshold || 0.1, // 10% growth
      snapshotInterval: options.snapshotInterval || 5 * 60 * 1000 // 5 minutes
    };

    this.stats = {
      checks: 0,
      gcRuns: 0,
      leaksDetected: 0,
      pressureEvents: 0,
      lastCheck: null
    };

    this.history = [];
    this.snapshots = [];
    this.leakDetector = null;
    this.monitor = null;

    this.initialize();
  }

  /**
   * Initialize memory management
   */
  initialize() {
    if (this.config.enableAutoGC && global.gc) {
      // Expose GC if available
      this.setupGarbageCollection();
    }

    if (this.config.enableLeakDetection) {
      this.leakDetector = new LeakDetector(this.config);
    }

    this.startMonitoring();
  }

  /**
   * Start memory monitoring
   */
  startMonitoring() {
    if (this.monitor) {
      clearInterval(this.monitor);
    }

    this.monitor = setInterval(() => {
      this.checkMemory();
    }, this.config.checkInterval);

    // Initial check
    this.checkMemory();
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (this.monitor) {
      clearInterval(this.monitor);
      this.monitor = null;
    }
  }

  /**
   * Check memory usage
   */
  async checkMemory() {
    const usage = this.getMemoryUsage();
    this.stats.checks++;
    this.stats.lastCheck = Date.now();

    // Add to history
    this.history.push({
      timestamp: Date.now(),
      ...usage
    });

    // Keep only recent history
    if (this.history.length > 100) {
      this.history.shift();
    }

    // Check thresholds
    this.checkThresholds(usage);

    // Check for memory leaks
    if (this.config.enableLeakDetection && this.leakDetector) {
      const leaks = await this.leakDetector.check(usage, this.history);
      if (leaks.length > 0) {
        this.stats.leaksDetected += leaks.length;
        this.emit('leak:detected', leaks);
      }
    }

    this.emit('memory:checked', usage);
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers || 0,
      heapSizeLimit: heapStats.heap_size_limit,
      totalHeapSize: heapStats.total_heap_size,
      usedHeapSize: heapStats.used_heap_size,
      mallocedMemory: heapStats.malloced_memory,
      peakMallocedMemory: heapStats.peak_malloced_memory,
      heapUsedPercent: (memUsage.heapUsed / heapStats.heap_size_limit) * 100,
      rssPercent: (memUsage.rss / this.config.maxRss) * 100
    };
  }

  /**
   * Check memory thresholds
   */
  checkThresholds(usage) {
    const heapThreshold = usage.heapUsed / this.config.maxHeapUsed;
    const rssThreshold = usage.rss / this.config.maxRss;

    if (heapThreshold > this.config.gcThreshold) {
      this.handleMemoryPressure('heap', usage);
    }

    if (rssThreshold > this.config.gcThreshold) {
      this.handleMemoryPressure('rss', usage);
    }

    if (heapThreshold > 0.95 || rssThreshold > 0.95) {
      this.handleCriticalPressure(usage);
    }
  }

  /**
   * Handle memory pressure
   */
  handleMemoryPressure(type, usage) {
    this.stats.pressureEvents++;
    this.emit('memory:pressure', { type, usage });

    if (this.config.enableAutoGC && global.gc) {
      this.runGarbageCollection();
    }

    // Clear caches
    this.clearCaches();

    // Suggest optimizations
    const suggestions = this.getSuggestions(usage);
    this.emit('memory:suggestions', suggestions);
  }

  /**
   * Handle critical memory pressure
   */
  handleCriticalPressure(usage) {
    this.emit('memory:critical', usage);

    // Aggressive cleanup
    if (global.gc) {
      global.gc(true); // Force full GC
    }

    // Clear all caches
    this.clearAllCaches();

    // Drop non-essential resources
    this.dropNonEssentialResources();
  }

  /**
   * Run garbage collection
   */
  runGarbageCollection() {
    if (!global.gc) {
      return;
    }

    const before = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    global.gc();

    const after = process.memoryUsage().heapUsed;
    const duration = performance.now() - startTime;
    const freed = before - after;

    this.stats.gcRuns++;

    this.emit('gc:complete', {
      freed,
      duration,
      before,
      after
    });
  }

  /**
   * Setup garbage collection hooks
   */
  setupGarbageCollection() {
    // Monitor GC events if available
    if (performance.nodeTiming) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            this.emit('gc:event', {
              kind: entry.kind,
              duration: entry.duration
            });
          }
        }
      });

      observer.observe({ entryTypes: ['gc'] });
    }
  }

  /**
   * Clear caches
   */
  clearCaches() {
    this.emit('cache:clear:requested');

    // Clear module cache
    for (const key in require.cache) {
      if (key.includes('node_modules')) {
        delete require.cache[key];
      }
    }
  }

  /**
   * Clear all caches aggressively
   */
  clearAllCaches() {
    this.emit('cache:clear:all');

    // Clear all module cache
    for (const key in require.cache) {
      delete require.cache[key];
    }

    // Clear global caches
    if (global.__cache) {
      global.__cache.clear();
    }
  }

  /**
   * Drop non-essential resources
   */
  dropNonEssentialResources() {
    this.emit('resources:drop');

    // Drop old history
    this.history = this.history.slice(-10);

    // Clear old snapshots
    this.snapshots = this.snapshots.slice(-2);
  }

  /**
   * Take heap snapshot
   */
  async takeSnapshot() {
    const snapshot = v8.writeHeapSnapshot();

    this.snapshots.push({
      timestamp: Date.now(),
      snapshot,
      usage: this.getMemoryUsage()
    });

    // Keep only recent snapshots
    if (this.snapshots.length > 5) {
      this.snapshots.shift();
    }

    this.emit('snapshot:taken');
    return snapshot;
  }

  /**
   * Get optimization suggestions
   */
  getSuggestions(usage) {
    const suggestions = [];

    if (usage.heapUsedPercent > 80) {
      suggestions.push('Consider increasing Node.js heap size with --max-old-space-size');
    }

    if (usage.external > 100 * 1024 * 1024) {
      suggestions.push('High external memory usage detected. Check for unfreed buffers.');
    }

    if (usage.arrayBuffers > 50 * 1024 * 1024) {
      suggestions.push('Large ArrayBuffer usage. Consider using streams or chunking.');
    }

    if (this.isMemoryGrowing()) {
      suggestions.push('Memory is growing steadily. Possible memory leak.');
    }

    return suggestions;
  }

  /**
   * Check if memory is growing
   */
  isMemoryGrowing() {
    if (this.history.length < 10) {
      return false;
    }

    const recent = this.history.slice(-10);
    const firstHeap = recent[0].heapUsed;
    const lastHeap = recent[recent.length - 1].heapUsed;

    const growth = (lastHeap - firstHeap) / firstHeap;
    return growth > this.config.leakGrowthThreshold;
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const current = this.getMemoryUsage();
    const trend = this.getMemoryTrend();

    return {
      current,
      trend,
      stats: this.stats,
      history: this.history.slice(-20)
    };
  }

  /**
   * Get memory trend
   */
  getMemoryTrend() {
    if (this.history.length < 2) {
      return 'stable';
    }

    const recent = this.history.slice(-10);
    const avgRecent = recent.reduce((sum, h) => sum + h.heapUsed, 0) / recent.length;

    const older = this.history.slice(-20, -10);
    if (older.length === 0) {
      return 'stable';
    }

    const avgOlder = older.reduce((sum, h) => sum + h.heapUsed, 0) / older.length;

    const change = (avgRecent - avgOlder) / avgOlder;

    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.stopMonitoring();
    this.history = [];
    this.snapshots = [];
  }
}

/**
 * Leak Detector
 * Detects potential memory leaks
 */
export class LeakDetector {
  constructor(config) {
    this.config = config;
    this.suspects = new Map();
    this.patterns = [
      new GrowthPattern(),
      new RetentionPattern(),
      new AllocationPattern()
    ];
  }

  /**
   * Check for leaks
   */
  async check(usage, history) {
    const leaks = [];

    for (const pattern of this.patterns) {
      const detected = await pattern.detect(usage, history);
      if (detected) {
        leaks.push(detected);
      }
    }

    // Track suspects
    this.trackSuspects(leaks);

    return this.confirmLeaks();
  }

  /**
   * Track suspected leaks
   */
  trackSuspects(leaks) {
    for (const leak of leaks) {
      const key = leak.type;

      if (!this.suspects.has(key)) {
        this.suspects.set(key, {
          type: leak.type,
          count: 0,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          evidence: []
        });
      }

      const suspect = this.suspects.get(key);
      suspect.count++;
      suspect.lastSeen = Date.now();
      suspect.evidence.push(leak.evidence);
    }
  }

  /**
   * Confirm leaks based on persistence
   */
  confirmLeaks() {
    const confirmed = [];

    for (const [key, suspect] of this.suspects) {
      // Leak confirmed if seen multiple times over time
      if (suspect.count > 3 &&
          (Date.now() - suspect.firstSeen) > 60000) {
        confirmed.push({
          type: suspect.type,
          severity: this.calculateSeverity(suspect),
          evidence: suspect.evidence.slice(-5)
        });
      }
    }

    // Clean old suspects
    this.cleanOldSuspects();

    return confirmed;
  }

  /**
   * Calculate leak severity
   */
  calculateSeverity(suspect) {
    const duration = Date.now() - suspect.firstSeen;
    const frequency = suspect.count / (duration / 60000); // per minute

    if (frequency > 1) return 'critical';
    if (frequency > 0.5) return 'high';
    if (frequency > 0.1) return 'medium';
    return 'low';
  }

  /**
   * Clean old suspects
   */
  cleanOldSuspects() {
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 minutes

    for (const [key, suspect] of this.suspects) {
      if (suspect.lastSeen < cutoff) {
        this.suspects.delete(key);
      }
    }
  }
}

/**
 * Growth Pattern Detector
 */
class GrowthPattern {
  async detect(usage, history) {
    if (history.length < 10) {
      return null;
    }

    const recent = history.slice(-10);
    const heapGrowth = this.calculateGrowth(recent.map(h => h.heapUsed));

    if (heapGrowth > 0.1) { // 10% growth
      return {
        type: 'heap-growth',
        evidence: {
          growth: heapGrowth,
          samples: recent.length
        }
      };
    }

    return null;
  }

  calculateGrowth(values) {
    if (values.length < 2) return 0;

    const first = values[0];
    const last = values[values.length - 1];

    return (last - first) / first;
  }
}

/**
 * Retention Pattern Detector
 */
class RetentionPattern {
  async detect(usage, history) {
    // Check if memory isn't being released after GC
    const gcEvents = history.filter(h => h.gcMarker);

    if (gcEvents.length < 2) {
      return null;
    }

    const retentionRatio = usage.heapUsed / usage.heapTotal;

    if (retentionRatio > 0.9) {
      return {
        type: 'high-retention',
        evidence: {
          ratio: retentionRatio,
          heapUsed: usage.heapUsed,
          heapTotal: usage.heapTotal
        }
      };
    }

    return null;
  }
}

/**
 * Allocation Pattern Detector
 */
class AllocationPattern {
  async detect(usage, history) {
    if (!usage.mallocedMemory) {
      return null;
    }

    const mallocRatio = usage.mallocedMemory / usage.peakMallocedMemory;

    if (mallocRatio > 0.9 && usage.mallocedMemory > 100 * 1024 * 1024) {
      return {
        type: 'high-allocation',
        evidence: {
          malloced: usage.mallocedMemory,
          peak: usage.peakMallocedMemory,
          ratio: mallocRatio
        }
      };
    }

    return null;
  }
}

/**
 * Memory Profiler
 * Profiles memory allocations
 */
export class MemoryProfiler {
  constructor() {
    this.profiles = [];
    this.sampling = false;
  }

  /**
   * Start profiling
   */
  start() {
    if (this.sampling) {
      return;
    }

    this.sampling = true;
    this.startTime = Date.now();
    this.initialMemory = process.memoryUsage();

    // Start heap profiling if available
    if (v8.startupSnapshot) {
      v8.startupSnapshot.setDeserializeMainFunction(() => {
        this.captureAllocation();
      });
    }
  }

  /**
   * Stop profiling
   */
  stop() {
    if (!this.sampling) {
      return null;
    }

    this.sampling = false;
    const duration = Date.now() - this.startTime;
    const finalMemory = process.memoryUsage();

    const profile = {
      duration,
      startMemory: this.initialMemory,
      endMemory: finalMemory,
      heapGrowth: finalMemory.heapUsed - this.initialMemory.heapUsed,
      timestamp: Date.now()
    };

    this.profiles.push(profile);
    return profile;
  }

  /**
   * Capture allocation
   */
  captureAllocation() {
    // Capture allocation stack trace
    const stack = new Error().stack;
    // Would store allocation information
  }

  /**
   * Get profile summary
   */
  getSummary() {
    if (this.profiles.length === 0) {
      return null;
    }

    const totalGrowth = this.profiles.reduce((sum, p) => sum + p.heapGrowth, 0);
    const avgGrowth = totalGrowth / this.profiles.length;

    return {
      profileCount: this.profiles.length,
      totalHeapGrowth: totalGrowth,
      averageHeapGrowth: avgGrowth,
      profiles: this.profiles.slice(-10)
    };
  }
}

// Export convenience functions
export function createMemoryManager(options) {
  return new MemoryManager(options);
}

export function createMemoryProfiler() {
  return new MemoryProfiler();
}

// Default memory manager
export const memoryManager = new MemoryManager();