# 第 9.4 部分:调试工具

## 简介

Claude Code 调试工具包为开发过程中识别、诊断和解决问题提供全面的工具和技术。本章探讨调试基础设施,从基本的控制台日志记录到高级的性能分析和跟踪系统,以实现 AI 驱动 CLI 的高效故障排除。

## 目录
1. [调试基础设施](#调试基础设施)
2. [日志系统](#日志系统)
3. [调试模式](#调试模式)
4. [交互式调试器](#交互式调试器)
5. [跟踪和性能分析](#跟踪和性能分析)
6. [错误诊断](#错误诊断)
7. [开发工具集成](#开发工具集成)
8. [性能影响](#性能影响)

## 调试基础设施

### 调试框架

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
        // 排除过滤器
        return !namespace.includes(filter.slice(1));
      } else if (filter.includes('*')) {
        // 通配符过滤器
        const regex = new RegExp(filter.replace('*', '.*'));
        return regex.test(namespace);
      } else {
        // 精确匹配
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

    // 输出到所有已注册的输出
    for (const output of this.outputs) {
      output.write(formatted);
    }

    // 默认控制台输出
    if (this.outputs.length === 0) {
      console.log(formatted);
    }
  }

  format(entry) {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] ${entry.namespace}:`;

    // 格式化参数
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

// 创建全局调试实例
const debugFramework = new DebugFramework();

// 从环境设置过滤器
if (process.env.DEBUG_FILTER) {
  debugFramework.setFilter(process.env.DEBUG_FILTER);
}

// 导出工厂函数
export const debug = (namespace) => debugFramework.createDebugger(namespace);
```

## 日志系统

### 高级日志记录器

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

  // 日志记录方法
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

    // 发送到所有传输器
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

        this.info(`性能分析 ${name}`, {
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
      this.warn(`计时器 ${label} 不存在`);
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

// 传输器实现
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

    // 关闭当前流
    if (this.stream) {
      this.stream.end();
    }

    // 轮换文件
    for (let i = this.maxFiles - 1; i > 0; i--) {
      const oldFile = i === 1 ? this.filename : `${this.filename}.${i - 1}`;
      const newFile = `${this.filename}.${i}`;

      try {
        await fs.rename(oldFile, newFile);
      } catch {
        // 文件可能不存在
      }
    }

    // 打开新流
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
      // 出错时恢复日志
      this.buffer.unshift(...batch);
      console.error('发送日志失败:', error);
    }

    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
```

## 调试模式

### 调试模式管理器

```javascript
class DebugModeManager {
  constructor() {
    this.modes = new Map();
    this.activeModes = new Set();

    // 注册内置模式
    this.registerBuiltInModes();
  }

  registerBuiltInModes() {
    // 详细模式 - 最大日志记录
    this.register('verbose', {
      name: '详细',
      description: '最大日志输出',

      enable() {
        process.env.LOG_LEVEL = 'trace';
        process.env.DEBUG = '*';
        console.log('🔍 详细模式已启用');
      },

      disable() {
        delete process.env.LOG_LEVEL;
        delete process.env.DEBUG;
        console.log('🔍 详细模式已禁用');
      }
    });

    // 性能模式 - 跟踪性能指标
    this.register('performance', {
      name: '性能',
      description: '跟踪性能指标',
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

        console.log('⚡ 性能模式已启用');
      },

      disable() {
        console.time = this.originalConsoleTime;
        console.timeEnd = this.originalConsoleTimeEnd;
        console.log('⚡ 性能模式已禁用');

        // 报告指标
        if (this.metrics.size > 0) {
          console.log('未关闭的计时器:', Array.from(this.metrics.keys()));
        }
      }
    });

    // 内存模式 - 跟踪内存使用
    this.register('memory', {
      name: '内存',
      description: '跟踪内存使用',
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

          // 仅保留最后 100 个样本
          if (this.samples.length > 100) {
            this.samples.shift();
          }
        }, 1000);

        console.log('💾 内存跟踪已启用');
      },

      disable() {
        clearInterval(this.interval);
        console.log('💾 内存跟踪已禁用');

        // 报告摘要
        if (this.samples.length > 0) {
          const avgHeap = this.samples.reduce((sum, s) => sum + s.heapUsed, 0) / this.samples.length;
          const maxHeap = Math.max(...this.samples.map(s => s.heapUsed));

          console.log('内存摘要:');
          console.log(`  平均堆: ${(avgHeap / 1024 / 1024).toFixed(2)}MB`);
          console.log(`  最大堆: ${(maxHeap / 1024 / 1024).toFixed(2)}MB`);
        }
      },

      getReport() {
        return {
          samples: this.samples,
          current: process.memoryUsage()
        };
      }
    });

    // API 模式 - 记录所有 API 调用
    this.register('api', {
      name: 'API',
      description: '记录所有 API 调用',
      calls: [],

      enable() {
        // 修补 fetch
        this.originalFetch = global.fetch;

        global.fetch = async (url, options) => {
          const startTime = Date.now();

          console.log(`🌐 API 调用: ${options?.method || 'GET'} ${url}`);

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

            console.log(`  ❌ 错误: ${error.message} (${call.duration}ms)`);

            this.calls.push(call);
            throw error;
          }
        };

        console.log('🌐 API 跟踪已启用');
      },

      disable() {
        global.fetch = this.originalFetch;
        console.log('🌐 API 跟踪已禁用');

        // 报告摘要
        if (this.calls.length > 0) {
          const totalCalls = this.calls.length;
          const avgDuration = this.calls.reduce((sum, c) => sum + (c.duration || 0), 0) / totalCalls;
          const errors = this.calls.filter(c => c.error).length;

          console.log('API 摘要:');
          console.log(`  总调用数: ${totalCalls}`);
          console.log(`  平均持续时间: ${avgDuration.toFixed(2)}ms`);
          console.log(`  错误: ${errors}`);
        }
      }
    });

    // 工具模式 - 记录所有工具执行
    this.register('tools', {
      name: '工具',
      description: '记录所有工具执行',
      executions: [],

      enable() {
        // 会挂钩到工具执行系统
        console.log('🔧 工具跟踪已启用');
      },

      disable() {
        console.log('🔧 工具跟踪已禁用');
      }
    });
  }

  register(name, mode) {
    this.modes.set(name, mode);
  }

  enable(modeName) {
    const mode = this.modes.get(modeName);

    if (!mode) {
      throw new Error(`未知的调试模式: ${modeName}`);
    }

    if (this.activeModes.has(modeName)) {
      console.log(`调试模式 ${modeName} 已启用`);
      return;
    }

    mode.enable();
    this.activeModes.add(modeName);
  }

  disable(modeName) {
    const mode = this.modes.get(modeName);

    if (!mode) {
      throw new Error(`未知的调试模式: ${modeName}`);
    }

    if (!this.activeModes.has(modeName)) {
      console.log(`调试模式 ${modeName} 未启用`);
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

// 全局调试模式管理器
const debugModes = new DebugModeManager();

// 从环境启用模式
if (process.env.DEBUG_MODES) {
  const modes = process.env.DEBUG_MODES.split(',');
  for (const mode of modes) {
    debugModes.enable(mode.trim());
  }
}

export { debugModes };
```

## 交互式调试器

### REPL 调试器

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

    // 设置上下文
    Object.assign(this.repl.context, this.context);

    // 添加调试命令
    this.setupCommands();

    // 设置历史记录
    this.setupHistory();

    console.log('🐛 交互式调试器已启动');
    console.log('输入 .help 查看可用命令');
  }

  setupCommands() {
    // 断点命令
    this.repl.defineCommand('break', {
      help: '设置断点',
      action: (file) => {
        const [filename, line] = file.split(':');
        this.setBreakpoint(filename, parseInt(line));
        this.repl.displayPrompt();
      }
    });

    // 监视命令
    this.repl.defineCommand('watch', {
      help: '监视变量',
      action: (variable) => {
        this.watch(variable);
        this.repl.displayPrompt();
      }
    });

    // 堆栈跟踪命令
    this.repl.defineCommand('stack', {
      help: '显示堆栈跟踪',
      action: () => {
        this.showStackTrace();
        this.repl.displayPrompt();
      }
    });

    // 继续命令
    this.repl.defineCommand('continue', {
      help: '继续执行',
      action: () => {
        this.continue();
        this.repl.displayPrompt();
      }
    });

    // 步进命令
    this.repl.defineCommand('step', {
      help: '步进到下一行',
      action: () => {
        this.step();
        this.repl.displayPrompt();
      }
    });

    // 变量命令
    this.repl.defineCommand('vars', {
      help: '显示所有变量',
      action: () => {
        this.showVariables();
        this.repl.displayPrompt();
      }
    });

    // 内存命令
    this.repl.defineCommand('mem', {
      help: '显示内存使用',
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

    // 加载历史记录
    try {
      const history = fs.readFileSync(historyFile, 'utf8').split('\n');
      this.repl.history = history;
    } catch {
      // 无历史文件
    }

    // 退出时保存历史记录
    this.repl.on('exit', () => {
      fs.writeFileSync(historyFile, this.repl.history.join('\n'));
    });
  }

  setBreakpoint(file, line) {
    if (!this.breakpoints.has(file)) {
      this.breakpoints.set(file, new Set());
    }

    this.breakpoints.get(file).add(line);
    console.log(`🔴 已在 ${file}:${line} 设置断点`);
  }

  watch(variable) {
    this.watchedVariables.add(variable);
    console.log(`👁️  正在监视变量: ${variable}`);
  }

  showStackTrace() {
    const stack = new Error().stack.split('\n').slice(2);
    console.log('\n堆栈跟踪:');
    stack.forEach((line, i) => {
      console.log(`  ${i}: ${line.trim()}`);
    });
  }

  showVariables() {
    console.log('\n变量:');
    for (const [key, value] of Object.entries(this.repl.context)) {
      if (key.startsWith('_')) continue;

      const type = typeof value;
      const preview = type === 'object'
        ? JSON.stringify(value, null, 2).slice(0, 100) + '...'
        : String(value).slice(0, 100);

      console.log(`  ${key} (${type}): ${preview}`);
    }

    if (this.watchedVariables.size > 0) {
      console.log('\n监视的变量:');
      for (const variable of this.watchedVariables) {
        const value = this.repl.context[variable];
        console.log(`  ${variable}: ${JSON.stringify(value)}`);
      }
    }
  }

  showMemory() {
    const usage = process.memoryUsage();
    console.log('\n内存使用:');
    console.log(`  RSS: ${(usage.rss / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  堆总量: ${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  堆使用: ${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  外部: ${(usage.external / 1024 / 1024).toFixed(2)}MB`);
  }

  continue() {
    console.log('▶️  继续执行...');
    // 实现会恢复执行
  }

  step() {
    console.log('➡️  步进到下一行...');
    // 实现会步进到下一行
  }

  attachToProcess() {
    // 附加到运行中的进程以进行调试
    const inspector = require('inspector');

    if (!inspector.url()) {
      inspector.open(9229, '127.0.0.1', true);
    }

    console.log(`🔗 检查器正在监听 ${inspector.url()}`);
    console.log('打开 chrome://inspect 进行调试');
  }
}

// CLI 调试器
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
      console.log(`未知命令: ${command}`);
      return;
    }

    await handler(...args);
  }

  async pause() {
    this.state.paused = true;
    console.log('⏸️  执行已暂停');

    // 进入调试循环
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
    console.log('▶️  执行已恢复');
  }
}
```

## 跟踪和性能分析

### 跟踪系统

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

    // 如已配置则导出跟踪
    if (process.env.TRACE_EXPORT) {
      this.exportTrace(trace);
    }

    return trace;
  }

  generateTraceId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  exportTrace(trace) {
    // 转换为 OpenTelemetry 格式
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

    // 导出到配置的后端
    if (process.env.TRACE_EXPORT === 'console') {
      console.log('📊 跟踪:', JSON.stringify(otTrace, null, 2));
    } else if (process.env.TRACE_EXPORT === 'file') {
      const fs = require('fs');
      fs.appendFileSync('traces.jsonl', JSON.stringify(otTrace) + '\n');
    }
    // 其他导出目标 (Jaeger, Zipkin 等)
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

    // 分析跨度
    for (const span of trace.spans) {
      analysis.spans.push({
        name: span.name,
        duration: span.duration,
        percentage: (span.duration / trace.duration * 100).toFixed(1) + '%',
        error: span.error
      });
    }

    // 按持续时间排序
    analysis.spans.sort((a, b) => b.duration - a.duration);

    // 查找瓶颈
    analysis.bottlenecks = analysis.spans
      .filter(s => s.duration > trace.duration * 0.2)
      .map(s => s.name);

    return analysis;
  }
}

// CPU 性能分析器
class CPUProfiler {
  constructor() {
    this.profiling = false;
    this.session = null;
  }

  async start() {
    if (this.profiling) {
      console.log('CPU 性能分析已在进行中');
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
    console.log('🔬 CPU 性能分析已启动');
  }

  async stop() {
    if (!this.profiling) {
      console.log('没有正在进行的 CPU 性能分析');
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

    console.log('🔬 CPU 性能分析已停止');

    // 保存性能分析
    const filename = `cpu-profile-${Date.now()}.cpuprofile`;
    await require('fs/promises').writeFile(
      filename,
      JSON.stringify(profile)
    );

    console.log(`性能分析已保存到 ${filename}`);
    console.log('在 Chrome DevTools 中加载以进行分析');

    return this.analyzeProfile(profile);
  }

  analyzeProfile(profile) {
    const analysis = {
      totalTime: 0,
      functions: new Map()
    };

    // 分析样本
    for (const node of profile.nodes) {
      const functionName = node.callFrame.functionName || '(匿名)';
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

    // 按自身时间排序
    const sorted = Array.from(analysis.functions.values())
      .sort((a, b) => b.selfTime - a.selfTime);

    // 获取顶部函数
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

## 错误诊断

### 错误分析器

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
    // 捕获未处理的错误
    process.on('uncaughtException', (error) => {
      this.analyzeError(error, 'uncaughtException');

      // 记录后退出
      console.error('💀 未捕获的异常,正在退出...');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.analyzeError(error, 'unhandledRejection');
    });

    // 捕获警告
    process.on('warning', (warning) => {
      this.analyzeError(warning, 'warning');
    });
  }

  loadPatterns() {
    // 常见错误模式和解决方案
    this.patterns.set(/Cannot find module/, {
      type: 'ModuleNotFound',
      category: 'dependency',

      diagnose(error) {
        const match = error.message.match(/Cannot find module '(.+)'/);
        const module = match ? match[1] : 'unknown';

        return {
          issue: `模块 '${module}' 未找到`,
          possibleCauses: [
            '模块未安装',
            '导入路径不正确',
            '缺少文件扩展名',
            '大小写敏感问题'
          ],
          solutions: [
            `运行: npm install ${module}`,
            '检查导入路径是否正确',
            '添加文件扩展名 (.js)',
            '检查文件名大小写是否匹配导入'
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
          issue: `文件 '${file}' 未找到`,
          possibleCauses: [
            '文件不存在',
            '文件路径不正确',
            '权限被拒绝',
            '工作目录问题'
          ],
          solutions: [
            '验证文件是否存在',
            '检查文件路径是否正确',
            '检查文件权限',
            `当前目录: ${process.cwd()}`
          ]
        };
      }
    });

    this.patterns.set(/TypeError:.*undefined/, {
      type: 'TypeError',
      category: 'runtime',

      diagnose(error) {
        return {
          issue: '访问 undefined 的属性',
          possibleCauses: [
            '变量未初始化',
            '异步操作未等待',
            '缺少空值检查',
            '作用域错误'
          ],
          solutions: [
            '添加空值/未定义检查',
            '确保 promise 被等待',
            '使用前初始化变量',
            '检查变量作用域'
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
          issue: '内存不足',
          possibleCauses: [
            '内存泄漏',
            '大数据处理',
            '无限循环',
            '循环引用'
          ],
          solutions: [
            '增加 Node.js 内存: --max-old-space-size=4096',
            '分块处理数据',
            '查找内存泄漏',
            '清除未使用的引用'
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

    // 查找匹配模式
    for (const [pattern, analyzer] of this.patterns) {
      if (pattern.test(error.message)) {
        analysis.diagnosis = analyzer.diagnose(error);
        analysis.type = analyzer.type;
        analysis.category = analyzer.category;
        break;
      }
    }

    // 存储错误
    this.errors.push(analysis);

    // 显示分析
    this.displayAnalysis(analysis);

    // 触发处理器
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
    console.error('错误分析');
    console.error('═'.repeat(60));

    console.error(`\n🔴 ${analysis.error.name}: ${analysis.error.message}`);
    console.error(`来源: ${analysis.source}`);

    if (analysis.diagnosis) {
      console.error('\n📋 诊断:');
      console.error(`问题: ${analysis.diagnosis.issue}`);

      if (analysis.diagnosis.possibleCauses) {
        console.error('\n可能原因:');
        analysis.diagnosis.possibleCauses.forEach(cause => {
          console.error(`  • ${cause}`);
        });
      }

      if (analysis.diagnosis.solutions) {
        console.error('\n建议解决方案:');
        analysis.diagnosis.solutions.forEach(solution => {
          console.error(`  ✓ ${solution}`);
        });
      }
    }

    if (analysis.similar.length > 0) {
      console.error(`\n⚠️  类似错误之前发生了 ${analysis.similar.length} 次`);
    }

    console.error('\n📍 堆栈跟踪:');
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
        console.error('错误处理器中的错误:', error);
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

    // 按类型分组
    for (const error of this.errors) {
      const type = error.type || 'unknown';
      report.errorsByType[type] = (report.errorsByType[type] || 0) + 1;

      const category = error.category || 'unknown';
      report.errorsByCategory[category] = (report.errorsByCategory[category] || 0) + 1;
    }

    // 查找模式
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

## 开发工具集成

### VSCode 调试器集成

```javascript
class VSCodeDebugger {
  generateLaunchConfig() {
    return {
      version: '0.2.0',
      configurations: [
        {
          type: 'node',
          request: 'launch',
          name: '调试 Claude Code',
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
          name: '附加到进程',
          port: 9229,
          skipFiles: ['<node_internals>/**']
        },
        {
          type: 'node',
          request: 'launch',
          name: '调试当前文件',
          skipFiles: ['<node_internals>/**'],
          program: '${file}',
          env: {
            DEBUG: '*'
          }
        },
        {
          type: 'node',
          request: 'launch',
          name: '带性能分析调试',
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
          label: '启动调试会话',
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
          label: '分析性能',
          type: 'shell',
          command: 'node --prof src/cli/main.js && node --prof-process isolate-*.log > profile.txt',
          group: 'test',
          presentation: {
            reveal: 'always',
            panel: 'new'
          }
        },
        {
          label: '检查内存泄漏',
          type: 'shell',
          command: 'node --expose-gc --trace-gc src/cli/main.js',
          group: 'test'
        }
      ]
    };
  }
}

// Chrome DevTools 集成
class ChromeDevTools {
  static startInspector() {
    const inspector = require('inspector');

    if (!inspector.url()) {
      inspector.open(9229, '0.0.0.0', true);
    }

    const url = inspector.url();

    console.log('\n' + '═'.repeat(60));
    console.log('🔍 Chrome DevTools 调试');
    console.log('═'.repeat(60));
    console.log('\n检查器 URL:', url);
    console.log('\n调试方法:');
    console.log('1. 打开 Chrome/Edge 浏览器');
    console.log('2. 导航到: chrome://inspect');
    console.log('3. 点击远程目标下的 "inspect"');
    console.log('\n或直接打开:');
    console.log(`devtools://devtools/bundled/inspector.html?ws=${url.replace('ws://', '')}`);
    console.log('═'.repeat(60) + '\n');

    return url;
  }
}
```

## 性能影响

### 调试性能监控

```javascript
class DebugPerformanceMonitor {
  static analyze() {
    const metrics = {
      debugOverhead: this.measureDebugOverhead(),
      loggingImpact: this.measureLoggingImpact(),
      tracingCost: this.measureTracingCost(),
      recommendations: []
    };

    // 生成建议
    if (metrics.debugOverhead > 10) {
      metrics.recommendations.push('检测到高调试开销。考虑减少调试输出。');
    }

    if (metrics.loggingImpact > 5) {
      metrics.recommendations.push('日志记录影响显著。使用条件日志记录。');
    }

    if (metrics.tracingCost > 15) {
      metrics.recommendations.push('跟踪成本高昂。在生产环境中禁用。');
    }

    return metrics;
  }

  static measureDebugOverhead() {
    const iterations = 10000;
    const debug = require('./debug-framework').debug('perf-test');

    // 基准线(无调试)
    const baselineStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      // 空循环
    }
    const baselineEnd = process.hrtime.bigint();
    const baseline = Number(baselineEnd - baselineStart) / 1e6;

    // 带调试
    const debugStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      debug('测试消息', { iteration: i });
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
      logger.debug('测试日志', { data: { i } });
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
        // 一些工作
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

## 总结

Claude Code 调试工具包提供全面的调试能力:

1. **调试框架**:灵活的基于命名空间的调试,带过滤和历史记录
2. **高级日志记录**:多传输器日志记录,带级别、元数据和性能分析
3. **调试模式**:用于详细、性能、内存、API 和工具调试的专用模式
4. **交互式调试器**:基于 REPL 的调试,带断点和变量监视
5. **跟踪系统**:分布式跟踪,带跨度跟踪和 OpenTelemetry 支持
6. **错误诊断**:智能错误分析,带模式匹配和解决方案
7. **IDE 集成**:VSCode 和 Chrome DevTools 集成,用于可视化调试
8. **性能监控**:调试开销测量和优化建议

调试基础设施实现高效的开发和故障排除,同时在生产环境中保持最小的性能影响。

## 下一步

这完成了第 9 部分:开发工具。下一部分将探讨 Claude Code 系统中的安全实现。

---

*Claude Code 技术系列的一部分 - 开发工具*