/**
 * Plugin System for Claude Code
 * Repository-based and NPM package plugin management
 * Extracted from lines 35026-35251
 */

import { join, basename, dirname } from 'path';
import { createRequire } from 'module';
import fs from 'fs';
import { execSync } from 'child_process';
import { z } from 'zod';

// Plugin manifest schema
const AuthorSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  url: z.string().url().optional()
});

const ManifestSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  author: AuthorSchema.optional(),
  tools: z.array(z.string()).optional(),
  commands: z.array(z.string()).optional(),
  hooks: z.object({}).optional(),
  model: z.string().optional(),
  color: z.string().optional()
});

// Plugin directories
const pluginRootDir = join(getTemporaryDirectory(), 'plugins');
const pluginReposDir = join(pluginRootDir, 'repos');
const pluginConfigPath = join(pluginRootDir, 'config.json');

/**
 * Initialize plugin directories
 * Original: function P15()
 */
async function initializePluginDirs() {

  if (!fs.existsSync(pluginRootDir)) {
    fs.mkdirSync(pluginRootDir, { recursive: true });
  }

  if (!fs.existsSync(pluginReposDir)) {
    fs.mkdirSync(pluginReposDir, { recursive: true });
  }
}

/**
 * Load plugin configuration
 * Original: function uq0()
 */
async function loadPluginConfig() {
  try {
    if (!fs.existsSync(pluginConfigPath)) {
      return { repositories: {} };
    }

    const content = fs.readFileSync(pluginConfigPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load plugin config: ${error}`);
    return { repositories: {} };
  }
}

/**
 * Save plugin configuration
 * Original: function j15()
 */
async function savePluginConfig(config) {
  try {
    fs.writeFileSync(
      pluginConfigPath,
      JSON.stringify(config, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error(`Failed to save plugin config: ${error}`);
  }
}

/**
 * Auto-update repositories
 * Original: function ZWB()
 */
async function autoUpdateRepositories() {
  const config = await loadPluginConfig();

  for (const repoName of Object.keys(config.repositories)) {
    try {
      const [owner, name] = repoName.split('/');

      if (!owner || !name) {
        console.error(`Invalid repository name: ${repoName}`);
        continue;
      }

      const repoPath = join(pluginReposDir, owner, name);

      if (!fs.existsSync(repoPath)) {
        console.error(`Repository directory not found for ${repoName}, skipping update`);
        continue;
      }

      console.log(`Auto-updating repository ${repoName}...`);

      // Pull latest changes
      const { status, stderr } = execSync('git pull', {
        cwd: repoPath,
        encoding: 'utf8'
      });

      if (status !== 0) {
        console.error(`Failed to auto-update repository ${repoName}: ${stderr}`);
        continue;
      }

      // Get current commit hash
      const commitHash = execSync('git rev-parse HEAD', {
        cwd: repoPath,
        encoding: 'utf8'
      }).trim();

      // Update config with new hash
      config.repositories[repoName] = {
        ...config.repositories[repoName],
        lastUpdated: Date.now(),
        commitHash
      };

      console.log(`Successfully auto-updated repository ${repoName}: ${commitHash}`);

    } catch (error) {
      console.error(`Error auto-updating repository ${repoName}: ${error}`);
    }
  }

  await savePluginConfig(config);
}

/**
 * Get repository path
 * Original: function GWB()
 */
function getRepositoryPath(repoName) {
  const [owner, name] = repoName.split('/');
  return join(pluginReposDir, owner, name);
}

/**
 * Validate package name
 * Original: function k15()
 */
function isValidPackageName(name) {
  if (name.includes('..') || name.includes('//')) {
    return false;
  }

  const scopedRegex = /^@[a-z0-9][a-z0-9-._]*\/[a-z0-9][a-z0-9-._]*$/;
  const normalRegex = /^[a-z0-9][a-z0-9-._]*$/;

  return scopedRegex.test(name) || normalRegex.test(name);
}

/**
 * Load plugin manifest
 * Original: function _15()
 */
function loadPluginManifest(manifestPath, pluginName, repoName) {

  if (!fs.existsSync(manifestPath)) {
    return {
      name: pluginName,
      description: `Plugin from ${repoName}`
    };
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(content);
    const validated = ManifestSchema.safeParse(parsed);

    if (validated.success) {
      return validated.data;
    }

    console.error(`Invalid manifest for ${pluginName}: ${validated.error}`);
    return {
      name: pluginName,
      description: `Plugin from ${repoName}`
    };

  } catch (error) {
    console.error(`Failed to load manifest for ${pluginName}: ${error}`);
    return {
      name: pluginName,
      description: `Plugin from ${repoName}`
    };
  }
}

/**
 * Load hooks configuration
 * Original: function x15()
 */
function loadHooksConfig(hooksPath, pluginPath, pluginName) {

  if (!fs.existsSync(hooksPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(hooksPath, 'utf8');
    return parseHooksConfig(content, pluginName);
  } catch (error) {
    console.error(`Failed to load hooks for ${pluginName}: ${error}`);
    return undefined;
  }
}

/**
 * Create plugin object
 * Original: function YWB()
 */
function createPluginObject(pluginPath, repository, enabled, name) {
  const manifestPath = join(pluginPath, 'plugin.json');
  const manifest = loadPluginManifest(manifestPath, name, repository);

  const plugin = {
    name: manifest.name,
    manifest,
    path: pluginPath,
    repository,
    enabled
  };

  // Check for commands directory
  const commandsPath = join(pluginPath, 'commands');
  if (fs.existsSync(commandsPath)) {
    plugin.commandsPath = commandsPath;
  }

  // Check for hooks
  const hooksPath = join(pluginPath, 'hooks', 'hooks.json');
  const hooksConfig = loadHooksConfig(hooksPath, pluginPath, manifest.name);

  if (hooksConfig) {
    plugin.hooksConfig = hooksConfig;
  }

  return plugin;
}

/**
 * Scan repository for plugins
 * Original: function v15()
 */
function scanRepositoryPlugins(repoPath, repoName) {
  const plugins = [];
  const config = getGlobalConfig();
  const enabledPlugins = config.enabledPlugins?.[repoName];
  const enabledList = Array.isArray(enabledPlugins) ? enabledPlugins : [];

  try {
    const entries = fs.readdirSync(repoPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      const pluginPath = join(repoPath, entry.name);
      const plugin = createPluginObject(pluginPath, repoName, false, entry.name);
      const isEnabled = enabledList.includes(plugin.name);

      plugin.enabled = isEnabled;
      plugins.push(plugin);

      if (isEnabled) {
        console.log(`Loaded plugin: ${plugin.name} from ${repoName}`);
      } else {
        console.log(`Found disabled plugin: ${plugin.name} from ${repoName}`);
      }
    }
  } catch (error) {
    console.error(`Failed to scan repository ${repoName}: ${error}`);
  }

  return plugins;
}

/**
 * Scan NPM package for plugin
 * Original: function b15()
 */
async function scanNpmPackage(packageName) {

  if (!isValidPackageName(packageName)) {
    console.error(`Invalid npm package name: ${packageName}`);
    return { type: 'invalid-name', packageName };
  }

  try {
    const require = createRequire(join(getCurrentWorkingDirectory(), 'package.json'));

    let packageJsonPath;
    try {
      packageJsonPath = await new Promise((resolve, reject) => {
        try {
          resolve(require.resolve(`${packageName}/package.json`));
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      console.error(`Package ${packageName} not found in node_modules: ${error}`);
      return { type: 'not-found', packageName };
    }

    const packageDir = dirname(packageJsonPath);
    const hasCommands = fs.existsSync(join(packageDir, 'commands'));
    const hasManifest = fs.existsSync(join(packageDir, 'plugin.json'));
    const hasHooks = fs.existsSync(join(packageDir, 'hooks', 'hooks.json'));

    if (!hasCommands && !hasManifest && !hasHooks) {
      console.error(`Package ${packageName} does not have plugin structure`);
      return { type: 'not-plugin', packageName };
    }

    const pluginName = packageName.split('/').pop() || packageName;
    const plugin = createPluginObject(packageDir, `npm:${packageName}`, true, pluginName);

    console.log(`Loaded npm plugin: ${plugin.name} from ${packageName}`);
    return { type: 'success', plugin };

  } catch (error) {
    console.error(`Failed to scan npm package ${packageName}: ${error}`);
    return { type: 'not-found', packageName };
  }
}

/**
 * Main plugin loader
 * Original: const dj
 */
export const loadAllPlugins = memoize(async () => {
  // Auto-update repositories
  await autoUpdateRepositories();

  const config = await loadPluginConfig();
  const globalConfig = getGlobalConfig();
  const enabledPlugins = [];
  const disabledPlugins = [];
  const errors = [];
  const pluginNameMap = new Map();

  // Load repository plugins
  for (const repoName of Object.keys(config.repositories)) {
    let repoPath;

    try {
      repoPath = getRepositoryPath(repoName);
    } catch {
      continue;
    }

    if (!fs.existsSync(repoPath)) {
      errors.push({
        repository: repoName,
        error: `Repository directory not found: ${repoPath}`
      });
      continue;
    }

    try {
      const plugins = scanRepositoryPlugins(repoPath, repoName);

      for (const plugin of plugins) {
        const existingRepo = pluginNameMap.get(plugin.name);

        if (existingRepo) {
          errors.push({
            repository: repoName,
            plugin: plugin.name,
            error: `Plugin name '${plugin.name}' conflicts with plugin from ${existingRepo}`
          });
          continue;
        }

        pluginNameMap.set(plugin.name, repoName);

        if (plugin.enabled) {
          enabledPlugins.push(plugin);
        } else {
          disabledPlugins.push(plugin);
        }
      }
    } catch (error) {
      errors.push({
        repository: repoName,
        error: `Failed to scan repository: ${error}`
      });
    }
  }

  // Load NPM package plugins
  const npmPlugins = globalConfig.enabledPlugins || {};
  const npmEntries = Object.entries(npmPlugins)
    .filter(([key, value]) => key.startsWith('npm:') && value === true);

  const npmResults = await Promise.all(
    npmEntries.map(async ([key, _]) => {
      const packageName = key.slice(4); // Remove 'npm:' prefix

      try {
        const result = await scanNpmPackage(packageName);
        return { key, packageName, result };
      } catch (error) {
        return {
          key,
          packageName,
          error: `Failed to load npm package: ${error}`
        };
      }
    })
  );

  // Process NPM results
  for (const { key, packageName, result } of npmResults) {
    if ('error' in result) {
      errors.push({ repository: key, error: result.error });
      continue;
    }

    switch (result.type) {
      case 'success': {
        const existingRepo = pluginNameMap.get(result.plugin.name);

        if (existingRepo) {
          errors.push({
            repository: key,
            plugin: result.plugin.name,
            error: `Plugin name '${result.plugin.name}' conflicts with plugin from ${existingRepo}`
          });
        } else {
          pluginNameMap.set(result.plugin.name, key);
          enabledPlugins.push(result.plugin);
        }
        break;
      }

      case 'not-found':
        errors.push({
          repository: key,
          error: `Package ${packageName} not found in node_modules`
        });
        break;

      case 'not-plugin':
        errors.push({
          repository: key,
          error: `Package ${packageName} does not appear to be a Claude plugin`
        });
        break;

      case 'invalid-name':
        errors.push({
          repository: key,
          error: `Invalid npm package name: ${packageName}`
        });
        break;
    }
  }

  const repoCount = Object.keys(config.repositories).length;
  const npmCount = npmEntries.length;

  console.log(
    `Found ${enabledPlugins.length + disabledPlugins.length} plugins ` +
    `(${enabledPlugins.length} enabled, ${disabledPlugins.length} disabled) ` +
    `from ${repoCount} repositories and ${npmCount} npm packages`
  );

  return {
    enabled: enabledPlugins,
    disabled: disabledPlugins,
    errors
  };
});

/**
 * Clear plugin cache
 * Original: function mq0()
 */
export function clearPluginCache() {
  loadAllPlugins.cache?.clear?.();
}

// Helper functions
function getTemporaryDirectory() {
  return process.env.TMPDIR || '/tmp';
}

function getCurrentWorkingDirectory() {
  return process.cwd();
}

function getGlobalConfig() {
  // Implementation would load global config
  return {};
}

function parseHooksConfig(content, pluginName) {
  // Implementation would parse hooks configuration
  return JSON.parse(content);
}

function memoize(fn) {
  let cache = null;
  const memoized = async (...args) => {
    if (cache === null) {
      cache = await fn(...args);
    }
    return cache;
  };
  memoized.cache = { clear: () => { cache = null; } };
  return memoized;
}