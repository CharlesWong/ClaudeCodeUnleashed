/**
 * Claude Code Tools Index
 *
 * Central export point for all Claude Code tools.
 * Provides access to all 10+ major tools and utilities.
 *
 * Complete tool suite for Claude Code CLI v1.0.115
 * Part of the 98% → 100% extraction phase
 */

// Import all tools from actual files
import { BashTool } from './bash.js';
import { EditTool, MultiEditTool } from './edit.js';
import { ReadTool } from './read.js';
import { WriteTool } from './write.js';
import { GrepTool } from './grep.js';
import { TaskTool } from './task.js';
import { WebSearchTool } from './web-search.js';
import { WebFetchTool } from './web-fetch.js';
import { NotebookEditTool } from './notebook-edit.js';
import { BashOutputTool, KillShellTool } from './shell-management.js';

/**
 * Tool Registry
 * Manages all available tools
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.aliases = new Map();
    this.categories = new Map();

    this.registerAllTools();
  }

  /**
   * Register all built-in tools
   */
  registerAllTools() {
    // File System Tools
    this.register('Read', ReadTool, 'filesystem');
    this.register('Write', WriteTool, 'filesystem');
    this.register('Edit', EditTool, 'filesystem');
    this.register('MultiEdit', MultiEditTool, 'filesystem');
    this.register('NotebookEdit', NotebookEditTool, 'filesystem');

    // Search Tools
    this.register('Grep', GrepTool, 'search');

    // Execution Tools
    this.register('Bash', BashTool, 'execution');
    this.register('BashOutput', BashOutputTool, 'execution');
    this.register('KillShell', KillShellTool, 'execution');

    // Web Tools
    this.register('WebSearch', WebSearchTool, 'web');
    this.register('WebFetch', WebFetchTool, 'web');

    // Task Management Tools
    this.register('Task', TaskTool, 'task');

    // Register aliases for backwards compatibility
    this.alias('str_replace', 'Edit');
    this.alias('str_replace_based_edit', 'MultiEdit');
    this.alias('search', 'Grep');
    this.alias('run_command', 'Bash');
    this.alias('execute', 'Bash');
    this.alias('file_read', 'Read');
    this.alias('file_write', 'Write');
  }

  /**
   * Register a tool
   */
  register(name, toolClass, category = 'general') {
    this.tools.set(name, {
      name,
      class: toolClass,
      category,
      enabled: true
    });

    // Update category mapping
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(name);
  }

  /**
   * Create an alias for a tool
   */
  alias(aliasName, toolName) {
    this.aliases.set(aliasName, toolName);
  }

  /**
   * Get a tool by name
   */
  get(name) {
    // Check for alias first
    const actualName = this.aliases.get(name) || name;
    const tool = this.tools.get(actualName);

    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    return tool;
  }

  /**
   * Create tool instance
   */
  create(name, options = {}) {
    const tool = this.get(name);

    if (!tool.enabled) {
      throw new Error(`Tool is disabled: ${name}`);
    }

    return new tool.class(options);
  }

  /**
   * List all tools
   */
  list() {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by category
   */
  listByCategory(category) {
    return this.categories.get(category) || [];
  }

  /**
   * Enable a tool
   */
  enable(name) {
    const tool = this.get(name);
    tool.enabled = true;
  }

  /**
   * Disable a tool
   */
  disable(name) {
    const tool = this.get(name);
    tool.enabled = false;
  }

  /**
   * Check if tool is enabled
   */
  isEnabled(name) {
    try {
      const tool = this.get(name);
      return tool.enabled;
    } catch {
      return false;
    }
  }

  /**
   * Get tool metadata
   */
  getMetadata(name) {
    const tool = this.get(name);
    const instance = new tool.class();

    return {
      name: tool.name,
      category: tool.category,
      enabled: tool.enabled,
      description: instance.description || '',
      parameters: instance.parameters || {},
      examples: instance.examples || []
    };
  }
}

/**
 * Tool Executor
 * Executes tools with permission checks
 */
export class ToolExecutor {
  constructor(options = {}) {
    this.registry = options.registry || new ToolRegistry();
    this.permissionSystem = options.permissionSystem;
    this.hooks = options.hooks;
    this.logger = options.logger;
  }

  /**
   * Execute a tool
   */
  async execute(toolName, parameters, context = {}) {
    // Log execution start
    this.log('info', `Executing tool: ${toolName}`, { parameters });

    try {
      // Get tool
      const tool = this.registry.create(toolName, context);

      // Check permissions
      if (this.permissionSystem) {
        const permitted = await this.permissionSystem.checkTool(toolName, parameters);
        if (!permitted) {
          throw new Error(`Permission denied for tool: ${toolName}`);
        }
      }

      // Pre-execution hook
      if (this.hooks) {
        await this.hooks.trigger('tool:pre', { tool: toolName, parameters });
      }

      // Validate parameters
      if (tool.validate) {
        const validation = await tool.validate(parameters);
        if (!validation.valid) {
          throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
        }
      }

      // Execute tool
      const result = await tool.execute(parameters);

      // Post-execution hook
      if (this.hooks) {
        await this.hooks.trigger('tool:post', { tool: toolName, parameters, result });
      }

      // Log success
      this.log('info', `Tool executed successfully: ${toolName}`);

      return result;

    } catch (error) {
      // Log error
      this.log('error', `Tool execution failed: ${toolName}`, { error: error.message });

      // Error hook
      if (this.hooks) {
        await this.hooks.trigger('tool:error', { tool: toolName, parameters, error });
      }

      throw error;
    }
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeParallel(executions) {
    const promises = executions.map(({ tool, parameters, context }) =>
      this.execute(tool, parameters, context)
    );

    return Promise.all(promises);
  }

  /**
   * Execute tools in sequence
   */
  async executeSequence(executions) {
    const results = [];

    for (const { tool, parameters, context } of executions) {
      const result = await this.execute(tool, parameters, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Log helper
   */
  log(level, message, meta = {}) {
    if (this.logger) {
      this.logger[level](message, meta);
    }
  }
}

/**
 * Tool Validator
 * Validates tool parameters
 */
export class ToolValidator {
  /**
   * Validate required parameters
   */
  static validateRequired(parameters, required) {
    const missing = required.filter(param => !(param in parameters));

    if (missing.length > 0) {
      return {
        valid: false,
        errors: missing.map(param => `Missing required parameter: ${param}`)
      };
    }

    return { valid: true };
  }

  /**
   * Validate parameter types
   */
  static validateTypes(parameters, schema) {
    const errors = [];

    for (const [key, value] of Object.entries(parameters)) {
      if (schema[key]) {
        const expectedType = schema[key].type;
        const actualType = typeof value;

        if (expectedType && actualType !== expectedType) {
          errors.push(`Parameter "${key}" must be of type ${expectedType}, got ${actualType}`);
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Validate parameter patterns
   */
  static validatePatterns(parameters, patterns) {
    const errors = [];

    for (const [key, pattern] of Object.entries(patterns)) {
      if (parameters[key] && !pattern.test(parameters[key])) {
        errors.push(`Parameter "${key}" does not match required pattern`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Validate file paths
   */
  static validatePaths(paths) {
    const errors = [];

    for (const path of paths) {
      if (path.includes('..')) {
        errors.push(`Path traversal detected in: ${path}`);
      }

      if (path.startsWith('/etc/') || path.startsWith('/sys/')) {
        errors.push(`Access to system path denied: ${path}`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  }
}

// Export all tools individually
export {
  BashTool,
  EditTool,
  MultiEditTool,
  ReadTool,
  WriteTool,
  GrepTool,
  TaskTool,
  WebSearchTool,
  WebFetchTool,
  NotebookEditTool,
  BashOutputTool,
  KillShellTool
};

// Export default registry and executor
export const toolRegistry = new ToolRegistry();
export const toolExecutor = new ToolExecutor({ registry: toolRegistry });

// Default export
export default {
  registry: toolRegistry,
  executor: toolExecutor,
  validator: ToolValidator,
  tools: {
    Bash: BashTool,
    Edit: EditTool,
    MultiEdit: MultiEditTool,
    Read: ReadTool,
    Write: WriteTool,
    Grep: GrepTool,
    Task: TaskTool,
    WebSearch: WebSearchTool,
    WebFetch: WebFetchTool,
    NotebookEdit: NotebookEditTool,
    BashOutput: BashOutputTool,
    KillShell: KillShellTool
  }
};