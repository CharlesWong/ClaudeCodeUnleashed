/**
 * Permission System
 * Complete permission management for Claude Code tools
 * Extracted from lines 1-500 of original file
 */

import { isAbsolute } from 'path';
import fs from 'fs';

// Permission behaviors
const PERMISSION_BEHAVIORS = ['allow', 'deny', 'ask'];

// Tool name constants
const EDIT_FILE_TOOL = 'Read';
const MAX_LINE_LENGTH = 2000;

/**
 * Extract permission rules from configuration
 * Original: function $C9(A, B)
 */
function extractPermissionRules(config, source) {
  if (!config || !config.permissions) return [];

  const { permissions } = config;
  const rules = [];

  for (const behavior of PERMISSION_BEHAVIORS) {
    const behaviorRules = permissions[behavior];
    if (behaviorRules) {
      for (const rule of behaviorRules) {
        rules.push({
          source: source,
          ruleBehavior: behavior,
          ruleValue: normalizeRule(rule)
        });
      }
    }
  }

  return rules;
}

/**
 * Get allowed tools excluding local settings
 * Original: function wC9(arg, options)
 */
function getAllowedToolsExcludingLocal(config, existingRules) {
  if (!config.allowedTools || config.allowedTools.length < 1) return [];

  const localAllowedSet = new Set();

  // Collect locally allowed tools
  for (const rule of existingRules) {
    if (rule.ruleBehavior === 'allow' && rule.source === 'localSettings') {
      localAllowedSet.add(normalizeRuleValue(rule.ruleValue));
    }
  }

  // Filter out locally allowed tools
  const result = new Set();
  for (const tool of config.allowedTools) {
    if (!localAllowedSet.has(tool)) {
      result.add(tool);
    }
  }

  return Array.from(result);
}

/**
 * Get ignore patterns excluding local settings
 * Original: function qC9(arg, options)
 */
function getIgnorePatternsExcludingLocal(config, existingRules) {
  if (!config.ignorePatterns || config.ignorePatterns.length < 1) return [];

  const localIgnoreSet = new Set();

  // Collect local ignore patterns
  for (const rule of existingRules) {
    if (
      rule.ruleBehavior === 'deny' &&
      rule.source === 'localSettings' &&
      rule.ruleValue.toolName === EDIT_FILE_TOOL &&
      rule.ruleValue.ruleContent !== undefined
    ) {
      localIgnoreSet.add(rule.ruleValue.ruleContent);
    }
  }

  // Filter out local patterns
  const result = new Set();
  for (const pattern of config.ignorePatterns) {
    if (!localIgnoreSet.has(pattern)) {
      result.add(pattern);
    }
  }

  return Array.from(result).map(pattern => ({
    toolName: EDIT_FILE_TOOL,
    ruleContent: pattern
  }));
}

/**
 * Migrate tool usage analytics
 * Original: function TUA()
 */
function migrateToolUsageAnalytics() {
  const config = getLocalSettings();
  if (!config.allowedTools && !config.ignorePatterns) return;

  const updatedConfig = { ...config };

  // Process allowed tools
  const allowedTools = getAllowedToolsExcludingLocal(
    config,
    extractPermissionRules('localSettings')
  );

  if (allowedTools.length > 0) {
    updatePermissionRules(
      { ruleValues: allowedTools.map(normalizeRule), ruleBehavior: 'allow' },
      'localSettings'
    );
  }

  updatedConfig.allowedTools = [];

  // Process ignore patterns
  const ignorePatterns = getIgnorePatternsExcludingLocal(
    config,
    extractPermissionRules('localSettings')
  );

  if (ignorePatterns.length > 0) {
    updatePermissionRules(
      { ruleValues: ignorePatterns, ruleBehavior: 'deny' },
      'localSettings'
    );
  }

  delete updatedConfig.ignorePatterns;
  saveLocalSettings(updatedConfig);
}

/**
 * Get all permission rules
 * Original: function mC1()
 */
function getAllPermissionRules() {
  const rules = [];
  const config = getLocalSettings();

  // Add project settings rules
  for (const tool of config.allowedTools || []) {
    rules.push({
      source: 'projectSettings',
      ruleBehavior: 'allow',
      ruleValue: normalizeRule(tool)
    });
  }

  // Add rules from all sources
  const sources = ['userSettings', 'projectSettings', 'localSettings'];
  for (const source of sources) {
    rules.push(...extractPermissionRules(source));
  }

  return rules;
}

/**
 * Get rules from a specific source
 * Original: function Da(arg)
 */
function getRulesFromSource(source) {
  const config = getConfigBySource(source);
  return extractPermissionRules(config, source);
}

/**
 * Check if rule can be removed
 * Original: function PUA(arg)
 */
function canRemoveRule(rule) {
  const ruleValue = normalizeRuleValue(rule.ruleValue);
  const sourceConfig = getConfigBySource(rule.source);

  if (!sourceConfig || !sourceConfig.permissions) return false;

  const behaviorRules = sourceConfig.permissions[rule.ruleBehavior];
  if (!behaviorRules || !behaviorRules.includes(ruleValue)) return false;

  try {
    const updatedConfig = {
      ...sourceConfig,
      permissions: {
        ...sourceConfig.permissions,
        [rule.ruleBehavior]: behaviorRules.filter(r => r !== ruleValue)
      }
    };

    const { error } = saveConfig(rule.source, updatedConfig);
    if (error) return false;

    return true;
  } catch (error) {
    console.error('Error removing rule:', error);
    return false;
  }
}

/**
 * Create empty permission context
 * Original: function EC9()
 */
function createEmptyPermissionContext() {
  return {
    permissions: {
      allow: [],
      deny: [],
      ask: []
    }
  };
}

/**
 * Update permission rules
 * Original: function uC1({ ruleValues: arg, ruleBehavior: B }, callback)
 */
function updatePermissionRules({ ruleValues, ruleBehavior }, source) {
  if (ruleValues.length < 1) return true;

  const config = getConfigBySource(source) || createEmptyPermissionContext();

  try {
    const permissions = config.permissions || {};
    const existingRules = permissions[ruleBehavior] || [];
    const existingSet = new Set(existingRules);
    const newRules = ruleValues.filter(rule => !existingSet.has(rule));

    if (newRules.length === 0) return true;

    const updatedPermissions = {
      ...permissions,
      [ruleBehavior]: [...existingRules, ...newRules]
    };

    const updatedConfig = {
      ...config,
      permissions: updatedPermissions
    };

    const result = saveConfig(source, updatedConfig);
    if (result.error) throw result.error;

    return true;
  } catch (error) {
    console.error('Error updating permissions:', error);
    return false;
  }
}

/**
 * Apply permission update to configuration
 * Original: function XF(arg, options)
 */
function applyPermissionUpdate(currentConfig, update) {
  switch (update.type) {
    case 'setMode':
      console.log(`Setting permission mode to '${update.mode}'`);
      return { ...currentConfig, mode: update.mode };

    case 'addRules': {
      const rules = update.rules.map(normalizeRuleValue);
      console.log(`Adding ${rules.length} ${update.behavior} rules to ${update.destination}`);

      const key = update.behavior === 'allow' ? 'alwaysAllowRules' :
                 update.behavior === 'deny' ? 'alwaysDenyRules' :
                 'alwaysAskRules';

      return {
        ...currentConfig,
        [key]: {
          ...currentConfig[key],
          [update.destination]: [
            ...(currentConfig[key]?.[update.destination] || []),
            ...rules
          ]
        }
      };
    }

    case 'replaceRules': {
      const rules = update.rules.map(normalizeRuleValue);
      console.log(`Replacing ${update.behavior} rules in ${update.destination}`);

      const key = update.behavior === 'allow' ? 'alwaysAllowRules' :
                 update.behavior === 'deny' ? 'alwaysDenyRules' :
                 'alwaysAskRules';

      return {
        ...currentConfig,
        [key]: {
          ...currentConfig[key],
          [update.destination]: rules
        }
      };
    }

    case 'removeRules': {
      const rulesToRemove = update.rules.map(normalizeRuleValue);
      console.log(`Removing ${rulesToRemove.length} ${update.behavior} rules from ${update.destination}`);

      const key = update.behavior === 'allow' ? 'alwaysAllowRules' :
                 update.behavior === 'deny' ? 'alwaysDenyRules' :
                 'alwaysAskRules';

      const existingRules = currentConfig[key]?.[update.destination] || [];
      const removeSet = new Set(rulesToRemove);
      const filteredRules = existingRules.filter(rule => !removeSet.has(rule));

      return {
        ...currentConfig,
        [key]: {
          ...currentConfig[key],
          [update.destination]: filteredRules
        }
      };
    }

    case 'addDirectories': {
      console.log(`Adding ${update.directories.length} directories to ${update.destination}`);
      const directories = new Map(currentConfig.additionalWorkingDirectories);
      for (const dir of update.directories) {
        directories.set(dir, true);
      }
      return {
        ...currentConfig,
        additionalWorkingDirectories: directories
      };
    }

    case 'removeDirectories': {
      console.log(`Removing ${update.directories.length} directories from ${update.destination}`);
      const directories = new Map(currentConfig.additionalWorkingDirectories);
      for (const dir of update.directories) {
        directories.delete(dir);
      }
      return {
        ...currentConfig,
        additionalWorkingDirectories: directories
      };
    }

    default:
      return currentConfig;
  }
}

/**
 * Apply multiple permission updates
 * Original: function Pg(arg, options)
 */
function applyPermissionUpdates(currentConfig, updates) {
  let config = currentConfig;
  for (const update of updates) {
    config = applyPermissionUpdate(config, update);
  }
  return config;
}

/**
 * Check if destination is persistable
 * Original: function le1(arg)
 */
function isPersistableDestination(destination) {
  return destination === 'localSettings' ||
         destination === 'userSettings' ||
         destination === 'projectSettings';
}

/**
 * Persist permission update
 * Original: function jg(arg)
 */
function persistPermissionUpdate(update) {
  if (!isPersistableDestination(update.destination)) return;

  console.log(`Persisting permission update: ${update.type} to '${update.destination}'`);

  switch (update.type) {
    case 'addRules':
      console.log(`Persisting ${update.rules.length} ${update.behavior} rules`);
      updatePermissionRules(
        { ruleValues: update.rules, ruleBehavior: update.behavior },
        update.destination
      );
      break;

    case 'removeRules':
      console.log(`Removing ${update.rules.length} ${update.behavior} rules`);
      const config = getConfigBySource(update.destination);
      const rulesToRemove = new Set(update.rules.map(normalizeRuleValue));
      const filteredRules = (config.permissions?.[update.behavior] || [])
        .filter(rule => !rulesToRemove.has(rule));

      saveConfig(update.destination, {
        ...config,
        permissions: {
          ...config.permissions,
          [update.behavior]: filteredRules
        }
      });
      break;

    case 'setMode':
      console.log(`Persisting mode '${update.mode}'`);
      saveConfig(update.destination, {
        ...getConfigBySource(update.destination),
        permissions: {
          ...getConfigBySource(update.destination)?.permissions,
          defaultMode: update.mode
        }
      });
      break;

    case 'replaceRules':
      console.log(`Replacing all ${update.behavior} rules with ${update.rules.length} new rules`);
      const newRules = update.rules.map(normalizeRuleValue);
      saveConfig(update.destination, {
        ...getConfigBySource(update.destination),
        permissions: {
          ...getConfigBySource(update.destination)?.permissions,
          [update.behavior]: newRules
        }
      });
      break;

    case 'addDirectories':
      console.log(`Adding ${update.directories.length} directories`);
      const existingDirs = getConfigBySource(update.destination)?.permissions?.additionalDirectories || [];
      const newDirs = update.directories.filter(dir => !existingDirs.includes(dir));

      if (newDirs.length > 0) {
        saveConfig(update.destination, {
          ...getConfigBySource(update.destination),
          permissions: {
            ...getConfigBySource(update.destination)?.permissions,
            additionalDirectories: [...existingDirs, ...newDirs]
          }
        });
      }
      break;

    case 'removeDirectories':
      console.log(`Removing ${update.directories.length} directories`);
      const currentDirs = getConfigBySource(update.destination)?.permissions?.additionalDirectories || [];
      const dirsToRemove = new Set(update.directories);
      const remainingDirs = currentDirs.filter(dir => !dirsToRemove.has(dir));

      saveConfig(update.destination, {
        ...getConfigBySource(update.destination),
        permissions: {
          ...getConfigBySource(update.destination)?.permissions,
          additionalDirectories: remainingDirs
        }
      });
      break;
  }
}

/**
 * Persist multiple updates
 * Original: function dC1(arg)
 */
function persistPermissionUpdates(updates) {
  for (const update of updates) {
    persistPermissionUpdate(update);
  }
}

/**
 * Create directory permission rule
 * Original: function cC1(arg)
 */
function createDirectoryPermissionRule(path) {
  try {
    if (fs.statSync(path).isDirectory()) {
      const normalizedPath = normalizePath(path);
      return {
        type: 'addRules',
        rules: [{
          toolName: 'Read',
          ruleContent: isAbsolute(normalizedPath) ?
                      `/${normalizedPath}/**` :
                      `${normalizedPath}/**`
        }],
        behavior: 'allow',
        destination: 'localSettings'
      };
    }
  } catch {}
  return null;
}

// Placeholder functions - these would need to be imported or implemented
function normalizeRule(rule) { return rule; }
function normalizeRuleValue(ruleValue) { return ruleValue; }
function getLocalSettings() { return {}; }
function saveLocalSettings(config) { return config; }
function getConfigBySource(source) { return {}; }
function saveConfig(source, config) { return { error: null }; }
function normalizePath(path) { return path; }

export {
  PERMISSION_BEHAVIORS,
  extractPermissionRules,
  getAllowedToolsExcludingLocal,
  getIgnorePatternsExcludingLocal,
  migrateToolUsageAnalytics,
  getAllPermissionRules,
  getRulesFromSource,
  canRemoveRule,
  createEmptyPermissionContext,
  updatePermissionRules,
  applyPermissionUpdate,
  applyPermissionUpdates,
  isPersistableDestination,
  persistPermissionUpdate,
  persistPermissionUpdates,
  createDirectoryPermissionRule
};