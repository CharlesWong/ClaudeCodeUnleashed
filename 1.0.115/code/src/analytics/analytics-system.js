/**
 * Analytics and Telemetry System for Claude Code
 * Event tracking, metrics collection, and usage analytics
 * Reconstructed from trackEvent patterns found throughout the codebase
 */

import { EventEmitter } from 'events';
import { getLogger } from '../utils/logging.js';

/**
 * Event categories
 */
export const EventCategory = {
  TOOLS: 'tools',
  MCP: 'mcp',
  OAUTH: 'oauth',
  SUBSCRIPTION: 'subscription',
  INSTALLATION: 'installation',
  EXTENSION: 'extension',
  HOOKS: 'hooks',
  THINKING: 'thinking',
  BASH: 'bash',
  ERROR: 'error',
  PERFORMANCE: 'performance',
  USER_ACTION: 'user_action',
  SYSTEM: 'system'
};

/**
 * Common event names found in the codebase
 * Based on trackEvent usage patterns
 */
export const EventNames = {
  // MCP Events
  MCP_SERVERS: 'tengu_mcp_servers',
  MCP_OAUTH_FLOW_START: 'tengu_mcp_oauth_flow_start',
  MCP_OAUTH_FLOW_SUCCESS: 'tengu_mcp_oauth_flow_success',
  MCP_OAUTH_FLOW_ERROR: 'tengu_mcp_oauth_flow_error',
  MCP_SERVER_NEEDS_AUTH: 'tengu_mcp_server_needs_auth',
  MCP_IDE_SERVER_CONNECTION_FAILED: 'tengu_mcp_ide_server_connection_failed',
  MCP_IDE_SERVER_CONNECTION_SUCCEEDED: 'tengu_mcp_ide_server_connection_succeeded',

  // Hook Events
  RUN_HOOK: 'tengu_run_hook',
  REPL_HOOK_FINISHED: 'tengu_repl_hook_finished',

  // Thinking Events
  THINKING: 'tengu_thinking',

  // OAuth Events
  OAUTH_TOKEN_REFRESH_SUCCESS: 'tengu_oauth_token_refresh_success',
  OAUTH_TOKEN_REFRESH_FAILURE: 'tengu_oauth_token_refresh_failure',
  OAUTH_ROLES_STORED: 'tengu_oauth_roles_stored',
  OAUTH_API_KEY: 'tengu_oauth_api_key',
  API_KEY_HELPER_MISSING_TRUST: 'tengu_apiKeyHelper_missing_trust',

  // Bash Events
  BASH_TOOL_RESET_TO_ORIGINAL_DIR: 'tengu_bash_tool_reset_to_original_dir',
  BASH_PREFIX: 'tengu_bash_prefix',
  BASH_COMMAND_BACKGROUNDED: 'tengu_bash_command_backgrounded',
  BASH_COMMAND_AUTO_BACKGROUNDED: 'tengu_bash_command_auto_backgrounded',

  // Installation Events
  LOCAL_INSTALL_MIGRATION: 'tengu_local_install_migration',
  AUTO_UPDATER_LOCK_CONTENTION: 'tengu_auto_updater_lock_contention',
  AUTO_UPDATER_WINDOWS_NPM_IN_WSL: 'tengu_auto_updater_windows_npm_in_wsl',

  // Extension Events
  EXT_INSTALLED: 'tengu_ext_installed',
  EXT_INSTALL_ERROR: 'tengu_ext_install_error',
  EXT_JETBRAINS_EXTENSION_INSTALL_UNKNOWN_IDE: 'tengu_ext_jetbrains_extension_install_unknown_ide',
  EXT_JETBRAINS_EXTENSION_INSTALL_SOURCE_MISSING: 'tengu_ext_jetbrains_extension_install_source_missing',
  EXT_JETBRAINS_EXTENSION_INSTALL_NO_PLUGIN_DIRECTORIES: 'tengu_ext_jetbrains_extension_install_no_plugin_directories',
  EXT_JETBRAINS_EXTENSION_INSTALL_ERROR_INSTALLING: 'tengu_ext_jetbrains_extension_install_error_installing',

  // Subscription Events
  SUBSCRIPTION_UPSELL_SHOWN: 'tengu_subscription_upsell_shown'
};

/**
 * Analytics configuration
 */
export class AnalyticsConfig {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.debug = options.debug ?? false;
    this.batchSize = options.batchSize ?? 100;
    this.flushInterval = options.flushInterval ?? 30000; // 30 seconds
    this.endpoint = options.endpoint || process.env.ANALYTICS_ENDPOINT;
    this.apiKey = options.apiKey || process.env.ANALYTICS_API_KEY;
    this.userId = options.userId;
    this.sessionId = options.sessionId || this.generateSessionId();
    this.metadata = options.metadata || {};
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Event queue for batching
 */
export class EventQueue {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.queue = [];
  }

  add(event) {
    this.queue.push(event);
    if (this.queue.length > this.maxSize) {
      this.queue.shift(); // Remove oldest
    }
  }

  flush() {
    const events = [...this.queue];
    this.queue = [];
    return events;
  }

  size() {
    return this.queue.length;
  }
}

/**
 * Main analytics system
 */
export class AnalyticsSystem extends EventEmitter {
  constructor(config = new AnalyticsConfig()) {
    super();
    this.config = config;
    this.logger = getLogger('analytics');
    this.queue = new EventQueue(config.batchSize);
    this.metrics = new Map();
    this.timers = new Map();
    this.sessionStartTime = Date.now();
    this.eventCount = 0;

    if (config.enabled) {
      this.startBatching();
    }
  }

  /**
   * Track an event
   * Original: trackEvent pattern found throughout codebase
   */
  trackEvent(eventName, properties = {}) {
    if (!this.config.enabled) return;

    const event = {
      name: eventName,
      properties: {
        ...properties,
        ...this.config.metadata
      },
      timestamp: Date.now(),
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      eventId: this.generateEventId()
    };

    this.queue.add(event);
    this.eventCount++;

    if (this.config.debug) {
      this.logger.debug(`Event tracked: ${eventName}`, properties);
    }

    this.emit('event', event);

    // Auto-flush if queue is full
    if (this.queue.size() >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Track a metric
   */
  trackMetric(metricName, value, unit = 'count') {
    if (!this.config.enabled) return;

    const metric = {
      name: metricName,
      value,
      unit,
      timestamp: Date.now()
    };

    // Update aggregated metrics
    if (!this.metrics.has(metricName)) {
      this.metrics.set(metricName, {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        values: []
      });
    }

    const stats = this.metrics.get(metricName);
    stats.count++;
    stats.sum += value;
    stats.min = Math.min(stats.min, value);
    stats.max = Math.max(stats.max, value);
    stats.values.push(value);

    // Keep only last 100 values
    if (stats.values.length > 100) {
      stats.values.shift();
    }

    this.trackEvent(`metric_${metricName}`, { value, unit });
  }

  /**
   * Start timing an operation
   */
  startTimer(name) {
    this.timers.set(name, {
      start: performance.now(),
      marks: []
    });
  }

  /**
   * Add a mark to a timer
   */
  markTimer(name, label) {
    const timer = this.timers.get(name);
    if (!timer) return;

    timer.marks.push({
      label,
      time: performance.now() - timer.start
    });
  }

  /**
   * End timing and track
   */
  endTimer(name, properties = {}) {
    const timer = this.timers.get(name);
    if (!timer) return;

    const duration = performance.now() - timer.start;
    this.timers.delete(name);

    this.trackEvent(`timer_${name}`, {
      duration,
      marks: timer.marks,
      ...properties
    });

    this.trackMetric(`${name}_duration`, duration, 'ms');

    return duration;
  }

  /**
   * Track an error
   */
  trackError(error, context = {}) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...context
    };

    this.trackEvent('error', errorData);
  }

  /**
   * Track page/view
   */
  trackView(viewName, properties = {}) {
    this.trackEvent('view', {
      viewName,
      ...properties
    });
  }

  /**
   * Track user action
   */
  trackUserAction(action, properties = {}) {
    this.trackEvent('user_action', {
      action,
      ...properties
    });
  }

  /**
   * Start batching events
   */
  startBatching() {
    this.batchInterval = setInterval(() => {
      if (this.queue.size() > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  /**
   * Stop batching
   */
  stopBatching() {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
  }

  /**
   * Flush events to endpoint
   */
  async flush() {
    const events = this.queue.flush();
    if (events.length === 0) return;

    try {
      await this.sendEvents(events);
      this.emit('flush', events);
    } catch (error) {
      this.logger.error('Failed to send analytics events', { error });
      this.emit('flush_error', error);
    }
  }

  /**
   * Send events to endpoint
   */
  async sendEvents(events) {
    if (!this.config.endpoint) {
      // No endpoint configured, just log
      if (this.config.debug) {
        this.logger.debug(`Would send ${events.length} events`, events);
      }
      return;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      },
      body: JSON.stringify({
        events,
        sessionId: this.config.sessionId,
        metadata: this.config.metadata
      })
    });

    if (!response.ok) {
      throw new Error(`Analytics endpoint returned ${response.status}`);
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    const sessionDuration = Date.now() - this.sessionStartTime;
    const metrics = {};

    for (const [name, stats] of this.metrics) {
      metrics[name] = {
        count: stats.count,
        sum: stats.sum,
        avg: stats.sum / stats.count,
        min: stats.min,
        max: stats.max
      };
    }

    return {
      sessionId: this.config.sessionId,
      duration: sessionDuration,
      eventCount: this.eventCount,
      metrics
    };
  }

  /**
   * Generate event ID
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.stopBatching();
    this.flush();
    this.removeAllListeners();
  }
}

/**
 * Performance tracker
 */
export class PerformanceTracker {
  constructor(analytics) {
    this.analytics = analytics;
    this.operations = new Map();
  }

  /**
   * Track operation performance
   */
  async trackOperation(name, operation, metadata = {}) {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    try {
      const result = await operation();

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage();

      this.analytics.trackEvent('performance', {
        operation: name,
        duration,
        memoryDelta: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external
        },
        success: true,
        ...metadata
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;

      this.analytics.trackEvent('performance', {
        operation: name,
        duration,
        success: false,
        error: error.message,
        ...metadata
      });

      throw error;
    }
  }

  /**
   * Create a performance mark
   */
  mark(name) {
    this.operations.set(name, performance.now());
  }

  /**
   * Measure between marks
   */
  measure(name, startMark, endMark = null) {
    const start = this.operations.get(startMark);
    if (!start) return;

    const end = endMark ? this.operations.get(endMark) : performance.now();
    const duration = end - start;

    this.analytics.trackMetric(`performance_${name}`, duration, 'ms');
    return duration;
  }
}

/**
 * Usage tracker for features
 */
export class FeatureUsageTracker {
  constructor(analytics) {
    this.analytics = analytics;
    this.features = new Map();
  }

  /**
   * Track feature usage
   */
  trackFeature(featureName, metadata = {}) {
    if (!this.features.has(featureName)) {
      this.features.set(featureName, {
        count: 0,
        firstUsed: Date.now(),
        lastUsed: null
      });
    }

    const feature = this.features.get(featureName);
    feature.count++;
    feature.lastUsed = Date.now();

    this.analytics.trackEvent('feature_usage', {
      feature: featureName,
      count: feature.count,
      ...metadata
    });
  }

  /**
   * Get feature usage stats
   */
  getFeatureStats() {
    const stats = {};
    for (const [name, data] of this.features) {
      stats[name] = { ...data };
    }
    return stats;
  }
}

// Singleton instance
let analyticsInstance = null;

/**
 * Initialize analytics system
 */
export function initAnalytics(config) {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsSystem(config);
  }
  return analyticsInstance;
}

/**
 * Get analytics instance
 */
export function getAnalytics() {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsSystem();
  }
  return analyticsInstance;
}

/**
 * Global trackEvent function
 * This matches the usage pattern found throughout the codebase
 */
export function trackEvent(eventName, properties) {
  const analytics = getAnalytics();
  analytics.trackEvent(eventName, properties);
}

/**
 * Track metric globally
 */
export function trackMetric(metricName, value, unit) {
  const analytics = getAnalytics();
  analytics.trackMetric(metricName, value, unit);
}

export default {
  EventCategory,
  EventNames,
  AnalyticsConfig,
  AnalyticsSystem,
  PerformanceTracker,
  FeatureUsageTracker,
  initAnalytics,
  getAnalytics,
  trackEvent,
  trackMetric
};