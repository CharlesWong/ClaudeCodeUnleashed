/**
 * Claude Code Legacy Compatibility Layer
 *
 * Provides backwards compatibility for older versions, deprecated APIs,
 * and migration utilities for upgrading from previous versions.
 *
 * Extracted from claude-code-full-extract.js (lines ~46500-46900)
 * Part of the 90% → 95% extraction phase
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import semver from 'semver';

/**
 * Legacy Compatibility Manager
 * Handles backwards compatibility and migrations
 */
export class LegacyCompatibilityManager extends EventEmitter {
  constructor() {
    super();

    this.version = process.env.VERSION || '1.0.115';
    this.deprecations = new Map();
    this.migrations = new Map();
    this.polyfills = new Map();
    this.aliases = new Map();

    this.initialize();
  }

  /**
   * Initialize compatibility layer
   */
  initialize() {
    this.registerDeprecations();
    this.registerMigrations();
    this.registerPolyfills();
    this.registerAliases();
    this.setupShims();
  }

  /**
   * Register deprecated features
   */
  registerDeprecations() {
    // Deprecated in v1.0.0
    this.deprecate('claude.query', {
      since: '1.0.0',
      replacement: 'claude.messages.create',
      message: 'claude.query is deprecated. Use claude.messages.create instead.'
    });

    // Deprecated in v1.0.50
    this.deprecate('setApiKey', {
      since: '1.0.50',
      replacement: 'configure({ apiKey })',
      message: 'setApiKey is deprecated. Use configure({ apiKey }) instead.'
    });

    // Deprecated in v1.0.80
    this.deprecate('enableDebug', {
      since: '1.0.80',
      replacement: 'setLogLevel("debug")',
      message: 'enableDebug is deprecated. Use setLogLevel("debug") instead.'
    });

    // Deprecated tool names
    this.deprecate('str_replace', {
      since: '1.0.100',
      replacement: 'Edit',
      message: 'str_replace tool is deprecated. Use Edit tool instead.'
    });

    this.deprecate('str_replace_based_edit', {
      since: '1.0.100',
      replacement: 'MultiEdit',
      message: 'str_replace_based_edit is deprecated. Use MultiEdit tool instead.'
    });

    // Deprecated config options
    this.deprecate('autoUpdates', {
      since: '1.0.110',
      replacement: 'updatePolicy.autoUpdate',
      message: 'autoUpdates config is deprecated. Use updatePolicy.autoUpdate instead.'
    });
  }

  /**
   * Register migration handlers
   */
  registerMigrations() {
    // v0.x to v1.0
    this.migration('0.x', '1.0', async (config) => {
      const migrated = { ...config };

      // Migrate old config structure
      if (config.anthropic_api_key) {
        migrated.apiKey = config.anthropic_api_key;
        delete migrated.anthropic_api_key;
      }

      if (config.model_name) {
        migrated.model = config.model_name;
        delete migrated.model_name;
      }

      // Migrate tool configurations
      if (config.tools) {
        migrated.toolConfig = {};
        for (const [tool, enabled] of Object.entries(config.tools)) {
          migrated.toolConfig[tool] = { enabled };
        }
        delete migrated.tools;
      }

      return migrated;
    });

    // v1.0 to v1.0.50
    this.migration('1.0', '1.0.50', async (config) => {
      const migrated = { ...config };

      // Migrate permission structure
      if (config.permissions && !config.permissions.version) {
        migrated.permissions = {
          version: '2',
          rules: config.permissions
        };
      }

      return migrated;
    });

    // v1.0.50 to v1.0.100
    this.migration('1.0.50', '1.0.100', async (config) => {
      const migrated = { ...config };

      // Migrate MCP servers
      if (config.mcpServers && Array.isArray(config.mcpServers)) {
        migrated.mcp = {
          servers: config.mcpServers.reduce((acc, server) => {
            acc[server.name] = server;
            return acc;
          }, {})
        };
        delete migrated.mcpServers;
      }

      return migrated;
    });

    // v1.0.100 to v1.0.115
    this.migration('1.0.100', '1.0.115', async (config) => {
      const migrated = { ...config };

      // Migrate cache settings
      if (config.cacheEnabled !== undefined) {
        migrated.cache = {
          enabled: config.cacheEnabled,
          strategy: 'lru',
          maxSize: 1000
        };
        delete migrated.cacheEnabled;
      }

      // Migrate telemetry settings
      if (config.analytics !== undefined) {
        migrated.telemetry = {
          enabled: config.analytics,
          privacy: 'strict'
        };
        delete migrated.analytics;
      }

      return migrated;
    });
  }

  /**
   * Register polyfills for older environments
   */
  registerPolyfills() {
    // Array.prototype.at polyfill
    if (!Array.prototype.at) {
      this.polyfill('Array.prototype.at', function(index) {
        const len = this.length;
        const relativeIndex = index >= 0 ? index : len + index;
        if (relativeIndex < 0 || relativeIndex >= len) {
          return undefined;
        }
        return this[relativeIndex];
      });
    }

    // Object.hasOwn polyfill
    if (!Object.hasOwn) {
      this.polyfill('Object.hasOwn', function(obj, prop) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
      });
    }

    // Promise.allSettled polyfill
    if (!Promise.allSettled) {
      this.polyfill('Promise.allSettled', function(promises) {
        return Promise.all(
          promises.map(p => Promise.resolve(p)
            .then(value => ({ status: 'fulfilled', value }))
            .catch(reason => ({ status: 'rejected', reason }))
          )
        );
      });
    }

    // String.prototype.replaceAll polyfill
    if (!String.prototype.replaceAll) {
      this.polyfill('String.prototype.replaceAll', function(search, replace) {
        return this.split(search).join(replace);
      });
    }

    // globalThis polyfill
    if (typeof globalThis === 'undefined') {
      this.polyfill('globalThis', (() => {
        if (typeof self !== 'undefined') return self;
        if (typeof window !== 'undefined') return window;
        if (typeof global !== 'undefined') return global;
        throw new Error('Unable to locate global object');
      })());
    }
  }

  /**
   * Register command aliases for backwards compatibility
   */
  registerAliases() {
    // Old command aliases
    this.alias('claude-cli', 'claude');
    this.alias('claude-code-cli', 'claude');
    this.alias('anthropic-cli', 'claude');

    // Old flag aliases
    this.alias('--api-key', '--anthropic-api-key');
    this.alias('--key', '--anthropic-api-key');
    this.alias('--model-name', '--model');
    this.alias('--verbose', '--debug');
    this.alias('--quite', '--quiet'); // Common typo

    // Old environment variable aliases
    this.aliasEnv('ANTHROPIC_KEY', 'ANTHROPIC_API_KEY');
    this.aliasEnv('CLAUDE_KEY', 'ANTHROPIC_API_KEY');
    this.aliasEnv('CLAUDE_API_KEY', 'ANTHROPIC_API_KEY');
  }

  /**
   * Setup shims for compatibility
   */
  setupShims() {
    // Shim for old API client
    this.shim('ClaudeClient', class {
      constructor(apiKey) {
        console.warn('ClaudeClient is deprecated. Use createAnthropicClient instead.');
        return new Proxy(this, {
          get(target, prop) {
            if (prop === 'query') {
              return async (prompt) => {
                const { createAnthropicClient } = require('../api/anthropic-client');
                const client = await createAnthropicClient({ apiKey });
                return client.messages.create({
                  messages: [{ role: 'user', content: prompt }]
                });
              };
            }
            return target[prop];
          }
        });
      }
    });

    // Shim for old configuration
    this.shim('loadConfig', async () => {
      console.warn('loadConfig is deprecated. Use ConfigurationSystem instead.');
      const { ConfigurationSystem } = require('../config/configuration-system');
      const config = new ConfigurationSystem();
      return config.load();
    });

    // Shim for old tool names
    this.shim('tools', new Proxy({}, {
      get(target, prop) {
        const toolMap = {
          'str_replace': 'Edit',
          'str_replace_based_edit': 'MultiEdit',
          'search': 'Grep',
          'find_files': 'Glob',
          'run_command': 'Bash'
        };

        if (toolMap[prop]) {
          console.warn(`Tool '${prop}' is deprecated. Use '${toolMap[prop]}' instead.`);
          return require(`../tools/${toolMap[prop].toLowerCase()}-tool`);
        }

        return target[prop];
      }
    }));
  }

  /**
   * Register a deprecation
   */
  deprecate(name, info) {
    this.deprecations.set(name, {
      ...info,
      warned: false
    });
  }

  /**
   * Warn about deprecation
   */
  warnDeprecation(name) {
    const deprecation = this.deprecations.get(name);
    if (deprecation && !deprecation.warned) {
      console.warn(`⚠️  ${deprecation.message}`);
      deprecation.warned = true;
      this.emit('deprecation:warned', { name, ...deprecation });
    }
  }

  /**
   * Register a migration
   */
  migration(fromVersion, toVersion, handler) {
    const key = `${fromVersion}->${toVersion}`;
    this.migrations.set(key, {
      from: fromVersion,
      to: toVersion,
      handler
    });
  }

  /**
   * Run migrations
   */
  async runMigrations(config, fromVersion, toVersion) {
    const migrations = this.findMigrationPath(fromVersion, toVersion);
    let migrated = config;

    for (const migration of migrations) {
      console.log(`Running migration: ${migration.from} → ${migration.to}`);
      migrated = await migration.handler(migrated);
      this.emit('migration:complete', migration);
    }

    return migrated;
  }

  /**
   * Find migration path between versions
   */
  findMigrationPath(from, to) {
    const path = [];
    let current = from;

    while (semver.lt(current, to)) {
      let found = false;

      for (const [key, migration] of this.migrations) {
        if (semver.satisfies(current, migration.from) &&
            semver.gt(migration.to, current)) {
          path.push(migration);
          current = migration.to;
          found = true;
          break;
        }
      }

      if (!found) break;
    }

    return path;
  }

  /**
   * Register a polyfill
   */
  polyfill(name, implementation) {
    this.polyfills.set(name, implementation);

    // Apply polyfill
    const parts = name.split('.');
    let target = global;

    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]];
    }

    const property = parts[parts.length - 1];
    if (!target[property]) {
      target[property] = implementation;
      this.emit('polyfill:applied', name);
    }
  }

  /**
   * Register an alias
   */
  alias(oldName, newName) {
    this.aliases.set(oldName, newName);
  }

  /**
   * Register environment variable alias
   */
  aliasEnv(oldName, newName) {
    if (process.env[oldName] && !process.env[newName]) {
      process.env[newName] = process.env[oldName];
      this.emit('env:aliased', { old: oldName, new: newName });
    }
  }

  /**
   * Register a shim
   */
  shim(name, implementation) {
    global[name] = implementation;
    this.emit('shim:registered', name);
  }

  /**
   * Check if feature is deprecated
   */
  isDeprecated(name) {
    return this.deprecations.has(name);
  }

  /**
   * Get replacement for deprecated feature
   */
  getReplacement(name) {
    const deprecation = this.deprecations.get(name);
    return deprecation ? deprecation.replacement : null;
  }

  /**
   * Resolve alias
   */
  resolveAlias(name) {
    return this.aliases.get(name) || name;
  }

  /**
   * Check compatibility
   */
  checkCompatibility(requiredVersion) {
    return semver.gte(this.version, requiredVersion);
  }

  /**
   * Get compatibility report
   */
  getCompatibilityReport() {
    return {
      version: this.version,
      deprecations: Array.from(this.deprecations.keys()),
      migrations: Array.from(this.migrations.keys()),
      polyfills: Array.from(this.polyfills.keys()),
      aliases: Array.from(this.aliases.entries())
    };
  }
}

/**
 * Version Compatibility Checker
 */
export class VersionCompatibility {
  static isCompatible(currentVersion, requiredVersion) {
    return semver.satisfies(currentVersion, requiredVersion);
  }

  static getMajorVersion(version) {
    return semver.major(version);
  }

  static getMinorVersion(version) {
    return semver.minor(version);
  }

  static getPatchVersion(version) {
    return semver.patch(version);
  }

  static needsMigration(fromVersion, toVersion) {
    return semver.lt(fromVersion, toVersion);
  }

  static getBreakingChanges(fromVersion, toVersion) {
    const fromMajor = this.getMajorVersion(fromVersion);
    const toMajor = this.getMajorVersion(toVersion);

    if (toMajor > fromMajor) {
      return {
        hasBreakingChanges: true,
        level: 'major',
        message: `Major version upgrade from ${fromMajor} to ${toMajor} may contain breaking changes.`
      };
    }

    return {
      hasBreakingChanges: false,
      level: 'none',
      message: 'No breaking changes expected.'
    };
  }
}

/**
 * Legacy Config Converter
 */
export class LegacyConfigConverter {
  static async convert(oldConfig, targetVersion = '1.0.115') {
    const manager = new LegacyCompatibilityManager();
    const fromVersion = oldConfig.version || '0.x';

    if (fromVersion === targetVersion) {
      return oldConfig;
    }

    return await manager.runMigrations(oldConfig, fromVersion, targetVersion);
  }

  static validate(config) {
    const required = ['apiKey', 'model'];
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
      return {
        valid: false,
        errors: missing.map(key => `Missing required field: ${key}`)
      };
    }

    return { valid: true };
  }
}

// Export singleton instance
export const legacyCompat = new LegacyCompatibilityManager();

// Export convenience functions
export function checkDeprecation(feature) {
  legacyCompat.warnDeprecation(feature);
  return legacyCompat.getReplacement(feature);
}

export function migrateConfig(config, fromVersion, toVersion) {
  return legacyCompat.runMigrations(config, fromVersion, toVersion);
}

export function isVersionCompatible(required) {
  return legacyCompat.checkCompatibility(required);
}