/**
 * Claude Code Telemetry Batching System
 *
 * Event aggregation, batching, and privacy-conscious telemetry pipeline.
 * Handles high-volume events with automatic batching and compression.
 *
 * Extracted from claude-code-full-extract.js (lines ~45400-45750)
 * Part of the 87% → 90% extraction phase
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Telemetry Batch Manager
 * Aggregates and batches telemetry events
 */
export class TelemetryBatchManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      batchSize: options.batchSize || 100,
      batchInterval: options.batchInterval || 30000, // 30 seconds
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 5000,
      compressionThreshold: options.compressionThreshold || 1024, // 1KB
      endpoint: options.endpoint || 'https://telemetry.anthropic.com/v1/events',
      apiKey: options.apiKey,
      enableCompression: options.enableCompression !== false,
      enablePrivacyMode: options.enablePrivacyMode || false,
      flushOnExit: options.flushOnExit !== false
    };

    this.queue = [];
    this.metrics = new Map();
    this.aggregates = new Map();
    this.batchTimer = null;
    this.sending = false;

    this.privacyRules = new PrivacyRules();
    this.eventProcessor = new EventProcessor();

    this.setupBatching();
    this.setupExitHandlers();
  }

  /**
   * Set up batching timer
   */
  setupBatching() {
    this.scheduleBatch();
  }

  /**
   * Schedule next batch send
   */
  scheduleBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.flushBatch();
      this.scheduleBatch();
    }, this.config.batchInterval);
  }

  /**
   * Set up exit handlers
   */
  setupExitHandlers() {
    if (this.config.flushOnExit) {
      const exitHandler = async () => {
        await this.flush();
      };

      process.on('exit', exitHandler);
      process.on('SIGINT', exitHandler);
      process.on('SIGTERM', exitHandler);
      process.on('uncaughtException', exitHandler);
      process.on('unhandledRejection', exitHandler);
    }
  }

  /**
   * Track event
   */
  track(eventName, properties = {}, options = {}) {
    const event = this.createEvent(eventName, properties, options);

    // Apply privacy rules
    if (this.config.enablePrivacyMode) {
      this.privacyRules.apply(event);
    }

    // Process event
    const processed = this.eventProcessor.process(event);

    // Add to queue or aggregate
    if (options.aggregate) {
      this.addToAggregate(processed);
    } else {
      this.addToQueue(processed);
    }

    // Check if we should flush
    if (this.queue.length >= this.config.batchSize) {
      this.flushBatch();
    }
  }

  /**
   * Track metric
   */
  metric(name, value, tags = {}) {
    const key = this.getMetricKey(name, tags);

    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        name,
        tags,
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity
      });
    }

    const metric = this.metrics.get(key);
    metric.values.push(value);
    metric.count++;
    metric.sum += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);

    // Calculate percentiles periodically
    if (metric.count % 100 === 0) {
      this.calculatePercentiles(metric);
    }
  }

  /**
   * Create event object
   */
  createEvent(name, properties, options) {
    return {
      id: this.generateId(),
      name,
      properties,
      context: this.getContext(),
      timestamp: Date.now(),
      sessionId: this.getSessionId(),
      version: options.version || '1.0.0'
    };
  }

  /**
   * Add event to queue
   */
  addToQueue(event) {
    this.queue.push(event);
    this.emit('event:queued', event);
  }

  /**
   * Add to aggregate
   */
  addToAggregate(event) {
    const key = `${event.name}:${JSON.stringify(event.properties)}`;

    if (!this.aggregates.has(key)) {
      this.aggregates.set(key, {
        name: event.name,
        properties: event.properties,
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      });
    }

    const aggregate = this.aggregates.get(key);
    aggregate.count++;
    aggregate.lastSeen = Date.now();
  }

  /**
   * Flush batch
   */
  async flushBatch() {
    if (this.sending || (this.queue.length === 0 && this.aggregates.size === 0)) {
      return;
    }

    this.sending = true;
    this.emit('batch:start');

    try {
      // Prepare batch
      const batch = this.prepareBatch();

      if (batch.events.length === 0 && batch.metrics.length === 0) {
        this.sending = false;
        return;
      }

      // Compress if needed
      const payload = await this.preparePayload(batch);

      // Send batch
      await this.sendBatch(payload);

      // Clear sent items
      this.clearSentItems(batch);

      this.emit('batch:success', { count: batch.events.length });
    } catch (error) {
      this.emit('batch:error', error);
      await this.handleBatchError(error);
    } finally {
      this.sending = false;
    }
  }

  /**
   * Prepare batch for sending
   */
  prepareBatch() {
    const events = this.queue.splice(0, this.config.batchSize);

    // Add aggregated events
    const aggregatedEvents = Array.from(this.aggregates.values()).map(agg => ({
      name: `${agg.name}_aggregated`,
      properties: {
        ...agg.properties,
        count: agg.count,
        duration: agg.lastSeen - agg.firstSeen
      },
      timestamp: agg.lastSeen
    }));

    // Add metrics
    const metrics = Array.from(this.metrics.values()).map(metric => ({
      name: metric.name,
      tags: metric.tags,
      statistics: {
        count: metric.count,
        sum: metric.sum,
        min: metric.min,
        max: metric.max,
        avg: metric.sum / metric.count,
        p50: metric.p50 || 0,
        p95: metric.p95 || 0,
        p99: metric.p99 || 0
      },
      timestamp: Date.now()
    }));

    return {
      events: [...events, ...aggregatedEvents],
      metrics,
      timestamp: Date.now(),
      sessionId: this.getSessionId()
    };
  }

  /**
   * Prepare payload with optional compression
   */
  async preparePayload(batch) {
    const json = JSON.stringify(batch);
    const size = Buffer.byteLength(json);

    if (this.config.enableCompression && size > this.config.compressionThreshold) {
      const compressed = await gzip(json);
      return {
        data: compressed.toString('base64'),
        compressed: true,
        originalSize: size,
        compressedSize: compressed.length
      };
    }

    return {
      data: json,
      compressed: false,
      size
    };
  }

  /**
   * Send batch to telemetry endpoint
   */
  async sendBatch(payload, retryCount = 0) {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
      'X-Compressed': payload.compressed.toString(),
      'X-Session-ID': this.getSessionId()
    };

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Telemetry send failed: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      if (retryCount < this.config.maxRetries) {
        await this.delay(this.config.retryDelay * Math.pow(2, retryCount));
        return this.sendBatch(payload, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Clear sent items
   */
  clearSentItems(batch) {
    // Clear aggregates
    this.aggregates.clear();

    // Clear metrics
    this.metrics.clear();
  }

  /**
   * Handle batch error
   */
  async handleBatchError(error) {
    // Could implement dead letter queue here
    console.error('Telemetry batch error:', error);
  }

  /**
   * Flush all pending events
   */
  async flush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    while (this.queue.length > 0 || this.aggregates.size > 0) {
      await this.flushBatch();
    }
  }

  /**
   * Calculate percentiles for metric
   */
  calculatePercentiles(metric) {
    const sorted = metric.values.slice().sort((a, b) => a - b);
    const len = sorted.length;

    metric.p50 = sorted[Math.floor(len * 0.5)];
    metric.p95 = sorted[Math.floor(len * 0.95)];
    metric.p99 = sorted[Math.floor(len * 0.99)];

    // Keep only recent values
    metric.values = metric.values.slice(-1000);
  }

  /**
   * Get metric key
   */
  getMetricKey(name, tags) {
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');

    return `${name}#${tagStr}`;
  }

  /**
   * Get context information
   */
  getContext() {
    return {
      app: 'claude-code',
      version: process.env.VERSION || 'unknown',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid
    };
  }

  /**
   * Get or create session ID
   */
  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = this.generateId();
    }
    return this.sessionId;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}-${process.pid}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      queueSize: this.queue.length,
      aggregateCount: this.aggregates.size,
      metricsCount: this.metrics.size,
      sending: this.sending
    };
  }
}

/**
 * Privacy Rules
 * Applies privacy rules to events
 */
export class PrivacyRules {
  constructor() {
    this.rules = new Map([
      ['pii', this.removePII.bind(this)],
      ['paths', this.sanitizePaths.bind(this)],
      ['urls', this.sanitizeURLs.bind(this)],
      ['keys', this.removeKeys.bind(this)]
    ]);
  }

  apply(event) {
    for (const [name, rule] of this.rules) {
      rule(event);
    }
  }

  removePII(event) {
    // Remove potential PII from properties
    const piiPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/g // Credit card
    ];

    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          for (const pattern of piiPatterns) {
            obj[key] = obj[key].replace(pattern, '[REDACTED]');
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };

    sanitize(event.properties);
  }

  sanitizePaths(event) {
    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string' && obj[key].includes('/')) {
          // Keep only filename
          obj[key] = obj[key].split('/').pop() || obj[key];
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };

    sanitize(event.properties);
  }

  sanitizeURLs(event) {
    const urlPattern = /https?:\/\/[^\s]+/g;

    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(urlPattern, '[URL]');
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };

    sanitize(event.properties);
  }

  removeKeys(event) {
    const keyPattern = /[a-zA-Z0-9]{20,}/g;

    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(keyPattern, '[KEY]');
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };

    sanitize(event.properties);
  }
}

/**
 * Event Processor
 * Processes and enriches events
 */
export class EventProcessor {
  constructor() {
    this.processors = [
      this.addTimestamp,
      this.addEnvironment,
      this.normalizeProperties,
      this.addFingerprint
    ];
  }

  process(event) {
    let processed = { ...event };

    for (const processor of this.processors) {
      processed = processor.call(this, processed);
    }

    return processed;
  }

  addTimestamp(event) {
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }
    return event;
  }

  addEnvironment(event) {
    event.environment = process.env.NODE_ENV || 'development';
    return event;
  }

  normalizeProperties(event) {
    // Ensure properties is an object
    if (!event.properties || typeof event.properties !== 'object') {
      event.properties = {};
    }

    // Convert undefined to null
    const normalize = (obj) => {
      for (const key in obj) {
        if (obj[key] === undefined) {
          obj[key] = null;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          normalize(obj[key]);
        }
      }
    };

    normalize(event.properties);
    return event;
  }

  addFingerprint(event) {
    const hash = createHash('sha256');
    hash.update(event.name);
    hash.update(JSON.stringify(event.properties));
    event.fingerprint = hash.digest('hex').substring(0, 8);
    return event;
  }
}

// Export convenience functions
export function createTelemetryBatcher(options) {
  return new TelemetryBatchManager(options);
}

// Default telemetry instance
export const telemetry = new TelemetryBatchManager();