# Part 8.1: Profiling and Benchmarking - Claude Code Technical Series

## 🚀 Introduction: Measuring and Optimizing Performance

Performance optimization in Claude Code is critical for providing a responsive, efficient CLI experience. The system implements sophisticated profiling and benchmarking techniques to identify bottlenecks, measure improvements, and ensure optimal resource utilization across different environments and workloads.

This comprehensive implementation demonstrates how modern CLI applications can achieve near-instantaneous responses while handling complex operations like API streaming, file processing, and concurrent tool execution.

## 📊 Performance Profiling Architecture

### Core Profiling System

Claude Code implements a multi-layered profiling system:

```javascript
/**
 * PerformanceProfiler class for measuring and tracking performance metrics
 */
class PerformanceProfiler {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.verbose = options.verbose || false;
    this.metricsCollector = options.metricsCollector || new MetricsCollector();

    // Performance marks and measures
    this.marks = new Map();
    this.measures = new Map();

    // Timing data
    this.timings = {
      startup: {},
      api: {},
      tools: {},
      rendering: {},
      io: {}
    };

    // Resource usage tracking
    this.resourceSnapshots = [];
    this.maxSnapshots = options.maxSnapshots || 100;

    // Start tracking if enabled
    if (this.enabled) {
      this.startProfiling();
    }
  }

  /**
   * Start profiling session
   */
  startProfiling() {
    this.sessionStart = Date.now();
    this.initialMemory = process.memoryUsage();
    this.initialCpuUsage = process.cpuUsage();

    // Mark session start
    this.mark('session:start');

    // Start resource monitoring
    this.startResourceMonitoring();
  }

  /**
   * Create a performance mark
   */
  mark(name, metadata = {}) {
    if (!this.enabled) return;

    const timestamp = performance.now();

    this.marks.set(name, {
      timestamp,
      metadata,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    });

    if (this.verbose) {
      console.debug(`[PERF] Mark: ${name} at ${timestamp.toFixed(2)}ms`);
    }
  }

  /**
   * Measure between two marks
   */
  measure(name, startMark, endMark) {
    if (!this.enabled) return;

    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);

    if (!start || !end) {
      console.warn(`Cannot measure ${name}: missing marks`);
      return;
    }

    const duration = end.timestamp - start.timestamp;
    const memoryDelta = {
      rss: end.memory.rss - start.memory.rss,
      heapTotal: end.memory.heapTotal - start.memory.heapTotal,
      heapUsed: end.memory.heapUsed - start.memory.heapUsed,
      external: end.memory.external - start.memory.external
    };

    const cpuDelta = {
      user: end.cpu.user - start.cpu.user,
      system: end.cpu.system - start.cpu.system
    };

    const measurement = {
      name,
      duration,
      memoryDelta,
      cpuDelta,
      startMark,
      endMark,
      timestamp: Date.now()
    };

    this.measures.set(name, measurement);
    this.metricsCollector.record('performance.measure', measurement);

    if (this.verbose) {
      console.debug(`[PERF] Measure: ${name} = ${duration.toFixed(2)}ms`);
    }

    return measurement;
  }
}
```

### Startup Performance Tracking

```javascript
class StartupProfiler {
  constructor() {
    this.phases = [];
    this.startTime = process.hrtime.bigint();
    this.requireTime = new Map();

    // Hook into module loading
    this.hookModuleLoading();
  }

  /**
   * Track a startup phase
   */
  trackPhase(name, fn) {
    const phaseStart = process.hrtime.bigint();

    try {
      const result = fn();

      const phaseEnd = process.hrtime.bigint();
      const duration = Number(phaseEnd - phaseStart) / 1e6; // Convert to ms

      this.phases.push({
        name,
        duration,
        success: true,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      const phaseEnd = process.hrtime.bigint();
      const duration = Number(phaseEnd - phaseStart) / 1e6;

      this.phases.push({
        name,
        duration,
        success: false,
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  }

  /**
   * Hook into module loading to track require times
   */
  hookModuleLoading() {
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    Module.prototype.require = (id) => {
      const start = process.hrtime.bigint();
      const result = originalRequire.apply(this, [id]);
      const end = process.hrtime.bigint();

      const duration = Number(end - start) / 1e6;

      if (!this.requireTime.has(id)) {
        this.requireTime.set(id, []);
      }

      this.requireTime.get(id).push(duration);

      return result;
    };
  }

  /**
   * Get startup report
   */
  getReport() {
    const totalTime = Number(process.hrtime.bigint() - this.startTime) / 1e6;

    // Sort phases by duration
    const sortedPhases = [...this.phases].sort((a, b) => b.duration - a.duration);

    // Get slowest module loads
    const moduleLoads = Array.from(this.requireTime.entries())
      .map(([module, times]) => ({
        module,
        totalTime: times.reduce((a, b) => a + b, 0),
        loadCount: times.length,
        averageTime: times.reduce((a, b) => a + b, 0) / times.length
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 10);

    return {
      totalStartupTime: totalTime,
      phases: sortedPhases,
      slowestModules: moduleLoads,
      phaseBreakdown: this.phases.reduce((acc, phase) => {
        acc[phase.name] = phase.duration;
        return acc;
      }, {})
    };
  }
}
```

## 🎯 Benchmarking Framework

### Micro-benchmarking System

```javascript
class MicroBenchmark {
  constructor(name, options = {}) {
    this.name = name;
    this.iterations = options.iterations || 1000;
    this.warmupIterations = options.warmup || 100;
    this.async = options.async || false;
    this.timeout = options.timeout || 30000;

    this.results = [];
    this.stats = null;
  }

  /**
   * Run the benchmark
   */
  async run(fn) {
    console.log(`Running benchmark: ${this.name}`);

    // Warmup phase
    console.log(`  Warming up (${this.warmupIterations} iterations)...`);
    await this.runIterations(fn, this.warmupIterations);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Actual benchmark
    console.log(`  Running benchmark (${this.iterations} iterations)...`);
    const times = await this.runIterations(fn, this.iterations);

    // Calculate statistics
    this.stats = this.calculateStats(times);

    // Report results
    this.report();

    return this.stats;
  }

  /**
   * Run multiple iterations
   */
  async runIterations(fn, count) {
    const times = [];

    for (let i = 0; i < count; i++) {
      const start = process.hrtime.bigint();

      if (this.async) {
        await fn();
      } else {
        fn();
      }

      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1e6; // Convert to ms

      times.push(duration);
    }

    return times;
  }

  /**
   * Calculate statistics
   */
  calculateStats(times) {
    const sorted = times.slice().sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const mean = sum / times.length;

    // Calculate standard deviation
    const squaredDiffs = times.map(t => Math.pow(t - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / times.length;
    const stdDev = Math.sqrt(variance);

    // Calculate percentiles
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return {
      name: this.name,
      iterations: this.iterations,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median: p50,
      stdDev,
      p75,
      p90,
      p95,
      p99,
      opsPerSecond: 1000 / mean
    };
  }

  /**
   * Report benchmark results
   */
  report() {
    console.log('\n📊 Benchmark Results:');
    console.log(`  Name: ${this.stats.name}`);
    console.log(`  Iterations: ${this.stats.iterations}`);
    console.log(`  Mean: ${this.stats.mean.toFixed(3)}ms`);
    console.log(`  Median: ${this.stats.median.toFixed(3)}ms`);
    console.log(`  Min: ${this.stats.min.toFixed(3)}ms`);
    console.log(`  Max: ${this.stats.max.toFixed(3)}ms`);
    console.log(`  Std Dev: ${this.stats.stdDev.toFixed(3)}ms`);
    console.log(`  P95: ${this.stats.p95.toFixed(3)}ms`);
    console.log(`  P99: ${this.stats.p99.toFixed(3)}ms`);
    console.log(`  Ops/sec: ${this.stats.opsPerSecond.toFixed(2)}`);
  }
}
```

### Comparative Benchmarking

```javascript
class BenchmarkSuite {
  constructor(name) {
    this.name = name;
    this.benchmarks = [];
    this.results = [];
  }

  /**
   * Add a benchmark to the suite
   */
  add(name, fn, options = {}) {
    this.benchmarks.push({
      name,
      fn,
      options
    });

    return this;
  }

  /**
   * Run all benchmarks
   */
  async run() {
    console.log(`\n🏃 Running Benchmark Suite: ${this.name}`);
    console.log('=' .repeat(50));

    for (const benchmark of this.benchmarks) {
      const bench = new MicroBenchmark(benchmark.name, benchmark.options);
      const stats = await bench.run(benchmark.fn);
      this.results.push(stats);

      // Add delay between benchmarks
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.compareResults();

    return this.results;
  }

  /**
   * Compare benchmark results
   */
  compareResults() {
    if (this.results.length < 2) return;

    console.log('\n📈 Comparison:');
    console.log('=' .repeat(50));

    // Find baseline (fastest)
    const baseline = this.results.reduce((min, curr) =>
      curr.mean < min.mean ? curr : min
    );

    // Create comparison table
    const table = this.results.map(result => ({
      Name: result.name,
      'Mean (ms)': result.mean.toFixed(3),
      'Ops/sec': result.opsPerSecond.toFixed(2),
      'Relative': result === baseline ? '1.00x (baseline)' :
                  `${(result.mean / baseline.mean).toFixed(2)}x slower`
    }));

    console.table(table);
  }
}

// Usage example
const suite = new BenchmarkSuite('String Processing');

suite.add('JSON.stringify', () => {
  const obj = { a: 1, b: 2, c: [1, 2, 3] };
  JSON.stringify(obj);
});

suite.add('String concatenation', () => {
  let result = '';
  for (let i = 0; i < 100; i++) {
    result += 'test';
  }
});

suite.add('Array join', () => {
  const arr = new Array(100).fill('test');
  arr.join('');
});

// Run benchmarks
await suite.run();
```

## 📈 API Performance Tracking

### Request/Response Profiling

```javascript
class APIPerformanceTracker {
  constructor() {
    this.requests = new Map();
    this.metrics = {
      totalRequests: 0,
      totalDuration: 0,
      averageDuration: 0,
      successRate: 0,
      errorRate: 0,
      throughput: 0
    };

    this.histogram = new LatencyHistogram();
    this.windowStart = Date.now();
  }

  /**
   * Track API request start
   */
  trackRequestStart(requestId, metadata = {}) {
    this.requests.set(requestId, {
      id: requestId,
      startTime: Date.now(),
      startHrTime: process.hrtime.bigint(),
      metadata,
      status: 'pending'
    });
  }

  /**
   * Track API request end
   */
  trackRequestEnd(requestId, response) {
    const request = this.requests.get(requestId);
    if (!request) return;

    const endTime = Date.now();
    const endHrTime = process.hrtime.bigint();

    const duration = Number(endHrTime - request.startHrTime) / 1e6; // ms

    request.endTime = endTime;
    request.duration = duration;
    request.status = response.error ? 'error' : 'success';
    request.statusCode = response.statusCode;
    request.responseSize = response.size || 0;

    // Update metrics
    this.updateMetrics(request);

    // Add to histogram
    this.histogram.record(duration);

    // Clean up old requests
    this.cleanupOldRequests();

    return request;
  }

  /**
   * Update aggregate metrics
   */
  updateMetrics(request) {
    this.metrics.totalRequests++;
    this.metrics.totalDuration += request.duration;
    this.metrics.averageDuration =
      this.metrics.totalDuration / this.metrics.totalRequests;

    if (request.status === 'success') {
      this.metrics.successRate =
        (this.metrics.successRate * (this.metrics.totalRequests - 1) + 1) /
        this.metrics.totalRequests;
    } else {
      this.metrics.errorRate =
        (this.metrics.errorRate * (this.metrics.totalRequests - 1) + 1) /
        this.metrics.totalRequests;
    }

    // Calculate throughput (requests per second)
    const windowDuration = (Date.now() - this.windowStart) / 1000;
    this.metrics.throughput = this.metrics.totalRequests / windowDuration;
  }

  /**
   * Get performance report
   */
  getReport() {
    return {
      metrics: this.metrics,
      histogram: this.histogram.getPercentiles(),
      activeRequests: Array.from(this.requests.values())
        .filter(r => r.status === 'pending')
        .length,
      recentRequests: Array.from(this.requests.values())
        .slice(-10)
        .map(r => ({
          id: r.id,
          duration: r.duration,
          status: r.status,
          statusCode: r.statusCode
        }))
    };
  }

  /**
   * Clean up old requests to prevent memory leak
   */
  cleanupOldRequests() {
    const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes

    for (const [id, request] of this.requests) {
      if (request.endTime && request.endTime < cutoff) {
        this.requests.delete(id);
      }
    }
  }
}
```

## 🔬 Tool Execution Profiling

### Tool Performance Monitor

```javascript
class ToolPerformanceMonitor {
  constructor() {
    this.toolMetrics = new Map();
    this.executionHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Profile tool execution
   */
  async profileToolExecution(toolName, toolFunction, input) {
    const executionId = `${toolName}-${Date.now()}`;

    const profile = {
      id: executionId,
      tool: toolName,
      startTime: Date.now(),
      startMemory: process.memoryUsage(),
      startCpu: process.cpuUsage()
    };

    try {
      // Execute with timing
      const startHr = process.hrtime.bigint();
      const result = await toolFunction(input);
      const endHr = process.hrtime.bigint();

      // Calculate metrics
      profile.endTime = Date.now();
      profile.duration = Number(endHr - startHr) / 1e6; // ms
      profile.endMemory = process.memoryUsage();
      profile.endCpu = process.cpuUsage();

      profile.memoryDelta = {
        heapUsed: profile.endMemory.heapUsed - profile.startMemory.heapUsed,
        external: profile.endMemory.external - profile.startMemory.external
      };

      profile.cpuDelta = {
        user: (profile.endCpu.user - profile.startCpu.user) / 1000, // ms
        system: (profile.endCpu.system - profile.startCpu.system) / 1000
      };

      profile.success = true;
      profile.inputSize = JSON.stringify(input).length;
      profile.outputSize = JSON.stringify(result).length;

      // Update metrics
      this.updateToolMetrics(toolName, profile);

      return result;

    } catch (error) {
      profile.endTime = Date.now();
      profile.duration = profile.endTime - profile.startTime;
      profile.success = false;
      profile.error = error.message;

      this.updateToolMetrics(toolName, profile);

      throw error;
    }
  }

  /**
   * Update tool-specific metrics
   */
  updateToolMetrics(toolName, profile) {
    if (!this.toolMetrics.has(toolName)) {
      this.toolMetrics.set(toolName, {
        executions: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        successCount: 0,
        errorCount: 0,
        totalMemoryDelta: 0,
        totalCpuTime: 0
      });
    }

    const metrics = this.toolMetrics.get(toolName);

    metrics.executions++;
    metrics.totalDuration += profile.duration;
    metrics.averageDuration = metrics.totalDuration / metrics.executions;
    metrics.minDuration = Math.min(metrics.minDuration, profile.duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, profile.duration);

    if (profile.success) {
      metrics.successCount++;
      metrics.totalMemoryDelta += profile.memoryDelta?.heapUsed || 0;
      metrics.totalCpuTime += (profile.cpuDelta?.user || 0) + (profile.cpuDelta?.system || 0);
    } else {
      metrics.errorCount++;
    }

    // Add to history
    this.executionHistory.push(profile);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get tool performance report
   */
  getToolReport(toolName) {
    const metrics = this.toolMetrics.get(toolName);
    if (!metrics) return null;

    const recentExecutions = this.executionHistory
      .filter(e => e.tool === toolName)
      .slice(-10);

    return {
      tool: toolName,
      metrics,
      recentExecutions: recentExecutions.map(e => ({
        duration: e.duration,
        success: e.success,
        memoryDelta: e.memoryDelta?.heapUsed,
        inputSize: e.inputSize,
        outputSize: e.outputSize
      })),
      successRate: metrics.successCount / metrics.executions,
      averageMemoryImpact: metrics.totalMemoryDelta / metrics.successCount,
      averageCpuTime: metrics.totalCpuTime / metrics.successCount
    };
  }

  /**
   * Get overall performance summary
   */
  getSummary() {
    const tools = Array.from(this.toolMetrics.entries()).map(([name, metrics]) => ({
      name,
      executions: metrics.executions,
      avgDuration: metrics.averageDuration.toFixed(2),
      successRate: ((metrics.successCount / metrics.executions) * 100).toFixed(1) + '%'
    }));

    return {
      totalTools: tools.length,
      totalExecutions: tools.reduce((sum, t) => sum + t.executions, 0),
      toolPerformance: tools.sort((a, b) => b.executions - a.executions)
    };
  }
}
```

## 🎮 Latency Histogram

### Advanced Latency Tracking

```javascript
class LatencyHistogram {
  constructor(buckets = null) {
    // Default exponential buckets: 1ms, 2ms, 4ms, 8ms, etc.
    this.buckets = buckets || this.createExponentialBuckets(1, 2, 20);
    this.counts = new Array(this.buckets.length).fill(0);
    this.sum = 0;
    this.count = 0;
    this.min = Infinity;
    this.max = 0;
  }

  /**
   * Create exponential buckets
   */
  createExponentialBuckets(start, factor, count) {
    const buckets = [];
    let value = start;

    for (let i = 0; i < count; i++) {
      buckets.push(value);
      value *= factor;
    }

    return buckets;
  }

  /**
   * Record a latency value
   */
  record(value) {
    this.sum += value;
    this.count++;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);

    // Find the right bucket
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.counts[i]++;
        return;
      }
    }

    // Value exceeds all buckets
    this.counts[this.counts.length - 1]++;
  }

  /**
   * Get percentiles
   */
  getPercentiles() {
    if (this.count === 0) {
      return {
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        p999: 0
      };
    }

    const percentiles = {
      p50: this.getPercentile(0.50),
      p75: this.getPercentile(0.75),
      p90: this.getPercentile(0.90),
      p95: this.getPercentile(0.95),
      p99: this.getPercentile(0.99),
      p999: this.getPercentile(0.999)
    };

    return percentiles;
  }

  /**
   * Get a specific percentile
   */
  getPercentile(percentile) {
    const targetCount = Math.ceil(this.count * percentile);
    let runningCount = 0;

    for (let i = 0; i < this.counts.length; i++) {
      runningCount += this.counts[i];
      if (runningCount >= targetCount) {
        return this.buckets[i];
      }
    }

    return this.max;
  }

  /**
   * Get histogram data for visualization
   */
  getHistogramData() {
    return this.buckets.map((bucket, i) => ({
      bucket: bucket.toFixed(1) + 'ms',
      count: this.counts[i],
      percentage: ((this.counts[i] / this.count) * 100).toFixed(2) + '%'
    }));
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    if (this.count === 0) {
      return {
        count: 0,
        mean: 0,
        min: 0,
        max: 0,
        percentiles: this.getPercentiles()
      };
    }

    return {
      count: this.count,
      mean: this.sum / this.count,
      min: this.min,
      max: this.max,
      percentiles: this.getPercentiles()
    };
  }
}
```

## 🔥 Flame Graph Generation

### CPU Profiling with Flame Graphs

```javascript
class FlameGraphProfiler {
  constructor() {
    this.stacks = [];
    this.isProfileing = false;
    this.sampleInterval = 10; // ms
  }

  /**
   * Start CPU profiling
   */
  startProfiling() {
    if (this.isProfileing) return;

    const v8profiler = require('v8-profiler-next');
    v8profiler.setGenerateType(1);

    this.profileId = `profile-${Date.now()}`;
    v8profiler.startProfiling(this.profileId, true);
    this.isProfileing = true;

    console.log('CPU profiling started...');
  }

  /**
   * Stop profiling and generate flame graph
   */
  async stopProfiling() {
    if (!this.isProfileing) return;

    const v8profiler = require('v8-profiler-next');
    const profile = v8profiler.stopProfiling(this.profileId);

    this.isProfileing = false;

    // Convert to flame graph format
    const flameGraph = await this.convertToFlameGraph(profile);

    // Clean up
    profile.delete();

    return flameGraph;
  }

  /**
   * Convert V8 profile to flame graph format
   */
  async convertToFlameGraph(profile) {
    const stacks = [];
    const nodes = profile.head;

    // Traverse the call tree
    this.traverseNode(nodes, [], stacks);

    // Aggregate stacks
    const aggregated = this.aggregateStacks(stacks);

    // Generate flame graph data
    return {
      name: 'root',
      value: profile.head.hitCount,
      children: this.buildFlameGraphTree(aggregated)
    };
  }

  /**
   * Traverse profile nodes
   */
  traverseNode(node, stack, stacks) {
    stack.push({
      functionName: node.functionName || '(anonymous)',
      url: node.url,
      lineNumber: node.lineNumber,
      hitCount: node.hitCount
    });

    if (node.hitCount > 0) {
      stacks.push({
        stack: [...stack],
        value: node.hitCount
      });
    }

    for (const child of (node.children || [])) {
      this.traverseNode(child, stack, stacks);
    }

    stack.pop();
  }

  /**
   * Aggregate stack traces
   */
  aggregateStacks(stacks) {
    const aggregated = new Map();

    for (const { stack, value } of stacks) {
      const key = stack.map(s => s.functionName).join(';');

      if (aggregated.has(key)) {
        aggregated.get(key).value += value;
      } else {
        aggregated.set(key, { stack, value });
      }
    }

    return aggregated;
  }

  /**
   * Build flame graph tree structure
   */
  buildFlameGraphTree(aggregated) {
    const root = { name: 'root', value: 0, children: [] };

    for (const { stack, value } of aggregated.values()) {
      let current = root;

      for (const frame of stack) {
        let child = current.children.find(c => c.name === frame.functionName);

        if (!child) {
          child = {
            name: frame.functionName,
            value: 0,
            children: []
          };
          current.children.push(child);
        }

        child.value += value;
        current = child;
      }
    }

    return root.children;
  }

  /**
   * Save flame graph as HTML
   */
  async saveAsHTML(flameGraph, filename) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Flame Graph</title>
  <script src="https://cdn.jsdelivr.net/npm/d3-flame-graph@4"></script>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/d3-flame-graph@4/dist/d3-flamegraph.css">
</head>
<body>
  <div id="chart"></div>
  <script>
    const data = ${JSON.stringify(flameGraph)};
    const flamegraph = d3.flamegraph()
      .width(window.innerWidth)
      .height(600);

    d3.select("#chart")
      .datum(data)
      .call(flamegraph);
  </script>
</body>
</html>`;

    const fs = require('fs').promises;
    await fs.writeFile(filename, html);
    console.log(`Flame graph saved to ${filename}`);
  }
}
```

## 💡 Performance Best Practices

### Optimization Patterns

```javascript
class PerformanceOptimizer {
  /**
   * Memoization decorator
   */
  static memoize(fn, options = {}) {
    const cache = new Map();
    const maxSize = options.maxSize || 100;
    const ttl = options.ttl || Infinity;

    return function memoized(...args) {
      const key = JSON.stringify(args);

      if (cache.has(key)) {
        const cached = cache.get(key);
        if (Date.now() - cached.timestamp < ttl) {
          return cached.value;
        }
        cache.delete(key);
      }

      const result = fn.apply(this, args);

      cache.set(key, {
        value: result,
        timestamp: Date.now()
      });

      // LRU eviction
      if (cache.size > maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }

      return result;
    };
  }

  /**
   * Debounce function calls
   */
  static debounce(fn, wait) {
    let timeout;

    return function debounced(...args) {
      clearTimeout(timeout);

      timeout = setTimeout(() => {
        fn.apply(this, args);
      }, wait);
    };
  }

  /**
   * Throttle function calls
   */
  static throttle(fn, limit) {
    let inThrottle = false;

    return function throttled(...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;

        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  }

  /**
   * Batch operations
   */
  static createBatcher(processBatch, options = {}) {
    const batchSize = options.batchSize || 100;
    const batchDelay = options.batchDelay || 10;

    let batch = [];
    let timeout;

    const flush = () => {
      if (batch.length > 0) {
        processBatch(batch);
        batch = [];
      }
      timeout = null;
    };

    return (item) => {
      batch.push(item);

      if (batch.length >= batchSize) {
        flush();
      } else if (!timeout) {
        timeout = setTimeout(flush, batchDelay);
      }
    };
  }
}
```

## 🚀 Real-World Usage Examples

### Complete Performance Monitoring Setup

```javascript
class PerformanceMonitoringSystem {
  constructor() {
    this.profiler = new PerformanceProfiler({ enabled: true });
    this.apiTracker = new APIPerformanceTracker();
    this.toolMonitor = new ToolPerformanceMonitor();
    this.flameGrapher = new FlameGraphProfiler();

    this.setupMonitoring();
  }

  /**
   * Setup comprehensive monitoring
   */
  setupMonitoring() {
    // Monitor event loop lag
    this.monitorEventLoop();

    // Monitor memory usage
    this.monitorMemory();

    // Monitor API calls
    this.monitorAPICalls();

    // Setup performance dashboard
    this.setupDashboard();
  }

  /**
   * Monitor event loop lag
   */
  monitorEventLoop() {
    let lastCheck = Date.now();

    setInterval(() => {
      const now = Date.now();
      const lag = now - lastCheck - 1000;

      if (lag > 100) {
        console.warn(`Event loop lag detected: ${lag}ms`);
        this.profiler.mark('event-loop-lag', { lag });
      }

      lastCheck = now;
    }, 1000);
  }

  /**
   * Monitor memory usage
   */
  monitorMemory() {
    setInterval(() => {
      const usage = process.memoryUsage();
      const heapUsedMB = usage.heapUsed / 1024 / 1024;

      if (heapUsedMB > 500) {
        console.warn(`High memory usage: ${heapUsedMB.toFixed(2)}MB`);
      }

      this.profiler.mark('memory-check', {
        heapUsed: heapUsedMB,
        rss: usage.rss / 1024 / 1024,
        external: usage.external / 1024 / 1024
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Generate performance report
   */
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      apiPerformance: this.apiTracker.getReport(),
      toolPerformance: this.toolMonitor.getSummary(),
      marks: Array.from(this.profiler.marks.entries()),
      measures: Array.from(this.profiler.measures.entries())
    };
  }
}
```

## 📊 Summary

The Profiling and Benchmarking system in Claude Code provides comprehensive performance monitoring and optimization capabilities. Key achievements include:

1. **Multi-layered Profiling**: Complete profiling system tracking startup, runtime, and shutdown
2. **Micro-benchmarking**: Sophisticated benchmarking framework with statistical analysis
3. **API Performance Tracking**: Detailed monitoring of API requests with histograms
4. **Tool Execution Profiling**: Per-tool performance metrics and history
5. **Latency Histograms**: Advanced percentile tracking with exponential buckets
6. **Flame Graph Generation**: CPU profiling with visual flame graphs
7. **Performance Optimizations**: Memoization, debouncing, throttling, and batching patterns
8. **Real-time Monitoring**: Event loop, memory, and resource monitoring

The implementation demonstrates how CLI applications can achieve exceptional performance through careful monitoring, profiling, and optimization. The comprehensive metrics collection enables data-driven performance improvements and ensures Claude Code maintains its responsiveness even under heavy load.

---

*Next in Part 8.2: Memory Management Strategies - Deep dive into memory optimization, garbage collection tuning, and leak detection.*