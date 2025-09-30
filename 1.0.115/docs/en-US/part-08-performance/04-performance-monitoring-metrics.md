# Part 8.4: Performance Monitoring and Metrics - Claude Code Technical Series

## 📊 Introduction: Real-time Performance Monitoring and Analytics

Performance monitoring in Claude Code goes beyond simple timing measurements, implementing a comprehensive metrics collection and analysis system that provides deep insights into application behavior. The system captures detailed performance data across all components, enabling proactive optimization and rapid issue detection.

This implementation demonstrates how modern CLI applications can maintain observability comparable to web services, with real-time metrics, intelligent alerting, and powerful analytics capabilities.

## 🎯 Core Metrics Collection System

### Universal Metrics Collector

```javascript
/**
 * Comprehensive metrics collection system with aggregation and reporting
 */
class MetricsCollector {
  constructor(options = {}) {
    this.namespace = options.namespace || 'claude-code';
    this.flushInterval = options.flushInterval || 10000; // 10 seconds
    this.retentionPeriod = options.retentionPeriod || 3600000; // 1 hour

    // Metric types
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.timers = new Map();

    // Time series data
    this.timeSeries = new Map();
    this.maxTimeSeriesPoints = options.maxTimeSeriesPoints || 1000;

    // Aggregation windows
    this.windows = {
      '1m': new Map(),
      '5m': new Map(),
      '15m': new Map(),
      '1h': new Map()
    };

    // Start collection
    this.startCollection();
  }

  /**
   * Record a counter metric
   */
  counter(name, value = 1, tags = {}) {
    const key = this.generateKey(name, tags);

    if (!this.counters.has(key)) {
      this.counters.set(key, {
        name,
        tags,
        value: 0,
        lastUpdated: Date.now()
      });
    }

    const counter = this.counters.get(key);
    counter.value += value;
    counter.lastUpdated = Date.now();

    // Record in time series
    this.recordTimeSeries(name, counter.value, tags);
  }

  /**
   * Record a gauge metric
   */
  gauge(name, value, tags = {}) {
    const key = this.generateKey(name, tags);

    this.gauges.set(key, {
      name,
      tags,
      value,
      lastUpdated: Date.now()
    });

    // Record in time series
    this.recordTimeSeries(name, value, tags);
  }

  /**
   * Record a histogram metric
   */
  histogram(name, value, tags = {}) {
    const key = this.generateKey(name, tags);

    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        name,
        tags,
        values: [],
        lastUpdated: Date.now()
      });
    }

    const histogram = this.histograms.get(key);
    histogram.values.push(value);
    histogram.lastUpdated = Date.now();

    // Limit histogram size
    if (histogram.values.length > 10000) {
      histogram.values = histogram.values.slice(-10000);
    }

    // Record in time series
    this.recordTimeSeries(name, value, tags);
  }

  /**
   * Record a timer metric
   */
  timer(name, tags = {}) {
    const key = this.generateKey(name, tags);
    const startTime = process.hrtime.bigint();

    return {
      end: () => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1e6; // Convert to ms

        this.histogram(`${name}.duration`, duration, tags);

        return duration;
      }
    };
  }

  /**
   * Record time series data
   */
  recordTimeSeries(name, value, tags = {}) {
    const key = this.generateKey(name, tags);

    if (!this.timeSeries.has(key)) {
      this.timeSeries.set(key, []);
    }

    const series = this.timeSeries.get(key);
    series.push({
      timestamp: Date.now(),
      value
    });

    // Limit series size
    if (series.length > this.maxTimeSeriesPoints) {
      series.shift();
    }
  }

  /**
   * Generate metric key
   */
  generateKey(name, tags) {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');

    return `${this.namespace}.${name}${tagString ? `:${tagString}` : ''}`;
  }

  /**
   * Get aggregated metrics
   */
  getAggregated(window = '1m') {
    const aggregated = {
      counters: {},
      gauges: {},
      histograms: {}
    };

    // Aggregate counters
    for (const [key, counter] of this.counters) {
      aggregated.counters[key] = {
        ...counter,
        rate: this.calculateRate(counter, window)
      };
    }

    // Current gauge values
    for (const [key, gauge] of this.gauges) {
      aggregated.gauges[key] = gauge;
    }

    // Calculate histogram statistics
    for (const [key, histogram] of this.histograms) {
      aggregated.histograms[key] = {
        ...histogram,
        stats: this.calculateHistogramStats(histogram.values)
      };
    }

    return aggregated;
  }

  /**
   * Calculate rate for counter
   */
  calculateRate(counter, window) {
    const windowMs = this.parseWindow(window);
    const timePassed = Date.now() - (counter.lastUpdated - windowMs);

    if (timePassed <= 0) return 0;

    return counter.value / (timePassed / 1000); // Rate per second
  }

  /**
   * Calculate histogram statistics
   */
  calculateHistogramStats(values) {
    if (values.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0,
        stdDev: 0
      };
    }

    const sorted = values.slice().sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    // Calculate standard deviation
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
    const stdDev = Math.sqrt(variance);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean,
      median: sorted[Math.floor(count * 0.5)],
      p75: sorted[Math.floor(count * 0.75)],
      p90: sorted[Math.floor(count * 0.90)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
      stdDev
    };
  }

  /**
   * Parse window string to milliseconds
   */
  parseWindow(window) {
    const units = {
      's': 1000,
      'm': 60000,
      'h': 3600000,
      'd': 86400000
    };

    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) return 60000; // Default 1 minute

    return parseInt(match[1]) * units[match[2]];
  }

  /**
   * Start metric collection
   */
  startCollection() {
    // Flush metrics periodically
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);

    // Clean old metrics
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.retentionPeriod / 10);
  }

  /**
   * Flush metrics to external systems
   */
  async flush() {
    const metrics = this.getAggregated();

    // Send to monitoring service
    if (process.env.METRICS_ENDPOINT) {
      try {
        await this.sendToEndpoint(metrics);
      } catch (error) {
        console.error('Failed to flush metrics:', error);
      }
    }

    // Log locally if in debug mode
    if (process.env.DEBUG_METRICS) {
      console.log('Metrics:', JSON.stringify(metrics, null, 2));
    }
  }

  /**
   * Clean up old metrics
   */
  cleanup() {
    const cutoff = Date.now() - this.retentionPeriod;

    // Clean time series
    for (const [key, series] of this.timeSeries) {
      const filtered = series.filter(point => point.timestamp > cutoff);

      if (filtered.length === 0) {
        this.timeSeries.delete(key);
      } else {
        this.timeSeries.set(key, filtered);
      }
    }

    // Clean old histograms
    for (const [key, histogram] of this.histograms) {
      if (histogram.lastUpdated < cutoff) {
        this.histograms.delete(key);
      }
    }
  }
}
```

## 🔍 Application Performance Monitoring (APM)

### Distributed Tracing Implementation

```javascript
class DistributedTracing {
  constructor() {
    this.traces = new Map();
    this.activeSpans = new Map();
    this.completedTraces = [];
    this.maxTraces = 1000;
  }

  /**
   * Start a new trace
   */
  startTrace(operationName, context = {}) {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();

    const trace = {
      traceId,
      rootSpan: {
        spanId,
        operationName,
        startTime: Date.now(),
        context,
        children: []
      }
    };

    this.traces.set(traceId, trace);
    this.activeSpans.set(spanId, trace.rootSpan);

    return {
      traceId,
      spanId,
      startSpan: (name, parentSpanId = spanId) =>
        this.startSpan(traceId, name, parentSpanId),
      endSpan: (spanId) => this.endSpan(spanId),
      end: () => this.endTrace(traceId)
    };
  }

  /**
   * Start a new span within a trace
   */
  startSpan(traceId, operationName, parentSpanId) {
    const spanId = this.generateSpanId();
    const parentSpan = this.activeSpans.get(parentSpanId);

    if (!parentSpan) {
      throw new Error(`Parent span ${parentSpanId} not found`);
    }

    const span = {
      spanId,
      parentSpanId,
      operationName,
      startTime: Date.now(),
      tags: {},
      logs: [],
      children: []
    };

    parentSpan.children.push(span);
    this.activeSpans.set(spanId, span);

    return {
      spanId,
      setTag: (key, value) => this.setSpanTag(spanId, key, value),
      log: (message) => this.logToSpan(spanId, message),
      end: () => this.endSpan(spanId)
    };
  }

  /**
   * End a span
   */
  endSpan(spanId) {
    const span = this.activeSpans.get(spanId);

    if (!span) {
      console.warn(`Span ${spanId} not found`);
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;

    this.activeSpans.delete(spanId);

    return span;
  }

  /**
   * End a trace
   */
  endTrace(traceId) {
    const trace = this.traces.get(traceId);

    if (!trace) {
      console.warn(`Trace ${traceId} not found`);
      return;
    }

    // End root span if still active
    if (this.activeSpans.has(trace.rootSpan.spanId)) {
      this.endSpan(trace.rootSpan.spanId);
    }

    // Calculate trace metrics
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.rootSpan.startTime;
    trace.spanCount = this.countSpans(trace.rootSpan);
    trace.criticalPath = this.findCriticalPath(trace.rootSpan);

    // Store completed trace
    this.completedTraces.push(trace);
    if (this.completedTraces.length > this.maxTraces) {
      this.completedTraces.shift();
    }

    this.traces.delete(traceId);

    return trace;
  }

  /**
   * Set tag on a span
   */
  setSpanTag(spanId, key, value) {
    const span = this.activeSpans.get(spanId);

    if (span) {
      span.tags[key] = value;
    }
  }

  /**
   * Log to a span
   */
  logToSpan(spanId, message) {
    const span = this.activeSpans.get(spanId);

    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        message
      });
    }
  }

  /**
   * Count total spans in trace
   */
  countSpans(span) {
    let count = 1;

    for (const child of span.children) {
      count += this.countSpans(child);
    }

    return count;
  }

  /**
   * Find critical path in trace
   */
  findCriticalPath(span) {
    if (span.children.length === 0) {
      return [span];
    }

    // Find child with longest duration
    let longestChild = null;
    let maxDuration = 0;

    for (const child of span.children) {
      if (child.duration > maxDuration) {
        maxDuration = child.duration;
        longestChild = child;
      }
    }

    return [span, ...this.findCriticalPath(longestChild)];
  }

  /**
   * Generate trace ID
   */
  generateTraceId() {
    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate span ID
   */
  generateSpanId() {
    return `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get trace analytics
   */
  getAnalytics() {
    const analytics = {
      activeTraces: this.traces.size,
      activeSpans: this.activeSpans.size,
      completedTraces: this.completedTraces.length,
      averageDuration: 0,
      averageSpanCount: 0,
      slowestTraces: [],
      errorTraces: []
    };

    if (this.completedTraces.length > 0) {
      const durations = this.completedTraces.map(t => t.duration);
      const spanCounts = this.completedTraces.map(t => t.spanCount);

      analytics.averageDuration =
        durations.reduce((a, b) => a + b, 0) / durations.length;

      analytics.averageSpanCount =
        spanCounts.reduce((a, b) => a + b, 0) / spanCounts.length;

      // Find slowest traces
      analytics.slowestTraces = [...this.completedTraces]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map(t => ({
          traceId: t.traceId,
          operation: t.rootSpan.operationName,
          duration: t.duration,
          spanCount: t.spanCount
        }));

      // Find error traces
      analytics.errorTraces = this.completedTraces
        .filter(t => t.rootSpan.tags?.error === true)
        .slice(-5);
    }

    return analytics;
  }
}
```

## 📈 Real-time Performance Dashboard

### Performance Dashboard System

```javascript
class PerformanceDashboard {
  constructor(metricsCollector, tracing) {
    this.metrics = metricsCollector;
    this.tracing = tracing;
    this.updateInterval = 1000; // Update every second
    this.history = [];
    this.maxHistory = 300; // 5 minutes of data

    this.alerts = [];
    this.thresholds = {
      cpuUsage: 80,
      memoryUsage: 90,
      responseTime: 1000,
      errorRate: 5
    };
  }

  /**
   * Start dashboard monitoring
   */
  start() {
    this.interval = setInterval(() => {
      this.update();
    }, this.updateInterval);

    // Initial update
    this.update();
  }

  /**
   * Update dashboard data
   */
  update() {
    const snapshot = this.collectSnapshot();

    // Store in history
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Check for alerts
    this.checkAlerts(snapshot);

    // Render dashboard
    this.render(snapshot);
  }

  /**
   * Collect performance snapshot
   */
  collectSnapshot() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const snapshot = {
      timestamp: Date.now(),

      // System metrics
      system: {
        cpuUsage: this.calculateCPUPercentage(cpuUsage),
        memoryUsage: (memUsage.heapUsed / memUsage.heapTotal * 100),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },

      // Application metrics
      application: this.metrics.getAggregated('1m'),

      // Tracing data
      tracing: this.tracing.getAnalytics(),

      // Custom metrics
      custom: this.collectCustomMetrics()
    };

    return snapshot;
  }

  /**
   * Calculate CPU usage percentage
   */
  calculateCPUPercentage(usage) {
    if (!this.lastCpuUsage) {
      this.lastCpuUsage = usage;
      return 0;
    }

    const userDelta = usage.user - this.lastCpuUsage.user;
    const systemDelta = usage.system - this.lastCpuUsage.system;
    const totalDelta = userDelta + systemDelta;

    this.lastCpuUsage = usage;

    // Convert microseconds to percentage
    return (totalDelta / 10000).toFixed(2);
  }

  /**
   * Collect custom application metrics
   */
  collectCustomMetrics() {
    return {
      activeRequests: this.getActiveRequestCount(),
      queueDepth: this.getQueueDepth(),
      cacheHitRate: this.getCacheHitRate(),
      throughput: this.calculateThroughput()
    };
  }

  /**
   * Check for alert conditions
   */
  checkAlerts(snapshot) {
    const alerts = [];

    // CPU usage alert
    if (snapshot.system.cpuUsage > this.thresholds.cpuUsage) {
      alerts.push({
        type: 'cpu',
        severity: 'warning',
        message: `High CPU usage: ${snapshot.system.cpuUsage}%`,
        value: snapshot.system.cpuUsage,
        threshold: this.thresholds.cpuUsage
      });
    }

    // Memory usage alert
    if (snapshot.system.memoryUsage > this.thresholds.memoryUsage) {
      alerts.push({
        type: 'memory',
        severity: 'critical',
        message: `High memory usage: ${snapshot.system.memoryUsage.toFixed(2)}%`,
        value: snapshot.system.memoryUsage,
        threshold: this.thresholds.memoryUsage
      });
    }

    // Response time alert
    const avgResponseTime = this.getAverageResponseTime(snapshot);
    if (avgResponseTime > this.thresholds.responseTime) {
      alerts.push({
        type: 'responseTime',
        severity: 'warning',
        message: `Slow response time: ${avgResponseTime}ms`,
        value: avgResponseTime,
        threshold: this.thresholds.responseTime
      });
    }

    // Process new alerts
    for (const alert of alerts) {
      this.handleAlert(alert);
    }
  }

  /**
   * Handle alert
   */
  handleAlert(alert) {
    // Check if already alerting
    const existing = this.alerts.find(a =>
      a.type === alert.type && Date.now() - a.timestamp < 60000
    );

    if (!existing) {
      alert.timestamp = Date.now();
      this.alerts.push(alert);

      // Trigger alert action
      this.triggerAlertAction(alert);
    }
  }

  /**
   * Trigger alert action
   */
  triggerAlertAction(alert) {
    console.warn(`⚠️  Performance Alert: ${alert.message}`);

    // Take corrective action based on alert type
    switch (alert.type) {
      case 'memory':
        if (alert.severity === 'critical') {
          this.performMemoryCleanup();
        }
        break;

      case 'cpu':
        if (alert.severity === 'critical') {
          this.throttleOperations();
        }
        break;
    }

    // Send alert to monitoring service
    if (process.env.ALERT_WEBHOOK) {
      this.sendAlert(alert);
    }
  }

  /**
   * Render dashboard
   */
  render(snapshot) {
    if (!process.env.DASHBOARD_ENABLED) return;

    console.clear();
    console.log(this.formatDashboard(snapshot));
  }

  /**
   * Format dashboard display
   */
  formatDashboard(snapshot) {
    const output = [];

    // Header
    output.push('╔══════════════════════════════════════════════════════════════╗');
    output.push('║           CLAUDE CODE PERFORMANCE DASHBOARD                 ║');
    output.push('╠══════════════════════════════════════════════════════════════╣');

    // System metrics
    output.push('║ System Metrics                                              ║');
    output.push(`║   CPU Usage:    ${this.formatBar(snapshot.system.cpuUsage, 100)} ${snapshot.system.cpuUsage}%`);
    output.push(`║   Memory Usage: ${this.formatBar(snapshot.system.memoryUsage, 100)} ${snapshot.system.memoryUsage.toFixed(1)}%`);
    output.push(`║   Heap Used:    ${(snapshot.system.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    output.push(`║   RSS:          ${(snapshot.system.rss / 1024 / 1024).toFixed(2)} MB`);

    // Application metrics
    output.push('║                                                             ║');
    output.push('║ Application Metrics                                         ║');
    output.push(`║   Active Traces:  ${snapshot.tracing.activeTraces}`);
    output.push(`║   Active Spans:   ${snapshot.tracing.activeSpans}`);
    output.push(`║   Avg Duration:   ${snapshot.tracing.averageDuration.toFixed(2)}ms`);

    // Custom metrics
    output.push('║                                                             ║');
    output.push('║ Performance                                                 ║');
    output.push(`║   Throughput:     ${snapshot.custom.throughput} req/s`);
    output.push(`║   Cache Hit Rate: ${snapshot.custom.cacheHitRate}%`);
    output.push(`║   Queue Depth:    ${snapshot.custom.queueDepth}`);

    // Alerts
    if (this.alerts.length > 0) {
      output.push('║                                                             ║');
      output.push('║ ⚠️  Active Alerts                                           ║');

      for (const alert of this.alerts.slice(-3)) {
        output.push(`║   ${alert.message}`);
      }
    }

    // Footer
    output.push('╚══════════════════════════════════════════════════════════════╝');

    return output.join('\n');
  }

  /**
   * Format progress bar
   */
  formatBar(value, max) {
    const width = 20;
    const filled = Math.round((value / max) * width);
    const empty = width - filled;

    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}
```

## 🔬 Performance Anomaly Detection

### Anomaly Detection System

```javascript
class PerformanceAnomalyDetector {
  constructor() {
    this.baselines = new Map();
    this.anomalies = [];
    this.learningPeriod = 3600000; // 1 hour
    this.sensitivity = 2; // Standard deviations
  }

  /**
   * Learn baseline for metric
   */
  learnBaseline(metricName, values) {
    const stats = this.calculateStatistics(values);

    this.baselines.set(metricName, {
      mean: stats.mean,
      stdDev: stats.stdDev,
      min: stats.min,
      max: stats.max,
      learned: Date.now(),
      sampleCount: values.length
    });
  }

  /**
   * Detect anomaly in metric value
   */
  detectAnomaly(metricName, value) {
    const baseline = this.baselines.get(metricName);

    if (!baseline) {
      return null;
    }

    // Check if value is anomalous
    const zScore = Math.abs((value - baseline.mean) / baseline.stdDev);

    if (zScore > this.sensitivity) {
      const anomaly = {
        metric: metricName,
        value,
        baseline: baseline.mean,
        zScore,
        severity: this.calculateSeverity(zScore),
        timestamp: Date.now()
      };

      this.anomalies.push(anomaly);
      return anomaly;
    }

    return null;
  }

  /**
   * Calculate statistics
   */
  calculateStatistics(values) {
    const n = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      stdDev,
      min: Math.min(...values),
      max: Math.max(...values),
      count: n
    };
  }

  /**
   * Calculate anomaly severity
   */
  calculateSeverity(zScore) {
    if (zScore > 4) return 'critical';
    if (zScore > 3) return 'high';
    if (zScore > 2) return 'medium';
    return 'low';
  }

  /**
   * Analyze patterns in anomalies
   */
  analyzeAnomalyPatterns() {
    const patterns = {
      recurring: [],
      trending: [],
      correlated: []
    };

    // Find recurring anomalies
    const metricAnomalies = new Map();

    for (const anomaly of this.anomalies) {
      if (!metricAnomalies.has(anomaly.metric)) {
        metricAnomalies.set(anomaly.metric, []);
      }
      metricAnomalies.get(anomaly.metric).push(anomaly);
    }

    // Check for patterns
    for (const [metric, anomalies] of metricAnomalies) {
      if (anomalies.length >= 3) {
        // Check for recurring pattern
        const intervals = [];
        for (let i = 1; i < anomalies.length; i++) {
          intervals.push(anomalies[i].timestamp - anomalies[i - 1].timestamp);
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const stdDev = Math.sqrt(
          intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
        );

        if (stdDev < avgInterval * 0.2) {
          patterns.recurring.push({
            metric,
            interval: avgInterval,
            count: anomalies.length
          });
        }

        // Check for trending
        const values = anomalies.map(a => a.value);
        const trend = this.calculateTrend(values);

        if (Math.abs(trend) > 0.5) {
          patterns.trending.push({
            metric,
            trend,
            direction: trend > 0 ? 'increasing' : 'decreasing'
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Calculate trend coefficient
   */
  calculateTrend(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }
}
```

## 📊 Performance Reporting

### Comprehensive Performance Report Generator

```javascript
class PerformanceReportGenerator {
  constructor(collector, tracing, anomalyDetector) {
    this.collector = collector;
    this.tracing = tracing;
    this.anomalyDetector = anomalyDetector;
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport(period = '1h') {
    const report = {
      metadata: {
        generated: new Date().toISOString(),
        period,
        version: '1.0.0'
      },

      summary: await this.generateSummary(period),
      metrics: await this.generateMetricsSection(period),
      tracing: await this.generateTracingSection(period),
      anomalies: await this.generateAnomaliesSection(period),
      recommendations: await this.generateRecommendations(),

      charts: {
        cpuUsage: this.generateChart('cpu.usage', period),
        memoryUsage: this.generateChart('memory.usage', period),
        responseTime: this.generateChart('response.time', period),
        throughput: this.generateChart('throughput', period)
      }
    };

    return report;
  }

  /**
   * Generate summary section
   */
  async generateSummary(period) {
    const metrics = this.collector.getAggregated(period);

    return {
      uptime: process.uptime(),
      totalRequests: metrics.counters['requests.total']?.value || 0,
      errorRate: this.calculateErrorRate(metrics),
      averageResponseTime: this.calculateAverageResponseTime(metrics),
      peakMemoryUsage: this.getPeakMemoryUsage(period),
      peakCPUUsage: this.getPeakCPUUsage(period)
    };
  }

  /**
   * Generate metrics section
   */
  async generateMetricsSection(period) {
    const metrics = this.collector.getAggregated(period);

    return {
      counters: this.formatCounters(metrics.counters),
      gauges: this.formatGauges(metrics.gauges),
      histograms: this.formatHistograms(metrics.histograms),
      rates: this.calculateRates(metrics)
    };
  }

  /**
   * Generate tracing section
   */
  async generateTracingSection(period) {
    const analytics = this.tracing.getAnalytics();

    return {
      totalTraces: analytics.completedTraces,
      averageDuration: analytics.averageDuration,
      averageSpanCount: analytics.averageSpanCount,
      slowestOperations: analytics.slowestTraces,
      errorTraces: analytics.errorTraces.length,
      traceDistribution: this.calculateTraceDistribution(analytics)
    };
  }

  /**
   * Generate anomalies section
   */
  async generateAnomaliesSection(period) {
    const patterns = this.anomalyDetector.analyzeAnomalyPatterns();

    return {
      totalAnomalies: this.anomalyDetector.anomalies.length,
      criticalAnomalies: this.anomalyDetector.anomalies.filter(
        a => a.severity === 'critical'
      ).length,
      patterns: {
        recurring: patterns.recurring,
        trending: patterns.trending
      },
      recentAnomalies: this.anomalyDetector.anomalies.slice(-10)
    };
  }

  /**
   * Generate recommendations
   */
  async generateRecommendations() {
    const recommendations = [];
    const metrics = this.collector.getAggregated('1h');

    // Memory recommendations
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.8) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        message: 'High memory usage detected. Consider optimizing memory allocation or increasing heap size.',
        actions: [
          'Review memory-intensive operations',
          'Implement object pooling',
          'Check for memory leaks'
        ]
      });
    }

    // Response time recommendations
    const responseTimeHistogram = metrics.histograms['response.time'];
    if (responseTimeHistogram && responseTimeHistogram.stats.p95 > 1000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Slow response times detected. Consider optimization.',
        actions: [
          'Profile slow operations',
          'Implement caching',
          'Optimize database queries'
        ]
      });
    }

    // Error rate recommendations
    const errorRate = this.calculateErrorRate(metrics);
    if (errorRate > 5) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: `High error rate detected: ${errorRate.toFixed(2)}%`,
        actions: [
          'Review error logs',
          'Implement retry logic',
          'Add error recovery mechanisms'
        ]
      });
    }

    return recommendations;
  }

  /**
   * Generate chart data
   */
  generateChart(metricName, period) {
    const timeSeries = this.collector.timeSeries.get(metricName);

    if (!timeSeries) {
      return { labels: [], data: [] };
    }

    // Aggregate into buckets
    const buckets = this.aggregateIntoBuckets(timeSeries, period);

    return {
      labels: buckets.map(b => new Date(b.timestamp).toISOString()),
      data: buckets.map(b => b.value)
    };
  }

  /**
   * Export report to various formats
   */
  async exportReport(report, format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);

      case 'html':
        return this.generateHTMLReport(report);

      case 'markdown':
        return this.generateMarkdownReport(report);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Performance Report - ${report.metadata.generated}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .metric { margin: 10px 0; }
    .chart { margin: 20px 0; }
    .recommendation {
      padding: 10px;
      margin: 10px 0;
      border-left: 4px solid #ff9800;
      background: #fff3e0;
    }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Performance Report</h1>

  <h2>Summary</h2>
  <div class="metric">Uptime: ${report.summary.uptime}s</div>
  <div class="metric">Total Requests: ${report.summary.totalRequests}</div>
  <div class="metric">Error Rate: ${report.summary.errorRate}%</div>
  <div class="metric">Avg Response Time: ${report.summary.averageResponseTime}ms</div>

  <h2>Recommendations</h2>
  ${report.recommendations.map(rec => `
    <div class="recommendation">
      <strong>${rec.message}</strong>
      <ul>
        ${rec.actions.map(action => `<li>${action}</li>`).join('')}
      </ul>
    </div>
  `).join('')}

  <h2>Metrics</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
      <th>Rate</th>
    </tr>
    ${Object.entries(report.metrics.counters).map(([key, value]) => `
      <tr>
        <td>${key}</td>
        <td>${value.value}</td>
        <td>${value.rate}/s</td>
      </tr>
    `).join('')}
  </table>
</body>
</html>`;
  }
}
```

## 🚀 Real-World Integration

### Complete Performance Monitoring Setup

```javascript
class PerformanceMonitoringSystem {
  constructor() {
    // Initialize components
    this.collector = new MetricsCollector();
    this.tracing = new DistributedTracing();
    this.anomalyDetector = new PerformanceAnomalyDetector();
    this.dashboard = new PerformanceDashboard(this.collector, this.tracing);
    this.reportGenerator = new PerformanceReportGenerator(
      this.collector,
      this.tracing,
      this.anomalyDetector
    );

    // Setup monitoring
    this.setupMonitoring();
  }

  /**
   * Setup comprehensive monitoring
   */
  setupMonitoring() {
    // Start dashboard
    if (process.env.DASHBOARD_ENABLED) {
      this.dashboard.start();
    }

    // Setup automatic reporting
    this.setupAutomaticReporting();

    // Setup metric collection
    this.setupMetricCollection();

    // Learn baselines
    this.learnBaselines();
  }

  /**
   * Setup automatic reporting
   */
  setupAutomaticReporting() {
    // Daily reports
    setInterval(async () => {
      const report = await this.reportGenerator.generateReport('24h');
      await this.sendReport(report);
    }, 86400000); // 24 hours

    // Hourly summary
    setInterval(async () => {
      const summary = await this.reportGenerator.generateSummary('1h');
      this.collector.gauge('report.summary', 1, { type: 'hourly' });

      if (process.env.DEBUG) {
        console.log('Hourly Summary:', summary);
      }
    }, 3600000); // 1 hour
  }

  /**
   * Setup metric collection hooks
   */
  setupMetricCollection() {
    // HTTP request metrics
    this.instrumentHTTPRequests();

    // Database query metrics
    this.instrumentDatabaseQueries();

    // Tool execution metrics
    this.instrumentToolExecution();

    // System metrics
    this.collectSystemMetrics();
  }

  /**
   * Instrument HTTP requests
   */
  instrumentHTTPRequests() {
    const originalFetch = global.fetch;

    global.fetch = async (...args) => {
      const timer = this.collector.timer('http.request');
      const trace = this.tracing.startTrace('http.request', {
        url: args[0],
        method: args[1]?.method || 'GET'
      });

      try {
        const response = await originalFetch(...args);

        timer.end();
        trace.end();

        this.collector.counter('http.requests', 1, {
          status: response.status,
          method: args[1]?.method || 'GET'
        });

        return response;
      } catch (error) {
        timer.end();
        trace.setTag('error', true);
        trace.end();

        this.collector.counter('http.errors', 1);
        throw error;
      }
    };
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Memory metrics
      this.collector.gauge('memory.heap.used', memUsage.heapUsed);
      this.collector.gauge('memory.heap.total', memUsage.heapTotal);
      this.collector.gauge('memory.rss', memUsage.rss);
      this.collector.gauge('memory.external', memUsage.external);

      // CPU metrics
      this.collector.gauge('cpu.user', cpuUsage.user);
      this.collector.gauge('cpu.system', cpuUsage.system);

      // Event loop metrics
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        this.collector.histogram('eventloop.lag', lag);
      });
    }, 5000);
  }

  /**
   * Learn performance baselines
   */
  async learnBaselines() {
    // Wait for initial data collection
    await new Promise(resolve => setTimeout(resolve, 60000));

    // Learn baselines for key metrics
    const metrics = ['response.time', 'memory.heap.used', 'cpu.user'];

    for (const metric of metrics) {
      const timeSeries = this.collector.timeSeries.get(metric);

      if (timeSeries && timeSeries.length > 100) {
        const values = timeSeries.map(p => p.value);
        this.anomalyDetector.learnBaseline(metric, values);
      }
    }
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      collector: {
        metrics: this.collector.counters.size +
                 this.collector.gauges.size +
                 this.collector.histograms.size,
        timeSeries: this.collector.timeSeries.size
      },
      tracing: {
        activeTraces: this.tracing.traces.size,
        completedTraces: this.tracing.completedTraces.length
      },
      anomalies: {
        detected: this.anomalyDetector.anomalies.length,
        baselines: this.anomalyDetector.baselines.size
      },
      dashboard: {
        running: !!this.dashboard.interval,
        alerts: this.dashboard.alerts.length
      }
    };
  }
}

// Initialize monitoring
const monitoring = new PerformanceMonitoringSystem();

// Export for use in application
export default monitoring;
```

## 📊 Summary

The Performance Monitoring and Metrics system in Claude Code provides comprehensive observability and analytics capabilities. Key achievements include:

1. **Universal Metrics Collection**: Complete metrics system with counters, gauges, histograms, and timers
2. **Distributed Tracing**: Full tracing implementation with spans, tags, and critical path analysis
3. **Real-time Dashboard**: Live performance dashboard with visual indicators and alerts
4. **Anomaly Detection**: Statistical anomaly detection with pattern recognition
5. **Performance Reporting**: Comprehensive report generation in multiple formats
6. **Alert System**: Threshold-based alerting with corrective actions
7. **System Monitoring**: CPU, memory, and event loop monitoring
8. **Integration Hooks**: Automatic instrumentation of HTTP, database, and tool operations

The implementation demonstrates how CLI applications can achieve enterprise-grade observability with real-time monitoring, intelligent alerting, and comprehensive analytics. These capabilities ensure Claude Code maintains optimal performance while providing deep insights into application behavior.

---

*This completes Part 8: Performance Optimization. The comprehensive documentation covers profiling, memory management, caching strategies, and performance monitoring - providing a complete picture of Claude Code's sophisticated performance optimization system.*