/**
 * Claude Code Runtime Initialization
 *
 * Bootstrap sequence, environment detection, and application startup.
 * Initializes all systems and prepares the CLI for execution.
 *
 * Extracted from claude-code-full-extract.js (lines ~47600-48000)
 * Part of the 95% → 98% extraction phase
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';

/**
 * Runtime Initializer
 * Manages application bootstrap and startup sequence
 */
export class RuntimeInitializer extends EventEmitter {
  constructor() {
    super();

    this.initialized = false;
    this.startTime = null;
    this.environment = null;
    this.config = null;
    this.systems = new Map();
  }

  /**
   * Initialize the runtime
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.startTime = Date.now();
    this.emit('init:start');

    try {
      // Phase 1: Environment detection
      await this.detectEnvironment();

      // Phase 2: Load configuration
      await this.loadConfiguration();

      // Phase 3: Initialize core systems
      await this.initializeSystems();

      // Phase 4: Setup handlers
      await this.setupHandlers();

      // Phase 5: Verify requirements
      await this.verifyRequirements();

      // Phase 6: Start services
      await this.startServices();

      this.initialized = true;
      const duration = Date.now() - this.startTime;
      this.emit('init:complete', { duration });

    } catch (error) {
      this.emit('init:error', error);
      throw error;
    }
  }

  /**
   * Detect runtime environment
   */
  async detectEnvironment() {
    this.emit('env:detecting');

    this.environment = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
      cwd: process.cwd(),
      homedir: process.env.HOME || process.env.USERPROFILE,
      tmpdir: process.env.TMPDIR || process.env.TEMP || '/tmp',
      shell: process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'),
      isDocker: await this.isDocker(),
      isWSL: await this.isWSL(),
      isCI: this.isCI(),
      isDevelopment: process.env.NODE_ENV === 'development',
      isProduction: process.env.NODE_ENV === 'production',
      isTest: process.env.NODE_ENV === 'test',
      hasGit: await this.hasCommand('git'),
      hasNode: await this.hasCommand('node'),
      hasNPM: await this.hasCommand('npm'),
      hasYarn: await this.hasCommand('yarn'),
      hasPython: await this.hasCommand('python3') || await this.hasCommand('python'),
      executable: process.argv[0],
      script: process.argv[1],
      args: process.argv.slice(2),
      installMethod: this.detectInstallMethod(),
      isLocalInstall: this.isLocalInstall()
    };

    this.emit('env:detected', this.environment);
  }

  /**
   * Load configuration
   */
  async loadConfiguration() {
    this.emit('config:loading');

    const configSources = [
      this.loadDefaultConfig(),
      this.loadGlobalConfig(),
      this.loadUserConfig(),
      this.loadProjectConfig(),
      this.loadEnvironmentConfig(),
      this.loadCliConfig()
    ];

    const configs = await Promise.all(configSources);

    // Merge configurations in priority order
    this.config = this.mergeConfigs(...configs);

    // Apply validation
    this.validateConfig(this.config);

    this.emit('config:loaded', this.config);
  }

  /**
   * Initialize core systems
   */
  async initializeSystems() {
    this.emit('systems:initializing');

    const systemOrder = [
      'logging',
      'error-handler',
      'permissions',
      'cache',
      'api-client',
      'tools',
      'hooks',
      'plugins',
      'ui',
      'conversation'
    ];

    for (const systemName of systemOrder) {
      await this.initializeSystem(systemName);
    }

    this.emit('systems:initialized');
  }

  /**
   * Initialize individual system
   */
  async initializeSystem(name) {
    this.emit('system:init:start', name);

    try {
      let system;

      switch (name) {
        case 'logging':
          const { LoggingSystem } = await import('../utils/logging.js');
          system = new LoggingSystem(this.config.logging);
          break;

        case 'error-handler':
          const { ErrorRecoveryManager } = await import('../error/error-recovery.js');
          system = new ErrorRecoveryManager(this.config.errorRecovery);
          break;

        case 'permissions':
          const { PermissionSystem } = await import('../permissions/permission-system.js');
          system = new PermissionSystem(this.config.permissions);
          break;

        case 'cache':
          const { createAdvancedCache } = await import('../cache/advanced-cache.js');
          system = createAdvancedCache(this.config.cache);
          break;

        case 'api-client':
          const { createAnthropicClient } = await import('../api/anthropic-client.js');
          system = await createAnthropicClient(this.config.api);
          break;

        case 'tools':
          system = await this.loadTools();
          break;

        case 'hooks':
          const { HookSystem } = await import('../hooks/hook-system.js');
          system = new HookSystem(this.config.hooks);
          break;

        case 'plugins':
          const { PluginSystem } = await import('../plugins/plugin-system.js');
          system = new PluginSystem(this.config.plugins);
          break;

        case 'ui':
          const { UIManager } = await import('../ui/ui-components.js');
          system = new UIManager();
          break;

        case 'conversation':
          const { ConversationLoop } = await import('../conversation/conversation-loop.js');
          system = new ConversationLoop(this.config.conversation);
          break;
      }

      this.systems.set(name, system);
      this.emit('system:init:complete', name);

    } catch (error) {
      this.emit('system:init:error', { name, error });
      throw error;
    }
  }

  /**
   * Load tools
   */
  async loadTools() {
    const tools = new Map();
    const toolNames = [
      'Bash', 'Edit', 'MultiEdit', 'Read', 'Write',
      'Grep', 'Glob', 'Task', 'WebSearch', 'WebFetch',
      'NotebookEdit', 'BashOutput', 'KillShell'
    ];

    for (const toolName of toolNames) {
      if (this.config.tools?.[toolName] !== false) {
        // Tools are loaded dynamically based on configuration
        tools.set(toolName, { enabled: true });
      }
    }

    return tools;
  }

  /**
   * Setup global handlers
   */
  async setupHandlers() {
    this.emit('handlers:setup:start');

    // Process handlers
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.emit('error:uncaught', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection:', reason);
      this.emit('error:unhandled', { reason, promise });
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      this.emit('shutdown:start', signal);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Memory warnings
    if (global.gc) {
      const memoryManager = this.systems.get('memory');
      if (memoryManager) {
        memoryManager.on('memory:critical', () => {
          console.warn('Critical memory pressure detected');
        });
      }
    }

    this.emit('handlers:setup:complete');
  }

  /**
   * Verify requirements
   */
  async verifyRequirements() {
    this.emit('requirements:checking');

    const requirements = [];

    // Check API key
    if (!this.config.api?.apiKey) {
      requirements.push('API key is required. Set ANTHROPIC_API_KEY environment variable.');
    }

    // Check Node version
    const nodeVersion = process.version;
    const requiredVersion = '18.0.0';
    if (!this.isVersionSatisfied(nodeVersion, requiredVersion)) {
      requirements.push(`Node.js ${requiredVersion} or higher is required.`);
    }

    // Check disk space
    const diskSpace = await this.checkDiskSpace();
    if (diskSpace < 100 * 1024 * 1024) { // 100MB
      requirements.push('Insufficient disk space (100MB required).');
    }

    if (requirements.length > 0) {
      const error = new Error('Requirements not met:\n' + requirements.join('\n'));
      this.emit('requirements:failed', requirements);
      throw error;
    }

    this.emit('requirements:passed');
  }

  /**
   * Start services
   */
  async startServices() {
    this.emit('services:starting');

    // Start cache service
    const cache = this.systems.get('cache');
    if (cache?.start) {
      await cache.start();
    }

    // Start plugin system
    const plugins = this.systems.get('plugins');
    if (plugins) {
      await plugins.loadAll();
    }

    // Initialize hooks
    const hooks = this.systems.get('hooks');
    if (hooks) {
      await hooks.initialize();
    }

    // Start telemetry if enabled
    if (this.config.telemetry?.enabled) {
      const { telemetry } = await import('../telemetry/telemetry-batching.js');
      telemetry.track('session:start', {
        environment: this.environment.platform,
        version: this.config.version
      });
    }

    this.emit('services:started');
  }

  /**
   * Load default configuration
   */
  async loadDefaultConfig() {
    return {
      version: '1.0.115',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
      temperature: 0,
      tools: {
        all: true
      },
      cache: {
        enabled: true,
        strategy: 'lru'
      },
      logging: {
        level: 'info',
        file: false
      },
      errorRecovery: {
        maxRetries: 3,
        retryDelay: 1000
      }
    };
  }

  /**
   * Load global configuration
   */
  async loadGlobalConfig() {
    const configPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.claude',
      'config.json'
    );

    try {
      const content = await fs.readFile(configPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Load user configuration
   */
  async loadUserConfig() {
    const configPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.config',
      'claude',
      'config.json'
    );

    try {
      const content = await fs.readFile(configPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Load project configuration
   */
  async loadProjectConfig() {
    const configFiles = [
      '.claude.json',
      '.claude/config.json',
      'claude.config.json'
    ];

    for (const file of configFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');
        return JSON.parse(content);
      } catch {
        // Continue to next file
      }
    }

    return {};
  }

  /**
   * Load environment configuration
   */
  loadEnvironmentConfig() {
    const config = {};

    if (process.env.ANTHROPIC_API_KEY) {
      config.api = { apiKey: process.env.ANTHROPIC_API_KEY };
    }

    if (process.env.CLAUDE_MODEL) {
      config.model = process.env.CLAUDE_MODEL;
    }

    if (process.env.CLAUDE_MAX_TOKENS) {
      config.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS);
    }

    if (process.env.DEBUG) {
      config.logging = { level: 'debug' };
    }

    return config;
  }

  /**
   * Load CLI configuration
   */
  loadCliConfig() {
    const args = process.argv.slice(2);
    const config = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--api-key' && args[i + 1]) {
        config.api = { apiKey: args[++i] };
      } else if (arg === '--model' && args[i + 1]) {
        config.model = args[++i];
      } else if (arg === '--debug') {
        config.logging = { level: 'debug' };
      }
    }

    return config;
  }

  /**
   * Merge configurations
   */
  mergeConfigs(...configs) {
    const merged = {};

    for (const config of configs) {
      this.deepMerge(merged, config);
    }

    return merged;
  }

  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = target[key] || {};
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config) {
    if (!config.model) {
      throw new Error('Model is required in configuration');
    }
  }

  /**
   * Detect installation method
   */
  detectInstallMethod() {
    const scriptPath = process.argv[1] || '';

    if (scriptPath.includes('/.claude/local/')) {
      return 'local';
    } else if (scriptPath.includes('/usr/local/')) {
      return 'global';
    } else if (scriptPath.includes('node_modules/.bin/')) {
      return 'npm';
    } else if (scriptPath.includes('homebrew')) {
      return 'homebrew';
    } else {
      return 'unknown';
    }
  }

  /**
   * Check if local installation
   */
  isLocalInstall() {
    return (process.argv[1] || '').includes('/.claude/local/node_modules/');
  }

  /**
   * Check if running in Docker
   */
  async isDocker() {
    try {
      await fs.access('/.dockerenv');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if running in WSL
   */
  async isWSL() {
    if (process.platform !== 'linux') return false;

    try {
      const osRelease = await fs.readFile('/proc/sys/kernel/osrelease', 'utf8');
      return osRelease.toLowerCase().includes('microsoft');
    } catch {
      return false;
    }
  }

  /**
   * Check if running in CI
   */
  isCI() {
    return !!(
      process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.CIRCLECI ||
      process.env.TRAVIS ||
      process.env.JENKINS_URL
    );
  }

  /**
   * Check if command exists
   */
  async hasCommand(command) {
    try {
      const checkCmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
      execSync(checkCmd, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check version requirement
   */
  isVersionSatisfied(current, required) {
    const parseVersion = (v) => v.replace(/^v/, '').split('.').map(Number);
    const [currMajor, currMinor] = parseVersion(current);
    const [reqMajor, reqMinor] = parseVersion(required);

    return currMajor > reqMajor || (currMajor === reqMajor && currMinor >= reqMinor);
  }

  /**
   * Check disk space
   */
  async checkDiskSpace() {
    try {
      if (process.platform === 'win32') {
        // Windows: Use wmic
        const output = execSync('wmic logicaldisk get size,freespace').toString();
        const lines = output.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
          const [free] = lines[1].trim().split(/\s+/).map(Number);
          return free;
        }
      } else {
        // Unix: Use df
        const output = execSync(`df -k ${process.cwd()}`).toString();
        const lines = output.split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          return parseInt(parts[3]) * 1024; // Convert from KB to bytes
        }
      }
    } catch {
      return Infinity; // Assume enough space if check fails
    }
  }

  /**
   * Shutdown runtime
   */
  async shutdown() {
    this.emit('shutdown:start');

    // Stop services in reverse order
    const systemOrder = Array.from(this.systems.keys()).reverse();

    for (const systemName of systemOrder) {
      const system = this.systems.get(systemName);
      if (system?.shutdown || system?.cleanup || system?.stop) {
        try {
          await (system.shutdown || system.cleanup || system.stop).call(system);
        } catch (error) {
          console.error(`Error shutting down ${systemName}:`, error);
        }
      }
    }

    // Clear systems
    this.systems.clear();

    // Final cleanup
    if (global.gc) {
      global.gc();
    }

    this.emit('shutdown:complete');
  }
}

// Export singleton instance
export const runtime = new RuntimeInitializer();

// Export main entry point
export async function main() {
  try {
    await runtime.initialize();

    // Get conversation system
    const conversation = runtime.systems.get('conversation');
    if (conversation) {
      await conversation.start();
    }
  } catch (error) {
    console.error('Failed to start Claude Code:', error);
    process.exit(1);
  }
}

// Auto-start if run directly (ES module equivalent)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}