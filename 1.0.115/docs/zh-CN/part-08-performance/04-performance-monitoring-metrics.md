# 第 8.4 部分：性能监控和指标 - Claude Code 技术系列

## 📊 引言：实时性能监控和分析

Claude Code 中的性能监控超越了简单的时序测量,实现了一个全面的指标收集和分析系统,深入洞察应用程序行为。系统在所有组件中捕获详细的性能数据,实现主动优化和快速问题检测。

该实现展示了现代 CLI 应用程序如何保持与 Web 服务相当的可观察性,具有实时指标、智能警报和强大的分析功能。

## 🎯 核心指标收集系统

### 通用指标收集器

```javascript
/**
 * 具有聚合和报告的全面指标收集系统
 */
class MetricsCollector {
  constructor(options = {}) {
    this.namespace = options.namespace || 'claude-code';
    this.flushInterval = options.flushInterval || 10000; // 10 秒
    this.retentionPeriod = options.retentionPeriod || 3600000; // 1 小时

    // 指标类型
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.timers = new Map();

    // 时间序列数据
    this.timeSeries = new Map();
    this.maxTimeSeriesPoints = options.maxTimeSeriesPoints || 1000;

    // 聚合窗口
    this.windows = {
      '1m': new Map(),
      '5m': new Map(),
      '15m': new Map(),
      '1h': new Map()
    };

    // 开始收集
    this.startCollection();
  }

  /**
   * 记录计数器指标
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

    // 记录在时间序列中
    this.recordTimeSeries(name, counter.value, tags);
  }

  /**
   * 记录量规指标
   */
  gauge(name, value, tags = {}) {
    const key = this.generateKey(name, tags);

    this.gauges.set(key, {
      name,
      tags,
      value,
      lastUpdated: Date.now()
    });

    // 记录在时间序列中
    this.recordTimeSeries(name, value, tags);
  }

  /**
   * 记录直方图指标
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

    // 限制直方图大小
    if (histogram.values.length > 10000) {
      histogram.values = histogram.values.slice(-10000);
    }

    // 记录在时间序列中
    this.recordTimeSeries(name, value, tags);
  }

  /**
   * 记录计时器指标
   */
  timer(name, tags = {}) {
    const key = this.generateKey(name, tags);
    const startTime = process.hrtime.bigint();

    return {
      end: () => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1e6; // 转换为毫秒

        this.histogram(`${name}.duration`, duration, tags);

        return duration;
      }
    };
  }

  /**
   * 记录时间序列数据
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

    // 限制序列大小
    if (series.length > this.maxTimeSeriesPoints) {
      series.shift();
    }
  }

  /**
   * 生成指标键
   */
  generateKey(name, tags) {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');

    return `${this.namespace}.${name}${tagString ? `:${tagString}` : ''}`;
  }

  /**
   * 获取聚合指标
   */
  getAggregated(window = '1m') {
    const aggregated = {
      counters: {},
      gauges: {},
      histograms: {}
    };

    // 聚合计数器
    for (const [key, counter] of this.counters) {
      aggregated.counters[key] = {
        ...counter,
        rate: this.calculateRate(counter, window)
      };
    }

    // 当前量规值
    for (const [key, gauge] of this.gauges) {
      aggregated.gauges[key] = gauge;
    }

    // 计算直方图统计
    for (const [key, histogram] of this.histograms) {
      aggregated.histograms[key] = {
        ...histogram,
        stats: this.calculateHistogramStats(histogram.values)
      };
    }

    return aggregated;
  }

  /**
   * 计算计数器速率
   */
  calculateRate(counter, window) {
    const windowMs = this.parseWindow(window);
    const timePassed = Date.now() - (counter.lastUpdated - windowMs);

    if (timePassed <= 0) return 0;

    return counter.value / (timePassed / 1000); // 每秒速率
  }

  /**
   * 计算直方图统计
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

    // 计算标准差
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
   * 将窗口字符串解析为毫秒
   */
  parseWindow(window) {
    const units = {
      's': 1000,
      'm': 60000,
      'h': 3600000,
      'd': 86400000
    };

    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) return 60000; // 默认 1 分钟

    return parseInt(match[1]) * units[match[2]];
  }

  /**
   * 开始指标收集
   */
  startCollection() {
    // 定期刷新指标
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);

    // 清理旧指标
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.retentionPeriod / 10);
  }

  /**
   * 将指标刷新到外部系统
   */
  async flush() {
    const metrics = this.getAggregated();

    // 发送到监控服务
    if (process.env.METRICS_ENDPOINT) {
      try {
        await this.sendToEndpoint(metrics);
      } catch (error) {
        console.error('Failed to flush metrics:', error);
      }
    }

    // 如果在调试模式下则本地记录
    if (process.env.DEBUG_METRICS) {
      console.log('Metrics:', JSON.stringify(metrics, null, 2));
    }
  }

  /**
   * 清理旧指标
   */
  cleanup() {
    const cutoff = Date.now() - this.retentionPeriod;

    // 清理时间序列
    for (const [key, series] of this.timeSeries) {
      const filtered = series.filter(point => point.timestamp > cutoff);

      if (filtered.length === 0) {
        this.timeSeries.delete(key);
      } else {
        this.timeSeries.set(key, filtered);
      }
    }

    // 清理旧直方图
    for (const [key, histogram] of this.histograms) {
      if (histogram.lastUpdated < cutoff) {
        this.histograms.delete(key);
      }
    }
  }
}
```

## 🔍 应用性能监控 (APM)

### 分布式跟踪实现

```javascript
class DistributedTracing {
  constructor() {
    this.traces = new Map();
    this.activeSpans = new Map();
    this.completedTraces = [];
    this.maxTraces = 1000;
  }

  /**
   * 开始新跟踪
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
   * 在跟踪内启动新跨度
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
   * 结束跨度
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
   * 结束跟踪
   */
  endTrace(traceId) {
    const trace = this.traces.get(traceId);

    if (!trace) {
      console.warn(`Trace ${traceId} not found`);
      return;
    }

    // 如果根跨度仍处于活动状态则结束它
    if (this.activeSpans.has(trace.rootSpan.spanId)) {
      this.endSpan(trace.rootSpan.spanId);
    }

    // 计算跟踪指标
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.rootSpan.startTime;
    trace.spanCount = this.countSpans(trace.rootSpan);
    trace.criticalPath = this.findCriticalPath(trace.rootSpan);

    // 存储已完成的跟踪
    this.completedTraces.push(trace);
    if (this.completedTraces.length > this.maxTraces) {
      this.completedTraces.shift();
    }

    this.traces.delete(traceId);

    return trace;
  }

  /**
   * 在跨度上设置标签
   */
  setSpanTag(spanId, key, value) {
    const span = this.activeSpans.get(spanId);

    if (span) {
      span.tags[key] = value;
    }
  }

  /**
   * 记录到跨度
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
   * 计算跟踪中的总跨度
   */
  countSpans(span) {
    let count = 1;

    for (const child of span.children) {
      count += this.countSpans(child);
    }

    return count;
  }

  /**
   * 查找跟踪中的关键路径
   */
  findCriticalPath(span) {
    if (span.children.length === 0) {
      return [span];
    }

    // 查找持续时间最长的子级
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
   * 生成跟踪 ID
   */
  generateTraceId() {
    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成跨度 ID
   */
  generateSpanId() {
    return `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取跟踪分析
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

      // 查找最慢的跟踪
      analytics.slowestTraces = [...this.completedTraces]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map(t => ({
          traceId: t.traceId,
          operation: t.rootSpan.operationName,
          duration: t.duration,
          spanCount: t.spanCount
        }));

      // 查找错误跟踪
      analytics.errorTraces = this.completedTraces
        .filter(t => t.rootSpan.tags?.error === true)
        .slice(-5);
    }

    return analytics;
  }
}
```

## 📈 实时性能仪表板

### 性能仪表板系统

```javascript
class PerformanceDashboard {
  constructor(metricsCollector, tracing) {
    this.metrics = metricsCollector;
    this.tracing = tracing;
    this.updateInterval = 1000; // 每秒更新
    this.history = [];
    this.maxHistory = 300; // 5 分钟的数据

    this.alerts = [];
    this.thresholds = {
      cpuUsage: 80,
      memoryUsage: 90,
      responseTime: 1000,
      errorRate: 5
    };
  }

  /**
   * 启动仪表板监控
   */
  start() {
    this.interval = setInterval(() => {
      this.update();
    }, this.updateInterval);

    // 初始更新
    this.update();
  }

  /**
   * 更新仪表板数据
   */
  update() {
    const snapshot = this.collectSnapshot();

    // 存储在历史记录中
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // 检查警报
    this.checkAlerts(snapshot);

    // 渲染仪表板
    this.render(snapshot);
  }

  /**
   * 收集性能快照
   */
  collectSnapshot() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const snapshot = {
      timestamp: Date.now(),

      // 系统指标
      system: {
        cpuUsage: this.calculateCPUPercentage(cpuUsage),
        memoryUsage: (memUsage.heapUsed / memUsage.heapTotal * 100),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },

      // 应用程序指标
      application: this.metrics.getAggregated('1m'),

      // 跟踪数据
      tracing: this.tracing.getAnalytics(),

      // 自定义指标
      custom: this.collectCustomMetrics()
    };

    return snapshot;
  }

  /**
   * 计算 CPU 使用百分比
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

    // 将微秒转换为百分比
    return (totalDelta / 10000).toFixed(2);
  }

  /**
   * 收集自定义应用程序指标
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
   * 检查警报条件
   */
  checkAlerts(snapshot) {
    const alerts = [];

    // CPU 使用警报
    if (snapshot.system.cpuUsage > this.thresholds.cpuUsage) {
      alerts.push({
        type: 'cpu',
        severity: 'warning',
        message: `High CPU usage: ${snapshot.system.cpuUsage}%`,
        value: snapshot.system.cpuUsage,
        threshold: this.thresholds.cpuUsage
      });
    }

    // 内存使用警报
    if (snapshot.system.memoryUsage > this.thresholds.memoryUsage) {
      alerts.push({
        type: 'memory',
        severity: 'critical',
        message: `High memory usage: ${snapshot.system.memoryUsage.toFixed(2)}%`,
        value: snapshot.system.memoryUsage,
        threshold: this.thresholds.memoryUsage
      });
    }

    // 响应时间警报
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

    // 处理新警报
    for (const alert of alerts) {
      this.handleAlert(alert);
    }
  }

  /**
   * 处理警报
   */
  handleAlert(alert) {
    // 检查是否已在警报
    const existing = this.alerts.find(a =>
      a.type === alert.type && Date.now() - a.timestamp < 60000
    );

    if (!existing) {
      alert.timestamp = Date.now();
      this.alerts.push(alert);

      // 触发警报动作
      this.triggerAlertAction(alert);
    }
  }

  /**
   * 触发警报动作
   */
  triggerAlertAction(alert) {
    console.warn(`⚠️  Performance Alert: ${alert.message}`);

    // 根据警报类型采取纠正措施
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

    // 向监控服务发送警报
    if (process.env.ALERT_WEBHOOK) {
      this.sendAlert(alert);
    }
  }

  /**
   * 渲染仪表板
   */
  render(snapshot) {
    if (!process.env.DASHBOARD_ENABLED) return;

    console.clear();
    console.log(this.formatDashboard(snapshot));
  }

  /**
   * 格式化仪表板显示
   */
  formatDashboard(snapshot) {
    const output = [];

    // 标题
    output.push('╔══════════════════════════════════════════════════════════════╗');
    output.push('║           CLAUDE CODE PERFORMANCE DASHBOARD                 ║');
    output.push('╠══════════════════════════════════════════════════════════════╣');

    // 系统指标
    output.push('║ System Metrics                                              ║');
    output.push(`║   CPU Usage:    ${this.formatBar(snapshot.system.cpuUsage, 100)} ${snapshot.system.cpuUsage}%`);
    output.push(`║   Memory Usage: ${this.formatBar(snapshot.system.memoryUsage, 100)} ${snapshot.system.memoryUsage.toFixed(1)}%`);
    output.push(`║   Heap Used:    ${(snapshot.system.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    output.push(`║   RSS:          ${(snapshot.system.rss / 1024 / 1024).toFixed(2)} MB`);

    // 应用程序指标
    output.push('║                                                             ║');
    output.push('║ Application Metrics                                         ║');
    output.push(`║   Active Traces:  ${snapshot.tracing.activeTraces}`);
    output.push(`║   Active Spans:   ${snapshot.tracing.activeSpans}`);
    output.push(`║   Avg Duration:   ${snapshot.tracing.averageDuration.toFixed(2)}ms`);

    // 自定义指标
    output.push('║                                                             ║');
    output.push('║ Performance                                                 ║');
    output.push(`║   Throughput:     ${snapshot.custom.throughput} req/s`);
    output.push(`║   Cache Hit Rate: ${snapshot.custom.cacheHitRate}%`);
    output.push(`║   Queue Depth:    ${snapshot.custom.queueDepth}`);

    // 警报
    if (this.alerts.length > 0) {
      output.push('║                                                             ║');
      output.push('║ ⚠️  Active Alerts                                           ║');

      for (const alert of this.alerts.slice(-3)) {
        output.push(`║   ${alert.message}`);
      }
    }

    // 页脚
    output.push('╚══════════════════════════════════════════════════════════════╝');

    return output.join('\n');
  }

  /**
   * 格式化进度条
   */
  formatBar(value, max) {
    const width = 20;
    const filled = Math.round((value / max) * width);
    const empty = width - filled;

    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}
```

## 🔬 性能异常检测

### 异常检测系统

```javascript
class PerformanceAnomalyDetector {
  constructor() {
    this.baselines = new Map();
    this.anomalies = [];
    this.learningPeriod = 3600000; // 1 小时
    this.sensitivity = 2; // 标准差
  }

  /**
   * 学习指标的基线
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
   * 检测指标值中的异常
   */
  detectAnomaly(metricName, value) {
    const baseline = this.baselines.get(metricName);

    if (!baseline) {
      return null;
    }

    // 检查值是否异常
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
   * 计算统计数据
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
   * 计算异常严重性
   */
  calculateSeverity(zScore) {
    if (zScore > 4) return 'critical';
    if (zScore > 3) return 'high';
    if (zScore > 2) return 'medium';
    return 'low';
  }

  /**
   * 分析异常模式
   */
  analyzeAnomalyPatterns() {
    const patterns = {
      recurring: [],
      trending: [],
      correlated: []
    };

    // 查找重复异常
    const metricAnomalies = new Map();

    for (const anomaly of this.anomalies) {
      if (!metricAnomalies.has(anomaly.metric)) {
        metricAnomalies.set(anomaly.metric, []);
      }
      metricAnomalies.get(anomaly.metric).push(anomaly);
    }

    // 检查模式
    for (const [metric, anomalies] of metricAnomalies) {
      if (anomalies.length >= 3) {
        // 检查重复模式
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

        // 检查趋势
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
   * 计算趋势系数
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

## 📊 性能报告

### 全面的性能报告生成器

```javascript
class PerformanceReportGenerator {
  constructor(collector, tracing, anomalyDetector) {
    this.collector = collector;
    this.tracing = tracing;
    this.anomalyDetector = anomalyDetector;
  }

  /**
   * 生成全面的性能报告
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
   * 生成摘要部分
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
   * 生成指标部分
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
   * 生成跟踪部分
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
   * 生成异常部分
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
   * 生成建议
   */
  async generateRecommendations() {
    const recommendations = [];
    const metrics = this.collector.getAggregated('1h');

    // 内存建议
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

    // 响应时间建议
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

    // 错误率建议
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
   * 生成图表数据
   */
  generateChart(metricName, period) {
    const timeSeries = this.collector.timeSeries.get(metricName);

    if (!timeSeries) {
      return { labels: [], data: [] };
    }

    // 聚合到桶中
    const buckets = this.aggregateIntoBuckets(timeSeries, period);

    return {
      labels: buckets.map(b => new Date(b.timestamp).toISOString()),
      data: buckets.map(b => b.value)
    };
  }

  /**
   * 将报告导出为各种格式
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
   * 生成 HTML 报告
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

## 🚀 实际集成

### 完整的性能监控设置

```javascript
class PerformanceMonitoringSystem {
  constructor() {
    // 初始化组件
    this.collector = new MetricsCollector();
    this.tracing = new DistributedTracing();
    this.anomalyDetector = new PerformanceAnomalyDetector();
    this.dashboard = new PerformanceDashboard(this.collector, this.tracing);
    this.reportGenerator = new PerformanceReportGenerator(
      this.collector,
      this.tracing,
      this.anomalyDetector
    );

    // 设置监控
    this.setupMonitoring();
  }

  /**
   * 设置全面监控
   */
  setupMonitoring() {
    // 启动仪表板
    if (process.env.DASHBOARD_ENABLED) {
      this.dashboard.start();
    }

    // 设置自动报告
    this.setupAutomaticReporting();

    // 设置指标收集
    this.setupMetricCollection();

    // 学习基线
    this.learnBaselines();
  }

  /**
   * 设置自动报告
   */
  setupAutomaticReporting() {
    // 每日报告
    setInterval(async () => {
      const report = await this.reportGenerator.generateReport('24h');
      await this.sendReport(report);
    }, 86400000); // 24 小时

    // 每小时摘要
    setInterval(async () => {
      const summary = await this.reportGenerator.generateSummary('1h');
      this.collector.gauge('report.summary', 1, { type: 'hourly' });

      if (process.env.DEBUG) {
        console.log('Hourly Summary:', summary);
      }
    }, 3600000); // 1 小时
  }

  /**
   * 设置指标收集钩子
   */
  setupMetricCollection() {
    // HTTP 请求指标
    this.instrumentHTTPRequests();

    // 数据库查询指标
    this.instrumentDatabaseQueries();

    // 工具执行指标
    this.instrumentToolExecution();

    // 系统指标
    this.collectSystemMetrics();
  }

  /**
   * 检测 HTTP 请求
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
   * 收集系统指标
   */
  collectSystemMetrics() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // 内存指标
      this.collector.gauge('memory.heap.used', memUsage.heapUsed);
      this.collector.gauge('memory.heap.total', memUsage.heapTotal);
      this.collector.gauge('memory.rss', memUsage.rss);
      this.collector.gauge('memory.external', memUsage.external);

      // CPU 指标
      this.collector.gauge('cpu.user', cpuUsage.user);
      this.collector.gauge('cpu.system', cpuUsage.system);

      // 事件循环指标
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        this.collector.histogram('eventloop.lag', lag);
      });
    }, 5000);
  }

  /**
   * 学习性能基线
   */
  async learnBaselines() {
    // 等待初始数据收集
    await new Promise(resolve => setTimeout(resolve, 60000));

    // 学习关键指标的基线
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
   * 获取监控状态
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

// 初始化监控
const monitoring = new PerformanceMonitoringSystem();

// 导出供应用程序使用
export default monitoring;
```

## 📊 总结

Claude Code 中的性能监控和指标系统提供了全面的可观察性和分析功能。主要成果包括：

1. **通用指标收集**：具有计数器、量规、直方图和计时器的完整指标系统
2. **分布式跟踪**：具有跨度、标签和关键路径分析的完整跟踪实现
3. **实时仪表板**：具有可视化指示器和警报的实时性能仪表板
4. **异常检测**：具有模式识别的统计异常检测
5. **性能报告**：以多种格式生成全面报告
6. **警报系统**：基于阈值的警报与纠正措施
7. **系统监控**：CPU、内存和事件循环监控
8. **集成钩子**：自动检测 HTTP、数据库和工具操作

该实现展示了 CLI 应用程序如何通过实时监控、智能警报和全面的分析实现企业级可观察性。这些功能确保 Claude Code 在保持最佳性能的同时深入洞察应用程序行为。

---

*这完成了第 8 部分：性能优化。全面的文档涵盖了分析、内存管理、缓存策略和性能监控 - 提供了 Claude Code 复杂的性能优化系统的完整图景。*