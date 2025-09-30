# Part 11.1: 插件架构

## 简介

Claude Code 的插件架构为扩展平台功能提供了一个强大而灵活的系统,无需修改核心代码即可实现功能扩展。该架构遵循现代软件设计原则,包括依赖注入、事件驱动通信和沙盒执行环境。插件系统使开发者能够添加自定义功能、集成第三方服务,并根据特定工作流定制 Claude Code,同时保持系统的稳定性和安全性。

## 核心架构概述

插件架构由几个关键组件组成,它们协同工作以提供无缝的扩展体验:

### 插件管理器

```javascript
// PluginManager.js
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs-extra';

class PluginManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.plugins = new Map();
    this.hooks = new Map();
    this.lifecycleStates = new Map();
    this.sandboxes = new Map();

    this.config = {
      pluginDir: options.pluginDir || './plugins',
      enableSandbox: options.enableSandbox ?? true,
      autoLoad: options.autoLoad ?? true,
      maxConcurrentPlugins: options.maxConcurrentPlugins || 10,
      pluginTimeout: options.pluginTimeout || 30000,
      ...options
    };

    this.eventBus = options.eventBus;
    this.storage = options.storage;
    this.logger = options.logger;

    this.isInitialized = false;
    this.loadQueue = [];
    this.activePlugins = new Set();
  }

  async initialize() {
    try {
      // 确保插件目录存在
      await fs.ensureDir(this.config.pluginDir);

      // 设置全局钩子
      this.setupGlobalHooks();

      // 加载插件清单
      await this.discoverPlugins();

      // 自动加载已启用的插件
      if (this.config.autoLoad) {
        await this.loadEnabledPlugins();
      }

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      this.logger?.error('Failed to initialize plugin manager', error);
      throw error;
    }
  }

  async discoverPlugins() {
    const pluginDirs = await fs.readdir(this.config.pluginDir);

    for (const dir of pluginDirs) {
      const pluginPath = path.join(this.config.pluginDir, dir);
      const stat = await fs.stat(pluginPath);

      if (stat.isDirectory()) {
        await this.registerPlugin(pluginPath);
      }
    }
  }

  async registerPlugin(pluginPath) {
    try {
      // 加载插件清单
      const manifestPath = path.join(pluginPath, 'plugin.json');
      const manifest = await fs.readJson(manifestPath);

      // 验证清单
      this.validateManifest(manifest);

      // 创建插件实例
      const plugin = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        manifest,
        path: pluginPath,
        state: 'registered',
        instance: null,
        sandbox: null,
        hooks: new Set(),
        dependencies: manifest.dependencies || [],
        permissions: manifest.permissions || []
      };

      this.plugins.set(plugin.id, plugin);
      this.lifecycleStates.set(plugin.id, 'registered');

      this.emit('plugin-registered', plugin);

    } catch (error) {
      this.logger?.error(`Failed to register plugin at ${pluginPath}`, error);
    }
  }

  validateManifest(manifest) {
    const required = ['id', 'name', 'version', 'main'];

    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // 验证版本格式
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new Error('Invalid version format');
    }

    // 验证权限
    if (manifest.permissions) {
      const validPermissions = [
        'file-read', 'file-write', 'network', 'shell',
        'tool-access', 'api-access', 'config-access'
      ];

      for (const permission of manifest.permissions) {
        if (!validPermissions.includes(permission)) {
          throw new Error(`Invalid permission: ${permission}`);
        }
      }
    }
  }

  async loadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (plugin.state === 'loaded') {
      return plugin;
    }

    try {
      // 检查依赖项
      await this.checkDependencies(plugin);

      // 如果启用沙盒,创建沙盒
      if (this.config.enableSandbox) {
        plugin.sandbox = await this.createSandbox(plugin);
      }

      // 加载插件代码
      const mainPath = path.join(plugin.path, plugin.manifest.main);

      if (plugin.sandbox) {
        plugin.instance = await this.loadInSandbox(plugin, mainPath);
      } else {
        plugin.instance = await this.loadDirect(mainPath);
      }

      // 初始化插件
      if (plugin.instance.initialize) {
        await plugin.instance.initialize({
          config: this.getPluginConfig(pluginId),
          api: this.createPluginAPI(plugin),
          logger: this.createPluginLogger(plugin)
        });
      }

      // 注册插件钩子
      await this.registerPluginHooks(plugin);

      plugin.state = 'loaded';
      this.lifecycleStates.set(pluginId, 'loaded');
      this.activePlugins.add(pluginId);

      this.emit('plugin-loaded', plugin);

      return plugin;

    } catch (error) {
      plugin.state = 'error';
      this.lifecycleStates.set(pluginId, 'error');
      throw error;
    }
  }

  async createSandbox(plugin) {
    return new Worker(path.join(__dirname, 'plugin-sandbox.js'), {
      workerData: {
        pluginId: plugin.id,
        pluginPath: plugin.path,
        permissions: plugin.permissions
      }
    });
  }

  createPluginAPI(plugin) {
    return {
      // 事件 API
      on: (event, handler) => this.addPluginListener(plugin, event, handler),
      off: (event, handler) => this.removePluginListener(plugin, event, handler),
      emit: (event, ...args) => this.emitPluginEvent(plugin, event, ...args),

      // 钩子 API
      registerHook: (name, handler) => this.registerHook(plugin, name, handler),
      unregisterHook: (name) => this.unregisterHook(plugin, name),

      // 存储 API
      storage: {
        get: (key) => this.getPluginStorage(plugin.id, key),
        set: (key, value) => this.setPluginStorage(plugin.id, key, value),
        delete: (key) => this.deletePluginStorage(plugin.id, key)
      },

      // 工具 API
      registerTool: (tool) => this.registerPluginTool(plugin, tool),
      callTool: (name, params) => this.callTool(name, params),

      // UI API
      ui: {
        showMessage: (message) => this.showPluginMessage(plugin, message),
        showPrompt: (prompt) => this.showPluginPrompt(plugin, prompt),
        registerView: (view) => this.registerPluginView(plugin, view)
      }
    };
  }

  async unloadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    try {
      // 调用插件清理
      if (plugin.instance?.cleanup) {
        await plugin.instance.cleanup();
      }

      // 注销钩子
      for (const hook of plugin.hooks) {
        this.hooks.delete(hook);
      }

      // 终止沙盒
      if (plugin.sandbox) {
        await plugin.sandbox.terminate();
      }

      plugin.state = 'unloaded';
      plugin.instance = null;
      plugin.sandbox = null;
      this.activePlugins.delete(pluginId);

      this.emit('plugin-unloaded', plugin);

    } catch (error) {
      this.logger?.error(`Failed to unload plugin ${pluginId}`, error);
    }
  }
}
```

### 插件沙盒

```javascript
// plugin-sandbox.js
import { parentPort, workerData } from 'worker_threads';
import vm from 'vm';
import { createRequire } from 'module';

class PluginSandbox {
  constructor(workerData) {
    this.pluginId = workerData.pluginId;
    this.pluginPath = workerData.pluginPath;
    this.permissions = new Set(workerData.permissions);

    this.context = this.createContext();
    this.messageHandlers = new Map();

    this.setupMessageHandling();
  }

  createContext() {
    const sandbox = {
      console: this.createSafeConsole(),
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
      Buffer: Buffer,
      process: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        env: {} // 为了安全性使用空环境
      }
    };

    // 添加允许的模块
    if (this.permissions.has('file-read')) {
      sandbox.fs = this.createSafeFs();
    }

    if (this.permissions.has('network')) {
      sandbox.fetch = this.createSafeFetch();
    }

    // 创建带限制的 require 函数
    sandbox.require = this.createSafeRequire();

    return vm.createContext(sandbox);
  }

  createSafeConsole() {
    return {
      log: (...args) => this.sendMessage('console.log', args),
      error: (...args) => this.sendMessage('console.error', args),
      warn: (...args) => this.sendMessage('console.warn', args),
      info: (...args) => this.sendMessage('console.info', args)
    };
  }

  createSafeFs() {
    const fs = require('fs');
    const path = require('path');

    return {
      readFile: async (filepath, options) => {
        // 验证路径是否在允许的目录内
        const resolved = path.resolve(filepath);
        if (!this.isPathAllowed(resolved)) {
          throw new Error('Access denied to path: ' + filepath);
        }
        return fs.promises.readFile(resolved, options);
      },

      readdir: async (dirpath, options) => {
        const resolved = path.resolve(dirpath);
        if (!this.isPathAllowed(resolved)) {
          throw new Error('Access denied to path: ' + dirpath);
        }
        return fs.promises.readdir(resolved, options);
      },

      stat: async (filepath) => {
        const resolved = path.resolve(filepath);
        if (!this.isPathAllowed(resolved)) {
          throw new Error('Access denied to path: ' + filepath);
        }
        return fs.promises.stat(resolved);
      }
    };
  }

  createSafeFetch() {
    return async (url, options) => {
      // 验证 URL 是否在允许的域名内
      if (!this.isUrlAllowed(url)) {
        throw new Error('Network access denied to: ' + url);
      }

      // 通过父进程代理 fetch
      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36);

        this.messageHandlers.set(requestId, { resolve, reject });

        parentPort.postMessage({
          type: 'fetch',
          requestId,
          url,
          options
        });
      });
    };
  }

  createSafeRequire() {
    const require = createRequire(this.pluginPath);
    const allowedModules = [
      'path', 'url', 'querystring', 'util',
      'events', 'stream', 'string_decoder'
    ];

    return (moduleName) => {
      // 允许插件内的相对引用
      if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
        const resolved = require.resolve(moduleName);
        if (resolved.startsWith(this.pluginPath)) {
          return require(moduleName);
        }
        throw new Error('Cannot require module outside plugin directory');
      }

      // 检查是否在允许的模块列表中
      if (!allowedModules.includes(moduleName)) {
        throw new Error(`Module not allowed: ${moduleName}`);
      }

      return require(moduleName);
    };
  }

  async loadPlugin(mainPath) {
    const code = await fs.promises.readFile(mainPath, 'utf8');

    // 包装在异步函数中以支持顶层 await
    const wrappedCode = `
      (async function() {
        ${code}

        // 返回插件导出
        if (typeof module !== 'undefined' && module.exports) {
          return module.exports;
        }
        return {};
      })()
    `;

    const script = new vm.Script(wrappedCode, {
      filename: mainPath,
      lineOffset: -1
    });

    // 添加类似模块的全局变量
    this.context.module = { exports: {} };
    this.context.__filename = mainPath;
    this.context.__dirname = path.dirname(mainPath);

    const result = await script.runInContext(this.context);
    return result;
  }

  isPathAllowed(filepath) {
    // 检查路径是否在插件目录或允许的路径内
    const allowed = [
      this.pluginPath,
      process.cwd() // 当前工作目录
    ];

    return allowed.some(dir => filepath.startsWith(dir));
  }

  isUrlAllowed(url) {
    // 解析并验证 URL
    try {
      const parsed = new URL(url);

      // 仅允许 HTTPS
      if (parsed.protocol !== 'https:') {
        return false;
      }

      // 检查黑名单
      const blocked = ['localhost', '127.0.0.1', '0.0.0.0'];
      if (blocked.includes(parsed.hostname)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  setupMessageHandling() {
    parentPort.on('message', async (message) => {
      switch (message.type) {
        case 'load':
          try {
            const plugin = await this.loadPlugin(message.mainPath);
            parentPort.postMessage({
              type: 'loaded',
              plugin: this.serializePlugin(plugin)
            });
          } catch (error) {
            parentPort.postMessage({
              type: 'error',
              error: error.message
            });
          }
          break;

        case 'call':
          try {
            const result = await this.callPluginMethod(
              message.method,
              message.args
            );
            parentPort.postMessage({
              type: 'result',
              callId: message.callId,
              result
            });
          } catch (error) {
            parentPort.postMessage({
              type: 'error',
              callId: message.callId,
              error: error.message
            });
          }
          break;

        case 'fetch-response':
          const handler = this.messageHandlers.get(message.requestId);
          if (handler) {
            if (message.error) {
              handler.reject(new Error(message.error));
            } else {
              handler.resolve(message.response);
            }
            this.messageHandlers.delete(message.requestId);
          }
          break;
      }
    });
  }

  sendMessage(type, data) {
    parentPort.postMessage({ type, data });
  }
}

// 初始化沙盒
const sandbox = new PluginSandbox(workerData);
```

## 插件生命周期管理

### 生命周期状态

```javascript
// PluginLifecycle.js
class PluginLifecycle {
  constructor(pluginManager) {
    this.pluginManager = pluginManager;

    this.states = {
      DISCOVERED: 'discovered',
      REGISTERED: 'registered',
      LOADING: 'loading',
      LOADED: 'loaded',
      ACTIVE: 'active',
      SUSPENDED: 'suspended',
      UNLOADING: 'unloading',
      UNLOADED: 'unloaded',
      ERROR: 'error'
    };

    this.transitions = new Map([
      ['discovered', ['registered', 'error']],
      ['registered', ['loading', 'unloaded', 'error']],
      ['loading', ['loaded', 'error']],
      ['loaded', ['active', 'unloading', 'error']],
      ['active', ['suspended', 'unloading', 'error']],
      ['suspended', ['active', 'unloading', 'error']],
      ['unloading', ['unloaded', 'error']],
      ['unloaded', ['loading', 'registered']],
      ['error', ['unloaded', 'registered']]
    ]);
  }

  async transitionPlugin(pluginId, newState) {
    const plugin = this.pluginManager.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const currentState = plugin.state;
    const allowedTransitions = this.transitions.get(currentState) || [];

    if (!allowedTransitions.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${currentState} -> ${newState}`
      );
    }

    // 执行转换
    await this.executeTransition(plugin, currentState, newState);

    // 更新状态
    plugin.state = newState;
    this.pluginManager.lifecycleStates.set(pluginId, newState);

    // 发出生命周期事件
    this.pluginManager.emit('plugin-lifecycle', {
      pluginId,
      previousState: currentState,
      currentState: newState
    });
  }

  async executeTransition(plugin, fromState, toState) {
    const transitionKey = `${fromState}->${toState}`;

    switch (transitionKey) {
      case 'registered->loading':
        await this.onBeforeLoad(plugin);
        break;

      case 'loading->loaded':
        await this.onAfterLoad(plugin);
        break;

      case 'loaded->active':
        await this.onActivate(plugin);
        break;

      case 'active->suspended':
        await this.onSuspend(plugin);
        break;

      case 'suspended->active':
        await this.onResume(plugin);
        break;

      case 'active->unloading':
      case 'loaded->unloading':
        await this.onBeforeUnload(plugin);
        break;

      case 'unloading->unloaded':
        await this.onAfterUnload(plugin);
        break;
    }
  }

  async onBeforeLoad(plugin) {
    // 验证依赖项
    for (const dep of plugin.dependencies) {
      const depPlugin = this.pluginManager.plugins.get(dep);
      if (!depPlugin || depPlugin.state !== 'active') {
        throw new Error(`Dependency not satisfied: ${dep}`);
      }
    }

    // 检查资源限制
    if (this.pluginManager.activePlugins.size >=
        this.pluginManager.config.maxConcurrentPlugins) {
      throw new Error('Maximum concurrent plugins reached');
    }

    // 发出预加载事件
    this.pluginManager.emit('plugin-before-load', plugin);
  }

  async onAfterLoad(plugin) {
    // 注册插件功能
    await this.registerCapabilities(plugin);

    // 设置监控
    this.setupMonitoring(plugin);

    // 发出后加载事件
    this.pluginManager.emit('plugin-after-load', plugin);
  }

  async onActivate(plugin) {
    // 调用插件激活钩子
    if (plugin.instance?.onActivate) {
      await plugin.instance.onActivate();
    }

    // 启用插件功能
    await this.enableFeatures(plugin);

    // 启动健康检查
    this.startHealthCheck(plugin);
  }

  async onSuspend(plugin) {
    // 调用插件挂起钩子
    if (plugin.instance?.onSuspend) {
      await plugin.instance.onSuspend();
    }

    // 暂停活动操作
    await this.pauseOperations(plugin);

    // 释放资源
    await this.freeResources(plugin);
  }

  async registerCapabilities(plugin) {
    const manifest = plugin.manifest;

    // 注册命令
    if (manifest.commands) {
      for (const command of manifest.commands) {
        await this.pluginManager.registerCommand(plugin, command);
      }
    }

    // 注册工具
    if (manifest.tools) {
      for (const tool of manifest.tools) {
        await this.pluginManager.registerTool(plugin, tool);
      }
    }

    // 注册视图
    if (manifest.views) {
      for (const view of manifest.views) {
        await this.pluginManager.registerView(plugin, view);
      }
    }
  }
}
```

## 钩子系统

### 钩子管理器

```javascript
// HookManager.js
class HookManager {
  constructor() {
    this.hooks = new Map();
    this.priorities = new Map();
    this.asyncHooks = new Set();
  }

  register(name, handler, options = {}) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }

    const hookEntry = {
      id: options.id || Math.random().toString(36),
      handler,
      priority: options.priority || 10,
      once: options.once || false,
      async: options.async || false,
      context: options.context || null
    };

    const hooks = this.hooks.get(name);
    hooks.push(hookEntry);

    // 按优先级排序
    hooks.sort((a, b) => b.priority - a.priority);

    if (hookEntry.async) {
      this.asyncHooks.add(name);
    }

    return hookEntry.id;
  }

  async execute(name, ...args) {
    const hooks = this.hooks.get(name) || [];
    const isAsync = this.asyncHooks.has(name);

    let result = args[0];
    const results = [];

    for (const hook of hooks) {
      try {
        if (isAsync || hook.async) {
          result = await hook.handler.call(hook.context, result, ...args.slice(1));
        } else {
          result = hook.handler.call(hook.context, result, ...args.slice(1));
        }

        results.push(result);

        // 处理"仅一次"钩子
        if (hook.once) {
          this.unregister(name, hook.id);
        }

        // 允许钩子停止传播
        if (result === false) {
          break;
        }

      } catch (error) {
        console.error(`Hook error in ${name}:`, error);

        // 在发生错误时继续执行其他钩子
        if (hook.continueOnError !== false) {
          continue;
        }
        throw error;
      }
    }

    return results.length === 1 ? results[0] : results;
  }

  unregister(name, id) {
    const hooks = this.hooks.get(name);
    if (!hooks) return false;

    const index = hooks.findIndex(h => h.id === id);
    if (index !== -1) {
      hooks.splice(index, 1);
      return true;
    }

    return false;
  }

  clear(name) {
    if (name) {
      this.hooks.delete(name);
      this.asyncHooks.delete(name);
    } else {
      this.hooks.clear();
      this.asyncHooks.clear();
    }
  }
}
```

### 内置钩子

```javascript
// built-in-hooks.js
class BuiltInHooks {
  static register(hookManager) {
    // 工具执行钩子
    hookManager.register('before-tool-execute', async (context) => {
      // 验证工具权限
      if (!context.plugin.permissions.includes('tool-access')) {
        throw new Error('Plugin lacks tool access permission');
      }

      // 记录工具执行
      console.log(`Plugin ${context.plugin.id} executing tool: ${context.tool}`);

      return context;
    });

    hookManager.register('after-tool-execute', async (result, context) => {
      // 处理工具结果
      if (context.transform) {
        result = await context.transform(result);
      }

      // 如果需要缓存结果
      if (context.cache) {
        await context.cache.set(context.cacheKey, result);
      }

      return result;
    });

    // 消息处理钩子
    hookManager.register('before-message', async (message) => {
      // 清理消息
      message.content = this.sanitizeContent(message.content);

      // 检查速率限制
      await this.checkRateLimit(message.userId);

      return message;
    });

    hookManager.register('after-message', async (response, message) => {
      // 记录消息处理
      await this.logMessage(message, response);

      // 更新指标
      await this.updateMetrics(message, response);

      return response;
    });

    // 文件操作钩子
    hookManager.register('before-file-read', async (filepath) => {
      // 验证文件访问权限
      if (!this.isFileAccessAllowed(filepath)) {
        throw new Error('File access denied');
      }

      // 规范化路径
      return path.resolve(filepath);
    });

    hookManager.register('after-file-read', async (content, filepath) => {
      // 处理文件内容
      if (filepath.endsWith('.json')) {
        try {
          return JSON.parse(content);
        } catch {
          return content;
        }
      }

      return content;
    });

    // 配置钩子
    hookManager.register('before-config-change', async (change) => {
      // 验证配置更改
      if (!this.isConfigChangeValid(change)) {
        throw new Error('Invalid configuration change');
      }

      // 备份当前配置
      await this.backupConfig();

      return change;
    });

    hookManager.register('after-config-change', async (newConfig, change) => {
      // 重新加载受影响的组件
      await this.reloadComponents(change.affected);

      // 通知插件
      await this.notifyPlugins('config-changed', change);

      return newConfig;
    });
  }

  static sanitizeContent(content) {
    // 移除潜在的有害内容
    return content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+="[^"]*"/gi, '');
  }

  static async checkRateLimit(userId) {
    // 实现速率限制逻辑
    const key = `rate:${userId}`;
    const limit = 100;
    const window = 60000; // 1 分钟

    // 检查并更新速率限制
    // 如果超过限制则抛出错误
  }
}
```

## 插件通信

### 插件间通信

```javascript
// InterPluginCommunication.js
class InterPluginCommunication {
  constructor(pluginManager) {
    this.pluginManager = pluginManager;
    this.channels = new Map();
    this.subscriptions = new Map();
    this.messageQueue = [];
    this.processing = false;
  }

  createChannel(name, options = {}) {
    if (this.channels.has(name)) {
      throw new Error(`Channel already exists: ${name}`);
    }

    const channel = {
      name,
      type: options.type || 'broadcast',
      persistent: options.persistent || false,
      buffer: options.buffer || 100,
      messages: [],
      subscribers: new Set()
    };

    this.channels.set(name, channel);
    return channel;
  }

  subscribe(pluginId, channelName, handler) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel not found: ${channelName}`);
    }

    const subscription = {
      pluginId,
      channel: channelName,
      handler,
      id: Math.random().toString(36)
    };

    channel.subscribers.add(subscription);

    if (!this.subscriptions.has(pluginId)) {
      this.subscriptions.set(pluginId, new Set());
    }
    this.subscriptions.get(pluginId).add(subscription);

    // 如果有缓冲消息则发送
    if (channel.persistent && channel.messages.length > 0) {
      for (const message of channel.messages) {
        handler(message);
      }
    }

    return subscription.id;
  }

  async publish(pluginId, channelName, message) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel not found: ${channelName}`);
    }

    const envelope = {
      id: Math.random().toString(36),
      sender: pluginId,
      channel: channelName,
      timestamp: Date.now(),
      message
    };

    // 如果持久化则存储到缓冲区
    if (channel.persistent) {
      channel.messages.push(envelope);

      // 如果需要修剪缓冲区
      if (channel.messages.length > channel.buffer) {
        channel.messages.shift();
      }
    }

    // 排队等待交付
    this.messageQueue.push(envelope);

    // 处理队列
    if (!this.processing) {
      await this.processQueue();
    }
  }

  async processQueue() {
    this.processing = true;

    while (this.messageQueue.length > 0) {
      const envelope = this.messageQueue.shift();
      const channel = this.channels.get(envelope.channel);

      if (!channel) continue;

      // 分发给订阅者
      for (const subscription of channel.subscribers) {
        // 除非自我订阅,否则不发送给发送者
        if (subscription.pluginId === envelope.sender &&
            !channel.selfSubscribe) {
          continue;
        }

        try {
          await subscription.handler(envelope);
        } catch (error) {
          console.error(
            `Failed to deliver message to ${subscription.pluginId}:`,
            error
          );
        }
      }
    }

    this.processing = false;
  }

  async call(pluginId, targetPlugin, method, ...args) {
    const target = this.pluginManager.plugins.get(targetPlugin);
    if (!target || target.state !== 'active') {
      throw new Error(`Target plugin not available: ${targetPlugin}`);
    }

    // 检查方法是否公开
    if (!target.instance?.exports?.[method]) {
      throw new Error(`Method not exposed: ${method}`);
    }

    // 创建请求上下文
    const context = {
      caller: pluginId,
      target: targetPlugin,
      method,
      timestamp: Date.now()
    };

    // 带超时执行
    const timeout = this.pluginManager.config.pluginTimeout;
    return Promise.race([
      target.instance.exports[method].call(context, ...args),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Plugin call timeout')), timeout)
      )
    ]);
  }
}
```

### 事件总线集成

```javascript
// PluginEventBus.js
class PluginEventBus extends EventEmitter {
  constructor(pluginManager) {
    super();
    this.pluginManager = pluginManager;
    this.eventMap = new Map();
    this.wildcardListeners = new Set();

    // 增加插件系统的最大监听器数量
    this.setMaxListeners(100);
  }

  registerPlugin(pluginId, events = []) {
    if (!this.eventMap.has(pluginId)) {
      this.eventMap.set(pluginId, new Set());
    }

    const pluginEvents = this.eventMap.get(pluginId);

    for (const event of events) {
      if (event === '*') {
        this.wildcardListeners.add(pluginId);
      } else {
        pluginEvents.add(event);
      }
    }
  }

  emitPluginEvent(pluginId, event, ...args) {
    // 检查插件是否可以发出此事件
    const pluginEvents = this.eventMap.get(pluginId);
    if (!pluginEvents?.has(event) && !this.wildcardListeners.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} not authorized to emit ${event}`);
    }

    // 添加插件上下文
    const context = {
      source: pluginId,
      timestamp: Date.now(),
      event
    };

    // 带上下文发出
    this.emit(event, context, ...args);

    // 发出给通配符监听器
    this.emit('*', context, ...args);
  }

  onPluginEvent(pluginId, event, handler) {
    const wrappedHandler = (context, ...args) => {
      // 过滤插件事件
      if (context.source === pluginId) {
        return; // 不接收自己的事件
      }

      try {
        handler(context, ...args);
      } catch (error) {
        console.error(`Plugin ${pluginId} event handler error:`, error);
      }
    };

    this.on(event, wrappedHandler);

    // 跟踪以便清理
    if (!this.pluginHandlers) {
      this.pluginHandlers = new Map();
    }

    if (!this.pluginHandlers.has(pluginId)) {
      this.pluginHandlers.set(pluginId, []);
    }

    this.pluginHandlers.get(pluginId).push({
      event,
      handler: wrappedHandler
    });
  }

  removePluginListeners(pluginId) {
    const handlers = this.pluginHandlers?.get(pluginId) || [];

    for (const { event, handler } of handlers) {
      this.removeListener(event, handler);
    }

    this.pluginHandlers?.delete(pluginId);
    this.eventMap.delete(pluginId);
    this.wildcardListeners.delete(pluginId);
  }
}
```

## 插件发现和加载

### 插件发现

```javascript
// PluginDiscovery.js
class PluginDiscovery {
  constructor(options = {}) {
    this.searchPaths = options.searchPaths || [
      './plugins',
      path.join(os.homedir(), '.claude-code', 'plugins'),
      '/usr/local/lib/claude-code/plugins'
    ];

    this.registry = options.registry || 'https://registry.claude-code.io';
    this.cache = new Map();
  }

  async discover() {
    const plugins = [];

    // 搜索本地目录
    for (const searchPath of this.searchPaths) {
      const localPlugins = await this.searchDirectory(searchPath);
      plugins.push(...localPlugins);
    }

    // 搜索注册表
    if (this.registry) {
      const registryPlugins = await this.searchRegistry();
      plugins.push(...registryPlugins);
    }

    // 按 ID 去重
    const unique = new Map();
    for (const plugin of plugins) {
      if (!unique.has(plugin.id) ||
          this.compareVersions(plugin.version, unique.get(plugin.id).version) > 0) {
        unique.set(plugin.id, plugin);
      }
    }

    return Array.from(unique.values());
  }

  async searchDirectory(dirPath) {
    const plugins = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(dirPath, entry.name);
          const plugin = await this.loadPluginManifest(pluginPath);

          if (plugin) {
            plugins.push(plugin);
          }
        }
      }
    } catch (error) {
      // 目录不存在或无法访问
      console.debug(`Failed to search directory ${dirPath}:`, error.message);
    }

    return plugins;
  }

  async loadPluginManifest(pluginPath) {
    const manifestPath = path.join(pluginPath, 'plugin.json');

    try {
      const manifest = await fs.readJson(manifestPath);

      return {
        ...manifest,
        path: pluginPath,
        source: 'local'
      };
    } catch {
      return null;
    }
  }

  async searchRegistry() {
    try {
      const response = await fetch(`${this.registry}/api/plugins`);
      const plugins = await response.json();

      return plugins.map(p => ({
        ...p,
        source: 'registry'
      }));
    } catch (error) {
      console.error('Failed to search registry:', error);
      return [];
    }
  }

  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }
}
```

### 插件加载器

```javascript
// PluginLoader.js
class PluginLoader {
  constructor(pluginManager) {
    this.pluginManager = pluginManager;
    this.loadedModules = new Map();
    this.resolvers = new Map();
  }

  async load(plugin) {
    const mainFile = path.join(plugin.path, plugin.manifest.main);

    // 检查缓存
    if (this.loadedModules.has(plugin.id)) {
      return this.loadedModules.get(plugin.id);
    }

    // 根据文件扩展名确定加载器
    const ext = path.extname(mainFile);
    const loader = this.getLoader(ext);

    if (!loader) {
      throw new Error(`No loader for file type: ${ext}`);
    }

    // 加载模块
    const module = await loader(mainFile, plugin);

    // 缓存模块
    this.loadedModules.set(plugin.id, module);

    // 如果需要初始化
    if (module.initialize) {
      await module.initialize(this.createPluginContext(plugin));
    }

    return module;
  }

  getLoader(extension) {
    const loaders = {
      '.js': this.loadJavaScript.bind(this),
      '.mjs': this.loadESModule.bind(this),
      '.ts': this.loadTypeScript.bind(this),
      '.wasm': this.loadWebAssembly.bind(this)
    };

    return loaders[extension];
  }

  async loadJavaScript(filepath, plugin) {
    // 清除 require 缓存
    delete require.cache[require.resolve(filepath)];

    // 加载模块
    const module = require(filepath);

    // 包装在代理中以进行访问控制
    return this.wrapModule(module, plugin);
  }

  async loadESModule(filepath, plugin) {
    // 动态导入
    const module = await import(filepath);

    return this.wrapModule(module.default || module, plugin);
  }

  async loadTypeScript(filepath, plugin) {
    // 编译 TypeScript
    const ts = require('typescript');
    const source = await fs.readFile(filepath, 'utf8');

    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020
      }
    });

    // 评估编译后的代码
    const module = eval(result.outputText);

    return this.wrapModule(module, plugin);
  }

  async loadWebAssembly(filepath, plugin) {
    const wasmBuffer = await fs.readFile(filepath);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer);

    return this.wrapModule(wasmModule.instance.exports, plugin);
  }

  wrapModule(module, plugin) {
    const wrapper = {
      ...module,
      __plugin: plugin,
      __context: this.createPluginContext(plugin)
    };

    // 添加权限检查
    return new Proxy(wrapper, {
      get(target, prop) {
        // 检查属性访问权限
        if (typeof target[prop] === 'function') {
          return (...args) => {
            // 验证函数调用
            if (!plugin.permissions.includes('function-call')) {
              throw new Error('Function call not permitted');
            }

            return target[prop].apply(target, args);
          };
        }

        return target[prop];
      }
    });
  }

  createPluginContext(plugin) {
    return {
      id: plugin.id,
      version: plugin.version,
      path: plugin.path,

      // API 访问
      api: this.pluginManager.createPluginAPI(plugin),

      // 日志记录器
      logger: this.pluginManager.createPluginLogger(plugin),

      // 存储
      storage: this.pluginManager.createPluginStorage(plugin),

      // 配置
      config: this.pluginManager.getPluginConfig(plugin.id),

      // 依赖项
      require: this.createPluginRequire(plugin)
    };
  }

  createPluginRequire(plugin) {
    return (moduleId) => {
      // 检查依赖项是否声明
      if (!plugin.manifest.dependencies?.includes(moduleId)) {
        throw new Error(`Undeclared dependency: ${moduleId}`);
      }

      // 加载依赖插件
      const depPlugin = this.pluginManager.plugins.get(moduleId);
      if (!depPlugin) {
        throw new Error(`Dependency not found: ${moduleId}`);
      }

      // 返回依赖项导出
      return depPlugin.instance?.exports || {};
    };
  }
}
```

## 性能和优化

### 插件性能监控器

```javascript
// PluginPerformanceMonitor.js
class PluginPerformanceMonitor {
  constructor(pluginManager) {
    this.pluginManager = pluginManager;
    this.metrics = new Map();
    this.thresholds = {
      loadTime: 5000,
      executionTime: 1000,
      memoryUsage: 100 * 1024 * 1024, // 100MB
      cpuUsage: 50 // 50%
    };
  }

  startMonitoring(pluginId) {
    if (this.metrics.has(pluginId)) {
      return;
    }

    const metrics = {
      loadTime: 0,
      executionTimes: [],
      memorySnapshots: [],
      cpuSnapshots: [],
      errors: [],
      calls: 0,
      startTime: Date.now()
    };

    this.metrics.set(pluginId, metrics);

    // 启动定期监控
    const interval = setInterval(() => {
      this.captureSnapshot(pluginId);
    }, 1000);

    metrics.interval = interval;
  }

  stopMonitoring(pluginId) {
    const metrics = this.metrics.get(pluginId);
    if (!metrics) return;

    clearInterval(metrics.interval);
    this.metrics.delete(pluginId);
  }

  captureSnapshot(pluginId) {
    const plugin = this.pluginManager.plugins.get(pluginId);
    if (!plugin || plugin.state !== 'active') {
      return;
    }

    const metrics = this.metrics.get(pluginId);
    if (!metrics) return;

    // 捕获内存使用情况
    const memUsage = process.memoryUsage();
    metrics.memorySnapshots.push({
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      rss: memUsage.rss
    });

    // 捕获 CPU 使用情况(简化版)
    const cpuUsage = process.cpuUsage();
    metrics.cpuSnapshots.push({
      timestamp: Date.now(),
      user: cpuUsage.user,
      system: cpuUsage.system
    });

    // 仅保留最后 60 个快照
    if (metrics.memorySnapshots.length > 60) {
      metrics.memorySnapshots.shift();
    }
    if (metrics.cpuSnapshots.length > 60) {
      metrics.cpuSnapshots.shift();
    }

    // 检查阈值
    this.checkThresholds(pluginId, metrics);
  }

  recordExecution(pluginId, executionTime) {
    const metrics = this.metrics.get(pluginId);
    if (!metrics) return;

    metrics.executionTimes.push(executionTime);
    metrics.calls++;

    // 仅保留最后 100 次执行时间
    if (metrics.executionTimes.length > 100) {
      metrics.executionTimes.shift();
    }
  }

  checkThresholds(pluginId, metrics) {
    const warnings = [];

    // 检查内存使用情况
    const lastMemSnapshot = metrics.memorySnapshots[metrics.memorySnapshots.length - 1];
    if (lastMemSnapshot && lastMemSnapshot.heapUsed > this.thresholds.memoryUsage) {
      warnings.push({
        type: 'memory',
        value: lastMemSnapshot.heapUsed,
        threshold: this.thresholds.memoryUsage
      });
    }

    // 检查平均执行时间
    if (metrics.executionTimes.length > 0) {
      const avgExecTime = metrics.executionTimes.reduce((a, b) => a + b, 0) /
                         metrics.executionTimes.length;

      if (avgExecTime > this.thresholds.executionTime) {
        warnings.push({
          type: 'execution',
          value: avgExecTime,
          threshold: this.thresholds.executionTime
        });
      }
    }

    // 发出警告
    if (warnings.length > 0) {
      this.pluginManager.emit('plugin-performance-warning', {
        pluginId,
        warnings
      });
    }
  }

  getMetrics(pluginId) {
    const metrics = this.metrics.get(pluginId);
    if (!metrics) return null;

    return {
      uptime: Date.now() - metrics.startTime,
      calls: metrics.calls,
      averageExecutionTime: metrics.executionTimes.length > 0
        ? metrics.executionTimes.reduce((a, b) => a + b, 0) / metrics.executionTimes.length
        : 0,
      currentMemory: metrics.memorySnapshots[metrics.memorySnapshots.length - 1],
      errors: metrics.errors.length
    };
  }
}
```

## 结论

Claude Code 的插件架构为扩展平台功能提供了一个全面而安全的系统。通过其模块化设计、沙盒执行、强大的生命周期管理和广泛的钩子系统,开发者可以创建强大的插件,与核心平台无缝集成。该架构通过基于权限的访问控制和沙盒执行优先考虑安全性,同时通过监控和优化系统保持高性能。

插件系统的灵活性允许各种扩展场景,从简单的实用函数到与外部服务的复杂集成。插件间通信系统使插件能够协同工作,创建丰富的功能生态系统。通过内置的发现、加载和管理功能,插件架构确保 Claude Code 保持可扩展性并能适应不断变化的用户需求,同时保持稳定性和安全性。

通过精心设计插件生命周期、钩子系统和通信机制,Claude Code 为开发者提供了创建可靠、高性能和安全扩展所需的工具,这些扩展增强了平台的功能而不会损害其核心功能或用户体验。