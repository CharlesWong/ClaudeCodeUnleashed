# Part 4.1: Tool Registry Architecture - The Foundation of Claude's Abilities

## Overview

The Tool Registry Architecture forms the backbone of Claude Code's ability to interact with the system - reading files, executing commands, searching code, and performing complex operations. This comprehensive analysis explores the sophisticated registration system, permission model, execution pipeline, and the architectural patterns that enable Claude to safely and efficiently perform thousands of operations per session.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tool Registry System](#tool-registry-system)
3. [Tool Executor Pipeline](#tool-executor-pipeline)
4. [Permission & Validation System](#permission--validation-system)
5. [Tool Categories & Organization](#tool-categories--organization)
6. [Execution Flow & State Management](#execution-flow--state-management)
7. [Error Handling & Recovery](#error-handling--recovery)
8. [Real-World Integration](#real-world-integration)

## Architecture Overview

### Core Components

The tool system consists of three primary components working in concert:

```javascript
// 1. Tool Registry - Manages tool registration and discovery
class ToolRegistry {
  constructor() {
    this.tools = new Map();        // Tool definitions
    this.aliases = new Map();       // Alternative names
    this.categories = new Map();    // Organizational groups
  }
}

// 2. Tool Executor - Handles execution with safety checks
class ToolExecutor {
  constructor(options = {}) {
    this.registry = options.registry || new ToolRegistry();
    this.permissionSystem = options.permissionSystem;
    this.hooks = options.hooks;
    this.logger = options.logger;
  }
}

// 3. Tool Validator - Ensures parameter correctness
class ToolValidator {
  static validateRequired(parameters, required) { /* ... */ }
  static validateTypes(parameters, schema) { /* ... */ }
  static validatePatterns(parameters, patterns) { /* ... */ }
  static validatePaths(paths) { /* ... */ }
}
```

### Design Principles

1. **Safety First**: Every tool execution passes through multiple safety checks
2. **Extensibility**: New tools can be added without modifying core code
3. **Observability**: Comprehensive event emission for monitoring
4. **Performance**: Concurrent execution where safe
5. **Consistency**: Uniform interface across all tools

## Tool Registry System

### Registration Architecture

The registry maintains a centralized catalog of all available tools:

```javascript
class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.aliases = new Map();
    this.categories = new Map();

    this.registerAllTools();
  }

  register(name, toolClass, category = 'general') {
    // Store tool metadata
    this.tools.set(name, {
      name,
      class: toolClass,
      category,
      enabled: true
    });

    // Update category mapping for quick lookup
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(name);
  }
}
```

### Built-in Tools Registration

The system registers all tools during initialization:

```javascript
registerAllTools() {
  // File System Tools - Core file operations
  this.register('Read', ReadTool, 'filesystem');
  this.register('Write', WriteTool, 'filesystem');
  this.register('Edit', EditTool, 'filesystem');
  this.register('MultiEdit', MultiEditTool, 'filesystem');
  this.register('NotebookEdit', NotebookEditTool, 'filesystem');

  // Search Tools - Pattern matching and discovery
  this.register('Grep', GrepTool, 'search');

  // Execution Tools - System command execution
  this.register('Bash', BashTool, 'execution');
  this.register('BashOutput', BashOutputTool, 'execution');
  this.register('KillShell', KillShellTool, 'execution');

  // Web Tools - Internet access capabilities
  this.register('WebSearch', WebSearchTool, 'web');
  this.register('WebFetch', WebFetchTool, 'web');

  // Task Management Tools - Complex operation orchestration
  this.register('Task', TaskTool, 'task');

  // Register aliases for backwards compatibility
  this.registerAliases();
}
```

### Alias System

Maintains compatibility with different naming conventions:

```javascript
registerAliases() {
  // Alternative names for tools
  this.alias('str_replace', 'Edit');
  this.alias('str_replace_based_edit', 'MultiEdit');
  this.alias('search', 'Grep');
  this.alias('run_command', 'Bash');
  this.alias('execute', 'Bash');
  this.alias('file_read', 'Read');
  this.alias('file_write', 'Write');
}

alias(aliasName, toolName) {
  this.aliases.set(aliasName, toolName);
}
```

### Tool Discovery

Finding and retrieving tools:

```javascript
get(name) {
  // Check for alias first
  const actualName = this.aliases.get(name) || name;
  const tool = this.tools.get(actualName);

  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  return tool;
}

create(name, options = {}) {
  const tool = this.get(name);

  if (!tool.enabled) {
    throw new Error(`Tool is disabled: ${name}`);
  }

  // Create new instance with options
  return new tool.class(options);
}
```

### Metadata Management

Exposing tool capabilities for introspection:

```javascript
getMetadata(name) {
  const tool = this.get(name);
  const instance = new tool.class();

  return {
    name: tool.name,
    category: tool.category,
    enabled: tool.enabled,
    description: instance.description || '',
    parameters: instance.parameters || {},
    examples: instance.examples || [],
    permissions: instance.requiredPermissions || [],
    concurrencySafe: instance.isConcurrencySafe?.() ?? true,
    readOnly: instance.isReadOnly?.() ?? false
  };
}
```

## Tool Executor Pipeline

### Execution Architecture

The executor manages the complete lifecycle of tool execution:

```javascript
class ToolExecutor {
  async execute(toolName, parameters, context = {}) {
    // Phase 1: Logging and Setup
    this.log('info', `Executing tool: ${toolName}`, { parameters });

    try {
      // Phase 2: Tool Creation
      const tool = this.registry.create(toolName, context);

      // Phase 3: Permission Checking
      if (this.permissionSystem) {
        const permitted = await this.permissionSystem.checkTool(toolName, parameters);
        if (!permitted) {
          throw new Error(`Permission denied for tool: ${toolName}`);
        }
      }

      // Phase 4: Pre-execution Hook
      if (this.hooks) {
        await this.hooks.trigger('tool:pre', { tool: toolName, parameters });
      }

      // Phase 5: Parameter Validation
      if (tool.validate) {
        const validation = await tool.validate(parameters);
        if (!validation.valid) {
          throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
        }
      }

      // Phase 6: Tool Execution
      const result = await tool.execute(parameters);

      // Phase 7: Post-execution Hook
      if (this.hooks) {
        await this.hooks.trigger('tool:post', { tool: toolName, parameters, result });
      }

      // Phase 8: Success Logging
      this.log('info', `Tool executed successfully: ${toolName}`);

      return result;

    } catch (error) {
      // Error handling and recovery
      this.handleExecutionError(error, toolName, parameters);
      throw error;
    }
  }
}
```

### Parallel Execution

Executing multiple tools simultaneously for performance:

```javascript
async executeParallel(executions) {
  // Validate all tools can run in parallel
  const validations = executions.map(({ tool }) => {
    const metadata = this.registry.getMetadata(tool);
    return {
      tool,
      canParallel: metadata.concurrencySafe
    };
  });

  const nonParallel = validations.filter(v => !v.canParallel);
  if (nonParallel.length > 0) {
    throw new Error(`Tools not safe for parallel execution: ${
      nonParallel.map(v => v.tool).join(', ')
    }`);
  }

  // Execute all tools concurrently
  const promises = executions.map(({ tool, parameters, context }) =>
    this.execute(tool, parameters, context)
      .catch(error => ({
        tool,
        error: error.message,
        failed: true
      }))
  );

  const results = await Promise.all(promises);

  // Check for failures
  const failures = results.filter(r => r.failed);
  if (failures.length > 0) {
    this.log('warn', `${failures.length} tools failed in parallel execution`);
  }

  return results;
}
```

### Sequential Execution

Executing tools in a specific order with dependencies:

```javascript
async executeSequence(executions) {
  const results = [];
  const context = { previousResults: [] };

  for (const { tool, parameters, usePreviousResult } of executions) {
    try {
      // Inject previous result if requested
      let executionParams = parameters;
      if (usePreviousResult && results.length > 0) {
        const lastResult = results[results.length - 1];
        executionParams = {
          ...parameters,
          previousResult: lastResult
        };
      }

      // Execute with accumulated context
      const result = await this.execute(tool, executionParams, context);
      results.push(result);

      // Update context for next tool
      context.previousResults.push({
        tool,
        result
      });

    } catch (error) {
      // Decide whether to continue or abort sequence
      if (this.options.abortOnError) {
        throw new Error(`Sequence aborted at ${tool}: ${error.message}`);
      }

      results.push({
        tool,
        error: error.message,
        failed: true
      });
    }
  }

  return results;
}
```

## Permission & Validation System

### Permission Checking

Multi-layered permission system for security:

```javascript
class PermissionSystem {
  constructor(mode = 'ask') {
    this.mode = mode; // 'ask' | 'allow' | 'deny'
    this.alwaysAllowRules = new Map();
    this.alwaysDenyRules = new Map();
    this.userResponses = new Map();
  }

  async checkTool(toolName, parameters) {
    // Check deny rules first (highest priority)
    if (this.checkDenyRules(toolName, parameters)) {
      return {
        allowed: false,
        reason: 'Matches deny rule'
      };
    }

    // Check allow rules
    if (this.checkAllowRules(toolName, parameters)) {
      return {
        allowed: true,
        reason: 'Matches allow rule'
      };
    }

    // Check mode
    if (this.mode === 'deny') {
      return {
        allowed: false,
        reason: 'Default deny mode'
      };
    }

    if (this.mode === 'allow') {
      return {
        allowed: true,
        reason: 'Default allow mode'
      };
    }

    // Mode is 'ask' - prompt user
    return await this.promptUser(toolName, parameters);
  }

  checkDenyRules(toolName, parameters) {
    const rules = this.alwaysDenyRules.get(toolName);
    if (!rules) return false;

    for (const rule of rules) {
      if (this.matchesRule(parameters, rule)) {
        return true;
      }
    }
    return false;
  }

  checkAllowRules(toolName, parameters) {
    const rules = this.alwaysAllowRules.get(toolName);
    if (!rules) return false;

    for (const rule of rules) {
      if (this.matchesRule(parameters, rule)) {
        return true;
      }
    }
    return false;
  }
}
```

### Parameter Validation

Comprehensive validation before tool execution:

```javascript
class ToolValidator {
  /**
   * Validate required parameters are present
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
   * Validate parameter types match schema
   */
  static validateTypes(parameters, schema) {
    const errors = [];

    for (const [key, value] of Object.entries(parameters)) {
      if (schema[key]) {
        const expectedType = schema[key].type;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (expectedType && actualType !== expectedType) {
          errors.push(`Parameter "${key}" must be of type ${expectedType}, got ${actualType}`);
        }

        // Nested validation for objects
        if (expectedType === 'object' && schema[key].properties) {
          const nestedValidation = this.validateTypes(value, schema[key].properties);
          if (!nestedValidation.valid) {
            errors.push(...nestedValidation.errors.map(e => `${key}.${e}`));
          }
        }
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  /**
   * Validate parameter values match patterns
   */
  static validatePatterns(parameters, patterns) {
    const errors = [];

    for (const [key, pattern] of Object.entries(patterns)) {
      if (parameters[key] && !pattern.test(parameters[key])) {
        errors.push(`Parameter "${key}" does not match required pattern: ${pattern}`);
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  /**
   * Validate file paths for security
   */
  static validatePaths(paths) {
    const errors = [];

    for (const path of paths) {
      // Check for path traversal attempts
      if (path.includes('..')) {
        errors.push(`Path traversal detected in: ${path}`);
      }

      // Check for system paths
      const systemPaths = ['/etc/', '/sys/', '/proc/', 'C:\\Windows\\System32'];
      for (const systemPath of systemPaths) {
        if (path.startsWith(systemPath)) {
          errors.push(`Access to system path denied: ${path}`);
        }
      }

      // Check for hidden files (optional)
      if (path.includes('/.') && !this.allowHiddenFiles) {
        errors.push(`Access to hidden file denied: ${path}`);
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }
}
```

## Tool Categories & Organization

### Category System

Tools are organized into logical categories:

```javascript
const TOOL_CATEGORIES = {
  filesystem: {
    name: 'File System',
    description: 'File reading, writing, and manipulation',
    tools: ['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'],
    permissions: ['fs:read', 'fs:write'],
    riskLevel: 'medium'
  },

  search: {
    name: 'Search & Discovery',
    description: 'Code search and pattern matching',
    tools: ['Grep'],
    permissions: ['fs:read'],
    riskLevel: 'low'
  },

  execution: {
    name: 'Command Execution',
    description: 'System command and script execution',
    tools: ['Bash', 'BashOutput', 'KillShell'],
    permissions: ['system:execute'],
    riskLevel: 'high'
  },

  web: {
    name: 'Web Access',
    description: 'Internet search and content fetching',
    tools: ['WebSearch', 'WebFetch'],
    permissions: ['network:read'],
    riskLevel: 'medium'
  },

  task: {
    name: 'Task Management',
    description: 'Complex task orchestration',
    tools: ['Task'],
    permissions: ['task:manage'],
    riskLevel: 'low'
  }
};
```

### Category-based Operations

Operating on tools by category:

```javascript
class CategoryManager {
  listByCategory(category) {
    return this.categories.get(category) || [];
  }

  enableCategory(category) {
    const tools = this.listByCategory(category);
    for (const toolName of tools) {
      this.enable(toolName);
    }
  }

  disableCategory(category) {
    const tools = this.listByCategory(category);
    for (const toolName of tools) {
      this.disable(toolName);
    }
  }

  getCategoryStats(category) {
    const tools = this.listByCategory(category);
    const stats = {
      total: tools.length,
      enabled: 0,
      disabled: 0,
      executions: 0
    };

    for (const toolName of tools) {
      const tool = this.get(toolName);
      if (tool.enabled) stats.enabled++;
      else stats.disabled++;
      stats.executions += tool.executionCount || 0;
    }

    return stats;
  }
}
```

## Execution Flow & State Management

### Tool Execution State

Managing execution state throughout the pipeline:

```javascript
class ExecutionState {
  constructor(toolName, parameters) {
    this.id = generateExecutionId();
    this.toolName = toolName;
    this.parameters = parameters;
    this.startTime = Date.now();
    this.status = 'pending';
    this.phases = [];
    this.result = null;
    this.error = null;
  }

  enterPhase(phase) {
    this.phases.push({
      name: phase,
      enteredAt: Date.now(),
      duration: null
    });
    this.status = `in-${phase}`;
  }

  exitPhase() {
    const currentPhase = this.phases[this.phases.length - 1];
    if (currentPhase && !currentPhase.duration) {
      currentPhase.duration = Date.now() - currentPhase.enteredAt;
    }
  }

  complete(result) {
    this.status = 'completed';
    this.result = result;
    this.duration = Date.now() - this.startTime;
  }

  fail(error) {
    this.status = 'failed';
    this.error = error;
    this.duration = Date.now() - this.startTime;
  }

  getMetrics() {
    return {
      id: this.id,
      tool: this.toolName,
      status: this.status,
      duration: this.duration || (Date.now() - this.startTime),
      phases: this.phases.map(p => ({
        name: p.name,
        duration: p.duration
      })),
      error: this.error?.message
    };
  }
}
```

### Execution Context

Context passed through the execution pipeline:

```javascript
class ExecutionContext {
  constructor(options = {}) {
    // User and session info
    this.userId = options.userId;
    this.sessionId = options.sessionId;

    // Execution control
    this.abortController = new AbortController();
    this.timeout = options.timeout || 120000;

    // Permission context
    this.permissionMode = options.permissionMode || 'ask';
    this.allowedPaths = options.allowedPaths || [];

    // Tool-specific context
    this.workingDirectory = options.cwd || process.cwd();
    this.environment = options.env || {};

    // Execution history
    this.previousResults = [];
    this.executedTools = new Set();

    // Metrics and monitoring
    this.metrics = {
      toolExecutions: 0,
      totalDuration: 0,
      errors: 0
    };
  }

  recordExecution(toolName, duration, success) {
    this.executedTools.add(toolName);
    this.metrics.toolExecutions++;
    this.metrics.totalDuration += duration;
    if (!success) this.metrics.errors++;
  }

  canExecute(toolName) {
    // Check if tool has already been executed (prevent loops)
    if (this.options.preventDuplicates && this.executedTools.has(toolName)) {
      return false;
    }

    // Check execution limit
    if (this.options.maxExecutions &&
        this.metrics.toolExecutions >= this.options.maxExecutions) {
      return false;
    }

    return true;
  }
}
```

### Execution Hooks

Lifecycle hooks for monitoring and extension:

```javascript
class ExecutionHooks {
  constructor() {
    this.hooks = new Map();
  }

  register(event, handler) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event).push(handler);
  }

  async trigger(event, data) {
    const handlers = this.hooks.get(event) || [];

    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (error) {
        console.error(`Hook error in ${event}:`, error);
      }
    }
  }
}

// Example hook registrations
hooks.register('tool:pre', async ({ tool, parameters }) => {
  console.log(`Executing ${tool} with`, parameters);
});

hooks.register('tool:post', async ({ tool, result }) => {
  console.log(`${tool} completed with result:`, result);
});

hooks.register('tool:error', async ({ tool, error }) => {
  console.error(`${tool} failed:`, error);
  // Could send to error tracking service
});
```

## Error Handling & Recovery

### Error Classification

Different error types require different handling:

```javascript
class ToolError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }
}

const ERROR_CODES = {
  // Permission errors (400-level)
  PERMISSION_DENIED: 'E_PERMISSION_DENIED',
  UNAUTHORIZED: 'E_UNAUTHORIZED',
  FORBIDDEN_PATH: 'E_FORBIDDEN_PATH',

  // Validation errors (400-level)
  INVALID_PARAMETERS: 'E_INVALID_PARAMS',
  MISSING_REQUIRED: 'E_MISSING_REQUIRED',
  TYPE_MISMATCH: 'E_TYPE_MISMATCH',

  // Execution errors (500-level)
  EXECUTION_FAILED: 'E_EXECUTION_FAILED',
  TIMEOUT: 'E_TIMEOUT',
  TOOL_NOT_FOUND: 'E_TOOL_NOT_FOUND',

  // System errors (500-level)
  SYSTEM_ERROR: 'E_SYSTEM_ERROR',
  OUT_OF_MEMORY: 'E_OUT_OF_MEMORY',
  CONCURRENCY_LIMIT: 'E_CONCURRENCY_LIMIT'
};
```

### Error Recovery Strategies

Attempting recovery based on error type:

```javascript
class ErrorRecovery {
  async attemptRecovery(error, toolName, parameters, context) {
    switch (error.code) {
      case ERROR_CODES.TIMEOUT:
        return this.handleTimeout(toolName, parameters, context);

      case ERROR_CODES.PERMISSION_DENIED:
        return this.handlePermissionDenied(toolName, parameters, context);

      case ERROR_CODES.CONCURRENCY_LIMIT:
        return this.handleConcurrencyLimit(toolName, parameters, context);

      case ERROR_CODES.OUT_OF_MEMORY:
        return this.handleMemoryError(toolName, parameters, context);

      default:
        return { recoverable: false, error };
    }
  }

  async handleTimeout(toolName, parameters, context) {
    // Try with extended timeout
    const newTimeout = context.timeout * 2;
    if (newTimeout <= MAX_TIMEOUT) {
      return {
        recoverable: true,
        action: 'retry',
        modifications: {
          context: { ...context, timeout: newTimeout }
        }
      };
    }

    return { recoverable: false, error: new ToolError('Timeout exceeded maximum', ERROR_CODES.TIMEOUT) };
  }

  async handleConcurrencyLimit(toolName, parameters, context) {
    // Queue for later execution
    return {
      recoverable: true,
      action: 'queue',
      delay: 1000
    };
  }

  async handleMemoryError(toolName, parameters, context) {
    // Try to free memory and retry
    if (global.gc) {
      global.gc();
      return {
        recoverable: true,
        action: 'retry',
        delay: 2000
      };
    }

    return { recoverable: false, error: new ToolError('Out of memory', ERROR_CODES.OUT_OF_MEMORY) };
  }
}
```

### Error Reporting

Comprehensive error reporting for debugging:

```javascript
class ErrorReporter {
  formatError(error, context) {
    return {
      // Error basics
      message: error.message,
      code: error.code || 'UNKNOWN',
      name: error.name,
      timestamp: error.timestamp || Date.now(),

      // Stack trace
      stack: this.sanitizeStack(error.stack),

      // Context information
      tool: context.toolName,
      parameters: this.sanitizeParameters(context.parameters),
      phase: context.currentPhase,

      // System information
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },

      // Recovery attempts
      recoveryAttempts: context.recoveryAttempts || 0,
      recoverable: error.recoverable ?? false
    };
  }

  sanitizeStack(stack) {
    // Remove sensitive paths and information
    return stack
      ?.replace(/\/Users\/[^\/]+/g, '/Users/***')
      .replace(/\/home\/[^\/]+/g, '/home/***')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '***@***.***');
  }

  sanitizeParameters(params) {
    // Remove sensitive parameter values
    const sanitized = { ...params };
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
```

## Real-World Integration

### Tool Usage Patterns

Common patterns in actual Claude Code usage:

```javascript
// Pattern 1: File exploration and modification
const fileExplorationFlow = async () => {
  // First, search for relevant files
  const searchResult = await executor.execute('Grep', {
    pattern: 'function calculatePrice',
    path: './src'
  });

  // Read the found file
  const fileContent = await executor.execute('Read', {
    file_path: searchResult.files[0]
  });

  // Edit the file
  const editResult = await executor.execute('Edit', {
    file_path: searchResult.files[0],
    old_string: 'calculatePrice(amount)',
    new_string: 'calculatePrice(amount, taxRate = 0.1)'
  });

  return editResult;
};

// Pattern 2: Code execution with output monitoring
const executionFlow = async () => {
  // Start background task
  const bashResult = await executor.execute('Bash', {
    command: 'npm test',
    run_in_background: true
  });

  // Monitor output
  let output;
  do {
    output = await executor.execute('BashOutput', {
      bash_id: bashResult.taskId
    });

    if (output.stdout.includes('FAIL')) {
      // Kill the task if tests are failing
      await executor.execute('KillShell', {
        shell_id: bashResult.taskId
      });
      break;
    }
  } while (output.status === 'running');

  return output;
};
```

### Performance Metrics

Typical tool execution performance:

```javascript
const PERFORMANCE_BENCHMARKS = {
  'Read': {
    small_file: '5-10ms',      // <10KB
    medium_file: '10-50ms',     // 10KB-1MB
    large_file: '50-500ms'      // >1MB
  },
  'Write': {
    small_file: '10-20ms',
    medium_file: '20-100ms',
    large_file: '100-1000ms'
  },
  'Edit': {
    single_edit: '20-50ms',
    multiple_edits: '50-200ms'
  },
  'Grep': {
    small_codebase: '50-200ms',    // <1000 files
    medium_codebase: '200-1000ms',  // 1000-10000 files
    large_codebase: '1-5s'          // >10000 files
  },
  'Bash': {
    simple_command: '50-100ms',     // ls, pwd, echo
    complex_command: '100ms-10s',   // npm install, build scripts
    long_running: '>10s'            // test suites, servers
  }
};
```

### Integration with Conversation Loop

How tools integrate with the conversation system:

```javascript
// From conversation/tool-execution.js
async performToolUse(toolUse, context) {
  const { id, name, input } = toolUse;

  // Track in conversation context
  context.inProgressToolUseIDs.add(id);

  try {
    // Execute through tool system
    const result = await toolExecutor.execute(name, input, {
      userId: context.userId,
      sessionId: context.sessionId,
      abortController: context.abortController
    });

    // Mark as resolved
    context.resolvedToolUseIDs.add(id);
    context.inProgressToolUseIDs.delete(id);

    return {
      type: 'tool_result',
      tool_use_id: id,
      content: this.formatToolResult(result),
      is_error: false
    };

  } catch (error) {
    // Mark as errored
    context.erroredToolUseIDs.add(id);
    context.inProgressToolUseIDs.delete(id);

    return {
      type: 'tool_result',
      tool_use_id: id,
      content: error.message,
      is_error: true
    };
  }
}
```

### Security Considerations

Security measures throughout the tool system:

```javascript
class SecurityManager {
  constructor() {
    this.blacklistedPaths = new Set([
      '/etc/passwd',
      '/etc/shadow',
      '~/.ssh/id_rsa',
      '~/.aws/credentials',
      '.env'
    ]);

    this.dangerousCommands = [
      /rm\s+-rf\s+\//,
      /:(){ :|:& };:/,  // Fork bomb
      /dd\s+if=\/dev\/zero/,
      />\s*\/dev\/sda/
    ];
  }

  validateToolUse(toolName, parameters) {
    // Check file paths
    if (['Read', 'Write', 'Edit'].includes(toolName)) {
      const path = parameters.file_path || parameters.path;
      if (this.blacklistedPaths.has(path)) {
        throw new ToolError(
          `Access to ${path} is forbidden`,
          ERROR_CODES.FORBIDDEN_PATH
        );
      }
    }

    // Check bash commands
    if (toolName === 'Bash') {
      const command = parameters.command;
      for (const pattern of this.dangerousCommands) {
        if (pattern.test(command)) {
          throw new ToolError(
            'Dangerous command detected',
            ERROR_CODES.PERMISSION_DENIED
          );
        }
      }
    }

    return true;
  }
}
```

## Advanced Features

### Tool Composition

Building complex operations from simple tools:

```javascript
class CompositeToolExecutor {
  async executeComposite(definition, context) {
    const { name, steps } = definition;

    console.log(`Executing composite tool: ${name}`);

    const results = [];
    let previousResult = null;

    for (const step of steps) {
      const parameters = this.resolveParameters(
        step.parameters,
        previousResult,
        results
      );

      const result = await this.executeStep(step, parameters, context);
      results.push(result);
      previousResult = result;

      if (step.continueOnError === false && result.error) {
        break;
      }
    }

    return {
      composite: name,
      steps: results,
      success: !results.some(r => r.error)
    };
  }

  resolveParameters(params, previousResult, allResults) {
    // Replace parameter placeholders with actual values
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // Reference to previous result
        if (value === '$previous') {
          resolved[key] = previousResult?.data;
        } else if (value.startsWith('$step')) {
          // Reference to specific step result
          const stepIndex = parseInt(value.substring(5));
          resolved[key] = allResults[stepIndex]?.data;
        } else {
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }
}
```

### Tool Middleware

Middleware system for cross-cutting concerns:

```javascript
class ToolMiddleware {
  constructor() {
    this.middlewares = [];
  }

  use(middleware) {
    this.middlewares.push(middleware);
  }

  async execute(tool, parameters, next) {
    let index = 0;

    const dispatch = async () => {
      if (index >= this.middlewares.length) {
        return await next();
      }

      const middleware = this.middlewares[index++];
      return await middleware(tool, parameters, dispatch);
    };

    return await dispatch();
  }
}

// Example middleware: Rate limiting
const rateLimitMiddleware = (() => {
  const executions = new Map();

  return async (tool, parameters, next) => {
    const key = `${tool}:${JSON.stringify(parameters)}`;
    const lastExecution = executions.get(key);

    if (lastExecution && Date.now() - lastExecution < 1000) {
      throw new ToolError('Rate limit exceeded', ERROR_CODES.RATE_LIMIT);
    }

    executions.set(key, Date.now());
    return await next();
  };
})();

// Example middleware: Logging
const loggingMiddleware = async (tool, parameters, next) => {
  const start = Date.now();
  console.log(`[TOOL] Starting ${tool}`);

  try {
    const result = await next();
    console.log(`[TOOL] Completed ${tool} in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`[TOOL] Failed ${tool}:`, error.message);
    throw error;
  }
};
```

### Dynamic Tool Loading

Loading tools at runtime:

```javascript
class DynamicToolLoader {
  async loadTool(path) {
    try {
      const module = await import(path);
      const tool = module.default || module.Tool;

      if (!tool || !tool.name) {
        throw new Error('Invalid tool module');
      }

      // Validate tool structure
      this.validateToolStructure(tool);

      // Register with registry
      this.registry.register(tool.name, tool, 'dynamic');

      console.log(`Dynamically loaded tool: ${tool.name}`);
      return tool;

    } catch (error) {
      throw new Error(`Failed to load tool from ${path}: ${error.message}`);
    }
  }

  validateToolStructure(tool) {
    const required = ['name', 'description', 'inputSchema', 'call'];
    const missing = required.filter(field => !(field in tool));

    if (missing.length > 0) {
      throw new Error(`Tool missing required fields: ${missing.join(', ')}`);
    }

    if (typeof tool.call !== 'function') {
      throw new Error('Tool call must be a function');
    }
  }
}
```

## Conclusion

The Tool Registry Architecture represents a sophisticated system for managing Claude Code's interaction capabilities with the outside world. Through its careful design of registration, validation, permission checking, and execution management, it enables Claude to safely and efficiently perform thousands of operations while maintaining security and observability. The extensible architecture allows for new tools to be added easily, while the comprehensive error handling ensures robust operation even in challenging conditions. This foundation enables Claude Code to be not just a conversation partner, but an active agent capable of real-world system interactions.