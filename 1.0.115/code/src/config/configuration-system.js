/**
 * Configuration Management System
 * Complete configuration loading, merging, and persistence
 * Extracted from lines 3345-3500 of original file
 */

import { resolve, join, dirname, basename } from 'path';
import fs from 'fs';

// Configuration Source Types
const CONFIG_SOURCES = [
  'userSettings',     // User-level settings
  'projectSettings',  // Project-specific settings
  'localSettings',    // Local project overrides
  'policySettings',   // Organization/enterprise policies
  'flagSettings'      // Feature flags
];

// Configuration file names
const CONFIG_FILES = {
  userSettings: 'config.json',
  projectSettings: '.claude.json',
  localSettings: '.claude.local.json',
  policySettings: 'policy.json',
  flagSettings: 'flags.json'
};

// Cache for merged configuration
let configCache = null;

/**
 * Get configuration file path for a source
 * Original: function jT(arg)
 */
function getConfigPath(source) {
  switch (source) {
    case 'userSettings':
      return join(getUserConfigDirectory(), CONFIG_FILES[source]);

    case 'projectSettings':
    case 'localSettings':
      return join(getCurrentWorkingDirectory(), CONFIG_FILES[source]);

    case 'policySettings':
      return getPolicyPath();

    case 'flagSettings':
      const flagDir = getFlagDirectory();
      return flagDir ? join(flagDir, CONFIG_FILES[source]) : null;

    default:
      return null;
  }
}

/**
 * Get configuration directory for a source
 * Original: function XU1(arg)
 */
function getConfigDirectory(source) {
  switch (source) {
    case 'userSettings':
      return getUserConfigDirectory();

    case 'policySettings':
    case 'projectSettings':
    case 'localSettings':
      return getCurrentWorkingDirectory();

    case 'flagSettings':
      const flagDir = getFlagDirectory();
      return flagDir ? normalizePath(flagDir) : getCurrentWorkingDirectory();

    default:
      return getCurrentWorkingDirectory();
  }
}

/**
 * Load configuration from a source
 * Original: function U8(arg)
 */
function loadConfig(source) {
  const configPath = getConfigPath(source);

  if (!configPath || !fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content);

    // Validate the configuration
    if (!validateConfig(parsed)) {
      console.error(`Invalid configuration in ${configPath}`);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`Failed to load config from ${configPath}:`, error);
    return null;
  }
}

/**
 * Save configuration to a source
 * Original: function W4(arg, options)
 */
function saveConfig(source, config) {
  // Don't save policy or flag settings
  if (source === 'policySettings' || source === 'flagSettings') {
    return { error: null };
  }

  const configPath = getConfigPath(source);

  if (!configPath) {
    return { error: 'Invalid configuration source' };
  }

  try {
    const dir = dirname(configPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing config to merge
    const existing = loadConfig(source);

    // Merge configurations
    const merged = mergeConfigurations(existing || {}, config);

    // Write configuration
    fs.writeFileSync(
      configPath,
      JSON.stringify(merged, null, 2),
      'utf8'
    );

    // Clear cache on save
    clearConfigCache();

    return { error: null };
  } catch (error) {
    console.error(`Failed to save config to ${configPath}:`, error);
    return { error: error.message };
  }
}

/**
 * Merge configurations with priority
 * Original: function D$9()
 */
function getMergedConfiguration() {
  // Return cached if available
  if (configCache !== null) {
    return configCache;
  }

  let merged = {};
  const loadedConfigs = [];
  const seenPaths = new Set();

  // Load configurations in priority order (lowest to highest)
  for (const source of CONFIG_SOURCES) {
    const configPath = getConfigPath(source);

    if (!configPath) continue;

    const normalized = normalizePath(configPath);

    // Skip if already loaded (for dedupe)
    if (seenPaths.has(normalized)) continue;

    seenPaths.add(normalized);

    const config = loadConfig(source);

    if (config) {
      loadedConfigs.push({ source, config });
    }
  }

  // Merge configurations
  for (const { config } of loadedConfigs) {
    merged = mergeConfigurations(merged, config);
  }

  // Apply configuration migrations
  merged = migrateConfiguration(merged);

  // Cache the result
  configCache = merged;

  return merged;
}

/**
 * Deep merge two configuration objects
 * Original: function IV1 (implied from usage)
 */
function mergeConfigurations(base, override) {
  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      // undefined means delete
      delete result[key];
    } else if (Array.isArray(value)) {
      // Arrays: merge unique values
      result[key] = mergeArrays(result[key], value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Objects: deep merge
      result[key] = mergeConfigurations(result[key] || {}, value);
    } else {
      // Primitives: override
      result[key] = value;
    }
  }

  return result;
}

/**
 * Merge arrays with deduplication
 * Original: function H$9(A, B)
 */
function mergeArrays(base, override) {
  const combined = [...(base || []), ...override];
  return Array.from(new Set(combined));
}

/**
 * Clear configuration cache
 * Original: function c41()
 */
function clearConfigCache() {
  configCache = null;
}

/**
 * Get current global configuration
 * Original: function E2()
 */
function getGlobalConfig() {
  const config = getMergedConfiguration();
  return config || {};
}

/**
 * Get cached global configuration
 * Original: function gk()
 */
function getCachedGlobalConfig() {
  if (configCache !== null) {
    return configCache;
  }

  configCache = getMergedConfiguration();
  return configCache;
}

/**
 * Parse frontmatter from markdown
 * Original: function uk(arg)
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)---\s*\n?/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content };
  }

  const frontmatterText = match[1];
  const mainContent = content.slice(match[0].length);
  const frontmatter = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');

    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (key) {
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        frontmatter[key] = cleanValue;
      }
    }
  }

  return { frontmatter, content: mainContent };
}

/**
 * Validate configuration object
 */
function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }

  // Add specific validation rules here
  // For now, just check it's an object
  return true;
}

/**
 * Migrate old configuration formats
 */
function migrateConfiguration(config) {
  const migrated = { ...config };

  // Migration: rename old keys
  if ('allowedTools' in migrated && !('permissions' in migrated)) {
    migrated.permissions = {
      allow: migrated.allowedTools || []
    };
    delete migrated.allowedTools;
  }

  if ('ignorePatterns' in migrated && migrated.permissions) {
    migrated.permissions.deny = [
      ...(migrated.permissions.deny || []),
      ...(migrated.ignorePatterns || [])
    ];
    delete migrated.ignorePatterns;
  }

  return migrated;
}

/**
 * Get policy configuration path
 */
function getPolicyPath() {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return '/Library/Application Support/ClaudeCode/policy.json';
    case 'win32':
      return 'C:\\ProgramData\\ClaudeCode\\policy.json';
    default:
      return '/etc/claude-code/policy.json';
  }
}

/**
 * Watch configuration files for changes
 */
class ConfigWatcher {
  constructor(callback) {
    this.callback = callback;
    this.watchers = new Map();
    this.debounceTimer = null;
  }

  start() {
    for (const source of CONFIG_SOURCES) {
      const path = getConfigPath(source);

      if (path && fs.existsSync(path)) {
        const watcher = fs.watch(path, (eventType) => {
          this.handleChange(source, eventType);
        });

        this.watchers.set(source, watcher);
      }
    }
  }

  stop() {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.watchers.clear();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  handleChange(source, eventType) {
    // Debounce multiple rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      clearConfigCache();
      this.callback(source, eventType);
      this.debounceTimer = null;
    }, 100);
  }
}

// Helper functions - would need to be imported
function getCurrentWorkingDirectory() {
  return process.cwd();
}

function getUserConfigDirectory() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return join(home, '.claude');
}

function getFlagDirectory() {
  return process.env.CLAUDE_FLAGS_DIR || null;
}

function normalizePath(path) {
  return resolve(path);
}

// Export functions
export {
  CONFIG_SOURCES,
  CONFIG_FILES,
  getConfigPath,
  getConfigDirectory,
  loadConfig,
  saveConfig,
  getMergedConfiguration,
  mergeConfigurations,
  clearConfigCache,
  getGlobalConfig,
  getCachedGlobalConfig,
  parseFrontmatter,
  ConfigWatcher
};