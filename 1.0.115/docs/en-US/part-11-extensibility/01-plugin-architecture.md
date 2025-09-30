# Part 11.1: Plugin Architecture

## Introduction

Claude Code's plugin architecture provides a robust and flexible system for extending the platform's capabilities without modifying core code. This architecture follows modern software design principles, including dependency injection, event-driven communication, and sandboxed execution environments. The plugin system enables developers to add custom functionality, integrate third-party services, and tailor Claude Code to specific workflows while maintaining system stability and security.

## Core Architecture Overview

The plugin architecture consists of several key components that work together to provide a seamless extension experience:

### Plugin Manager

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
      // Ensure plugin directory exists
      await fs.ensureDir(this.config.pluginDir);

      // Set up global hooks
      this.setupGlobalHooks();

      // Load plugin manifests
      await this.discoverPlugins();

      // Auto-load enabled plugins
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
      // Load plugin manifest
      const manifestPath = path.join(pluginPath, 'plugin.json');
      const manifest = await fs.readJson(manifestPath);

      // Validate manifest
      this.validateManifest(manifest);

      // Create plugin instance
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

    // Validate version format
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new Error('Invalid version format');
    }

    // Validate permissions
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
      // Check dependencies
      await this.checkDependencies(plugin);

      // Create sandbox if enabled
      if (this.config.enableSandbox) {
        plugin.sandbox = await this.createSandbox(plugin);
      }

      // Load plugin code
      const mainPath = path.join(plugin.path, plugin.manifest.main);

      if (plugin.sandbox) {
        plugin.instance = await this.loadInSandbox(plugin, mainPath);
      } else {
        plugin.instance = await this.loadDirect(mainPath);
      }

      // Initialize plugin
      if (plugin.instance.initialize) {
        await plugin.instance.initialize({
          config: this.getPluginConfig(pluginId),
          api: this.createPluginAPI(plugin),
          logger: this.createPluginLogger(plugin)
        });
      }

      // Register plugin hooks
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
      // Event API
      on: (event, handler) => this.addPluginListener(plugin, event, handler),
      off: (event, handler) => this.removePluginListener(plugin, event, handler),
      emit: (event, ...args) => this.emitPluginEvent(plugin, event, ...args),

      // Hook API
      registerHook: (name, handler) => this.registerHook(plugin, name, handler),
      unregisterHook: (name) => this.unregisterHook(plugin, name),

      // Storage API
      storage: {
        get: (key) => this.getPluginStorage(plugin.id, key),
        set: (key, value) => this.setPluginStorage(plugin.id, key, value),
        delete: (key) => this.deletePluginStorage(plugin.id, key)
      },

      // Tool API
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
      // Call plugin cleanup
      if (plugin.instance?.cleanup) {
        await plugin.instance.cleanup();
      }

      // Unregister hooks
      for (const hook of plugin.hooks) {
        this.hooks.delete(hook);
      }

      // Terminate sandbox
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

### Plugin Sandbox

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
        env: {} // Empty env for security
      }
    };

    // Add permitted modules
    if (this.permissions.has('file-read')) {
      sandbox.fs = this.createSafeFs();
    }

    if (this.permissions.has('network')) {
      sandbox.fetch = this.createSafeFetch();
    }

    // Create require function with restrictions
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
        // Validate path is within allowed directories
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
      // Validate URL against allowed domains
      if (!this.isUrlAllowed(url)) {
        throw new Error('Network access denied to: ' + url);
      }

      // Proxy the fetch through parent
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
      // Allow relative requires within plugin
      if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
        const resolved = require.resolve(moduleName);
        if (resolved.startsWith(this.pluginPath)) {
          return require(moduleName);
        }
        throw new Error('Cannot require module outside plugin directory');
      }

      // Check against allowed modules
      if (!allowedModules.includes(moduleName)) {
        throw new Error(`Module not allowed: ${moduleName}`);
      }

      return require(moduleName);
    };
  }

  async loadPlugin(mainPath) {
    const code = await fs.promises.readFile(mainPath, 'utf8');

    // Wrap in async function for top-level await support
    const wrappedCode = `
      (async function() {
        ${code}

        // Return the plugin exports
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

    // Add module-like globals
    this.context.module = { exports: {} };
    this.context.__filename = mainPath;
    this.context.__dirname = path.dirname(mainPath);

    const result = await script.runInContext(this.context);
    return result;
  }

  isPathAllowed(filepath) {
    // Check if path is within plugin directory or allowed paths
    const allowed = [
      this.pluginPath,
      process.cwd() // Current working directory
    ];

    return allowed.some(dir => filepath.startsWith(dir));
  }

  isUrlAllowed(url) {
    // Parse and validate URL
    try {
      const parsed = new URL(url);

      // Allow HTTPS only
      if (parsed.protocol !== 'https:') {
        return false;
      }

      // Check against blocklist
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

// Initialize sandbox
const sandbox = new PluginSandbox(workerData);
```

## Plugin Lifecycle Management

### Lifecycle States

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

    // Execute transition
    await this.executeTransition(plugin, currentState, newState);

    // Update state
    plugin.state = newState;
    this.pluginManager.lifecycleStates.set(pluginId, newState);

    // Emit lifecycle event
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
    // Validate dependencies
    for (const dep of plugin.dependencies) {
      const depPlugin = this.pluginManager.plugins.get(dep);
      if (!depPlugin || depPlugin.state !== 'active') {
        throw new Error(`Dependency not satisfied: ${dep}`);
      }
    }

    // Check resource limits
    if (this.pluginManager.activePlugins.size >=
        this.pluginManager.config.maxConcurrentPlugins) {
      throw new Error('Maximum concurrent plugins reached');
    }

    // Emit pre-load event
    this.pluginManager.emit('plugin-before-load', plugin);
  }

  async onAfterLoad(plugin) {
    // Register plugin capabilities
    await this.registerCapabilities(plugin);

    // Set up monitoring
    this.setupMonitoring(plugin);

    // Emit post-load event
    this.pluginManager.emit('plugin-after-load', plugin);
  }

  async onActivate(plugin) {
    // Call plugin activation hook
    if (plugin.instance?.onActivate) {
      await plugin.instance.onActivate();
    }

    // Enable plugin features
    await this.enableFeatures(plugin);

    // Start health monitoring
    this.startHealthCheck(plugin);
  }

  async onSuspend(plugin) {
    // Call plugin suspension hook
    if (plugin.instance?.onSuspend) {
      await plugin.instance.onSuspend();
    }

    // Pause active operations
    await this.pauseOperations(plugin);

    // Free resources
    await this.freeResources(plugin);
  }

  async registerCapabilities(plugin) {
    const manifest = plugin.manifest;

    // Register commands
    if (manifest.commands) {
      for (const command of manifest.commands) {
        await this.pluginManager.registerCommand(plugin, command);
      }
    }

    // Register tools
    if (manifest.tools) {
      for (const tool of manifest.tools) {
        await this.pluginManager.registerTool(plugin, tool);
      }
    }

    // Register views
    if (manifest.views) {
      for (const view of manifest.views) {
        await this.pluginManager.registerView(plugin, view);
      }
    }
  }
}
```

## Hook System

### Hook Manager

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

    // Sort by priority
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

        // Handle 'once' hooks
        if (hook.once) {
          this.unregister(name, hook.id);
        }

        // Allow hooks to stop propagation
        if (result === false) {
          break;
        }

      } catch (error) {
        console.error(`Hook error in ${name}:`, error);

        // Continue with other hooks on error
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

### Built-in Hooks

```javascript
// built-in-hooks.js
class BuiltInHooks {
  static register(hookManager) {
    // Tool execution hooks
    hookManager.register('before-tool-execute', async (context) => {
      // Validate tool permissions
      if (!context.plugin.permissions.includes('tool-access')) {
        throw new Error('Plugin lacks tool access permission');
      }

      // Log tool execution
      console.log(`Plugin ${context.plugin.id} executing tool: ${context.tool}`);

      return context;
    });

    hookManager.register('after-tool-execute', async (result, context) => {
      // Process tool result
      if (context.transform) {
        result = await context.transform(result);
      }

      // Cache result if needed
      if (context.cache) {
        await context.cache.set(context.cacheKey, result);
      }

      return result;
    });

    // Message handling hooks
    hookManager.register('before-message', async (message) => {
      // Sanitize message
      message.content = this.sanitizeContent(message.content);

      // Check rate limits
      await this.checkRateLimit(message.userId);

      return message;
    });

    hookManager.register('after-message', async (response, message) => {
      // Log message processing
      await this.logMessage(message, response);

      // Update metrics
      await this.updateMetrics(message, response);

      return response;
    });

    // File operation hooks
    hookManager.register('before-file-read', async (filepath) => {
      // Validate file access
      if (!this.isFileAccessAllowed(filepath)) {
        throw new Error('File access denied');
      }

      // Normalize path
      return path.resolve(filepath);
    });

    hookManager.register('after-file-read', async (content, filepath) => {
      // Process file content
      if (filepath.endsWith('.json')) {
        try {
          return JSON.parse(content);
        } catch {
          return content;
        }
      }

      return content;
    });

    // Configuration hooks
    hookManager.register('before-config-change', async (change) => {
      // Validate configuration change
      if (!this.isConfigChangeValid(change)) {
        throw new Error('Invalid configuration change');
      }

      // Backup current config
      await this.backupConfig();

      return change;
    });

    hookManager.register('after-config-change', async (newConfig, change) => {
      // Reload affected components
      await this.reloadComponents(change.affected);

      // Notify plugins
      await this.notifyPlugins('config-changed', change);

      return newConfig;
    });
  }

  static sanitizeContent(content) {
    // Remove potentially harmful content
    return content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+="[^"]*"/gi, '');
  }

  static async checkRateLimit(userId) {
    // Implement rate limiting logic
    const key = `rate:${userId}`;
    const limit = 100;
    const window = 60000; // 1 minute

    // Check and update rate limit
    // Throw error if exceeded
  }
}
```

## Plugin Communication

### Inter-Plugin Communication

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

    // Send buffered messages if any
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

    // Store in buffer if persistent
    if (channel.persistent) {
      channel.messages.push(envelope);

      // Trim buffer if needed
      if (channel.messages.length > channel.buffer) {
        channel.messages.shift();
      }
    }

    // Queue for delivery
    this.messageQueue.push(envelope);

    // Process queue
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

      // Deliver to subscribers
      for (const subscription of channel.subscribers) {
        // Don't send to sender unless self-subscribe
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

    // Check if method is exposed
    if (!target.instance?.exports?.[method]) {
      throw new Error(`Method not exposed: ${method}`);
    }

    // Create request context
    const context = {
      caller: pluginId,
      target: targetPlugin,
      method,
      timestamp: Date.now()
    };

    // Execute with timeout
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

### Event Bus Integration

```javascript
// PluginEventBus.js
class PluginEventBus extends EventEmitter {
  constructor(pluginManager) {
    super();
    this.pluginManager = pluginManager;
    this.eventMap = new Map();
    this.wildcardListeners = new Set();

    // Increase max listeners for plugin system
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
    // Check if plugin can emit this event
    const pluginEvents = this.eventMap.get(pluginId);
    if (!pluginEvents?.has(event) && !this.wildcardListeners.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} not authorized to emit ${event}`);
    }

    // Add plugin context
    const context = {
      source: pluginId,
      timestamp: Date.now(),
      event
    };

    // Emit with context
    this.emit(event, context, ...args);

    // Emit to wildcard listeners
    this.emit('*', context, ...args);
  }

  onPluginEvent(pluginId, event, handler) {
    const wrappedHandler = (context, ...args) => {
      // Filter events for plugin
      if (context.source === pluginId) {
        return; // Don't receive own events
      }

      try {
        handler(context, ...args);
      } catch (error) {
        console.error(`Plugin ${pluginId} event handler error:`, error);
      }
    };

    this.on(event, wrappedHandler);

    // Track for cleanup
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

## Plugin Discovery and Loading

### Plugin Discovery

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

    // Search local directories
    for (const searchPath of this.searchPaths) {
      const localPlugins = await this.searchDirectory(searchPath);
      plugins.push(...localPlugins);
    }

    // Search registry
    if (this.registry) {
      const registryPlugins = await this.searchRegistry();
      plugins.push(...registryPlugins);
    }

    // Deduplicate by ID
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
      // Directory doesn't exist or not accessible
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

### Plugin Loader

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

    // Check cache
    if (this.loadedModules.has(plugin.id)) {
      return this.loadedModules.get(plugin.id);
    }

    // Determine loader based on file extension
    const ext = path.extname(mainFile);
    const loader = this.getLoader(ext);

    if (!loader) {
      throw new Error(`No loader for file type: ${ext}`);
    }

    // Load module
    const module = await loader(mainFile, plugin);

    // Cache module
    this.loadedModules.set(plugin.id, module);

    // Initialize if needed
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
    // Clear require cache
    delete require.cache[require.resolve(filepath)];

    // Load module
    const module = require(filepath);

    // Wrap in proxy for access control
    return this.wrapModule(module, plugin);
  }

  async loadESModule(filepath, plugin) {
    // Dynamic import
    const module = await import(filepath);

    return this.wrapModule(module.default || module, plugin);
  }

  async loadTypeScript(filepath, plugin) {
    // Compile TypeScript
    const ts = require('typescript');
    const source = await fs.readFile(filepath, 'utf8');

    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020
      }
    });

    // Evaluate compiled code
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

    // Add permission checks
    return new Proxy(wrapper, {
      get(target, prop) {
        // Check property access permissions
        if (typeof target[prop] === 'function') {
          return (...args) => {
            // Validate function call
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

      // API access
      api: this.pluginManager.createPluginAPI(plugin),

      // Logger
      logger: this.pluginManager.createPluginLogger(plugin),

      // Storage
      storage: this.pluginManager.createPluginStorage(plugin),

      // Configuration
      config: this.pluginManager.getPluginConfig(plugin.id),

      // Dependencies
      require: this.createPluginRequire(plugin)
    };
  }

  createPluginRequire(plugin) {
    return (moduleId) => {
      // Check if dependency is declared
      if (!plugin.manifest.dependencies?.includes(moduleId)) {
        throw new Error(`Undeclared dependency: ${moduleId}`);
      }

      // Load dependency plugin
      const depPlugin = this.pluginManager.plugins.get(moduleId);
      if (!depPlugin) {
        throw new Error(`Dependency not found: ${moduleId}`);
      }

      // Return dependency exports
      return depPlugin.instance?.exports || {};
    };
  }
}
```

## Performance and Optimization

### Plugin Performance Monitor

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

    // Start periodic monitoring
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

    // Capture memory usage
    const memUsage = process.memoryUsage();
    metrics.memorySnapshots.push({
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      rss: memUsage.rss
    });

    // Capture CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    metrics.cpuSnapshots.push({
      timestamp: Date.now(),
      user: cpuUsage.user,
      system: cpuUsage.system
    });

    // Keep only last 60 snapshots
    if (metrics.memorySnapshots.length > 60) {
      metrics.memorySnapshots.shift();
    }
    if (metrics.cpuSnapshots.length > 60) {
      metrics.cpuSnapshots.shift();
    }

    // Check thresholds
    this.checkThresholds(pluginId, metrics);
  }

  recordExecution(pluginId, executionTime) {
    const metrics = this.metrics.get(pluginId);
    if (!metrics) return;

    metrics.executionTimes.push(executionTime);
    metrics.calls++;

    // Keep only last 100 execution times
    if (metrics.executionTimes.length > 100) {
      metrics.executionTimes.shift();
    }
  }

  checkThresholds(pluginId, metrics) {
    const warnings = [];

    // Check memory usage
    const lastMemSnapshot = metrics.memorySnapshots[metrics.memorySnapshots.length - 1];
    if (lastMemSnapshot && lastMemSnapshot.heapUsed > this.thresholds.memoryUsage) {
      warnings.push({
        type: 'memory',
        value: lastMemSnapshot.heapUsed,
        threshold: this.thresholds.memoryUsage
      });
    }

    // Check average execution time
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

    // Emit warnings
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

## Conclusion

Claude Code's plugin architecture provides a comprehensive and secure system for extending the platform's functionality. Through its modular design, sandboxed execution, robust lifecycle management, and extensive hook system, developers can create powerful plugins that integrate seamlessly with the core platform. The architecture prioritizes security through permission-based access control and sandboxed execution, while maintaining high performance through monitoring and optimization systems.

The plugin system's flexibility allows for various extension scenarios, from simple utility functions to complex integrations with external services. The inter-plugin communication system enables plugins to work together, creating rich ecosystems of functionality. With built-in discovery, loading, and management capabilities, the plugin architecture ensures that Claude Code remains extensible and adaptable to evolving user needs while maintaining stability and security.

Through careful design of the plugin lifecycle, hook system, and communication mechanisms, Claude Code provides developers with the tools they need to create reliable, performant, and secure extensions that enhance the platform's capabilities without compromising its core functionality or user experience.