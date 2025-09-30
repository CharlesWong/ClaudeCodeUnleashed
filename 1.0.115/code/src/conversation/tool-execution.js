/**
 * Tool Execution Module
 * Handle safe execution of tools with permission checking
 */

import { EventEmitter } from 'events';

const TOOL_TIMEOUT = 120000; // 2 minutes default
const MAX_CONCURRENT_TOOLS = 5;

class ToolExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.tools = new Map();
    this.executingTools = new Map();
    this.concurrentCount = 0;
    this.maxConcurrent = options.maxConcurrent || MAX_CONCURRENT_TOOLS;
    this.defaultTimeout = options.timeout || TOOL_TIMEOUT;
    this.permissionMode = options.permissionMode || 'ask';
  }

  /**
   * Register a tool
   */
  registerTool(tool) {
    if (!tool.name) {
      throw new Error('Tool must have a name');
    }

    this.tools.set(tool.name, tool);
    this.emit('tool:registered', { tool: tool.name });
  }

  /**
   * Register multiple tools
   */
  registerTools(tools) {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Execute a tool use
   */
  async performToolUse(toolUse, context) {
    const { id, name, input } = toolUse;

    // Check if tool exists
    const tool = this.tools.get(name);
    if (!tool) {
      return this.createErrorResult(id, `Unknown tool: ${name}`);
    }

    // Check if tool is enabled
    if (tool.isEnabled && !tool.isEnabled()) {
      return this.createErrorResult(id, `Tool ${name} is not enabled`);
    }

    // Track execution
    this.executingTools.set(id, {
      name,
      startTime: Date.now(),
      status: 'checking'
    });

    try {
      // Check permissions
      const permission = await this.checkPermission(tool, input, context);
      if (permission.behavior !== 'allow') {
        return this.createDeniedResult(id, permission);
      }

      // Validate input
      if (tool.validateInput) {
        const validation = await tool.validateInput(
          permission.updatedInput || input,
          context
        );

        if (!validation.result) {
          return this.createErrorResult(
            id,
            validation.errorMessage || 'Input validation failed'
          );
        }
      }

      // Check concurrency
      if (!tool.isConcurrencySafe || !tool.isConcurrencySafe()) {
        await this.waitForConcurrencySlot();
      }

      // Update status
      this.executingTools.get(id).status = 'executing';
      this.concurrentCount++;

      // Execute tool
      const result = await this.executeTool(
        tool,
        permission.updatedInput || input,
        context
      );

      // Map result
      return this.mapToolResult(tool, result, id);

    } catch (error) {
      this.emit('tool:error', { tool: name, error });
      return this.createErrorResult(id, error.message);

    } finally {
      this.concurrentCount--;
      this.executingTools.delete(id);
    }
  }

  /**
   * Execute the tool with timeout
   */
  async executeTool(tool, input, context) {
    const timeout = tool.timeout || this.defaultTimeout;

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);
    });

    // Create abort controller for tool
    const toolContext = {
      ...context,
      abortController: context.abortController || new AbortController()
    };

    // Execute tool
    const toolPromise = this.runTool(tool, input, toolContext);

    // Race between tool execution and timeout
    return await Promise.race([toolPromise, timeoutPromise]);
  }

  /**
   * Run the tool
   */
  async runTool(tool, input, context) {
    // Handle generator tools
    if (tool.call && tool.call.constructor.name === 'AsyncGeneratorFunction') {
      const results = [];

      for await (const result of tool.call(input, context)) {
        if (result.type === 'progress') {
          this.emit('tool:progress', {
            tool: tool.name,
            data: result.data
          });
        } else if (result.type === 'result') {
          results.push(result.data);
        }
      }

      // Return last result
      return results[results.length - 1];
    }

    // Handle async tools
    if (tool.call) {
      return await tool.call(input, context);
    }

    // Handle sync tools
    if (tool.execute) {
      return tool.execute(input, context);
    }

    throw new Error('Tool has no execution method');
  }

  /**
   * Check permission to use tool
   */
  async checkPermission(tool, input, context) {
    // Use tool's own permission check if available
    if (tool.checkPermissions) {
      return await tool.checkPermissions(input, context);
    }

    // Apply default permission logic
    switch (this.permissionMode) {
      case 'allow':
        return { behavior: 'allow', updatedInput: input };

      case 'deny':
        return {
          behavior: 'deny',
          decisionReason: { type: 'policy', reason: 'All tools denied by policy' }
        };

      case 'ask':
      default:
        return await this.askPermission(tool, input, context);
    }
  }

  /**
   * Ask for permission interactively
   */
  async askPermission(tool, input, context) {
    // Check if tool is in always-allow list
    if (context.toolPermissionContext?.alwaysAllowRules) {
      const rules = context.toolPermissionContext.alwaysAllowRules;
      if (rules[tool.name]) {
        return { behavior: 'allow', updatedInput: input };
      }
    }

    // Check if tool is in always-deny list
    if (context.toolPermissionContext?.alwaysDenyRules) {
      const rules = context.toolPermissionContext.alwaysDenyRules;
      if (rules[tool.name]) {
        return {
          behavior: 'deny',
          decisionReason: { type: 'rule', reason: 'Tool denied by rule' }
        };
      }
    }

    // Emit permission request event
    return new Promise((resolve) => {
      this.emit('permission:request', {
        tool: tool.name,
        input,
        callback: (decision) => {
          resolve(decision);
        }
      });

      // Default timeout for permission request
      setTimeout(() => {
        resolve({
          behavior: 'deny',
          decisionReason: { type: 'timeout', reason: 'Permission request timed out' }
        });
      }, 30000);
    });
  }

  /**
   * Wait for concurrency slot
   */
  async waitForConcurrencySlot() {
    while (this.concurrentCount >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Map tool result to standard format
   */
  mapToolResult(tool, result, toolUseId) {
    if (tool.mapToolResultToToolResultBlockParam) {
      return tool.mapToolResultToToolResultBlockParam(result, toolUseId);
    }

    // Default mapping
    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: typeof result === 'string' ? result : JSON.stringify(result),
      is_error: false
    };
  }

  /**
   * Create error result
   */
  createErrorResult(toolUseId, message) {
    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: `Error: ${message}`,
      is_error: true
    };
  }

  /**
   * Create denied result
   */
  createDeniedResult(toolUseId, permission) {
    const reason = permission.decisionReason?.reason || 'Permission denied';
    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: `Tool use denied: ${reason}`,
      is_error: true
    };
  }

  /**
   * Get executing tools
   */
  getExecutingTools() {
    return Array.from(this.executingTools.entries()).map(([id, info]) => ({
      id,
      ...info,
      duration: Date.now() - info.startTime
    }));
  }

  /**
   * Cancel tool execution
   */
  cancelTool(toolUseId) {
    const execution = this.executingTools.get(toolUseId);
    if (execution && execution.abortController) {
      execution.abortController.abort();
      this.executingTools.delete(toolUseId);
      this.concurrentCount--;
      return true;
    }
    return false;
  }

  /**
   * Cancel all tools
   */
  cancelAll() {
    for (const [id, execution] of this.executingTools) {
      if (execution.abortController) {
        execution.abortController.abort();
      }
    }
    this.executingTools.clear();
    this.concurrentCount = 0;
  }
}

// Singleton instance
let toolExecutor = null;

/**
 * Get or create tool executor
 */
export function getToolExecutor(options) {
  if (!toolExecutor) {
    toolExecutor = new ToolExecutor(options);
  }
  return toolExecutor;
}

/**
 * Perform tool use with default executor
 */
export async function performToolUse(toolUse, context, options) {
  const executor = getToolExecutor(options);
  return await executor.performToolUse(toolUse, context);
}

/**
 * Register tools with default executor
 */
export function registerTools(tools, options) {
  const executor = getToolExecutor(options);
  executor.registerTools(tools);
}

/**
 * Check if tool is safe to execute concurrently
 */
export function isConcurrencySafe(toolName) {
  const executor = getToolExecutor();
  const tool = executor.tools.get(toolName);
  return tool?.isConcurrencySafe ? tool.isConcurrencySafe() : false;
}

export {
  ToolExecutor,
  TOOL_TIMEOUT,
  MAX_CONCURRENT_TOOLS
};