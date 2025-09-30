/**
 * Hook System Implementation
 * Complete hook system for pre/post tool execution and lifecycle events
 * Extracted from lines 8100-8800 of original file
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { z } from 'zod';

// Hook Event Types
const HOOK_EVENTS = {
  PRE_TOOL_USE: 'PreToolUse',
  POST_TOOL_USE: 'PostToolUse',
  USER_PROMPT_SUBMIT: 'UserPromptSubmit',
  SESSION_START: 'SessionStart',
  SESSION_END: 'SessionEnd',
  PRE_COMPACT: 'PreCompact',
  NOTIFICATION: 'Notification',
  STOP: 'Stop'
};

// Hook timeout default
const DEFAULT_HOOK_TIMEOUT = 60000; // 60 seconds

// Hook response schemas
const AsyncHookResponse = z.object({
  async: z.literal(true),
  asyncTimeout: z.number().optional()
});

const SyncHookResponse = z.object({
  continue: z.boolean().optional(),
  suppressOutput: z.boolean().optional(),
  decision: z.enum(['approve', 'block']).optional(),
  reason: z.string().optional(),
  systemMessage: z.string().optional(),
  additionalContext: z.string().optional(),
  hookSpecificOutput: z.union([
    z.object({
      hookEventName: z.literal('PreToolUse'),
      permissionDecision: z.enum(['allow', 'deny', 'ask']).optional(),
      permissionDecisionReason: z.string().optional()
    }),
    z.object({
      hookEventName: z.literal('UserPromptSubmit'),
      additionalContext: z.string().optional()
    }),
    z.object({
      hookEventName: z.literal('SessionStart'),
      additionalContext: z.string().optional()
    }),
    z.object({
      hookEventName: z.literal('PostToolUse'),
      additionalContext: z.string().optional()
    })
  ]).optional()
});

const HookResponse = z.union([AsyncHookResponse, SyncHookResponse]);

// Hook registry
const asyncHookRegistry = new Map();
let hookConfiguration = null;
let sessionHooks = null;

/**
 * Load hook configuration from settings
 * Original: function l00()
 */
function loadHookConfiguration() {
  const config = getGlobalConfig() || {};
  hookConfiguration = normalizeHookConfig(config.hooks);
}

/**
 * Update hook configuration
 * Original: function U61()
 */
function updateHookConfiguration() {
  const config = getGlobalConfig() || {};
  hookConfiguration = normalizeHookConfig(config.hooks);
}

/**
 * Set session hooks
 * Original: function S$1(A)
 */
function setSessionHooks(hooks) {
  sessionHooks = hooks;
}

/**
 * Get session hooks
 * Original: function y$1()
 */
function getSessionHooks() {
  return sessionHooks;
}

/**
 * Normalize hook configuration
 * Original: function c00(arg)
 */
function normalizeHookConfig(hooks) {
  if (!hooks) return null;

  const normalized = {};
  const eventKeys = Object.keys(hooks).sort();

  for (const event of eventKeys) {
    const eventHooks = hooks[event];
    if (!eventHooks) continue;

    // Sort hooks by matcher
    const sorted = [...eventHooks].sort((a, b) => {
      const matcherA = a.matcher || '';
      const matcherB = b.matcher || '';
      return matcherA.localeCompare(matcherB);
    });

    normalized[event] = sorted.map(hook => ({
      matcher: hook.matcher,
      hooks: [...hook.hooks].sort((a, b) =>
        a.command.localeCompare(b.command)
      )
    }));
  }

  return normalized;
}

/**
 * Get hook configuration changes
 * Original: function BLA()
 */
function getHookConfigurationChanges() {
  if (hookConfiguration === null) return null;

  const config = getGlobalConfig() || {};
  const newConfig = normalizeHookConfig(config.hooks);

  if (JSON.stringify(hookConfiguration) === JSON.stringify(newConfig)) {
    return null;
  }

  const changes = [];
  const oldEvents = new Set(Object.keys(hookConfiguration || {}));
  const newEvents = new Set(Object.keys(newConfig || {}));

  // Check for added events
  for (const event of newEvents) {
    if (!oldEvents.has(event)) {
      changes.push(`Added hooks for event: ${event}`);
    }
  }

  // Check for removed events
  for (const event of oldEvents) {
    if (!newEvents.has(event)) {
      changes.push(`Removed all hooks for event: ${event}`);
    }
  }

  // Check for modified events
  for (const event of oldEvents) {
    if (newEvents.has(event)) {
      const oldHooks = hookConfiguration?.[event] || [];
      const newHooks = newConfig?.[event] || [];

      if (JSON.stringify(oldHooks) !== JSON.stringify(newHooks)) {
        changes.push(`Modified hooks for event: ${event}`);
      }
    }
  }

  return changes.length > 0 ? changes.join('\n') : null;
}

/**
 * Register async hook
 * Original: function GLA
 */
function registerAsyncHook(processId, hookName, command, eventType, toolName, response) {
  const timeout = response.asyncTimeout || 15000;

  console.log(`Hooks: Registering async hook ${processId} (${hookName}) with timeout ${timeout}ms`);

  asyncHookRegistry.set(processId, {
    processId,
    hookName,
    hookEvent: eventType,
    toolName,
    command,
    startTime: Date.now(),
    timeout,
    stdout: '',
    responseAttachmentSent: false
  });
}

/**
 * Add output to async hook
 * Original: function YLA(arg, options)
 */
function addAsyncHookOutput(processId, output) {
  const hook = asyncHookRegistry.get(processId);

  if (hook) {
    hook.stdout += output;
  } else {
    console.log(`Hooks: Attempted to add output to unknown process ${processId}`);
  }
}

/**
 * Check for new async hook responses
 * Original: function ILA()
 */
function checkForNewAsyncResponses() {
  console.log('Hooks: checkForNewResponses called');

  const responses = [];
  const totalHooks = asyncHookRegistry.size;

  console.log(`Hooks: Found ${totalHooks} total hooks in registry`);

  for (const [processId, hook] of asyncHookRegistry) {
    // Skip if already sent or no output
    if (hook.responseAttachmentSent || !hook.stdout.trim()) {
      continue;
    }

    // Check for timeout
    if (Date.now() - hook.startTime > hook.timeout) {
      console.log(`Hooks: Hook ${processId} timed out`);
      hook.responseAttachmentSent = true;
      continue;
    }

    // Parse stdout for JSON responses
    const lines = hook.stdout.split('\n');

    for (const line of lines) {
      if (line.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(line);

          if (!('async' in parsed)) {
            responses.push({
              processId: hook.processId,
              response: parsed,
              hookName: hook.hookName,
              hookEvent: hook.hookEvent,
              toolName: hook.toolName
            });

            hook.responseAttachmentSent = true;
            break;
          }
        } catch {
          // Not valid JSON, continue
        }
      }
    }
  }

  console.log(`Hooks: checkForNewResponses returning ${responses.length} responses`);
  return responses;
}

/**
 * Clean delivered async hooks
 * Original: function WLA(arg)
 */
function cleanDeliveredAsyncHooks(processIds) {
  for (const processId of processIds) {
    const hook = asyncHookRegistry.get(processId);

    if (hook && hook.responseAttachmentSent) {
      console.log(`Hooks: Removing delivered hook ${processId}`);
      asyncHookRegistry.delete(processId);
    }
  }
}

/**
 * Check if hook response is async
 * Original: function $61(A)
 */
function isAsyncHookResponse(response) {
  return 'async' in response && response.async === true;
}

/**
 * Check if hook response is sync
 * Original: function ZLA(arg)
 */
function isSyncHookResponse(response) {
  return !('async' in response && response.async === true);
}

/**
 * Match hook pattern
 * Original: function SN9(arg, options)
 */
function matchesHookPattern(value, pattern) {
  if (!pattern || pattern === '*') return true;

  // Simple string match
  if (/^[a-zA-Z0-9_|]+$/.test(pattern)) {
    if (pattern.includes('|')) {
      return pattern
        .split('|')
        .map(p => p.trim())
        .includes(value);
    }
    return value === pattern;
  }

  // Regex match
  try {
    return new RegExp(pattern).test(value);
  } catch {
    console.log(`Invalid regex pattern in hook matcher: ${pattern}`);
    return false;
  }
}

/**
 * Get all configured hooks
 * Original: function yN9()
 */
function getAllConfiguredHooks() {
  const hooks = {};

  // Load from configuration
  const configHooks = getLoadedHookConfiguration();
  if (configHooks) {
    for (const [event, eventHooks] of Object.entries(configHooks)) {
      hooks[event] = eventHooks.map(h => ({
        matcher: h.matcher,
        hooks: h.hooks
      }));
    }
  }

  // Add session hooks
  const session = getSessionHooks();
  if (session) {
    for (const [event, eventHooks] of Object.entries(session)) {
      if (!hooks[event]) hooks[event] = [];

      for (const hook of eventHooks) {
        hooks[event].push({
          matcher: hook.matcher,
          hooks: hook.hooks
        });
      }
    }
  }

  return hooks;
}

/**
 * Get loaded hook configuration
 * Original: function QLA()
 */
function getLoadedHookConfiguration() {
  if (hookConfiguration === null) {
    loadHookConfiguration();
  }
  return hookConfiguration;
}

/**
 * Find matching hooks for event
 * Original: function FLA(arg, options)
 */
function findMatchingHooks(eventType, context) {
  try {
    const allHooks = getAllConfiguredHooks();
    const eventHooks = allHooks[eventType];

    if (!eventHooks || eventHooks.length === 0) {
      return [];
    }

    // Determine match value based on event type
    let matchValue;
    switch (context.hook_event_name) {
      case 'PreToolUse':
      case 'PostToolUse':
        matchValue = context.tool_name;
        break;
      case 'SessionStart':
        matchValue = context.source;
        break;
      case 'PreCompact':
        matchValue = context.trigger;
        break;
      default:
        break;
    }

    // Filter hooks by matcher
    let matchedHooks;
    if (!matchValue) {
      matchedHooks = eventHooks.flatMap(h => h.hooks);
    } else {
      matchedHooks = eventHooks
        .filter(h => !h.matcher || matchesHookPattern(matchValue, h.matcher))
        .flatMap(h => h.hooks);
    }

    // Deduplicate command hooks
    const uniqueCommands = Array.from(
      new Map(
        matchedHooks
          .filter(h => h.type === 'command')
          .map(h => [h.command, h])
      ).values()
    );

    const callbacks = matchedHooks.filter(h => h.type === 'callback');

    const allUniqueHooks = [...uniqueCommands, ...callbacks];

    console.log(
      `Matched ${allUniqueHooks.length} unique hooks for query "${matchValue || 'no match query'}" ` +
      `(${matchedHooks.length} before deduplication)`
    );

    return allUniqueHooks;
  } catch (error) {
    console.error('Error finding matching hooks:', error);
    return [];
  }
}

/**
 * Parse hook output
 * Original: function JLA(arg)
 */
function parseHookOutput(output) {
  const trimmed = output.trim();

  if (!trimmed.startsWith('{')) {
    console.log('Hook output does not start with {, treating as plain text');
    return { plainText: output };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const validation = HookResponse.safeParse(parsed);

    if (validation.success) {
      return { json: validation.data };
    } else {
      const error = `Hook JSON output validation failed:\n${
        validation.error.issues
          .map(i => `- ${i.path.join('.')}: ${i.message}`)
          .join('\n')
      }`;

      console.log(error);
      return { plainText: output, validationError: error };
    }
  } catch (error) {
    return {
      plainText: output,
      validationError: `JSON parse error: ${error.message}`
    };
  }
}

/**
 * Process hook response
 * Original: function XLA(arg, options, callback)
 */
function processHookResponse(response, command, eventType) {
  const result = {};

  if (isAsyncHookResponse(response)) {
    return result;
  }

  // Handle sync response
  if (response.continue === false) {
    result.preventContinuation = true;
    if (response.stopReason) {
      result.stopReason = response.stopReason;
    }
  }

  // Handle decision
  if (response.decision) {
    switch (response.decision) {
      case 'approve':
        result.permissionBehavior = 'allow';
        break;
      case 'block':
        result.permissionBehavior = 'deny';
        result.blockingError = {
          blockingError: response.reason || 'Blocked by hook',
          command
        };
        break;
    }
  }

  // Handle system message
  if (response.systemMessage) {
    result.systemMessage = response.systemMessage;
  }

  // Handle additional context
  if (response.additionalContext) {
    result.additionalContext = response.additionalContext;
  }

  // Handle hook-specific output
  if (response.hookSpecificOutput) {
    switch (response.hookSpecificOutput.hookEventName) {
      case 'PreToolUse':
        if (response.hookSpecificOutput.permissionDecision) {
          switch (response.hookSpecificOutput.permissionDecision) {
            case 'allow':
              result.permissionBehavior = 'allow';
              break;
            case 'deny':
              result.permissionBehavior = 'deny';
              result.blockingError = {
                blockingError:
                  response.hookSpecificOutput.permissionDecisionReason ||
                  response.reason ||
                  'Blocked by hook',
                command
              };
              break;
            case 'ask':
              result.permissionBehavior = 'ask';
              break;
          }
        }
        if (response.hookSpecificOutput.permissionDecisionReason) {
          result.hookPermissionDecisionReason =
            response.hookSpecificOutput.permissionDecisionReason;
        }
        break;

      case 'UserPromptSubmit':
      case 'SessionStart':
      case 'PostToolUse':
        if (response.hookSpecificOutput.additionalContext) {
          result.additionalContext = response.hookSpecificOutput.additionalContext;
        }
        break;
    }
  }

  return result;
}

/**
 * Execute hook command
 * Original: async function i00
 */
async function executeHookCommand(hook, eventName, context, signal) {
  if (signal?.aborted) {
    return { stdout: '', stderr: 'Operation cancelled', status: 1, aborted: true };
  }

  const cwd = process.cwd();
  const command = process.env.CLAUDE_CODE_SHELL_PREFIX ?
    applyShellPrefix(process.env.CLAUDE_CODE_SHELL_PREFIX, hook.command) :
    hook.command;

  const timeout = hook.timeout ? hook.timeout * 1000 : 60000;

  // Spawn process
  const proc = spawn(command, [], {
    shell: true,
    cwd,
    env: process.env,
    signal
  });

  let stdout = '';
  let stderr = '';

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');

  proc.stdout.on('data', (data) => {
    stdout += data;
  });

  proc.stderr.on('data', (data) => {
    stderr += data;
  });

  // Write context to stdin
  const stdinPromise = new Promise((resolve, reject) => {
    proc.stdin.write(JSON.stringify(context), (err) => {
      if (err) reject(err);
      else {
        proc.stdin.end();
        resolve();
      }
    });
  });

  // Wait for process to complete
  const closePromise = new Promise((resolve) => {
    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        status: code ?? 1,
        aborted: signal?.aborted
      });
    });
  });

  const errorPromise = new Promise((_, reject) => {
    proc.on('error', reject);
  });

  try {
    await Promise.race([stdinPromise, errorPromise]);
    return await Promise.race([closePromise, errorPromise]);
  } catch (error) {
    if (error.code === 'EPIPE') {
      console.log('EPIPE error while writing to hook stdin');
      return {
        stdout: '',
        stderr: 'Hook command closed stdin before input was fully written (EPIPE)',
        status: 1
      };
    } else if (error.code === 'ABORT_ERR') {
      return {
        stdout: '',
        stderr: 'Hook cancelled',
        status: 1,
        aborted: true
      };
    } else {
      return {
        stdout: '',
        stderr: `Hook error: ${error.message}`,
        status: 1
      };
    }
  }
}

/**
 * Apply shell prefix to command
 * Original: function j$1(A, B)
 */
function applyShellPrefix(prefix, command) {
  const lastDashIndex = prefix.lastIndexOf(' -');
  if (lastDashIndex > 0) {
    // Handle flags in prefix
    const baseCommand = prefix.substring(0, lastDashIndex);
    const flags = prefix.substring(lastDashIndex);
    return `${baseCommand} ${command} ${flags}`;
  }
  return `${prefix} ${command}`;
}

/**
 * Create hook context
 * Original: function FL(arg)
 */
function createHookContext(permissionMode) {
  return {
    session_id: getSessionId(),
    transcript_path: getTranscriptPath(),
    cwd: process.cwd(),
    permission_mode: permissionMode
  };
}

// Helper functions - would need to be imported
function getGlobalConfig() { return {}; }
function getSessionId() { return randomUUID(); }
function getTranscriptPath() { return null; }

export {
  HOOK_EVENTS,
  DEFAULT_HOOK_TIMEOUT,
  loadHookConfiguration,
  updateHookConfiguration,
  setSessionHooks,
  getSessionHooks,
  normalizeHookConfig,
  getHookConfigurationChanges,
  registerAsyncHook,
  addAsyncHookOutput,
  checkForNewAsyncResponses,
  cleanDeliveredAsyncHooks,
  isAsyncHookResponse,
  isSyncHookResponse,
  matchesHookPattern,
  getAllConfiguredHooks,
  getLoadedHookConfiguration,
  findMatchingHooks,
  parseHookOutput,
  processHookResponse,
  executeHookCommand,
  createHookContext
};