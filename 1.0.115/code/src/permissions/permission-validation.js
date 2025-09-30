/**
 * Permission Validation System
 * Complete permission validation and rule checking
 * Extracted from lines 500-1000 of original file
 */

import { isIP } from 'node:net';
import fs from 'fs';
import path from 'path';

// MCP Server Functions
// Original: lines 514-552

/**
 * Check if MCP server exists
 * Original: function re1()
 */
function hasMcpServer(serverName) {
  return serverName !== null;
}

/**
 * Sanitize MCP server name
 * Original: function SH(arg)
 */
function sanitizeMcpServerName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Filter MCP tools by server
 * Original: function T41(arg, options)
 */
function getMcpToolsForServer(tools, serverName) {
  const prefix = `mcp__${sanitizeMcpServerName(serverName)}__`;
  return tools.filter(tool => tool.name?.startsWith(prefix));
}

/**
 * Get non-MCP tools
 * Original: function _UA(arg, options) and xUA
 */
function getNonMcpTools(tools, serverName) {
  const prefix = `mcp__${sanitizeMcpServerName(serverName)}__`;
  return tools.filter(tool => !tool.name?.startsWith(prefix));
}

/**
 * Remove MCP prefix from args
 * Original: function vUA(arg, options)
 */
function removeMcpPrefix(args, serverName) {
  const result = { ...args };
  delete result[serverName];
  return result;
}

/**
 * Create MCP tool prefix
 * Original: function bUA(arg)
 */
function createMcpPrefix(serverName) {
  return `mcp__${sanitizeMcpServerName(serverName)}__`;
}

/**
 * Check if tool is MCP tool
 * Original: function oe1(arg)
 */
function isMcpTool(tool) {
  return tool.name?.startsWith('mcp__') || tool.isMcp === true;
}

/**
 * Parse MCP tool name
 * Original: function hk(arg)
 */
function parseMcpToolName(toolName) {
  const parts = toolName.split('__');
  if (parts[0] !== 'mcp' || !parts[1]) return null;

  const serverName = parts[1];
  const toolNamePart = parts.length > 2 ? parts.slice(2).join('__') : undefined;

  return { serverName, toolName: toolNamePart };
}

/**
 * Strip MCP prefix from tool name
 * Original: function aC1(arg, options)
 */
function stripMcpPrefix(toolName, serverName) {
  const prefix = `mcp__${sanitizeMcpServerName(serverName)}__`;
  return toolName.replace(prefix, '');
}

/**
 * Clean MCP tool display name
 * Original: function sC1(arg)
 */
function cleanMcpToolDisplayName(displayName) {
  let cleaned = displayName.replace(/\s*\(MCP\)\s*$/, '');
  cleaned = cleaned.trim();

  const dashIndex = cleaned.indexOf(' - ');
  if (dashIndex > -1) {
    cleaned = cleaned.substring(0, dashIndex).trim();
  }

  return cleaned;
}

// Permission Scope Functions
// Original: lines 559-596

/**
 * Get permission scope display name
 * Original: function yH(arg)
 */
function getPermissionScopeDisplayName(scope) {
  const homeDir = getHomeDirectory();

  switch (scope) {
    case 'user': {
      const userConfigPath = getUserConfigPath();
      const exists = fs.existsSync(userConfigPath);
      return exists ? userConfigPath : `User settings (${userConfigPath})`;
    }
    case 'project': {
      const projectConfigPath = path.join(getCurrentWorkingDirectory(), '.mcp.json');
      const exists = fs.existsSync(projectConfigPath);
      return exists ? projectConfigPath : `Project settings (${projectConfigPath})`;
    }
    case 'local':
      return `${getHomeDirectory()} [project: ${getCurrentWorkingDirectory()}]`;
    case 'dynamic':
    case 'enterprise': {
      const configPath = getEnterpriseConfigPath();
      const exists = fs.existsSync(configPath);
      return exists ? configPath : `Enterprise settings (${configPath})`;
    }
    default:
      return scope;
  }
}

/**
 * Get permission scope type
 * Original: function yg(arg)
 */
function getPermissionScopeType(scope) {
  switch (scope) {
    case 'local':
    case 'project':
    case 'user':
    case 'dynamic':
    case 'enterprise':
      return scope;
    default:
      return scope;
  }
}

/**
 * Validate permission scope
 * Original: function P41(arg)
 */
function validatePermissionScope(scope) {
  if (!scope) return 'local';

  const validScopes = ['local', 'project', 'user', 'dynamic', 'enterprise'];
  if (!validScopes.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Must be one of: ${validScopes.join(', ')}`);
  }

  return scope;
}

/**
 * Get transport type
 * Original: function fUA(arg)
 */
function getTransportType(transport) {
  if (!transport) return 'stdio';
  return transport;
}

/**
 * Parse HTTP headers
 * Original: function te1(arg)
 */
function parseHttpHeaders(headerStrings) {
  const headers = {};

  for (const headerStr of headerStrings) {
    const colonIndex = headerStr.indexOf(':');
    if (colonIndex === -1) continue;

    const name = headerStr.substring(0, colonIndex).trim();
    const value = headerStr.substring(colonIndex + 1).trim();

    if (!name) {
      throw new Error(`Invalid header: "${headerStr}". Header name cannot be empty.`);
    }

    headers[name] = value;
  }

  return headers;
}

/**
 * Get MCP server approval status
 * Original: function iC1(arg)
 */
function getMcpServerApprovalStatus(serverName) {
  const config = getLocalConfig();
  const sanitizedName = sanitizeMcpServerName(serverName);

  if (config?.disabledMcpjsonServers?.some(s => sanitizeMcpServerName(s) === sanitizedName)) {
    return 'rejected';
  }

  if (config?.enabledMcpjsonServers?.some(s => sanitizeMcpServerName(s) === sanitizedName) ||
      config?.enableAllProjectMcpServers) {
    return 'approved';
  }

  return 'pending';
}

// Permission Sources
const PERMISSION_SOURCES = [
  'localSettings',
  'projectSettings',
  'userSettings',
  'policySettings',
  'flagSettings',
  'cliArg',
  'command',
  'session'
];

/**
 * Get permission source display name
 * Original: function j41(arg)
 */
function getPermissionSourceDisplayName(source) {
  switch (source) {
    case 'cliArg':
      return 'CLI argument';
    case 'command':
    case 'session':
      return 'current session';
    case 'localSettings':
      return 'local settings';
    case 'projectSettings':
      return 'project settings';
    case 'policySettings':
      return 'policy settings';
    case 'userSettings':
      return 'user settings';
    case 'flagSettings':
      return 'flag settings';
    default:
      return source;
  }
}

// Rule Parsing Functions
// Original: lines 631-642

/**
 * Parse permission rule
 * Original: function jH(arg)
 */
function parsePermissionRule(ruleString) {
  const match = ruleString.match(/^([^(]+)\(([^)]+)\)$/);

  if (!match) {
    return { toolName: ruleString };
  }

  const toolName = match[1];
  const ruleContent = match[2];

  if (!toolName || !ruleContent) {
    return { toolName: ruleString };
  }

  return { toolName, ruleContent };
}

/**
 * Format permission rule
 * Original: function o6(arg)
 */
function formatPermissionRule(rule) {
  return rule.ruleContent ?
    `${rule.toolName}(${rule.ruleContent})` :
    rule.toolName;
}

// Permission Rule Retrieval
// Original: lines 643-713

/**
 * Get all allow rules
 * Original: function kg(arg)
 */
function getAllowRules(context) {
  return PERMISSION_SOURCES.flatMap(source =>
    (context.alwaysAllowRules[source] || []).map(rule => ({
      source,
      ruleBehavior: 'allow',
      ruleValue: parsePermissionRule(rule)
    }))
  );
}

/**
 * Get allowed patterns for tool
 * Original: function SC9(arg, options)
 */
function getAllowedPatternsForTool(context, toolName) {
  return getAllowRules(context)
    .filter(rule => rule.ruleValue.toolName === toolName)
    .map(rule => {
      if (rule.ruleValue.ruleContent) {
        return rule.ruleValue.ruleContent;
      }
      return toolName;
    });
}

/**
 * Format permission decision message
 * Original: function FF(arg, options, callback)
 */
function formatPermissionDecisionMessage(context, toolName, decision) {
  let message = '';

  if (decision) {
    switch (decision.type) {
      case 'hook':
        return decision.reason ?
          `Hook '${decision.hookName}' blocked this action: ${decision.reason}` :
          `Hook '${decision.hookName}' requires approval for this ${toolName} command`;

      case 'rule': {
        const ruleStr = formatPermissionRule(decision.rule.ruleValue);
        const sourceName = getPermissionSourceDisplayName(decision.rule.source);
        return `Permission rule '${ruleStr}' from ${sourceName} requires approval for this ${toolName} command`;
      }

      case 'subcommandResults': {
        const requiresApproval = [];
        for (const [name, result] of decision.reasons) {
          if (result.behavior === 'ask' || result.behavior === 'passthrough') {
            requiresApproval.push(name);
          }
        }

        if (requiresApproval.length > 0) {
          const plural = requiresApproval.length > 1;
          return `This ${toolName} command contains multiple operations. The following part${plural ? 's' : ''} require${plural ? '' : 's'} approval: ${requiresApproval.join(', ')}`;
        }

        return `This ${toolName} command contains multiple operations that require approval`;
      }

      case 'permissionPromptTool':
        return `Tool '${decision.permissionPromptToolName}' requires approval for this ${toolName} command`;

      case 'other':
        return decision.reason;

      case 'mode':
        return `Current permission mode (${decision.mode}) requires approval for this ${toolName} command`;
    }
  }

  // Add reminder about allowed patterns
  const allowedPatterns = getAllowedPatternsForTool(context, toolName);
  if (allowedPatterns.length > 0) {
    message += `\n\nAs a reminder, Claude can use these ${toolName} commands without approval: ${allowedPatterns.join(', ')}`;
  }

  return message;
}

/**
 * Get all deny rules
 * Original: function wa(arg)
 */
function getDenyRules(context) {
  return PERMISSION_SOURCES.flatMap(source =>
    (context.alwaysDenyRules[source] || []).map(rule => ({
      source,
      ruleBehavior: 'deny',
      ruleValue: parsePermissionRule(rule)
    }))
  );
}

/**
 * Get all ask rules
 * Original: function rC1(arg)
 */
function getAskRules(context) {
  return PERMISSION_SOURCES.flatMap(source =>
    (context.alwaysAskRules[source] || []).map(rule => ({
      source,
      ruleBehavior: 'ask',
      ruleValue: parsePermissionRule(rule)
    }))
  );
}

/**
 * Check if rule matches tool
 * Original: function A10(arg, options)
 */
function ruleMatchesTool(tool, rule) {
  // If rule has content, it must match exactly
  if (rule.ruleValue.ruleContent !== undefined) return false;

  // Direct name match
  if (rule.ruleValue.toolName === tool.name) return true;

  // Check MCP tool matching
  const ruleMcp = parseMcpToolName(rule.ruleValue.toolName);
  const toolMcp = parseMcpToolName(tool.name);

  // If both are MCP tools and rule doesn't specify tool name, match by server
  return ruleMcp !== null &&
         toolMcp !== null &&
         ruleMcp.toolName === undefined &&
         ruleMcp.serverName === toolMcp.serverName;
}

/**
 * Find allow rule for tool
 * Original: function yC9(arg, options)
 */
function findAllowRuleForTool(context, tool) {
  return getAllowRules(context).find(rule => ruleMatchesTool(tool, rule)) || null;
}

/**
 * Find deny rule for tool
 * Original: function kC9(arg, options)
 */
function findDenyRuleForTool(context, tool) {
  return getDenyRules(context).find(rule => ruleMatchesTool(tool, rule)) || null;
}

/**
 * Find ask rule for tool
 * Original: function _C9(arg, options)
 */
function findAskRuleForTool(context, tool) {
  return getAskRules(context).find(rule => ruleMatchesTool(tool, rule)) || null;
}

/**
 * Get rules by behavior for tool
 * Original: function B10(arg, options, callback)
 */
function getRulesByBehaviorForTool(context, toolName, behavior) {
  const rulesMap = new Map();
  let rules = [];

  switch (behavior) {
    case 'allow':
      rules = getAllowRules(context);
      break;
    case 'deny':
      rules = getDenyRules(context);
      break;
    case 'ask':
      rules = getAskRules(context);
      break;
  }

  for (const rule of rules) {
    if (rule.ruleValue.toolName === toolName &&
        rule.ruleValue.ruleContent !== undefined &&
        rule.ruleBehavior === behavior) {
      rulesMap.set(rule.ruleValue.ruleContent, rule);
    }
  }

  return rulesMap;
}

// Hook Types
const HOOK_TYPES = [
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'PreCompact'
];

// Permission Validation
// Original: lines 810-955

const PERMISSION_VALIDATION_CONFIG = {
  bashPrefixTools: ['Bash', 'Shell', 'Execute'],

  customValidation: {
    WebSearch: (pattern) => {
      if (pattern.includes('*') || pattern.includes('?')) {
        return {
          valid: false,
          error: 'WebSearch does not support wildcards',
          examples: ['WebSearch(claude ai)', 'WebSearch(typescript tutorial)']
        };
      }
      return { valid: true };
    },

    WebFetch: (pattern) => {
      if (!pattern.startsWith('domain:')) {
        return {
          valid: false,
          error: 'WebFetch permissions must use "domain:" prefix',
          examples: ['WebFetch(domain:example.com)', 'WebFetch(domain:*.google.com)']
        };
      }
      return { valid: true };
    }
  }
};

/**
 * Check if tool is file tool
 * Original: function dUA(arg)
 */
function isFileTool(toolName) {
  return ['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName);
}

/**
 * Check if tool uses bash prefix
 * Original: function cUA(arg)
 */
function usesBashPrefix(toolName) {
  return PERMISSION_VALIDATION_CONFIG.bashPrefixTools.includes(toolName);
}

/**
 * Get custom validator for tool
 * Original: function lUA(arg)
 */
function getCustomValidator(toolName) {
  return PERMISSION_VALIDATION_CONFIG.customValidation[toolName];
}

/**
 * Validate permission rule
 * Original: function xC9(arg)
 */
function validatePermissionRule(ruleString) {
  // Check for empty rule
  if (!ruleString || ruleString.trim() === '') {
    return { valid: false, error: 'Permission rule cannot be empty' };
  }

  // Check parentheses matching
  const openParens = (ruleString.match(/\(/g) || []).length;
  const closeParens = (ruleString.match(/\)/g) || []).length;

  if (openParens !== closeParens) {
    return {
      valid: false,
      error: 'Mismatched parentheses',
      suggestion: 'Ensure all opening parentheses have matching closing parentheses'
    };
  }

  // Parse the rule
  const parsed = parsePermissionRule(ruleString);

  // Check for empty parentheses
  if (ruleString.includes('()')) {
    const toolName = parsed.toolName;
    if (!toolName) {
      return {
        valid: false,
        error: 'Empty parentheses with no tool name',
        suggestion: 'Specify a tool name before the parentheses'
      };
    }

    return {
      valid: false,
      error: 'Empty parentheses',
      suggestion: `Either specify a pattern or use just "${toolName}" without parentheses`,
      examples: [`${toolName}`, `${toolName}(some-pattern)`]
    };
  }

  // Check MCP rules
  const mcpInfo = parseMcpToolName(parsed.toolName);
  if (mcpInfo) {
    if (parsed.ruleContent !== undefined) {
      return {
        valid: false,
        error: 'MCP rules do not support patterns',
        suggestion: `Use "${parsed.toolName}" without parentheses`,
        examples: [
          `mcp__${mcpInfo.serverName}`,
          mcpInfo.toolName ? `mcp__${mcpInfo.serverName}__${mcpInfo.toolName}` : undefined
        ].filter(Boolean)
      };
    }
    return { valid: true };
  }

  // Check tool name
  if (!parsed.toolName || parsed.toolName.length === 0) {
    return { valid: false, error: 'Tool name cannot be empty' };
  }

  // Check capitalization
  if (parsed.toolName[0] !== parsed.toolName[0]?.toUpperCase()) {
    return {
      valid: false,
      error: 'Tool names must start with uppercase',
      suggestion: `Use "${String(parsed.toolName).charAt(0).toUpperCase() + String(parsed.toolName).slice(1)}"`
    };
  }

  // Apply custom validation
  const customValidator = getCustomValidator(parsed.toolName);
  if (customValidator && parsed.ruleContent !== undefined) {
    const result = customValidator(parsed.ruleContent);
    if (!result.valid) return result;
  }

  // Validate bash command patterns
  if (usesBashPrefix(parsed.toolName) && parsed.ruleContent !== undefined) {
    const pattern = parsed.ruleContent;

    // Check :* pattern
    if (pattern.includes(':*') && !pattern.endsWith(':*')) {
      return {
        valid: false,
        error: 'The :* pattern must be at the end',
        suggestion: 'Move :* to the end for prefix matching'
      };
    }

    // Check wildcards in middle
    if (pattern.includes(' * ') && !pattern.endsWith(':*')) {
      return {
        valid: false,
        error: 'Wildcards in the middle of commands are not supported',
        suggestion: 'Use prefix matching with ":*" or specify exact commands',
        examples: ['git:*', 'npm install', 'docker build:*']
      };
    }

    // Check empty prefix
    if (pattern === ':*') {
      return {
        valid: false,
        error: 'Prefix cannot be empty before :*',
        suggestion: 'Specify a command prefix before :*'
      };
    }

    // Check quote matching
    const quotes = ['"', "'"];
    for (const quote of quotes) {
      if ((pattern.match(new RegExp(quote, 'g')) || []).length % 2 !== 0) {
        return {
          valid: false,
          error: `Unmatched ${quote} quote`,
          suggestion: 'Ensure all quotes are properly paired'
        };
      }
    }

    // Check single asterisk
    if (pattern === '*') {
      return {
        valid: false,
        error: 'Cannot use "*" alone',
        suggestion: 'Remove the parentheses or specify a command pattern'
      };
    }

    // Check invalid * usage
    const asteriskIndex = pattern.indexOf('*');
    if (asteriskIndex !== -1 && !pattern.includes('/') && !pattern.endsWith(':*')) {
      return {
        valid: false,
        error: 'Use ":*" for prefix matching, not just "*"',
        suggestion: `Use "${pattern.replace('*', ':*')}" for prefix matching`
      };
    }
  }

  // Validate file patterns
  if (isFileTool(parsed.toolName) && parsed.ruleContent !== undefined) {
    const pattern = parsed.ruleContent;

    // Check :* in file patterns
    if (pattern.includes(':*')) {
      return {
        valid: false,
        error: 'File patterns do not support ":*" syntax',
        suggestion: 'Use standard glob patterns like "*.js" or "**/*.ts"',
        examples: ['*.js', '**/*.ts', '/path/to/file.txt']
      };
    }

    // Check wildcard placement
    if (pattern.includes('*') &&
        !pattern.match(/^\*|\*$|\*\*|\/\*|\*\.|\*\)/) &&
        !pattern.includes('**')) {
      return {
        valid: false,
        error: 'Wildcard placement might be incorrect',
        suggestion: 'Wildcards are typically used at path boundaries',
        examples: ['*.js', 'src/**/*.ts', '/path/*/file.txt']
      };
    }
  }

  return { valid: true };
}

/**
 * Format validation error
 * Original: lines 950-955
 */
function formatValidationError(ruleString) {
  const validation = validatePermissionRule(ruleString);

  if (!validation.valid) {
    let errorMsg = validation.error || 'Invalid permission rule';

    if (validation.suggestion) {
      errorMsg += `. ${validation.suggestion}`;
    }

    if (validation.examples && validation.examples.length > 0) {
      errorMsg += `. Examples: ${validation.examples.join(', ')}`;
    }

    return errorMsg;
  }

  return null;
}

// Network Validation
// Original: lines 956-999

/**
 * Validate port number
 * Original: Y10
 */
function validatePort(portStr) {
  if (!/^\d+$/.test(portStr)) {
    throw new Error('Port must be numeric');
  }

  const port = parseInt(portStr, 10);
  if (port < 1 || port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }

  return port;
}

/**
 * Parse IPv6 address
 * Original: vC9
 */
function parseIPv6Address(address) {
  if (isIP(address) === 6 && !address.includes('[') && !address.includes(']')) {
    return { host: address, port: undefined };
  }
  throw new Error('Invalid IPv6 address');
}

/**
 * Parse IPv6 with port
 * Original: bC9
 */
function parseIPv6WithPort(addressStr) {
  const match = addressStr.match(/^\[([^\]]+)\]:(\d+)$/);
  if (!match) {
    throw new Error('Invalid IPv6 address format');
  }

  const host = match[1];
  const portStr = match[2];

  if (isIP(host) !== 6) {
    throw new Error('Invalid IPv6 address in bracket notation');
  }

  const port = validatePort(portStr);
  return { host, port };
}

/**
 * Parse IPv4 address
 * Original: fC9
 */
function parseIPv4Address(address) {
  if (isIP(address) === 4) {
    return { host: address, port: undefined };
  }
  throw new Error('Invalid IPv4 address');
}

/**
 * Parse IPv4 with port
 * Original: hC9
 */
function parseIPv4WithPort(addressStr) {
  const match = addressStr.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
  if (!match) {
    throw new Error('Invalid IPv4:port format');
  }

  const host = match[1];
  const portStr = match[2];

  if (isIP(host) !== 4) {
    throw new Error('Invalid IPv4 address');
  }

  const port = validatePort(portStr);
  return { host, port };
}

/**
 * Check if string is valid hostname
 * Original: line 999
 */
function isValidHostname(str) {
  if (str.length === 0 ||
      str.includes(':') ||
      str.includes('/') ||
      str.includes('?') ||
      str.includes('#') ||
      isIP(str)) {
    return false;
  }
  return true;
}

// Placeholder functions - would need to be imported
function getHomeDirectory() { return process.env.HOME || ''; }
function getCurrentWorkingDirectory() { return process.cwd(); }
function getUserConfigPath() { return '~/.claude/config.json'; }
function getEnterpriseConfigPath() { return '/etc/claude/config.json'; }
function getLocalConfig() { return {}; }

export {
  // MCP functions
  hasMcpServer,
  sanitizeMcpServerName,
  getMcpToolsForServer,
  getNonMcpTools,
  removeMcpPrefix,
  createMcpPrefix,
  isMcpTool,
  parseMcpToolName,
  stripMcpPrefix,
  cleanMcpToolDisplayName,

  // Scope functions
  getPermissionScopeDisplayName,
  getPermissionScopeType,
  validatePermissionScope,
  getTransportType,
  parseHttpHeaders,
  getMcpServerApprovalStatus,

  // Rule functions
  parsePermissionRule,
  formatPermissionRule,
  getAllowRules,
  getAllowedPatternsForTool,
  formatPermissionDecisionMessage,
  getDenyRules,
  getAskRules,
  ruleMatchesTool,
  findAllowRuleForTool,
  findDenyRuleForTool,
  findAskRuleForTool,
  getRulesByBehaviorForTool,

  // Validation functions
  isFileTool,
  usesBashPrefix,
  getCustomValidator,
  validatePermissionRule,
  formatValidationError,

  // Network functions
  validatePort,
  parseIPv6Address,
  parseIPv6WithPort,
  parseIPv4Address,
  parseIPv4WithPort,
  isValidHostname,

  // Constants
  PERMISSION_SOURCES,
  HOOK_TYPES,
  PERMISSION_VALIDATION_CONFIG
};