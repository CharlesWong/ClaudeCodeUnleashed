/**
 * Development Tools for Claude Code
 * Debugging utilities, profiling, and development helpers
 * Extracted from development-related patterns and utilities
 */

import { EventEmitter } from 'events';
import v8 from 'v8';
import express from 'express';
import { getLogger } from '../utils/logging.js';

/**
 * Debug log levels
 */
export const DebugLevel = {
  OFF: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  VERBOSE: 5,
  TRACE: 6
};

/**
 * Console methods to patch
 * Original: lines 3593-3597
 */
const CONSOLE_METHODS = [
  'log',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'group',
  'groupEnd',
  'count',
  'countReset',
  'time',
  'timeEnd',
  'timeLog',
  'assert',
  'clear',
  'dir',
  'dirxml',
  'profile',
  'profileEnd',
  'table'
];

/**
 * Debug logger
 * Enhanced console with various debug features
 */
export class DebugLogger {
  constructor(options = {}) {
    this.enabled = options.enabled ?? (process.env.DEBUG === 'true');
    this.level = options.level ?? DebugLevel.INFO;
    this.prefix = options.prefix || '[DEBUG]';
    this.showTimestamp = options.showTimestamp ?? true;
    this.showLocation = options.showLocation ?? false;
    this.logger = getLogger('debug');
    this.originalConsole = {};
    this.logHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
  }

  /**
   * Log debug message
   * Original: debugLog pattern
   */
  log(level, message, ...args) {
    if (!this.enabled || level > this.level) return;

    const entry = {
      level,
      message,
      args,
      timestamp: Date.now(),
      location: this.showLocation ? this.getCallLocation() : null
    };

    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    const formattedMessage = this.formatMessage(entry);
    this.outputMessage(level, formattedMessage);
  }

  /**
   * Format log message
   */
  formatMessage(entry) {
    const parts = [];

    if (this.showTimestamp) {
      parts.push(new Date(entry.timestamp).toISOString());
    }

    parts.push(this.prefix);
    parts.push(`[${this.getLevelName(entry.level)}]`);

    if (entry.location) {
      parts.push(`(${entry.location})`);
    }

    parts.push(entry.message);

    return parts.join(' ');
  }

  /**
   * Get level name
   */
  getLevelName(level) {
    const names = ['OFF', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE', 'TRACE'];
    return names[level] || 'UNKNOWN';
  }

  /**
   * Get call location
   */
  getCallLocation() {
    const error = new Error();
    const stack = error.stack?.split('\n')[3];
    const match = stack?.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);
    if (match) {
      return `${match[2]}:${match[3]}:${match[4]}`;
    }
    return 'unknown';
  }

  /**
   * Output message
   */
  outputMessage(level, message) {
    switch (level) {
      case DebugLevel.ERROR:
        console.error(message);
        break;
      case DebugLevel.WARN:
        console.warn(message);
        break;
      default:
        console.log(message);
    }
  }

  /**
   * Convenience methods
   */
  error(message, ...args) { this.log(DebugLevel.ERROR, message, ...args); }
  warn(message, ...args) { this.log(DebugLevel.WARN, message, ...args); }
  info(message, ...args) { this.log(DebugLevel.INFO, message, ...args); }
  debug(message, ...args) { this.log(DebugLevel.DEBUG, message, ...args); }
  verbose(message, ...args) { this.log(DebugLevel.VERBOSE, message, ...args); }
  trace(message, ...args) { this.log(DebugLevel.TRACE, message, ...args); }

  /**
   * Patch console methods
   * Original: patchConsole pattern from lines 7672-7674
   */
  patchConsole() {
    if (!this.enabled) return;

    CONSOLE_METHODS.forEach(method => {
      if (typeof console[method] === 'function') {
        this.originalConsole[method] = console[method];
        console[method] = (...args) => {
          this.log(DebugLevel.DEBUG, `[console.${method}]`, ...args);
          this.originalConsole[method](...args);
        };
      }
    });
  }

  /**
   * Restore console
   */
  restoreConsole() {
    Object.keys(this.originalConsole).forEach(method => {
      console[method] = this.originalConsole[method];
    });
    this.originalConsole = {};
  }

  /**
   * Get log history
   */
  getHistory(filter = {}) {
    let history = [...this.logHistory];

    if (filter.level !== undefined) {
      history = history.filter(entry => entry.level === filter.level);
    }

    if (filter.pattern) {
      const regex = new RegExp(filter.pattern, 'i');
      history = history.filter(entry => regex.test(entry.message));
    }

    if (filter.since) {
      history = history.filter(entry => entry.timestamp >= filter.since);
    }

    return history;
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.logHistory = [];
  }
}

/**
 * Performance profiler
 * Measures and tracks performance metrics
 */
export class PerformanceProfiler extends EventEmitter {
  constructor() {
    super();
    this.marks = new Map();
    this.measures = new Map();
    this.timers = new Map();
    this.enabled = process.env.PROFILE === 'true';
    this.logger = getLogger('profiler');
  }

  /**
   * Mark a performance point
   * Original: performance measurement patterns
   */
  mark(name, metadata = {}) {
    if (!this.enabled) return;

    const mark = {
      name,
      timestamp: performance.now(),
      metadata
    };

    this.marks.set(name, mark);
    this.emit('mark', mark);
  }

  /**
   * Measure between two marks
   */
  measure(name, startMark, endMark = null) {
    if (!this.enabled) return null;

    const start = this.marks.get(startMark);
    if (!start) {
      this.logger.warn(`Start mark '${startMark}' not found`);
      return null;
    }

    const end = endMark ? this.marks.get(endMark) : { timestamp: performance.now() };
    if (!end && endMark) {
      this.logger.warn(`End mark '${endMark}' not found`);
      return null;
    }

    const duration = end.timestamp - start.timestamp;
    const measure = {
      name,
      startMark,
      endMark,
      duration,
      timestamp: Date.now()
    };

    if (!this.measures.has(name)) {
      this.measures.set(name, []);
    }
    this.measures.get(name).push(measure);

    this.emit('measure', measure);
    return duration;
  }

  /**
   * Start a timer
   */
  startTimer(name) {
    if (!this.enabled) return;

    this.timers.set(name, {
      start: performance.now(),
      laps: []
    });
  }

  /**
   * Record a lap time
   */
  lap(name, label) {
    if (!this.enabled) return null;

    const timer = this.timers.get(name);
    if (!timer) return null;

    const lapTime = performance.now() - timer.start;
    timer.laps.push({ label, time: lapTime });

    return lapTime;
  }

  /**
   * End a timer
   */
  endTimer(name) {
    if (!this.enabled) return null;

    const timer = this.timers.get(name);
    if (!timer) return null;

    const duration = performance.now() - timer.start;
    this.timers.delete(name);

    this.emit('timer', {
      name,
      duration,
      laps: timer.laps
    });

    return duration;
  }

  /**
   * Profile a function
   */
  async profileFunction(name, fn, ...args) {
    if (!this.enabled) return fn(...args);

    const startMemory = process.memoryUsage();
    const startTime = performance.now();

    try {
      const result = await fn(...args);

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage();

      const profile = {
        name,
        duration,
        memory: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external,
          rss: endMemory.rss - startMemory.rss
        },
        success: true
      };

      this.emit('profile', profile);
      return result;

    } catch (error) {
      const duration = performance.now() - startTime;

      this.emit('profile', {
        name,
        duration,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const stats = {
      marks: Object.fromEntries(this.marks),
      measures: {},
      averages: {}
    };

    for (const [name, measures] of this.measures) {
      stats.measures[name] = measures;

      const total = measures.reduce((sum, m) => sum + m.duration, 0);
      stats.averages[name] = {
        count: measures.length,
        total,
        average: total / measures.length,
        min: Math.min(...measures.map(m => m.duration)),
        max: Math.max(...measures.map(m => m.duration))
      };
    }

    return stats;
  }

  /**
   * Clear all data
   */
  clear() {
    this.marks.clear();
    this.measures.clear();
    this.timers.clear();
  }
}

/**
 * Memory profiler
 */
export class MemoryProfiler {
  constructor() {
    this.snapshots = [];
    this.maxSnapshots = 100;
    this.logger = getLogger('memory-profiler');
  }

  /**
   * Take memory snapshot
   */
  snapshot(label = '') {
    const snapshot = {
      label,
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      v8: this.getV8HeapStatistics()
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Get V8 heap statistics
   */
  getV8HeapStatistics() {
    try {
      return v8.getHeapStatistics();
    } catch {
      return null;
    }
  }

  /**
   * Compare two snapshots
   */
  compare(snapshot1, snapshot2) {
    return {
      heapUsed: snapshot2.memory.heapUsed - snapshot1.memory.heapUsed,
      heapTotal: snapshot2.memory.heapTotal - snapshot1.memory.heapTotal,
      external: snapshot2.memory.external - snapshot1.memory.external,
      rss: snapshot2.memory.rss - snapshot1.memory.rss,
      arrayBuffers: snapshot2.memory.arrayBuffers - snapshot1.memory.arrayBuffers
    };
  }

  /**
   * Find memory leaks
   */
  findLeaks(threshold = 10 * 1024 * 1024) { // 10MB default
    const leaks = [];

    for (let i = 1; i < this.snapshots.length; i++) {
      const diff = this.compare(this.snapshots[i - 1], this.snapshots[i]);

      if (diff.heapUsed > threshold) {
        leaks.push({
          from: this.snapshots[i - 1].label || `Snapshot ${i - 1}`,
          to: this.snapshots[i].label || `Snapshot ${i}`,
          increase: diff.heapUsed,
          timestamp: this.snapshots[i].timestamp
        });
      }
    }

    return leaks;
  }

  /**
   * Get memory trend
   */
  getTrend() {
    if (this.snapshots.length < 2) return null;

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const duration = last.timestamp - first.timestamp;
    const heapGrowth = last.memory.heapUsed - first.memory.heapUsed;

    return {
      duration,
      heapGrowth,
      heapGrowthRate: heapGrowth / (duration / 1000), // bytes per second
      samples: this.snapshots.length
    };
  }

  /**
   * Clear snapshots
   */
  clear() {
    this.snapshots = [];
  }
}

/**
 * Development server
 * Provides debugging endpoints and tools
 */
export class DevServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 9229;
    this.host = options.host || 'localhost';
    this.enabled = options.enabled ?? (process.env.NODE_ENV === 'development');
    this.logger = getLogger('dev-server');
    this.server = null;
    this.debugger = new DebugLogger({ enabled: true });
    this.profiler = new PerformanceProfiler();
    this.memoryProfiler = new MemoryProfiler();
  }

  /**
   * Start dev server
   */
  async start() {
    if (!this.enabled) return;

    const app = express();

    // Debug endpoints
    app.get('/debug/logs', (req, res) => {
      res.json(this.debugger.getHistory());
    });

    app.get('/debug/performance', (req, res) => {
      res.json(this.profiler.getStats());
    });

    app.get('/debug/memory', (req, res) => {
      res.json({
        current: this.memoryProfiler.snapshot('api-request'),
        trend: this.memoryProfiler.getTrend(),
        leaks: this.memoryProfiler.findLeaks()
      });
    });

    app.get('/debug/config', (req, res) => {
      res.json({
        env: process.env.NODE_ENV,
        debug: this.debugger.enabled,
        profiling: this.profiler.enabled
      });
    });

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });

    this.server = app.listen(this.port, this.host, () => {
      this.logger.info(`Dev server running at http://${this.host}:${this.port}`);
      this.emit('started');
    });
  }

  /**
   * Stop dev server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('Dev server stopped');
          this.emit('stopped');
          resolve();
        });
      });
    }
  }
}

/**
 * Code inspector
 * Analyzes code structure and patterns
 */
export class CodeInspector {
  constructor() {
    this.logger = getLogger('code-inspector');
  }

  /**
   * Inspect function
   */
  inspectFunction(fn) {
    const source = fn.toString();
    const info = {
      name: fn.name || 'anonymous',
      length: fn.length,
      async: source.includes('async'),
      generator: source.includes('function*'),
      arrow: source.includes('=>'),
      parameters: this.extractParameters(source),
      complexity: this.calculateComplexity(source),
      lines: source.split('\n').length
    };

    return info;
  }

  /**
   * Extract function parameters
   */
  extractParameters(source) {
    const match = source.match(/\(([^)]*)\)/);
    if (!match) return [];

    return match[1]
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
  }

  /**
   * Calculate cyclomatic complexity
   */
  calculateComplexity(source) {
    let complexity = 1;

    // Count decision points
    const patterns = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /case\s+/g,
      /catch\s*\(/g,
      /\?\s*[^:]+:/g, // ternary
      /&&/g,
      /\|\|/g
    ];

    patterns.forEach(pattern => {
      const matches = source.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });

    return complexity;
  }

  /**
   * Analyze call stack
   */
  analyzeCallStack() {
    const stack = new Error().stack;
    const frames = [];

    const lines = stack.split('\n').slice(2); // Skip error message and this function

    lines.forEach(line => {
      const match = line.match(/at\s+(.+?)\s+\((.+):(\d+):(\d+)\)/);
      if (match) {
        frames.push({
          function: match[1],
          file: match[2],
          line: parseInt(match[3]),
          column: parseInt(match[4])
        });
      }
    });

    return frames;
  }

  /**
   * Trace object properties
   */
  traceObject(obj, depth = 2) {
    const seen = new Set();

    function trace(obj, level) {
      if (level > depth || seen.has(obj)) return '<circular>';

      if (obj === null) return null;
      if (typeof obj !== 'object') return obj;

      seen.add(obj);

      const result = {};
      for (const key in obj) {
        try {
          const value = obj[key];
          const type = typeof value;

          if (type === 'function') {
            result[key] = '<function>';
          } else if (type === 'object' && level < depth) {
            result[key] = trace(value, level + 1);
          } else {
            result[key] = value;
          }
        } catch (error) {
          result[key] = `<error: ${error.message}>`;
        }
      }

      return result;
    }

    return trace(obj, 0);
  }
}

/**
 * Benchmarking utility
 */
export class Benchmark {
  constructor(name, options = {}) {
    this.name = name;
    this.iterations = options.iterations || 1000;
    this.warmup = options.warmup || 100;
    this.logger = getLogger('benchmark');
    this.results = [];
  }

  /**
   * Run benchmark
   */
  async run(fn, ...args) {
    // Warmup
    for (let i = 0; i < this.warmup; i++) {
      await fn(...args);
    }

    // Actual benchmark
    const times = [];

    for (let i = 0; i < this.iterations; i++) {
      const start = performance.now();
      await fn(...args);
      const end = performance.now();
      times.push(end - start);
    }

    const result = {
      name: this.name,
      iterations: this.iterations,
      times,
      stats: this.calculateStats(times)
    };

    this.results.push(result);
    return result;
  }

  /**
   * Calculate statistics
   */
  calculateStats(times) {
    const sorted = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const mean = sum / times.length;

    const variance = times.reduce((acc, time) =>
      acc + Math.pow(time - mean, 2), 0) / times.length;

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      stdDev: Math.sqrt(variance),
      total: sum
    };
  }

  /**
   * Compare with another benchmark
   */
  compare(otherBenchmark) {
    const myStats = this.results[this.results.length - 1].stats;
    const otherStats = otherBenchmark.results[otherBenchmark.results.length - 1].stats;

    return {
      speedup: otherStats.mean / myStats.mean,
      difference: myStats.mean - otherStats.mean,
      percentFaster: ((otherStats.mean - myStats.mean) / otherStats.mean) * 100
    };
  }
}

// Export utility functions
export function createDebugLogger(options) {
  return new DebugLogger(options);
}

export function createProfiler() {
  return new PerformanceProfiler();
}

export function createMemoryProfiler() {
  return new MemoryProfiler();
}

export function createDevServer(options) {
  return new DevServer(options);
}

export function createInspector() {
  return new CodeInspector();
}

export function createBenchmark(name, options) {
  return new Benchmark(name, options);
}

// Global debug function
// Original: debugLog function pattern
export function debugLog(message, context = 'general') {
  const logger = createDebugLogger({ enabled: true });

  if (message instanceof Error) {
    logger.error(`[${context}] ${message.message}`, message.stack);
  } else {
    logger.debug(`[${context}] ${message}`);
  }
}

export default {
  DebugLevel,
  DebugLogger,
  PerformanceProfiler,
  MemoryProfiler,
  DevServer,
  CodeInspector,
  Benchmark,
  createDebugLogger,
  createProfiler,
  createMemoryProfiler,
  createDevServer,
  createInspector,
  createBenchmark,
  debugLog
};