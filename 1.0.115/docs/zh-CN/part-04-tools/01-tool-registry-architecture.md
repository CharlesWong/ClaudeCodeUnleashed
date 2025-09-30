# 第4.1部分：工具注册架构 - Claude能力的基础

## 概述

工具注册架构构成了Claude Code与系统交互能力的支柱——读取文件、执行命令、搜索代码和执行复杂操作。这一全面分析探讨了复杂的注册系统、权限模型、执行流水线，以及使Claude能够在每个会话中安全高效地执行数千次操作的架构模式。

## 目录

1. [架构概述](#架构概述)
2. [工具注册系统](#工具注册系统)
3. [工具执行器流水线](#工具执行器流水线)
4. [权限与验证系统](#权限与验证系统)
5. [工具分类与组织](#工具分类与组织)
6. [执行流程与状态管理](#执行流程与状态管理)
7. [错误处理与恢复](#错误处理与恢复)
8. [实际应用集成](#实际应用集成)

## 架构概述

### 核心组件

工具系统由三个协同工作的主要组件组成：

```javascript
// 1. 工具注册表 - 管理工具注册和发现
class ToolRegistry {
  constructor() {
    this.tools = new Map();        // 工具定义
    this.aliases = new Map();       // 别名映射
    this.categories = new Map();    // 组织分组
  }
}

// 2. 工具执行器 - 处理执行和安全检查
class ToolExecutor {
  constructor(options = {}) {
    this.registry = options.registry || new ToolRegistry();
    this.permissionSystem = options.permissionSystem;
    this.hooks = options.hooks;
    this.logger = options.logger;
  }
}

// 3. 工具验证器 - 确保参数正确性
class ToolValidator {
  static validateRequired(parameters, required) { /* ... */ }
  static validateTypes(parameters, schema) { /* ... */ }
  static validatePatterns(parameters, patterns) { /* ... */ }
  static validatePaths(paths) { /* ... */ }
}
```

### 设计原则

1. **安全第一**：每个工具执行都通过多重安全检查
2. **可扩展性**：可在不修改核心代码的情况下添加新工具
3. **可观察性**：全面的事件发射用于监控
4. **性能**：在安全的情况下并发执行
5. **一致性**：所有工具的统一接口

## 工具注册系统

### 注册架构

注册表维护所有可用工具的集中目录：

```javascript
class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.aliases = new Map();
    this.categories = new Map();

    this.registerAllTools();
  }

  register(name, toolClass, category = 'general') {
    // 存储工具元数据
    this.tools.set(name, {
      name,
      class: toolClass,
      category,
      enabled: true
    });

    // 更新类别映射以便快速查找
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(name);
  }
}
```

### 内置工具注册

系统在初始化期间注册所有工具：

```javascript
registerAllTools() {
  // 文件系统工具 - 核心文件操作
  this.register('Read', ReadTool, 'filesystem');
  this.register('Write', WriteTool, 'filesystem');
  this.register('Edit', EditTool, 'filesystem');
  this.register('MultiEdit', MultiEditTool, 'filesystem');
  this.register('NotebookEdit', NotebookEditTool, 'filesystem');

  // 搜索工具 - 模式匹配和发现
  this.register('Grep', GrepTool, 'search');

  // 执行工具 - 系统命令执行
  this.register('Bash', BashTool, 'execution');
  this.register('BashOutput', BashOutputTool, 'execution');
  this.register('KillShell', KillShellTool, 'execution');

  // Web工具 - 互联网访问功能
  this.register('WebSearch', WebSearchTool, 'web');
  this.register('WebFetch', WebFetchTool, 'web');

  // 任务管理工具 - 复杂操作编排
  this.register('Task', TaskTool, 'task');

  // 注册别名以保持向后兼容性
  this.registerAliases();
}
```

### 别名系统

维护与不同命名约定的兼容性：

```javascript
registerAliases() {
  // 工具的替代名称
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

### 工具发现

查找和检索工具：

```javascript
get(name) {
  // 首先检查别名
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

  // 使用选项创建新实例
  return new tool.class(options);
}
```

### 元数据管理

暴露工具功能以供内省：

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

## 工具执行器流水线

### 执行架构

执行器管理工具执行的完整生命周期：

```javascript
class ToolExecutor {
  async execute(toolName, parameters, context = {}) {
    // 阶段1：日志记录和设置
    this.log('info', `Executing tool: ${toolName}`, { parameters });

    try {
      // 阶段2：工具创建
      const tool = this.registry.create(toolName, context);

      // 阶段3：权限检查
      if (this.permissionSystem) {
        const permitted = await this.permissionSystem.checkTool(toolName, parameters);
        if (!permitted) {
          throw new Error(`Permission denied for tool: ${toolName}`);
        }
      }

      // 阶段4：预执行钩子
      if (this.hooks) {
        await this.hooks.trigger('tool:pre', { tool: toolName, parameters });
      }

      // 阶段5：参数验证
      if (tool.validate) {
        const validation = await tool.validate(parameters);
        if (!validation.valid) {
          throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
        }
      }

      // 阶段6：工具执行
      const result = await tool.execute(parameters);

      // 阶段7：后执行钩子
      if (this.hooks) {
        await this.hooks.trigger('tool:post', { tool: toolName, parameters, result });
      }

      // 阶段8：成功日志记录
      this.log('info', `Tool executed successfully: ${toolName}`);

      return result;

    } catch (error) {
      // 错误处理和恢复
      this.handleExecutionError(error, toolName, parameters);
      throw error;
    }
  }
}
```

### 并行执行

同时执行多个工具以提高性能：

```javascript
async executeParallel(executions) {
  // 验证所有工具都可以并行运行
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

  // 并发执行所有工具
  const promises = executions.map(({ tool, parameters, context }) =>
    this.execute(tool, parameters, context)
      .catch(error => ({
        tool,
        error: error.message,
        failed: true
      }))
  );

  const results = await Promise.all(promises);

  // 检查失败
  const failures = results.filter(r => r.failed);
  if (failures.length > 0) {
    this.log('warn', `${failures.length} tools failed in parallel execution`);
  }

  return results;
}
```

### 顺序执行

按特定顺序执行具有依赖关系的工具：

```javascript
async executeSequence(executions) {
  const results = [];
  const context = { previousResults: [] };

  for (const { tool, parameters, usePreviousResult } of executions) {
    try {
      // 如果需要，注入前一个结果
      let executionParams = parameters;
      if (usePreviousResult && results.length > 0) {
        const lastResult = results[results.length - 1];
        executionParams = {
          ...parameters,
          previousResult: lastResult
        };
      }

      // 使用累积的上下文执行
      const result = await this.execute(tool, executionParams, context);
      results.push(result);

      // 为下一个工具更新上下文
      context.previousResults.push({
        tool,
        result
      });

    } catch (error) {
      // 决定是否继续或中止序列
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

## 权限与验证系统

### 权限检查

多层权限系统确保安全：

```javascript
class PermissionSystem {
  constructor(mode = 'ask') {
    this.mode = mode; // 'ask' | 'allow' | 'deny'
    this.alwaysAllowRules = new Map();
    this.alwaysDenyRules = new Map();
    this.userResponses = new Map();
  }

  async checkTool(toolName, parameters) {
    // 首先检查拒绝规则（最高优先级）
    if (this.checkDenyRules(toolName, parameters)) {
      return {
        allowed: false,
        reason: 'Matches deny rule'
      };
    }

    // 检查允许规则
    if (this.checkAllowRules(toolName, parameters)) {
      return {
        allowed: true,
        reason: 'Matches allow rule'
      };
    }

    // 检查模式
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

    // 模式为'ask' - 提示用户
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

### 参数验证

执行工具之前的全面验证：

```javascript
class ToolValidator {
  /**
   * 验证必需参数是否存在
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
   * 验证参数类型是否匹配模式
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

        // 对象的嵌套验证
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
   * 验证参数值是否匹配模式
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
   * 验证文件路径的安全性
   */
  static validatePaths(paths) {
    const errors = [];

    for (const path of paths) {
      // 检查路径遍历尝试
      if (path.includes('..')) {
        errors.push(`Path traversal detected in: ${path}`);
      }

      // 检查系统路径
      const systemPaths = ['/etc/', '/sys/', '/proc/', 'C:\\Windows\\System32'];
      for (const systemPath of systemPaths) {
        if (path.startsWith(systemPath)) {
          errors.push(`Access to system path denied: ${path}`);
        }
      }

      // 检查隐藏文件（可选）
      if (path.includes('/.') && !this.allowHiddenFiles) {
        errors.push(`Access to hidden file denied: ${path}`);
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }
}
```

## 工具分类与组织

### 分类系统

工具被组织成逻辑分类：

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

### 基于分类的操作

按分类操作工具：

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

## 执行流程与状态管理

### 工具执行状态

管理整个流水线的执行状态：

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

### 执行上下文

传递通过执行流水线的上下文：

```javascript
class ExecutionContext {
  constructor(options = {}) {
    // 用户和会话信息
    this.userId = options.userId;
    this.sessionId = options.sessionId;

    // 执行控制
    this.abortController = new AbortController();
    this.timeout = options.timeout || 120000;

    // 权限上下文
    this.permissionMode = options.permissionMode || 'ask';
    this.allowedPaths = options.allowedPaths || [];

    // 工具特定上下文
    this.workingDirectory = options.cwd || process.cwd();
    this.environment = options.env || {};

    // 执行历史
    this.previousResults = [];
    this.executedTools = new Set();

    // 指标和监控
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
    // 检查工具是否已经执行过（防止循环）
    if (this.options.preventDuplicates && this.executedTools.has(toolName)) {
      return false;
    }

    // 检查执行限制
    if (this.options.maxExecutions &&
        this.metrics.toolExecutions >= this.options.maxExecutions) {
      return false;
    }

    return true;
  }
}
```

### 执行钩子

用于监控和扩展的生命周期钩子：

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

// 示例钩子注册
hooks.register('tool:pre', async ({ tool, parameters }) => {
  console.log(`Executing ${tool} with`, parameters);
});

hooks.register('tool:post', async ({ tool, result }) => {
  console.log(`${tool} completed with result:`, result);
});

hooks.register('tool:error', async ({ tool, error }) => {
  console.error(`${tool} failed:`, error);
  // 可以发送到错误跟踪服务
});
```

## 错误处理与恢复

### 错误分类

不同错误类型需要不同处理：

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
  // 权限错误（400级）
  PERMISSION_DENIED: 'E_PERMISSION_DENIED',
  UNAUTHORIZED: 'E_UNAUTHORIZED',
  FORBIDDEN_PATH: 'E_FORBIDDEN_PATH',

  // 验证错误（400级）
  INVALID_PARAMETERS: 'E_INVALID_PARAMS',
  MISSING_REQUIRED: 'E_MISSING_REQUIRED',
  TYPE_MISMATCH: 'E_TYPE_MISMATCH',

  // 执行错误（500级）
  EXECUTION_FAILED: 'E_EXECUTION_FAILED',
  TIMEOUT: 'E_TIMEOUT',
  TOOL_NOT_FOUND: 'E_TOOL_NOT_FOUND',

  // 系统错误（500级）
  SYSTEM_ERROR: 'E_SYSTEM_ERROR',
  OUT_OF_MEMORY: 'E_OUT_OF_MEMORY',
  CONCURRENCY_LIMIT: 'E_CONCURRENCY_LIMIT'
};
```

### 错误恢复策略

基于错误类型尝试恢复：

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
    // 尝试使用扩展的超时时间
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
    // 排队等待稍后执行
    return {
      recoverable: true,
      action: 'queue',
      delay: 1000
    };
  }

  async handleMemoryError(toolName, parameters, context) {
    // 尝试释放内存并重试
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

### 错误报告

用于调试的全面错误报告：

```javascript
class ErrorReporter {
  formatError(error, context) {
    return {
      // 错误基础信息
      message: error.message,
      code: error.code || 'UNKNOWN',
      name: error.name,
      timestamp: error.timestamp || Date.now(),

      // 堆栈跟踪
      stack: this.sanitizeStack(error.stack),

      // 上下文信息
      tool: context.toolName,
      parameters: this.sanitizeParameters(context.parameters),
      phase: context.currentPhase,

      // 系统信息
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },

      // 恢复尝试
      recoveryAttempts: context.recoveryAttempts || 0,
      recoverable: error.recoverable ?? false
    };
  }

  sanitizeStack(stack) {
    // 删除敏感路径和信息
    return stack
      ?.replace(/\/Users\/[^\/]+/g, '/Users/***')
      .replace(/\/home\/[^\/]+/g, '/home/***')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '***@***.***');
  }

  sanitizeParameters(params) {
    // 删除敏感参数值
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

## 实际应用集成

### 工具使用模式

实际Claude Code使用中的常见模式：

```javascript
// 模式1：文件探索和修改
const fileExplorationFlow = async () => {
  // 首先，搜索相关文件
  const searchResult = await executor.execute('Grep', {
    pattern: 'function calculatePrice',
    path: './src'
  });

  // 读取找到的文件
  const fileContent = await executor.execute('Read', {
    file_path: searchResult.files[0]
  });

  // 编辑文件
  const editResult = await executor.execute('Edit', {
    file_path: searchResult.files[0],
    old_string: 'calculatePrice(amount)',
    new_string: 'calculatePrice(amount, taxRate = 0.1)'
  });

  return editResult;
};

// 模式2：带输出监控的代码执行
const executionFlow = async () => {
  // 启动后台任务
  const bashResult = await executor.execute('Bash', {
    command: 'npm test',
    run_in_background: true
  });

  // 监控输出
  let output;
  do {
    output = await executor.execute('BashOutput', {
      bash_id: bashResult.taskId
    });

    if (output.stdout.includes('FAIL')) {
      // 如果测试失败，终止任务
      await executor.execute('KillShell', {
        shell_id: bashResult.taskId
      });
      break;
    }
  } while (output.status === 'running');

  return output;
};
```

### 性能指标

典型工具执行性能：

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
    small_codebase: '50-200ms',    // <1000个文件
    medium_codebase: '200-1000ms',  // 1000-10000个文件
    large_codebase: '1-5s'          // >10000个文件
  },
  'Bash': {
    simple_command: '50-100ms',     // ls, pwd, echo
    complex_command: '100ms-10s',   // npm install, 构建脚本
    long_running: '>10s'            // 测试套件，服务器
  }
};
```

### 与会话循环的集成

工具如何与会话系统集成：

```javascript
// 来自conversation/tool-execution.js
async performToolUse(toolUse, context) {
  const { id, name, input } = toolUse;

  // 在会话上下文中跟踪
  context.inProgressToolUseIDs.add(id);

  try {
    // 通过工具系统执行
    const result = await toolExecutor.execute(name, input, {
      userId: context.userId,
      sessionId: context.sessionId,
      abortController: context.abortController
    });

    // 标记为已解决
    context.resolvedToolUseIDs.add(id);
    context.inProgressToolUseIDs.delete(id);

    return {
      type: 'tool_result',
      tool_use_id: id,
      content: this.formatToolResult(result),
      is_error: false
    };

  } catch (error) {
    // 标记为错误
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

### 安全考虑

整个工具系统的安全措施：

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
      /:(){ :|:& };:/,  // Fork炸弹
      /dd\s+if=\/dev\/zero/,
      />\s*\/dev\/sda/
    ];
  }

  validateToolUse(toolName, parameters) {
    // 检查文件路径
    if (['Read', 'Write', 'Edit'].includes(toolName)) {
      const path = parameters.file_path || parameters.path;
      if (this.blacklistedPaths.has(path)) {
        throw new ToolError(
          `Access to ${path} is forbidden`,
          ERROR_CODES.FORBIDDEN_PATH
        );
      }
    }

    // 检查bash命令
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

## 高级功能

### 工具组合

从简单工具构建复杂操作：

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
    // 用实际值替换参数占位符
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // 对前一个结果的引用
        if (value === '$previous') {
          resolved[key] = previousResult?.data;
        } else if (value.startsWith('$step')) {
          // 对特定步骤结果的引用
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

### 工具中间件

横切关注点的中间件系统：

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

// 示例中间件：速率限制
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

// 示例中间件：日志记录
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

### 动态工具加载

运行时加载工具：

```javascript
class DynamicToolLoader {
  async loadTool(path) {
    try {
      const module = await import(path);
      const tool = module.default || module.Tool;

      if (!tool || !tool.name) {
        throw new Error('Invalid tool module');
      }

      // 验证工具结构
      this.validateToolStructure(tool);

      // 在注册表中注册
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

## 结论

工具注册架构代表了管理Claude Code与外部世界交互能力的复杂系统。通过精心设计的注册、验证、权限检查和执行管理，它使Claude能够在维护安全性和可观察性的同时安全高效地执行数千个操作。可扩展的架构允许轻松添加新工具，而全面的错误处理确保即使在具有挑战性的条件下也能稳健运行。这一基础使Claude Code不仅成为对话伙伴，而且成为能够进行真实世界系统交互的活跃代理。