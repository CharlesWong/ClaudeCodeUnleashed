/**
 * Logging System for Claude Code
 * Debug logging, event tracking, and analytics
 * Extracted from patterns around lines 11825-11850, 19830-19850
 */

import { EventEmitter } from 'events';
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Log levels
 * Original: line 11831 - logLevel ?? "off"
 */
export const LogLevel = {
  OFF: 'off',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace'
};

/**
 * Log level priorities
 */
const LOG_LEVEL_PRIORITY = {
  [LogLevel.OFF]: 0,
  [LogLevel.ERROR]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.INFO]: 3,
  [LogLevel.DEBUG]: 4,
  [LogLevel.TRACE]: 5
};

/**
 * ANSI color codes for terminal output
 */
const Colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  magenta: '\x1b[35m'
};

/**
 * Logger configuration
 */
export class LoggerConfig {
  constructor(options = {}) {
    this.level = options.level || LogLevel.INFO;
    this.enableColors = options.enableColors ?? true;
    this.enableTimestamp = options.enableTimestamp ?? true;
    this.enableLocation = options.enableLocation ?? false;
    this.logToFile = options.logToFile ?? false;
    this.logDir = options.logDir || join(homedir(), '.claude', 'logs');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.format = options.format || 'text'; // text, json
    this.filters = options.filters || [];
  }
}

/**
 * Logger implementation
 * Original patterns from lines 11825-11850
 */
export class Logger {
  constructor(name = 'default', config = new LoggerConfig()) {
    this.name = name;
    this.config = config;
    this.emitter = new EventEmitter();
    this.cache = new WeakMap();
    this.metrics = {
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      trace: 0
    };

    if (this.config.logToFile) {
      this.initFileLogging();
    }
  }

  /**
   * Initialize file logging
   */
  initFileLogging() {
    if (!existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    this.logFile = join(this.config.logDir, `claude-${timestamp}.log`);
  }

  /**
   * Check if should log based on level
   * Original: Sw1 function pattern
   */
  shouldLog(level) {
    const configPriority = LOG_LEVEL_PRIORITY[this.config.level];
    const levelPriority = LOG_LEVEL_PRIORITY[level];
    return levelPriority <= configPriority && levelPriority > 0;
  }

  /**
   * Format log message
   */
  formatMessage(level, message, data = {}) {
    if (this.config.format === 'json') {
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        logger: this.name,
        message,
        ...data
      });
    }

    const parts = [];

    // Timestamp
    if (this.config.enableTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    // Logger name
    parts.push(`[${this.name}]`);

    // Level with color
    const levelStr = level.toUpperCase().padEnd(5);
    if (this.config.enableColors && process.stdout.isTTY) {
      const color = this.getColorForLevel(level);
      parts.push(`${color}${levelStr}${Colors.reset}`);
    } else {
      parts.push(levelStr);
    }

    // Message
    parts.push(message);

    // Additional data
    if (Object.keys(data).length > 0) {
      parts.push(JSON.stringify(data, null, 2));
    }

    return parts.join(' ');
  }

  /**
   * Get color for log level
   */
  getColorForLevel(level) {
    switch (level) {
      case LogLevel.ERROR:
        return Colors.red;
      case LogLevel.WARN:
        return Colors.yellow;
      case LogLevel.INFO:
        return Colors.blue;
      case LogLevel.DEBUG:
        return Colors.cyan;
      case LogLevel.TRACE:
        return Colors.gray;
      default:
        return Colors.reset;
    }
  }

  /**
   * Apply filters to data
   * Original: lT function pattern for filtering sensitive data
   */
  filterSensitiveData(data) {
    const filtered = { ...data };

    // Filter headers
    if (filtered.headers) {
      filtered.headers = Object.fromEntries(
        Object.entries(filtered.headers).map(([key, value]) => {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey === 'x-api-key' ||
            lowerKey === 'authorization' ||
            lowerKey === 'cookie' ||
            lowerKey === 'set-cookie'
          ) {
            return [key, '***'];
          }
          return [key, value];
        })
      );
    }

    // Apply custom filters
    for (const filter of this.config.filters) {
      filter(filtered);
    }

    return filtered;
  }

  /**
   * Core logging method
   */
  log(level, message, data = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    // Update metrics
    this.metrics[level]++;

    // Filter sensitive data
    const filteredData = this.filterSensitiveData(data);

    // Format message
    const formatted = this.formatMessage(level, message, filteredData);

    // Output to console
    const output = level === LogLevel.ERROR ? console.error : console.log;
    output(formatted);

    // Write to file if enabled
    if (this.config.logToFile && this.logFile) {
      try {
        appendFileSync(this.logFile, formatted + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }

    // Emit event
    this.emitter.emit('log', {
      level,
      message,
      data: filteredData,
      timestamp: Date.now()
    });
  }

  /**
   * Log level methods
   */
  error(message, data) {
    this.log(LogLevel.ERROR, message, data);
  }

  warn(message, data) {
    this.log(LogLevel.WARN, message, data);
  }

  info(message, data) {
    this.log(LogLevel.INFO, message, data);
  }

  debug(message, data) {
    this.log(LogLevel.DEBUG, message, data);
  }

  trace(message, data) {
    this.log(LogLevel.TRACE, message, data);
  }

  /**
   * Child logger with inherited config
   */
  child(name, config = {}) {
    return new Logger(
      `${this.name}.${name}`,
      { ...this.config, ...config }
    );
  }

  /**
   * Set log level
   */
  setLevel(level) {
    this.config.level = level;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Clear metrics
   */
  clearMetrics() {
    this.metrics = {
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      trace: 0
    };
  }
}

/**
 * No-op logger for silent mode
 * Original: cj9 pattern from line 11827
 */
export class NoOpLogger {
  error() {}
  warn() {}
  info() {}
  debug() {}
  trace() {}
  child() { return this; }
  setLevel() {}
  getMetrics() { return {}; }
}

/**
 * Performance logger
 */
export class PerformanceLogger {
  constructor(logger) {
    this.logger = logger;
    this.timers = new Map();
  }

  start(label) {
    this.timers.set(label, {
      start: performance.now(),
      marks: []
    });
  }

  mark(label, message) {
    const timer = this.timers.get(label);
    if (!timer) return;

    timer.marks.push({
      time: performance.now() - timer.start,
      message
    });
  }

  end(label, data = {}) {
    const timer = this.timers.get(label);
    if (!timer) return;

    const duration = performance.now() - timer.start;

    this.logger.debug(`[PERF] ${label}`, {
      duration: `${duration.toFixed(2)}ms`,
      marks: timer.marks,
      ...data
    });

    this.timers.delete(label);
    return duration;
  }
}

/**
 * Event tracker
 */
export class EventTracker {
  constructor(logger) {
    this.logger = logger;
    this.events = [];
    this.maxEvents = 1000;
  }

  track(event, data = {}) {
    const tracked = {
      event,
      data,
      timestamp: Date.now()
    };

    this.events.push(tracked);

    // Limit stored events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    this.logger.debug(`[EVENT] ${event}`, data);
  }

  getEvents(filter) {
    if (!filter) return [...this.events];

    return this.events.filter(e => {
      if (typeof filter === 'string') {
        return e.event === filter;
      }
      return filter(e);
    });
  }

  clear() {
    this.events = [];
  }

  getStats() {
    const stats = {};

    for (const event of this.events) {
      stats[event.event] = (stats[event.event] || 0) + 1;
    }

    return stats;
  }
}

/**
 * Logger factory
 */
class LoggerFactory {
  constructor() {
    this.loggers = new Map();
    this.defaultConfig = new LoggerConfig();
  }

  /**
   * Get or create logger
   * Original: getLogger pattern from line 19832
   */
  getLogger(name = 'default') {
    if (!this.loggers.has(name)) {
      const logger = new Logger(name, this.defaultConfig);
      this.loggers.set(name, logger);
    }
    return this.loggers.get(name);
  }

  /**
   * Set default config
   */
  setDefaultConfig(config) {
    this.defaultConfig = config;
  }

  /**
   * Set level for all loggers
   */
  setGlobalLevel(level) {
    this.defaultConfig.level = level;
    for (const logger of this.loggers.values()) {
      logger.setLevel(level);
    }
  }

  /**
   * Get all loggers
   */
  getAllLoggers() {
    return Array.from(this.loggers.values());
  }
}

// Singleton factory instance
const factory = new LoggerFactory();

/**
 * Export convenience functions
 */
export function getLogger(name) {
  return factory.getLogger(name);
}

export function setGlobalLogLevel(level) {
  factory.setGlobalLevel(level);
}

export function createLogger(name, config) {
  return new Logger(name, config);
}

export function createPerformanceLogger(logger) {
  return new PerformanceLogger(logger || getLogger('performance'));
}

export function createEventTracker(logger) {
  return new EventTracker(logger || getLogger('events'));
}

export default {
  LogLevel,
  Logger,
  NoOpLogger,
  PerformanceLogger,
  EventTracker,
  LoggerConfig,
  getLogger,
  setGlobalLogLevel,
  createLogger,
  createPerformanceLogger,
  createEventTracker
};