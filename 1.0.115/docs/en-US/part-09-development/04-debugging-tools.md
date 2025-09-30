# Part 9.4: Debugging Tools

## Introduction

The Claude Code debugging toolkit provides comprehensive tools and techniques for identifying, diagnosing, and resolving issues during development. This chapter explores the debugging infrastructure, from basic console logging to advanced profiling and tracing systems that enable efficient troubleshooting of the AI-powered CLI.

## Table of Contents
1. [Debugging Infrastructure](#debugging-infrastructure)
2. [Logging System](#logging-system)
3. [Debug Modes](#debug-modes)
4. [Interactive Debugger](#interactive-debugger)
5. [Tracing and Profiling](#tracing-and-profiling)
6. [Error Diagnostics](#error-diagnostics)
7. [Development Tools Integration](#development-tools-integration)
8. [Performance Implications](#performance-implications)

## Debugging Infrastructure

### Debug Framework

```javascript
class DebugFramework {
  constructor() {
    this.enabled = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
    this.namespaces = new Set();
    this.filters = [];
    this.outputs = [];
    this.history = [];
    this.maxHistorySize = 10000;
  }

  createDebugger(namespace) {
    this.namespaces.add(namespace);

    const debug = (...args) => {
      if (!this.enabled) return;

      if (!this.matchesFilter(namespace)) return;

      const entry = {
        namespace,
        timestamp: Date.now(),
        args,
        stack: this.captureStack()
      };

      this.log(entry);
      this.addToHistory(entry);
    };

    debug.enabled = () => this.enabled && this.matchesFilter(namespace);
    debug.namespace = namespace;
    debug.extend = (suffix) => this.createDebugger(`${namespace}:${suffix}`);

    return debug;
  }

  matchesFilter(namespace) {
    if (this.filters.length === 0) return true;

    return this.filters.some(filter => {
      if (filter.startsWith('-')) {
        // Exclusion filter
        return !namespace.includes(filter.slice(1));
      } else if (filter.includes('*')) {
        // Wildcard filter
        const regex = new RegExp(filter.replace('*', '.*'));
        return regex.test(namespace);
      } else {
        // Exact match
        return namespace === filter || namespace.startsWith(`${filter}:`);
      }
    });
  }

  captureStack() {
    const error = new Error();
    const stack = error.stack.split('\n').slice(3, 6);
    return stack.map(line => line.trim()).filter(Boolean);
  }

  log(entry) {
    const formatted = this.format(entry);

    // Output to all registered outputs
    for (const output of this.outputs) {
      output.write(formatted);
    }

    // Default console output
    if (this.outputs.length === 0) {
      console.log(formatted);
    }
  }

  format(entry) {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] ${entry.namespace}:`;

    // Format arguments
    const args = entry.args.map(arg => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg, null, 2);
      }
      return String(arg);
    }).join(' ');

    return `${prefix} ${args}`;
  }

  addToHistory(entry) {
    this.history.push(entry);

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  setFilter(filter) {
    if (typeof filter === 'string') {
      this.filters = filter.split(',').map(f => f.trim());
    } else if (Array.isArray(filter)) {
      this.filters = filter;
    }
  }

  addOutput(output) {
    this.outputs.push(output);
  }

  getHistory(filter = {}) {
    let history = [...this.history];

    if (filter.namespace) {
      history = history.filter(e => e.namespace.includes(filter.namespace));
    }

    if (filter.since) {
      history = history.filter(e => e.timestamp >= filter.since);
    }

    if (filter.until) {
      history = history.filter(e => e.timestamp <= filter.until);
    }

    return history;
  }

  exportHistory(format = 'json') {
    const history = this.getHistory();

    switch (format) {
      case 'json':
        return JSON.stringify(history, null, 2);

      case 'csv':
        const headers = ['timestamp', 'namespace', 'message'];
        const rows = history.map(e => [
          e.timestamp,
          e.namespace,
          e.args.join(' ')
        ]);
        return [headers, ...rows].map(r => r.join(',')).join('\n');

      case 'text':
        return history.map(e => this.format(e)).join('\n');

      default:
        return history;
    }
  }
}

// Create global debug instance
const debugFramework = new DebugFramework();

// Set filter from environment
if (process.env.DEBUG_FILTER) {
  debugFramework.setFilter(process.env.DEBUG_FILTER);
}

// Export factory function
export const debug = (namespace) => debugFramework.createDebugger(namespace);
```

## Logging System

### Advanced Logger

```javascript
class Logger {
  constructor(options = {}) {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    this.level = this.levels[options.level || process.env.LOG_LEVEL || 'info'];
    this.transports = [];
    this.metadata = {};
    this.context = [];
  }

  // Logging methods
  error(...args) {
    this.log('error', ...args);
  }

  warn(...args) {
    this.log('warn', ...args);
  }

  info(...args) {
    this.log('info', ...args);
  }

  debug(...args) {
    this.log('debug', ...args);
  }

  trace(...args) {
    this.log('trace', ...args);
  }

  log(level, ...args) {
    const levelValue = this.levels[level];

    if (levelValue === undefined || levelValue > this.level) {
      return;
    }

    const entry = this.createLogEntry(level, args);

    // Send to all transports
    for (const transport of this.transports) {
      transport.log(entry);
    }
  }

  createLogEntry(level, args) {
    const error = args.find(arg => arg instanceof Error);
    const message = args
      .filter(arg => !(arg instanceof Error))
      .map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))
      .join(' ');

    return {
      level,
      timestamp: new Date().toISOString(),
      message,
      error: error ? {
        message: error.message,
        stack: error.stack,
        code: error.code
      } : null,
      metadata: { ...this.metadata },
      context: [...this.context],
      pid: process.pid,
      hostname: require('os').hostname()
    };
  }

  addTransport(transport) {
    this.transports.push(transport);
  }

  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  pushContext(context) {
    this.context.push(context);
  }

  popContext() {
    return this.context.pop();
  }

  child(metadata) {
    const child = new Logger({ level: this.level });
    child.transports = this.transports;
    child.metadata = { ...this.metadata, ...metadata };
    child.context = [...this.context];
    return child;
  }

  profile(name) {
    const startTime = process.hrtime.bigint();

    return {
      end: (metadata = {}) => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1e6; // ms

        this.info(`Profile ${name}`, {
          duration,
          ...metadata
        });

        return duration;
      }
    };
  }

  time(label) {
    const timers = this.timers || (this.timers = new Map());
    timers.set(label, process.hrtime.bigint());
  }

  timeEnd(label) {
    const timers = this.timers;
    if (!timers || !timers.has(label)) {
      this.warn(`Timer ${label} does not exist`);
      return;
    }

    const startTime = timers.get(label);
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1e6;

    timers.delete(label);
    this.info(`${label}: ${duration}ms`);

    return duration;
  }
}

// Transport implementations
class ConsoleTransport {
  constructor(options = {}) {
    this.colors = {
      error: '\x1b[31m',
      warn: '\x1b[33m',
      info: '\x1b[36m',
      debug: '\x1b[90m',
      trace: '\x1b[90m',
      reset: '\x1b[0m'
    };

    this.useColors = options.colors !== false && process.stdout.isTTY;
  }

  log(entry) {
    const color = this.useColors ? this.colors[entry.level] : '';
    const reset = this.useColors ? this.colors.reset : '';

    const prefix = `${color}[${entry.timestamp}] [${entry.level.toUpperCase()}]${reset}`;
    const message = `${prefix} ${entry.message}`;

    if (entry.level === 'error' || entry.level === 'warn') {
      console.error(message);
    } else {
      console.log(message);
    }

    if (entry.error) {
      console.error(entry.error.stack);
    }
  }
}

class FileTransport {
  constructor(options = {}) {
    this.filename = options.filename || 'claude-code.log';
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.stream = null;
    this.currentSize = 0;
  }

  async log(entry) {
    if (!this.stream) {
      await this.openStream();
    }

    const line = JSON.stringify(entry) + '\n';
    const size = Buffer.byteLength(line);

    if (this.currentSize + size > this.maxSize) {
      await this.rotate();
    }

    this.stream.write(line);
    this.currentSize += size;
  }

  async openStream() {
    const fs = await import('fs');
    this.stream = fs.createWriteStream(this.filename, { flags: 'a' });

    const stats = await fs.promises.stat(this.filename).catch(() => ({ size: 0 }));
    this.currentSize = stats.size;
  }

  async rotate() {
    const fs = await import('fs/promises');

    // Close current stream
    if (this.stream) {
      this.stream.end();
    }

    // Rotate files
    for (let i = this.maxFiles - 1; i > 0; i--) {
      const oldFile = i === 1 ? this.filename : `${this.filename}.${i - 1}`;
      const newFile = `${this.filename}.${i}`;

      try {
        await fs.rename(oldFile, newFile);
      } catch {
        // File might not exist
      }
    }

    // Open new stream
    await this.openStream();
  }
}

class RemoteTransport {
  constructor(options = {}) {
    this.url = options.url;
    this.apiKey = options.apiKey;
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000;
    this.buffer = [];
  }

  log(entry) {
    this.buffer.push(entry);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.batchSize);

    try {
      await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ logs: batch })
      });
    } catch (error) {
      // Restore logs on error
      this.buffer.unshift(...batch);
      console.error('Failed to send logs:', error);
    }

    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
```

## Debug Modes

### Debug Mode Manager

```javascript
class DebugModeManager {
  constructor() {
    this.modes = new Map();
    this.activeModes = new Set();

    // Register built-in modes
    this.registerBuiltInModes();
  }

  registerBuiltInModes() {
    // Verbose mode - maximum logging
    this.register('verbose', {
      name: 'Verbose',
      description: 'Maximum logging output',

      enable() {
        process.env.LOG_LEVEL = 'trace';
        process.env.DEBUG = '*';
        console.log('🔍 Verbose mode enabled');
      },

      disable() {
        delete process.env.LOG_LEVEL;
        delete process.env.DEBUG;
        console.log('🔍 Verbose mode disabled');
      }
    });

    // Performance mode - tracks performance metrics
    this.register('performance', {
      name: 'Performance',
      description: 'Track performance metrics',
      metrics: new Map(),

      enable() {
        this.originalConsoleTime = console.time;
        this.originalConsoleTimeEnd = console.timeEnd;

        console.time = (label) => {
          this.metrics.set(label, process.hrtime.bigint());
        };

        console.timeEnd = (label) => {
          if (this.metrics.has(label)) {
            const start = this.metrics.get(label);
            const end = process.hrtime.bigint();
            const duration = Number(end - start) / 1e6;
            console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`);
            this.metrics.delete(label);
          }
        };

        console.log('⚡ Performance mode enabled');
      },

      disable() {
        console.time = this.originalConsoleTime;
        console.timeEnd = this.originalConsoleTimeEnd;
        console.log('⚡ Performance mode disabled');

        // Report metrics
        if (this.metrics.size > 0) {
          console.log('Unclosed timers:', Array.from(this.metrics.keys()));
        }
      }
    });

    // Memory mode - tracks memory usage
    this.register('memory', {
      name: 'Memory',
      description: 'Track memory usage',
      interval: null,
      samples: [],

      enable() {
        this.samples = [];

        this.interval = setInterval(() => {
          const usage = process.memoryUsage();
          this.samples.push({
            timestamp: Date.now(),
            rss: usage.rss,
            heapTotal: usage.heapTotal,
            heapUsed: usage.heapUsed,
            external: usage.external
          });

          // Keep only last 100 samples
          if (this.samples.length > 100) {
            this.samples.shift();
          }
        }, 1000);

        console.log('💾 Memory tracking enabled');
      },

      disable() {
        clearInterval(this.interval);
        console.log('💾 Memory tracking disabled');

        // Report summary
        if (this.samples.length > 0) {
          const avgHeap = this.samples.reduce((sum, s) => sum + s.heapUsed, 0) / this.samples.length;
          const maxHeap = Math.max(...this.samples.map(s => s.heapUsed));

          console.log('Memory summary:');
          console.log(`  Average heap: ${(avgHeap / 1024 / 1024).toFixed(2)}MB`);
          console.log(`  Max heap: ${(maxHeap / 1024 / 1024).toFixed(2)}MB`);
        }
      },

      getReport() {
        return {
          samples: this.samples,
          current: process.memoryUsage()
        };
      }
    });

    // API mode - logs all API calls
    this.register('api', {
      name: 'API',
      description: 'Log all API calls',
      calls: [],

      enable() {
        // Monkey-patch fetch
        this.originalFetch = global.fetch;

        global.fetch = async (url, options) => {
          const startTime = Date.now();

          console.log(`🌐 API Call: ${options?.method || 'GET'} ${url}`);

          const call = {
            url,
            method: options?.method || 'GET',
            timestamp: startTime,
            headers: options?.headers,
            body: options?.body
          };

          try {
            const response = await this.originalFetch(url, options);

            call.status = response.status;
            call.duration = Date.now() - startTime;

            console.log(`  ✅ ${response.status} (${call.duration}ms)`);

            this.calls.push(call);
            return response;

          } catch (error) {
            call.error = error.message;
            call.duration = Date.now() - startTime;

            console.log(`  ❌ Error: ${error.message} (${call.duration}ms)`);

            this.calls.push(call);
            throw error;
          }
        };

        console.log('🌐 API tracking enabled');
      },

      disable() {
        global.fetch = this.originalFetch;
        console.log('🌐 API tracking disabled');

        // Report summary
        if (this.calls.length > 0) {
          const totalCalls = this.calls.length;
          const avgDuration = this.calls.reduce((sum, c) => sum + (c.duration || 0), 0) / totalCalls;
          const errors = this.calls.filter(c => c.error).length;

          console.log('API summary:');
          console.log(`  Total calls: ${totalCalls}`);
          console.log(`  Average duration: ${avgDuration.toFixed(2)}ms`);
          console.log(`  Errors: ${errors}`);
        }
      }
    });

    // Tool mode - logs all tool executions
    this.register('tools', {
      name: 'Tools',
      description: 'Log all tool executions',
      executions: [],

      enable() {
        // Would hook into tool execution system
        console.log('🔧 Tool tracking enabled');
      },

      disable() {
        console.log('🔧 Tool tracking disabled');
      }
    });
  }

  register(name, mode) {
    this.modes.set(name, mode);
  }

  enable(modeName) {
    const mode = this.modes.get(modeName);

    if (!mode) {
      throw new Error(`Unknown debug mode: ${modeName}`);
    }

    if (this.activeModes.has(modeName)) {
      console.log(`Debug mode ${modeName} is already enabled`);
      return;
    }

    mode.enable();
    this.activeModes.add(modeName);
  }

  disable(modeName) {
    const mode = this.modes.get(modeName);

    if (!mode) {
      throw new Error(`Unknown debug mode: ${modeName}`);
    }

    if (!this.activeModes.has(modeName)) {
      console.log(`Debug mode ${modeName} is not enabled`);
      return;
    }

    mode.disable();
    this.activeModes.delete(modeName);
  }

  enableAll() {
    for (const [name, mode] of this.modes) {
      if (!this.activeModes.has(name)) {
        this.enable(name);
      }
    }
  }

  disableAll() {
    for (const name of this.activeModes) {
      this.disable(name);
    }
  }

  getActiveMode() {
    return Array.from(this.activeModes);
  }

  getReport(modeName) {
    const mode = this.modes.get(modeName);

    if (!mode || !mode.getReport) {
      return null;
    }

    return mode.getReport();
  }
}

// Global debug mode manager
const debugModes = new DebugModeManager();

// Enable modes from environment
if (process.env.DEBUG_MODES) {
  const modes = process.env.DEBUG_MODES.split(',');
  for (const mode of modes) {
    debugModes.enable(mode.trim());
  }
}

export { debugModes };
```

## Interactive Debugger

### REPL Debugger

```javascript
class REPLDebugger {
  constructor() {
    this.repl = null;
    this.context = {};
    this.breakpoints = new Map();
    this.watchedVariables = new Set();
    this.history = [];
  }

  async start() {
    const repl = await import('repl');

    this.repl = repl.start({
      prompt: 'debug> ',
      useColors: true,
      replMode: repl.REPL_MODE_STRICT
    });

    // Setup context
    Object.assign(this.repl.context, this.context);

    // Add debug commands
    this.setupCommands();

    // Setup history
    this.setupHistory();

    console.log('🐛 Interactive debugger started');
    console.log('Type .help for available commands');
  }

  setupCommands() {
    // Breakpoint command
    this.repl.defineCommand('break', {
      help: 'Set a breakpoint',
      action: (file) => {
        const [filename, line] = file.split(':');
        this.setBreakpoint(filename, parseInt(line));
        this.repl.displayPrompt();
      }
    });

    // Watch command
    this.repl.defineCommand('watch', {
      help: 'Watch a variable',
      action: (variable) => {
        this.watch(variable);
        this.repl.displayPrompt();
      }
    });

    // Stack trace command
    this.repl.defineCommand('stack', {
      help: 'Show stack trace',
      action: () => {
        this.showStackTrace();
        this.repl.displayPrompt();
      }
    });

    // Continue command
    this.repl.defineCommand('continue', {
      help: 'Continue execution',
      action: () => {
        this.continue();
        this.repl.displayPrompt();
      }
    });

    // Step command
    this.repl.defineCommand('step', {
      help: 'Step to next line',
      action: () => {
        this.step();
        this.repl.displayPrompt();
      }
    });

    // Variables command
    this.repl.defineCommand('vars', {
      help: 'Show all variables',
      action: () => {
        this.showVariables();
        this.repl.displayPrompt();
      }
    });

    // Memory command
    this.repl.defineCommand('mem', {
      help: 'Show memory usage',
      action: () => {
        this.showMemory();
        this.repl.displayPrompt();
      }
    });
  }

  setupHistory() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const historyFile = path.join(os.homedir(), '.claude_debug_history');

    // Load history
    try {
      const history = fs.readFileSync(historyFile, 'utf8').split('\n');
      this.repl.history = history;
    } catch {
      // No history file
    }

    // Save history on exit
    this.repl.on('exit', () => {
      fs.writeFileSync(historyFile, this.repl.history.join('\n'));
    });
  }

  setBreakpoint(file, line) {
    if (!this.breakpoints.has(file)) {
      this.breakpoints.set(file, new Set());
    }

    this.breakpoints.get(file).add(line);
    console.log(`🔴 Breakpoint set at ${file}:${line}`);
  }

  watch(variable) {
    this.watchedVariables.add(variable);
    console.log(`👁️  Watching variable: ${variable}`);
  }

  showStackTrace() {
    const stack = new Error().stack.split('\n').slice(2);
    console.log('\nStack trace:');
    stack.forEach((line, i) => {
      console.log(`  ${i}: ${line.trim()}`);
    });
  }

  showVariables() {
    console.log('\nVariables:');
    for (const [key, value] of Object.entries(this.repl.context)) {
      if (key.startsWith('_')) continue;

      const type = typeof value;
      const preview = type === 'object'
        ? JSON.stringify(value, null, 2).slice(0, 100) + '...'
        : String(value).slice(0, 100);

      console.log(`  ${key} (${type}): ${preview}`);
    }

    if (this.watchedVariables.size > 0) {
      console.log('\nWatched variables:');
      for (const variable of this.watchedVariables) {
        const value = this.repl.context[variable];
        console.log(`  ${variable}: ${JSON.stringify(value)}`);
      }
    }
  }

  showMemory() {
    const usage = process.memoryUsage();
    console.log('\nMemory usage:');
    console.log(`  RSS: ${(usage.rss / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  External: ${(usage.external / 1024 / 1024).toFixed(2)}MB`);
  }

  continue() {
    console.log('▶️  Continuing execution...');
    // Implementation would resume execution
  }

  step() {
    console.log('➡️  Stepping to next line...');
    // Implementation would step to next line
  }

  attachToProcess() {
    // Attach to running process for debugging
    const inspector = require('inspector');

    if (!inspector.url()) {
      inspector.open(9229, '127.0.0.1', true);
    }

    console.log(`🔗 Inspector listening on ${inspector.url()}`);
    console.log('Open chrome://inspect to debug');
  }
}

// CLI Debugger
class CLIDebugger {
  constructor() {
    this.commands = new Map();
    this.state = {
      paused: false,
      stepping: false,
      currentFile: null,
      currentLine: null
    };
  }

  registerCommand(name, handler) {
    this.commands.set(name, handler);
  }

  async processCommand(input) {
    const [command, ...args] = input.split(' ');

    const handler = this.commands.get(command);
    if (!handler) {
      console.log(`Unknown command: ${command}`);
      return;
    }

    await handler(...args);
  }

  async pause() {
    this.state.paused = true;
    console.log('⏸️  Execution paused');

    // Enter debug loop
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'debug> '
    });

    rl.prompt();

    rl.on('line', async (line) => {
      await this.processCommand(line.trim());

      if (!this.state.paused) {
        rl.close();
      } else {
        rl.prompt();
      }
    });
  }

  resume() {
    this.state.paused = false;
    console.log('▶️  Execution resumed');
  }
}
```

## Tracing and Profiling

### Trace System

```javascript
class TraceSystem {
  constructor() {
    this.traces = new Map();
    this.activeTraces = new Map();
    this.enabled = process.env.TRACE === 'true';
  }

  startTrace(name, metadata = {}) {
    if (!this.enabled) return null;

    const traceId = this.generateTraceId();

    const trace = {
      id: traceId,
      name,
      startTime: process.hrtime.bigint(),
      metadata,
      spans: [],
      events: []
    };

    this.activeTraces.set(traceId, trace);

    return {
      traceId,

      span(spanName, fn) {
        return this.traceSpan(traceId, spanName, fn);
      },

      event(eventName, data) {
        this.addEvent(traceId, eventName, data);
      },

      end(result) {
        return this.endTrace(traceId, result);
      }
    };
  }

  async traceSpan(traceId, spanName, fn) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return fn();

    const span = {
      name: spanName,
      startTime: process.hrtime.bigint(),
      endTime: null,
      duration: null,
      error: null
    };

    try {
      const result = await fn();
      span.endTime = process.hrtime.bigint();
      span.duration = Number(span.endTime - span.startTime) / 1e6;
      trace.spans.push(span);
      return result;

    } catch (error) {
      span.endTime = process.hrtime.bigint();
      span.duration = Number(span.endTime - span.startTime) / 1e6;
      span.error = error.message;
      trace.spans.push(span);
      throw error;
    }
  }

  addEvent(traceId, eventName, data) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    trace.events.push({
      name: eventName,
      timestamp: process.hrtime.bigint(),
      data
    });
  }

  endTrace(traceId, result) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    trace.endTime = process.hrtime.bigint();
    trace.duration = Number(trace.endTime - trace.startTime) / 1e6;
    trace.result = result;

    this.activeTraces.delete(traceId);
    this.traces.set(traceId, trace);

    // Export trace if configured
    if (process.env.TRACE_EXPORT) {
      this.exportTrace(trace);
    }

    return trace;
  }

  generateTraceId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  exportTrace(trace) {
    // Convert to OpenTelemetry format
    const otTrace = {
      traceId: trace.id,
      spans: trace.spans.map(span => ({
        name: span.name,
        startTimeUnixNano: span.startTime.toString(),
        endTimeUnixNano: span.endTime?.toString(),
        attributes: {
          duration: span.duration,
          error: span.error
        }
      })),
      resource: {
        attributes: trace.metadata
      }
    };

    // Export to configured backend
    if (process.env.TRACE_EXPORT === 'console') {
      console.log('📊 Trace:', JSON.stringify(otTrace, null, 2));
    } else if (process.env.TRACE_EXPORT === 'file') {
      const fs = require('fs');
      fs.appendFileSync('traces.jsonl', JSON.stringify(otTrace) + '\n');
    }
    // Additional export targets (Jaeger, Zipkin, etc.)
  }

  getTrace(traceId) {
    return this.traces.get(traceId) || this.activeTraces.get(traceId);
  }

  getTraces(filter = {}) {
    let traces = Array.from(this.traces.values());

    if (filter.name) {
      traces = traces.filter(t => t.name.includes(filter.name));
    }

    if (filter.minDuration) {
      traces = traces.filter(t => t.duration >= filter.minDuration);
    }

    if (filter.hasError) {
      traces = traces.filter(t =>
        t.spans.some(s => s.error) || t.error
      );
    }

    return traces;
  }

  analyzeTrace(traceId) {
    const trace = this.getTrace(traceId);
    if (!trace) return null;

    const analysis = {
      totalDuration: trace.duration,
      spanCount: trace.spans.length,
      eventCount: trace.events.length,
      spans: []
    };

    // Analyze spans
    for (const span of trace.spans) {
      analysis.spans.push({
        name: span.name,
        duration: span.duration,
        percentage: (span.duration / trace.duration * 100).toFixed(1) + '%',
        error: span.error
      });
    }

    // Sort by duration
    analysis.spans.sort((a, b) => b.duration - a.duration);

    // Find bottlenecks
    analysis.bottlenecks = analysis.spans
      .filter(s => s.duration > trace.duration * 0.2)
      .map(s => s.name);

    return analysis;
  }
}

// CPU Profiler
class CPUProfiler {
  constructor() {
    this.profiling = false;
    this.session = null;
  }

  async start() {
    if (this.profiling) {
      console.log('CPU profiling already in progress');
      return;
    }

    const inspector = require('inspector');
    const fs = require('fs/promises');

    this.session = new inspector.Session();
    this.session.connect();

    await new Promise((resolve, reject) => {
      this.session.post('Profiler.enable', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      this.session.post('Profiler.start', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.profiling = true;
    console.log('🔬 CPU profiling started');
  }

  async stop() {
    if (!this.profiling) {
      console.log('No CPU profiling in progress');
      return null;
    }

    const profile = await new Promise((resolve, reject) => {
      this.session.post('Profiler.stop', (err, { profile }) => {
        if (err) reject(err);
        else resolve(profile);
      });
    });

    this.session.disconnect();
    this.profiling = false;

    console.log('🔬 CPU profiling stopped');

    // Save profile
    const filename = `cpu-profile-${Date.now()}.cpuprofile`;
    await require('fs/promises').writeFile(
      filename,
      JSON.stringify(profile)
    );

    console.log(`Profile saved to ${filename}`);
    console.log('Load in Chrome DevTools for analysis');

    return this.analyzeProfile(profile);
  }

  analyzeProfile(profile) {
    const analysis = {
      totalTime: 0,
      functions: new Map()
    };

    // Analyze samples
    for (const node of profile.nodes) {
      const functionName = node.callFrame.functionName || '(anonymous)';
      const file = node.callFrame.url;
      const line = node.callFrame.lineNumber;

      if (!analysis.functions.has(functionName)) {
        analysis.functions.set(functionName, {
          name: functionName,
          file,
          line,
          selfTime: 0,
          totalTime: 0,
          callCount: 0
        });
      }

      const func = analysis.functions.get(functionName);
      func.selfTime += node.selfTime || 0;
      func.totalTime += node.totalTime || 0;
      func.callCount++;

      analysis.totalTime += node.selfTime || 0;
    }

    // Sort by self time
    const sorted = Array.from(analysis.functions.values())
      .sort((a, b) => b.selfTime - a.selfTime);

    // Get top functions
    const topFunctions = sorted.slice(0, 10).map(f => ({
      name: f.name,
      selfTime: f.selfTime,
      percentage: (f.selfTime / analysis.totalTime * 100).toFixed(1) + '%',
      file: f.file,
      line: f.line
    }));

    return {
      totalTime: analysis.totalTime,
      topFunctions
    };
  }
}
```

## Error Diagnostics

### Error Analyzer

```javascript
class ErrorAnalyzer {
  constructor() {
    this.errors = [];
    this.patterns = new Map();
    this.handlers = new Map();

    this.setupErrorCapture();
    this.loadPatterns();
  }

  setupErrorCapture() {
    // Capture unhandled errors
    process.on('uncaughtException', (error) => {
      this.analyzeError(error, 'uncaughtException');

      // Exit after logging
      console.error('💀 Uncaught exception, exiting...');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.analyzeError(error, 'unhandledRejection');
    });

    // Capture warnings
    process.on('warning', (warning) => {
      this.analyzeError(warning, 'warning');
    });
  }

  loadPatterns() {
    // Common error patterns and solutions
    this.patterns.set(/Cannot find module/, {
      type: 'ModuleNotFound',
      category: 'dependency',

      diagnose(error) {
        const match = error.message.match(/Cannot find module '(.+)'/);
        const module = match ? match[1] : 'unknown';

        return {
          issue: `Module '${module}' not found`,
          possibleCauses: [
            'Module not installed',
            'Incorrect import path',
            'Missing file extension',
            'Case sensitivity issue'
          ],
          solutions: [
            `Run: npm install ${module}`,
            'Check the import path is correct',
            'Add file extension (.js)',
            'Check file name case matches import'
          ]
        };
      }
    });

    this.patterns.set(/ENOENT: no such file/, {
      type: 'FileNotFound',
      category: 'filesystem',

      diagnose(error) {
        const match = error.message.match(/ENOENT: no such file or directory, .+ '(.+)'/);
        const file = match ? match[1] : 'unknown';

        return {
          issue: `File '${file}' not found`,
          possibleCauses: [
            'File does not exist',
            'Incorrect file path',
            'Permission denied',
            'Working directory issue'
          ],
          solutions: [
            'Verify the file exists',
            'Check the file path is correct',
            'Check file permissions',
            `Current directory: ${process.cwd()}`
          ]
        };
      }
    });

    this.patterns.set(/TypeError:.*undefined/, {
      type: 'TypeError',
      category: 'runtime',

      diagnose(error) {
        return {
          issue: 'Accessing property of undefined',
          possibleCauses: [
            'Variable not initialized',
            'Async operation not awaited',
            'Missing null check',
            'Wrong scope'
          ],
          solutions: [
            'Add null/undefined checks',
            'Ensure promises are awaited',
            'Initialize variables before use',
            'Check variable scope'
          ]
        };
      }
    });

    this.patterns.set(/out of memory/, {
      type: 'MemoryError',
      category: 'performance',

      diagnose(error) {
        const usage = process.memoryUsage();

        return {
          issue: 'Out of memory',
          possibleCauses: [
            'Memory leak',
            'Large data processing',
            'Infinite loop',
            'Circular references'
          ],
          solutions: [
            'Increase Node.js memory: --max-old-space-size=4096',
            'Process data in chunks',
            'Look for memory leaks',
            'Clear unused references'
          ],
          memoryUsage: {
            heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
            heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
            rss: `${(usage.rss / 1024 / 1024).toFixed(2)}MB`
          }
        };
      }
    });
  }

  analyzeError(error, source = 'unknown') {
    const analysis = {
      timestamp: new Date().toISOString(),
      source,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      diagnosis: null,
      context: this.gatherContext(),
      similar: this.findSimilarErrors(error)
    };

    // Find matching pattern
    for (const [pattern, analyzer] of this.patterns) {
      if (pattern.test(error.message)) {
        analysis.diagnosis = analyzer.diagnose(error);
        analysis.type = analyzer.type;
        analysis.category = analyzer.category;
        break;
      }
    }

    // Store error
    this.errors.push(analysis);

    // Display analysis
    this.displayAnalysis(analysis);

    // Trigger handlers
    this.triggerHandlers(analysis);

    return analysis;
  }

  gatherContext() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      env: process.env.NODE_ENV,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  findSimilarErrors(error) {
    const similar = [];

    for (const pastError of this.errors.slice(-10)) {
      if (pastError.error.name === error.name) {
        similar.push({
          timestamp: pastError.timestamp,
          message: pastError.error.message
        });
      }
    }

    return similar;
  }

  displayAnalysis(analysis) {
    console.error('\n' + '═'.repeat(60));
    console.error('ERROR ANALYSIS');
    console.error('═'.repeat(60));

    console.error(`\n🔴 ${analysis.error.name}: ${analysis.error.message}`);
    console.error(`Source: ${analysis.source}`);

    if (analysis.diagnosis) {
      console.error('\n📋 Diagnosis:');
      console.error(`Issue: ${analysis.diagnosis.issue}`);

      if (analysis.diagnosis.possibleCauses) {
        console.error('\nPossible causes:');
        analysis.diagnosis.possibleCauses.forEach(cause => {
          console.error(`  • ${cause}`);
        });
      }

      if (analysis.diagnosis.solutions) {
        console.error('\nSuggested solutions:');
        analysis.diagnosis.solutions.forEach(solution => {
          console.error(`  ✓ ${solution}`);
        });
      }
    }

    if (analysis.similar.length > 0) {
      console.error(`\n⚠️  Similar error occurred ${analysis.similar.length} time(s) before`);
    }

    console.error('\n📍 Stack trace:');
    console.error(analysis.error.stack);

    console.error('\n' + '═'.repeat(60));
  }

  registerHandler(errorType, handler) {
    if (!this.handlers.has(errorType)) {
      this.handlers.set(errorType, []);
    }

    this.handlers.get(errorType).push(handler);
  }

  triggerHandlers(analysis) {
    const handlers = this.handlers.get(analysis.type) || [];

    for (const handler of handlers) {
      try {
        handler(analysis);
      } catch (error) {
        console.error('Error in error handler:', error);
      }
    }
  }

  getErrorReport() {
    const report = {
      totalErrors: this.errors.length,
      errorsByType: {},
      errorsByCategory: {},
      recentErrors: this.errors.slice(-10),
      patterns: []
    };

    // Group by type
    for (const error of this.errors) {
      const type = error.type || 'unknown';
      report.errorsByType[type] = (report.errorsByType[type] || 0) + 1;

      const category = error.category || 'unknown';
      report.errorsByCategory[category] = (report.errorsByCategory[category] || 0) + 1;
    }

    // Find patterns
    const errorMessages = this.errors.map(e => e.error.message);
    const messageCount = new Map();

    for (const message of errorMessages) {
      const key = message.slice(0, 50);
      messageCount.set(key, (messageCount.get(key) || 0) + 1);
    }

    report.patterns = Array.from(messageCount.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));

    return report;
  }
}
```

## Development Tools Integration

### VSCode Debugger Integration

```javascript
class VSCodeDebugger {
  generateLaunchConfig() {
    return {
      version: '0.2.0',
      configurations: [
        {
          type: 'node',
          request: 'launch',
          name: 'Debug Claude Code',
          skipFiles: ['<node_internals>/**'],
          program: '${workspaceFolder}/src/cli/main.js',
          args: ['chat'],
          env: {
            DEBUG: 'true',
            LOG_LEVEL: 'debug'
          },
          console: 'integratedTerminal',
          outputCapture: 'std'
        },
        {
          type: 'node',
          request: 'attach',
          name: 'Attach to Process',
          port: 9229,
          skipFiles: ['<node_internals>/**']
        },
        {
          type: 'node',
          request: 'launch',
          name: 'Debug Current File',
          skipFiles: ['<node_internals>/**'],
          program: '${file}',
          env: {
            DEBUG: '*'
          }
        },
        {
          type: 'node',
          request: 'launch',
          name: 'Debug with Performance',
          skipFiles: ['<node_internals>/**'],
          program: '${workspaceFolder}/src/cli/main.js',
          env: {
            DEBUG_MODES: 'performance,memory'
          },
          runtimeArgs: [
            '--inspect-brk',
            '--prof',
            '--track-heap-objects'
          ]
        }
      ]
    };
  }

  generateTasksConfig() {
    return {
      version: '2.0.0',
      tasks: [
        {
          label: 'Start Debug Session',
          type: 'npm',
          script: 'debug',
          group: {
            kind: 'test',
            isDefault: true
          },
          presentation: {
            reveal: 'always',
            panel: 'new'
          }
        },
        {
          label: 'Analyze Performance',
          type: 'shell',
          command: 'node --prof src/cli/main.js && node --prof-process isolate-*.log > profile.txt',
          group: 'test',
          presentation: {
            reveal: 'always',
            panel: 'new'
          }
        },
        {
          label: 'Check Memory Leaks',
          type: 'shell',
          command: 'node --expose-gc --trace-gc src/cli/main.js',
          group: 'test'
        }
      ]
    };
  }
}

// Chrome DevTools Integration
class ChromeDevTools {
  static startInspector() {
    const inspector = require('inspector');

    if (!inspector.url()) {
      inspector.open(9229, '0.0.0.0', true);
    }

    const url = inspector.url();

    console.log('\n' + '═'.repeat(60));
    console.log('🔍 Chrome DevTools Debugging');
    console.log('═'.repeat(60));
    console.log('\nInspector URL:', url);
    console.log('\nTo debug:');
    console.log('1. Open Chrome/Edge browser');
    console.log('2. Navigate to: chrome://inspect');
    console.log('3. Click "inspect" under Remote Target');
    console.log('\nOr open directly:');
    console.log(`devtools://devtools/bundled/inspector.html?ws=${url.replace('ws://', '')}`);
    console.log('═'.repeat(60) + '\n');

    return url;
  }
}
```

## Performance Implications

### Debug Performance Monitor

```javascript
class DebugPerformanceMonitor {
  static analyze() {
    const metrics = {
      debugOverhead: this.measureDebugOverhead(),
      loggingImpact: this.measureLoggingImpact(),
      tracingCost: this.measureTracingCost(),
      recommendations: []
    };

    // Generate recommendations
    if (metrics.debugOverhead > 10) {
      metrics.recommendations.push('High debug overhead detected. Consider reducing debug output.');
    }

    if (metrics.loggingImpact > 5) {
      metrics.recommendations.push('Logging impact significant. Use conditional logging.');
    }

    if (metrics.tracingCost > 15) {
      metrics.recommendations.push('Tracing is expensive. Disable in production.');
    }

    return metrics;
  }

  static measureDebugOverhead() {
    const iterations = 10000;
    const debug = require('./debug-framework').debug('perf-test');

    // Baseline (no debug)
    const baselineStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      // Empty loop
    }
    const baselineEnd = process.hrtime.bigint();
    const baseline = Number(baselineEnd - baselineStart) / 1e6;

    // With debug
    const debugStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      debug('Test message', { iteration: i });
    }
    const debugEnd = process.hrtime.bigint();
    const withDebug = Number(debugEnd - debugStart) / 1e6;

    return ((withDebug - baseline) / baseline * 100).toFixed(1);
  }

  static measureLoggingImpact() {
    const logger = new Logger({ level: 'debug' });
    const iterations = 1000;

    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      logger.debug('Test log', { data: { i } });
    }
    const end = process.hrtime.bigint();

    const avgTime = Number(end - start) / 1e6 / iterations;
    return avgTime;
  }

  static measureTracingCost() {
    const tracer = new TraceSystem();
    tracer.enabled = true;

    const iterations = 100;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      const trace = tracer.startTrace('test-trace');
      trace.span('test-span', () => {
        // Some work
        const sum = Array(100).fill(0).reduce((a, b, i) => a + i, 0);
      });
      trace.end();
    }

    const end = process.hrtime.bigint();
    const avgTime = Number(end - start) / 1e6 / iterations;

    return avgTime;
  }
}
```

## Summary

The Claude Code debugging toolkit provides comprehensive debugging capabilities:

1. **Debug Framework**: Flexible namespace-based debugging with filtering and history
2. **Advanced Logging**: Multi-transport logging with levels, metadata, and profiling
3. **Debug Modes**: Specialized modes for verbose, performance, memory, API, and tool debugging
4. **Interactive Debugger**: REPL-based debugging with breakpoints and variable watching
5. **Tracing System**: Distributed tracing with span tracking and OpenTelemetry support
6. **Error Diagnostics**: Intelligent error analysis with pattern matching and solutions
7. **IDE Integration**: VSCode and Chrome DevTools integration for visual debugging
8. **Performance Monitoring**: Debug overhead measurement and optimization recommendations

The debugging infrastructure enables efficient development and troubleshooting while maintaining minimal performance impact in production.

## Next Steps

This completes Part 9: Development Tools. The next part will explore Security implementations in the Claude Code system.

---

*Part of the Claude Code Technical Series - Development Tools*