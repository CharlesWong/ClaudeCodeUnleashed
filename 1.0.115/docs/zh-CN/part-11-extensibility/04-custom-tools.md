# Part 11.4: 自定义工具

## 简介

Claude Code 中的自定义工具代表了一种强大的扩展机制,允许开发者创建与 AI 助手功能无缝集成的专门功能。这些工具超越了简单的命令,为复杂操作、数据处理和与外部系统的集成提供了结构化接口。自定义工具框架确保类型安全、验证、错误处理,以及与 Claude Code 的权限和安全系统的正确集成。

## 工具开发框架

### 自定义工具架构

```javascript
// CustomToolFramework.js
import { EventEmitter } from 'events';
import { z } from 'zod';
import { createHash } from 'crypto';

class CustomToolFramework extends EventEmitter {
  constructor(options = {}) {
    super();

    this.tools = new Map();
    this.categories = new Map();
    this.validators = new Map();
    this.middleware = [];
    this.executionQueue = [];

    this.config = {
      maxConcurrentTools: options.maxConcurrentTools || 10,
      defaultTimeout: options.defaultTimeout || 30000,
      retryPolicy: options.retryPolicy || {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000
      },
      validation: options.validation !== false,
      caching: options.caching !== false,
      monitoring: options.monitoring !== false,
      ...options
    };

    this.metrics = {
      executions: 0,
      successes: 0,
      failures: 0,
      totalDuration: 0
    };

    this.cache = new Map();
    this.activeExecutions = new Map();
  }

  /**
   * 注册自定义工具
   */
  registerTool(definition) {
    // 验证工具定义
    this.validateToolDefinition(definition);

    // 创建工具实例
    const tool = new CustomTool({
      ...definition,
      framework: this
    });

    // 注册工具
    this.tools.set(tool.name, tool);

    // 在类别中注册
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category).add(tool.name);

    // 发出注册事件
    this.emit('tool-registered', tool);

    return tool;
  }

  validateToolDefinition(definition) {
    const schema = z.object({
      name: z.string().min(1),
      description: z.string(),
      category: z.string().optional(),
      parameters: z.record(z.any()).optional(),
      handler: z.function(),
      permissions: z.array(z.string()).optional(),
      timeout: z.number().optional(),
      retryable: z.boolean().optional(),
      cacheable: z.boolean().optional()
    });

    try {
      schema.parse(definition);
    } catch (error) {
      throw new Error(`Invalid tool definition: ${error.message}`);
    }
  }

  /**
   * 执行工具
   */
  async executeTool(toolName, params, context) {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // 检查是否已在执行
    const executionId = this.generateExecutionId(toolName, params);
    if (this.activeExecutions.has(executionId)) {
      return this.activeExecutions.get(executionId);
    }

    // 创建执行 Promise
    const executionPromise = this.executeToolInternal(tool, params, context);
    this.activeExecutions.set(executionId, executionPromise);

    try {
      const result = await executionPromise;
      return result;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  async executeToolInternal(tool, params, context) {
    const startTime = Date.now();
    let attempt = 0;
    let lastError;

    // 检查缓存
    if (tool.cacheable && this.config.caching) {
      const cached = this.checkCache(tool, params);
      if (cached) {
        this.metrics.executions++;
        this.metrics.successes++;
        return cached;
      }
    }

    // 重试循环
    while (attempt <= (tool.retryable ? this.config.retryPolicy.maxRetries : 0)) {
      try {
        // 应用中间件
        for (const middleware of this.middleware) {
          await middleware(tool, params, context);
        }

        // 验证参数
        if (this.config.validation) {
          await tool.validateParameters(params);
        }

        // 检查权限
        await tool.checkPermissions(context);

        // 带超时执行
        const result = await this.executeWithTimeout(
          () => tool.execute(params, context),
          tool.timeout || this.config.defaultTimeout
        );

        // 更新指标
        this.updateMetrics(tool, startTime, true);

        // 缓存结果
        if (tool.cacheable && this.config.caching) {
          this.cacheResult(tool, params, result);
        }

        // 发出成功事件
        this.emit('tool-executed', {
          tool: tool.name,
          params,
          result,
          duration: Date.now() - startTime
        });

        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        // 检查是否可重试
        if (!tool.retryable || attempt > this.config.retryPolicy.maxRetries) {
          break;
        }

        // 计算延迟
        const delay = this.config.retryPolicy.initialDelay *
          Math.pow(this.config.retryPolicy.backoffMultiplier, attempt - 1);

        // 重试前等待
        await new Promise(resolve => setTimeout(resolve, delay));

        this.emit('tool-retry', {
          tool: tool.name,
          attempt,
          error: error.message
        });
      }
    }

    // 更新失败指标
    this.updateMetrics(tool, startTime, false);

    // 发出失败事件
    this.emit('tool-failed', {
      tool: tool.name,
      params,
      error: lastError,
      attempts: attempt
    });

    throw lastError;
  }

  async executeWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), timeout)
      )
    ]);
  }

  generateExecutionId(toolName, params) {
    const hash = createHash('sha256');
    hash.update(toolName);
    hash.update(JSON.stringify(params));
    return hash.digest('hex');
  }

  checkCache(tool, params) {
    const cacheKey = this.generateExecutionId(tool.name, params);
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.result;
    }

    return null;
  }

  cacheResult(tool, params, result) {
    const cacheKey = this.generateExecutionId(tool.name, params);
    const ttl = tool.cacheTTL || 300000; // 默认 5 分钟

    this.cache.set(cacheKey, {
      result,
      expiry: Date.now() + ttl
    });
  }

  updateMetrics(tool, startTime, success) {
    this.metrics.executions++;

    if (success) {
      this.metrics.successes++;
    } else {
      this.metrics.failures++;
    }

    this.metrics.totalDuration += Date.now() - startTime;

    // 更新工具特定的指标
    if (!tool.metrics) {
      tool.metrics = {
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0
      };
    }

    tool.metrics.executions++;
    if (success) {
      tool.metrics.successes++;
    } else {
      tool.metrics.failures++;
    }
    tool.metrics.totalDuration += Date.now() - startTime;
  }
}

class CustomTool {
  constructor(definition) {
    this.name = definition.name;
    this.description = definition.description;
    this.category = definition.category || 'custom';
    this.parameters = definition.parameters || {};
    this.handler = definition.handler;
    this.permissions = definition.permissions || [];
    this.timeout = definition.timeout;
    this.retryable = definition.retryable || false;
    this.cacheable = definition.cacheable || false;
    this.cacheTTL = definition.cacheTTL;
    this.framework = definition.framework;

    this.validators = new Map();
    this.preprocessors = [];
    this.postprocessors = [];

    this.setupValidators();
  }

  setupValidators() {
    // 为参数创建 Zod 验证器
    for (const [key, schema] of Object.entries(this.parameters)) {
      this.validators.set(key, this.createValidator(schema));
    }
  }

  createValidator(schema) {
    if (typeof schema === 'string') {
      // 简单类型
      switch (schema) {
        case 'string':
          return z.string();
        case 'number':
          return z.number();
        case 'boolean':
          return z.boolean();
        case 'array':
          return z.array(z.any());
        case 'object':
          return z.object({});
        default:
          return z.any();
      }
    }

    // 复杂模式
    if (schema.type) {
      let validator = this.createValidator(schema.type);

      if (schema.required) {
        validator = validator.nonempty();
      }

      if (schema.min !== undefined) {
        validator = validator.min(schema.min);
      }

      if (schema.max !== undefined) {
        validator = validator.max(schema.max);
      }

      if (schema.pattern) {
        validator = validator.regex(new RegExp(schema.pattern));
      }

      if (schema.enum) {
        validator = z.enum(schema.enum);
      }

      return validator;
    }

    return z.any();
  }

  async validateParameters(params) {
    const errors = [];

    for (const [key, validator] of this.validators) {
      try {
        validator.parse(params[key]);
      } catch (error) {
        errors.push({
          parameter: key,
          error: error.message
        });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Parameter validation failed', errors);
    }
  }

  async checkPermissions(context) {
    if (!context.user) {
      throw new Error('User context required');
    }

    for (const permission of this.permissions) {
      if (!context.user.hasPermission(permission)) {
        throw new Error(`Missing required permission: ${permission}`);
      }
    }
  }

  async execute(params, context) {
    // 应用预处理器
    let processedParams = params;
    for (const preprocessor of this.preprocessors) {
      processedParams = await preprocessor(processedParams, context);
    }

    // 执行处理器
    let result = await this.handler(processedParams, context);

    // 应用后处理器
    for (const postprocessor of this.postprocessors) {
      result = await postprocessor(result, context);
    }

    return result;
  }

  addPreprocessor(fn) {
    this.preprocessors.push(fn);
  }

  addPostprocessor(fn) {
    this.postprocessors.push(fn);
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      parameters: this.parameters,
      permissions: this.permissions,
      timeout: this.timeout,
      retryable: this.retryable,
      cacheable: this.cacheable
    };
  }
}

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}
```

### 工具类别和组织

```javascript
// ToolCategories.js
class ToolCategoryManager {
  constructor() {
    this.categories = new Map();
    this.categoryMetadata = new Map();
    this.categoryPermissions = new Map();
  }

  defineCategory(name, metadata = {}) {
    if (this.categories.has(name)) {
      throw new Error(`Category already exists: ${name}`);
    }

    this.categories.set(name, new Set());
    this.categoryMetadata.set(name, {
      name,
      description: metadata.description || '',
      icon: metadata.icon,
      priority: metadata.priority || 0,
      permissions: metadata.permissions || [],
      maxTools: metadata.maxTools || Infinity
    });

    return this;
  }

  addToolToCategory(toolName, categoryName) {
    if (!this.categories.has(categoryName)) {
      this.defineCategory(categoryName);
    }

    const category = this.categories.get(categoryName);
    const metadata = this.categoryMetadata.get(categoryName);

    if (category.size >= metadata.maxTools) {
      throw new Error(`Category ${categoryName} has reached maximum tools limit`);
    }

    category.add(toolName);
  }

  getToolsByCategory(categoryName) {
    const category = this.categories.get(categoryName);
    return category ? Array.from(category) : [];
  }

  getAllCategories() {
    const result = [];

    for (const [name, tools] of this.categories) {
      const metadata = this.categoryMetadata.get(name);
      result.push({
        ...metadata,
        tools: Array.from(tools)
      });
    }

    // 按优先级排序
    result.sort((a, b) => b.priority - a.priority);

    return result;
  }

  searchTools(query, options = {}) {
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (const [categoryName, tools] of this.categories) {
      const metadata = this.categoryMetadata.get(categoryName);

      // 检查类别匹配
      if (options.searchCategories !== false) {
        if (categoryName.toLowerCase().includes(lowerQuery) ||
            metadata.description.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'category',
            name: categoryName,
            metadata,
            tools: Array.from(tools)
          });
        }
      }

      // 检查工具匹配
      if (options.searchTools !== false) {
        for (const toolName of tools) {
          if (toolName.toLowerCase().includes(lowerQuery)) {
            results.push({
              type: 'tool',
              name: toolName,
              category: categoryName
            });
          }
        }
      }
    }

    return results;
  }
}

// 内置类别
class BuiltInCategories {
  static initialize(categoryManager) {
    // 文件系统工具
    categoryManager.defineCategory('filesystem', {
      description: '文件和目录操作',
      icon: '📁',
      priority: 10,
      permissions: ['file-read', 'file-write']
    });

    // 网络工具
    categoryManager.defineCategory('network', {
      description: '网络和 HTTP 操作',
      icon: '🌐',
      priority: 9,
      permissions: ['network']
    });

    // 数据处理工具
    categoryManager.defineCategory('data', {
      description: '数据转换和处理',
      icon: '📊',
      priority: 8
    });

    // 开发工具
    categoryManager.defineCategory('development', {
      description: '开发和调试工具',
      icon: '🛠️',
      priority: 7,
      permissions: ['shell']
    });

    // AI/ML 工具
    categoryManager.defineCategory('ai', {
      description: 'AI 和机器学习工具',
      icon: '🤖',
      priority: 6,
      permissions: ['api-access']
    });

    // 实用工具
    categoryManager.defineCategory('utility', {
      description: '通用实用工具',
      icon: '🔧',
      priority: 5
    });

    // 自定义工具
    categoryManager.defineCategory('custom', {
      description: '用户定义的自定义工具',
      icon: '⚡',
      priority: 1
    });
  }
}
```

## 内置自定义工具

### 文件系统工具

```javascript
// FileSystemTools.js
class FileSystemTools {
  static register(framework) {
    // 高级文件搜索工具
    framework.registerTool({
      name: 'FileSearch',
      description: '支持模式匹配和内容搜索的高级文件搜索',
      category: 'filesystem',
      parameters: {
        path: {
          type: 'string',
          description: '要搜索的目录',
          required: true
        },
        pattern: {
          type: 'string',
          description: '文件名模式(glob)',
          default: '*'
        },
        contentPattern: {
          type: 'string',
          description: '要搜索的内容模式'
        },
        recursive: {
          type: 'boolean',
          description: '递归搜索',
          default: true
        },
        maxDepth: {
          type: 'number',
          description: '递归搜索的最大深度',
          default: 10
        },
        excludePatterns: {
          type: 'array',
          description: '要排除的模式',
          default: ['node_modules', '.git', 'dist', 'build']
        }
      },
      handler: async (params, context) => {
        const fs = require('fs').promises;
        const path = require('path');
        const glob = require('glob');

        const results = [];

        async function searchDirectory(dir, depth = 0) {
          if (depth > params.maxDepth) return;

          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // 检查排除项
            if (params.excludePatterns.some(pattern =>
              entry.name.includes(pattern))) {
              continue;
            }

            if (entry.isDirectory() && params.recursive) {
              await searchDirectory(fullPath, depth + 1);
            } else if (entry.isFile()) {
              // 检查文件名模式
              if (!glob.minimatch(entry.name, params.pattern)) {
                continue;
              }

              // 如果指定,检查内容模式
              if (params.contentPattern) {
                const content = await fs.readFile(fullPath, 'utf8');
                if (!content.includes(params.contentPattern)) {
                  continue;
                }
              }

              const stats = await fs.stat(fullPath);
              results.push({
                path: fullPath,
                name: entry.name,
                size: stats.size,
                modified: stats.mtime,
                created: stats.birthtime
              });
            }
          }
        }

        await searchDirectory(params.path);

        return {
          count: results.length,
          files: results
        };
      },
      permissions: ['file-read'],
      cacheable: true,
      cacheTTL: 60000 // 1 分钟
    });

    // 文件转换工具
    framework.registerTool({
      name: 'FileTransform',
      description: '使用自定义操作转换文件内容',
      category: 'filesystem',
      parameters: {
        inputPath: {
          type: 'string',
          description: '输入文件路径',
          required: true
        },
        outputPath: {
          type: 'string',
          description: '输出文件路径'
        },
        operations: {
          type: 'array',
          description: '转换操作',
          required: true
        }
      },
      handler: async (params, context) => {
        const fs = require('fs').promises;

        // 读取输入文件
        let content = await fs.readFile(params.inputPath, 'utf8');

        // 应用转换
        for (const operation of params.operations) {
          content = await applyOperation(content, operation);
        }

        // 写入输出
        const outputPath = params.outputPath || params.inputPath;
        await fs.writeFile(outputPath, content, 'utf8');

        return {
          inputPath: params.inputPath,
          outputPath,
          operations: params.operations.length,
          size: Buffer.byteLength(content)
        };

        async function applyOperation(content, operation) {
          switch (operation.type) {
            case 'replace':
              return content.replace(
                new RegExp(operation.pattern, operation.flags || 'g'),
                operation.replacement
              );

            case 'append':
              return content + operation.text;

            case 'prepend':
              return operation.text + content;

            case 'transform':
              // 自定义转换函数
              return operation.fn(content);

            default:
              return content;
          }
        }
      },
      permissions: ['file-read', 'file-write']
    });

    // 目录同步工具
    framework.registerTool({
      name: 'DirectorySync',
      description: '使用各种策略同步目录',
      category: 'filesystem',
      parameters: {
        source: {
          type: 'string',
          description: '源目录',
          required: true
        },
        target: {
          type: 'string',
          description: '目标目录',
          required: true
        },
        strategy: {
          type: 'string',
          enum: ['mirror', 'merge', 'update'],
          description: '同步策略',
          default: 'merge'
        },
        dryRun: {
          type: 'boolean',
          description: '预览更改而不应用',
          default: false
        },
        excludePatterns: {
          type: 'array',
          description: '要排除的模式'
        }
      },
      handler: async (params, context) => {
        const fs = require('fs-extra');
        const path = require('path');

        const changes = {
          created: [],
          updated: [],
          deleted: [],
          skipped: []
        };

        async function syncDirectory(source, target, relativePath = '') {
          const sourceEntries = await fs.readdir(source, { withFileTypes: true });
          const targetExists = await fs.pathExists(target);

          if (!targetExists && !params.dryRun) {
            await fs.ensureDir(target);
          }

          // 获取目标条目
          const targetEntries = targetExists
            ? await fs.readdir(target, { withFileTypes: true })
            : [];

          const targetMap = new Map(
            targetEntries.map(e => [e.name, e])
          );

          // 处理源条目
          for (const entry of sourceEntries) {
            const sourcePath = path.join(source, entry.name);
            const targetPath = path.join(target, entry.name);
            const relPath = path.join(relativePath, entry.name);

            // 检查排除项
            if (params.excludePatterns?.some(pattern =>
              entry.name.includes(pattern))) {
              changes.skipped.push(relPath);
              continue;
            }

            if (entry.isDirectory()) {
              await syncDirectory(sourcePath, targetPath, relPath);
            } else {
              const targetEntry = targetMap.get(entry.name);

              if (!targetEntry) {
                // 文件在目标中不存在
                changes.created.push(relPath);
                if (!params.dryRun) {
                  await fs.copy(sourcePath, targetPath);
                }
              } else {
                // 文件存在,检查是否需要更新
                const sourceStats = await fs.stat(sourcePath);
                const targetStats = await fs.stat(targetPath);

                if (sourceStats.mtime > targetStats.mtime) {
                  changes.updated.push(relPath);
                  if (!params.dryRun) {
                    await fs.copy(sourcePath, targetPath);
                  }
                }
              }

              targetMap.delete(entry.name);
            }
          }

          // 处理删除(仅 mirror 策略)
          if (params.strategy === 'mirror') {
            for (const [name, entry] of targetMap) {
              const relPath = path.join(relativePath, name);
              changes.deleted.push(relPath);

              if (!params.dryRun) {
                const targetPath = path.join(target, name);
                await fs.remove(targetPath);
              }
            }
          }
        }

        await syncDirectory(params.source, params.target);

        return {
          strategy: params.strategy,
          dryRun: params.dryRun,
          changes
        };
      },
      permissions: ['file-read', 'file-write'],
      timeout: 60000 // 1 分钟
    });
  }
}
```

### 数据处理工具

```javascript
// DataProcessingTools.js
class DataProcessingTools {
  static register(framework) {
    // JSON 转换工具
    framework.registerTool({
      name: 'JSONTransform',
      description: '使用 JSONPath 和自定义操作转换 JSON 数据',
      category: 'data',
      parameters: {
        data: {
          type: 'object',
          description: '输入 JSON 数据',
          required: true
        },
        transformations: {
          type: 'array',
          description: '转换操作',
          required: true
        }
      },
      handler: async (params, context) => {
        const jp = require('jsonpath');
        let data = JSON.parse(JSON.stringify(params.data)); // 深拷贝

        for (const transform of params.transformations) {
          switch (transform.type) {
            case 'set':
              jp.apply(data, transform.path, () => transform.value);
              break;

            case 'delete':
              jp.apply(data, transform.path, () => undefined);
              break;

            case 'map':
              const values = jp.query(data, transform.path);
              const mapped = values.map(transform.fn);
              jp.apply(data, transform.path, (v, i) => mapped[i]);
              break;

            case 'filter':
              const items = jp.query(data, transform.path);
              const filtered = items.filter(transform.fn);
              jp.value(data, transform.path.replace(/\[\*\]/, ''), filtered);
              break;

            case 'merge':
              const target = jp.query(data, transform.path)[0];
              Object.assign(target, transform.value);
              break;

            case 'custom':
              data = transform.fn(data);
              break;
          }
        }

        return data;
      },
      cacheable: true
    });

    // CSV 处理工具
    framework.registerTool({
      name: 'CSVProcessor',
      description: '使用过滤、转换和聚合处理 CSV 数据',
      category: 'data',
      parameters: {
        input: {
          type: 'string',
          description: 'CSV 内容或文件路径',
          required: true
        },
        inputType: {
          type: 'string',
          enum: ['content', 'file'],
          default: 'content'
        },
        operations: {
          type: 'array',
          description: '处理操作'
        },
        outputFormat: {
          type: 'string',
          enum: ['csv', 'json', 'array'],
          default: 'csv'
        }
      },
      handler: async (params, context) => {
        const csv = require('csv-parse/sync');
        const csvStringify = require('csv-stringify/sync');
        const fs = require('fs').promises;

        // 加载数据
        let content = params.input;
        if (params.inputType === 'file') {
          content = await fs.readFile(params.input, 'utf8');
        }

        // 解析 CSV
        let records = csv.parse(content, {
          columns: true,
          skip_empty_lines: true
        });

        // 应用操作
        for (const op of params.operations || []) {
          records = await applyOperation(records, op);
        }

        // 格式化输出
        switch (params.outputFormat) {
          case 'json':
            return records;

          case 'array':
            return records.map(Object.values);

          case 'csv':
          default:
            return csvStringify.stringify(records, {
              header: true
            });
        }

        async function applyOperation(data, operation) {
          switch (operation.type) {
            case 'filter':
              return data.filter(operation.fn);

            case 'map':
              return data.map(operation.fn);

            case 'sort':
              return data.sort((a, b) => {
                const aVal = a[operation.field];
                const bVal = b[operation.field];
                return operation.desc
                  ? bVal.localeCompare(aVal)
                  : aVal.localeCompare(bVal);
              });

            case 'aggregate':
              const result = {};
              for (const agg of operation.aggregations) {
                switch (agg.type) {
                  case 'sum':
                    result[agg.name] = data.reduce(
                      (sum, row) => sum + Number(row[agg.field]),
                      0
                    );
                    break;

                  case 'avg':
                    const sum = data.reduce(
                      (sum, row) => sum + Number(row[agg.field]),
                      0
                    );
                    result[agg.name] = sum / data.length;
                    break;

                  case 'count':
                    result[agg.name] = data.length;
                    break;

                  case 'min':
                    result[agg.name] = Math.min(
                      ...data.map(row => Number(row[agg.field]))
                    );
                    break;

                  case 'max':
                    result[agg.name] = Math.max(
                      ...data.map(row => Number(row[agg.field]))
                    );
                    break;
                }
              }
              return [result];

            case 'groupBy':
              const groups = {};
              for (const row of data) {
                const key = row[operation.field];
                if (!groups[key]) {
                  groups[key] = [];
                }
                groups[key].push(row);
              }
              return Object.entries(groups).map(([key, rows]) => ({
                [operation.field]: key,
                count: rows.length,
                data: rows
              }));

            default:
              return data;
          }
        }
      },
      permissions: ['file-read'],
      cacheable: true
    });

    // 文本分析工具
    framework.registerTool({
      name: 'TextAnalyzer',
      description: '使用各种 NLP 操作分析文本',
      category: 'data',
      parameters: {
        text: {
          type: 'string',
          description: '要分析的文本',
          required: true
        },
        analyses: {
          type: 'array',
          description: '要执行的分析类型',
          enum: ['sentiment', 'entities', 'keywords', 'summary', 'language', 'statistics'],
          default: ['statistics']
        }
      },
      handler: async (params, context) => {
        const results = {};

        // 统计
        if (params.analyses.includes('statistics')) {
          const words = params.text.split(/\s+/);
          const sentences = params.text.split(/[.!?]+/);
          const paragraphs = params.text.split(/\n\n+/);

          results.statistics = {
            characters: params.text.length,
            words: words.length,
            sentences: sentences.length,
            paragraphs: paragraphs.length,
            averageWordLength: words.reduce((sum, word) => sum + word.length, 0) / words.length,
            averageSentenceLength: words.length / sentences.length
          };
        }

        // 关键词提取
        if (params.analyses.includes('keywords')) {
          const words = params.text.toLowerCase().split(/\W+/);
          const wordFreq = {};

          for (const word of words) {
            if (word.length > 3) { // 跳过短词
              wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
          }

          results.keywords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({ word, count }));
        }

        // 语言检测
        if (params.analyses.includes('language')) {
          // 基于常见词的简单语言检测
          const languages = {
            english: ['the', 'and', 'is', 'in', 'to'],
            spanish: ['el', 'la', 'de', 'en', 'y'],
            french: ['le', 'de', 'et', 'la', 'les'],
            german: ['der', 'die', 'und', 'in', 'das']
          };

          const textLower = params.text.toLowerCase();
          const scores = {};

          for (const [lang, words] of Object.entries(languages)) {
            scores[lang] = words.filter(word =>
              textLower.includes(` ${word} `)
            ).length;
          }

          results.language = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])[0][0];
        }

        // 摘要生成
        if (params.analyses.includes('summary')) {
          const sentences = params.text.split(/[.!?]+/).filter(s => s.trim());

          // 简单的提取式摘要
          const importantSentences = sentences
            .map(sentence => ({
              text: sentence.trim(),
              score: sentence.split(/\s+/).length // 按长度简单评分
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => s.text);

          results.summary = importantSentences.join('. ') + '.';
        }

        return results;
      },
      cacheable: true
    });
  }
}
```

### AI 集成工具

```javascript
// AIIntegrationTools.js
class AIIntegrationTools {
  static register(framework) {
    // 代码生成工具
    framework.registerTool({
      name: 'CodeGenerator',
      description: '根据规范生成代码',
      category: 'ai',
      parameters: {
        specification: {
          type: 'string',
          description: '代码规范或需求',
          required: true
        },
        language: {
          type: 'string',
          description: '编程语言',
          enum: ['javascript', 'python', 'typescript', 'java', 'go', 'rust'],
          required: true
        },
        style: {
          type: 'object',
          description: '代码风格偏好',
          properties: {
            indentation: { type: 'string', enum: ['spaces', 'tabs'] },
            indentSize: { type: 'number' },
            quotes: { type: 'string', enum: ['single', 'double'] },
            semicolons: { type: 'boolean' }
          }
        },
        context: {
          type: 'object',
          description: '生成的附加上下文'
        }
      },
      handler: async (params, context) => {
        // 基于模板的代码生成
        const templates = {
          javascript: {
            class: (name, methods) => `class ${name} {
  constructor() {
    // 初始化
  }

${methods.map(m => `  ${m}() {
    // TODO: 实现 ${m}
  }`).join('\n\n')}
}`,
            function: (name, params, body) => `function ${name}(${params.join(', ')}) {
  ${body || '// TODO: 实现'}
}`,
            asyncFunction: (name, params, body) => `async function ${name}(${params.join(', ')}) {
  ${body || '// TODO: 实现'}
}`
          },
          python: {
            class: (name, methods) => `class ${name}:
    def __init__(self):
        # 初始化
        pass

${methods.map(m => `    def ${m}(self):
        # TODO: 实现 ${m}
        pass`).join('\n\n')}`,
            function: (name, params, body) => `def ${name}(${params.join(', ')}):
    ${body || '# TODO: 实现'}`,
            asyncFunction: (name, params, body) => `async def ${name}(${params.join(', ')}):
    ${body || '# TODO: 实现'}`
          }
        };

        // 解析规范
        const spec = this.parseSpecification(params.specification);

        // 根据规范生成代码
        const language = params.language;
        const template = templates[language];

        if (!template) {
          throw new Error(`Unsupported language: ${language}`);
        }

        let code = '';

        if (spec.type === 'class') {
          code = template.class(spec.name, spec.methods || []);
        } else if (spec.type === 'function') {
          code = spec.async
            ? template.asyncFunction(spec.name, spec.params || [], spec.body)
            : template.function(spec.name, spec.params || [], spec.body);
        }

        // 应用风格偏好
        if (params.style) {
          code = this.applyStyle(code, params.style);
        }

        return {
          code,
          language: params.language,
          specification: spec
        };
      },
      parseSpecification(spec) {
        // 简单的规范解析器
        const lines = spec.toLowerCase();

        if (lines.includes('class')) {
          const nameMatch = spec.match(/class\s+(\w+)/i);
          const methodsMatch = spec.match(/methods?:\s*([\w,\s]+)/i);

          return {
            type: 'class',
            name: nameMatch ? nameMatch[1] : 'MyClass',
            methods: methodsMatch
              ? methodsMatch[1].split(',').map(m => m.trim())
              : []
          };
        }

        if (lines.includes('function')) {
          const nameMatch = spec.match(/function\s+(\w+)/i);
          const paramsMatch = spec.match(/parameters?:\s*([\w,\s]+)/i);

          return {
            type: 'function',
            name: nameMatch ? nameMatch[1] : 'myFunction',
            params: paramsMatch
              ? paramsMatch[1].split(',').map(p => p.trim())
              : [],
            async: lines.includes('async')
          };
        }

        return {
          type: 'unknown',
          raw: spec
        };
      },
      applyStyle(code, style) {
        let styled = code;

        // 应用缩进
        if (style.indentation === 'tabs') {
          styled = styled.replace(/^ {2,}/gm, m => '\t'.repeat(m.length / 2));
        } else if (style.indentSize) {
          const spaces = ' '.repeat(style.indentSize);
          styled = styled.replace(/^ {2}/gm, spaces);
        }

        // 应用引号
        if (style.quotes === 'single') {
          styled = styled.replace(/"/g, "'");
        } else if (style.quotes === 'double') {
          styled = styled.replace(/'/g, '"');
        }

        return styled;
      },
      permissions: ['api-access'],
      cacheable: true
    });

    // 代码分析工具
    framework.registerTool({
      name: 'CodeAnalyzer',
      description: '分析代码的质量、复杂性和问题',
      category: 'ai',
      parameters: {
        code: {
          type: 'string',
          description: '要分析的代码',
          required: true
        },
        language: {
          type: 'string',
          description: '编程语言',
          required: true
        },
        checks: {
          type: 'array',
          description: '要执行的检查',
          enum: ['complexity', 'quality', 'security', 'performance', 'style'],
          default: ['complexity', 'quality']
        }
      },
      handler: async (params, context) => {
        const analysis = {};

        // 复杂性分析
        if (params.checks.includes('complexity')) {
          const lines = params.code.split('\n');
          const functions = params.code.match(/function\s+\w+|=>\s*{|async\s+function/g) || [];
          const conditions = params.code.match(/if\s*\(|while\s*\(|for\s*\(|switch\s*\(/g) || [];
          const nesting = this.calculateNesting(params.code);

          analysis.complexity = {
            lines: lines.length,
            functions: functions.length,
            conditions: conditions.length,
            maxNesting: nesting,
            cyclomaticComplexity: conditions.length + 1
          };
        }

        // 质量检查
        if (params.checks.includes('quality')) {
          const issues = [];

          // 检查常见问题
          if (params.code.includes('console.log')) {
            issues.push({
              type: 'warning',
              message: '发现 Console.log 语句',
              line: this.findLine(params.code, 'console.log')
            });
          }

          if (params.code.includes('TODO') || params.code.includes('FIXME')) {
            issues.push({
              type: 'info',
              message: '发现 TODO/FIXME 注释',
              line: this.findLine(params.code, /TODO|FIXME/)
            });
          }

          if (params.language === 'javascript' && !params.code.includes('use strict')) {
            issues.push({
              type: 'warning',
              message: '缺少 "use strict" 指令'
            });
          }

          analysis.quality = {
            issues,
            score: Math.max(0, 100 - issues.length * 10)
          };
        }

        // 安全检查
        if (params.checks.includes('security')) {
          const vulnerabilities = [];

          // 检查常见安全问题
          if (params.code.includes('eval(')) {
            vulnerabilities.push({
              type: 'critical',
              message: '检测到使用 eval()',
              line: this.findLine(params.code, 'eval(')
            });
          }

          if (params.code.match(/password|secret|key/i) &&
              params.code.match(/["'][^"']+["']/)) {
            vulnerabilities.push({
              type: 'warning',
              message: '可能的硬编码凭证'
            });
          }

          analysis.security = {
            vulnerabilities,
            secure: vulnerabilities.length === 0
          };
        }

        return analysis;
      },
      calculateNesting(code) {
        let maxNesting = 0;
        let currentNesting = 0;

        for (const char of code) {
          if (char === '{') {
            currentNesting++;
            maxNesting = Math.max(maxNesting, currentNesting);
          } else if (char === '}') {
            currentNesting--;
          }
        }

        return maxNesting;
      },
      findLine(code, pattern) {
        const lines = code.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (typeof pattern === 'string') {
            if (lines[i].includes(pattern)) {
              return i + 1;
            }
          } else if (pattern.test(lines[i])) {
            return i + 1;
          }
        }
        return null;
      },
      permissions: ['api-access'],
      cacheable: true
    });
  }
}
```

## 工具组合和工作流

### 工具工作流引擎

```javascript
// ToolWorkflowEngine.js
class ToolWorkflowEngine {
  constructor(framework) {
    this.framework = framework;
    this.workflows = new Map();
    this.runningWorkflows = new Map();
  }

  defineWorkflow(definition) {
    const workflow = new ToolWorkflow(definition, this.framework);
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  async executeWorkflow(workflowId, input, context) {
    const workflow = this.workflows.get(workflowId);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = Math.random().toString(36);
    const execution = {
      id: executionId,
      workflow: workflowId,
      status: 'running',
      startTime: Date.now(),
      steps: []
    };

    this.runningWorkflows.set(executionId, execution);

    try {
      const result = await workflow.execute(input, context, execution);

      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.result = result;

      return result;

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error.message;

      throw error;

    } finally {
      this.runningWorkflows.delete(executionId);
    }
  }
}

class ToolWorkflow {
  constructor(definition, framework) {
    this.id = definition.id;
    this.name = definition.name;
    this.description = definition.description;
    this.steps = definition.steps;
    this.framework = framework;

    this.validateWorkflow();
  }

  validateWorkflow() {
    // 验证步骤依赖
    const stepIds = new Set(this.steps.map(s => s.id));

    for (const step of this.steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!stepIds.has(dep)) {
            throw new Error(`Invalid dependency: ${dep} not found`);
          }
        }
      }
    }
  }

  async execute(input, context, execution) {
    const stepResults = new Map();
    const executedSteps = new Set();

    // 构建执行顺序
    const executionOrder = this.buildExecutionOrder();

    for (const stepId of executionOrder) {
      const step = this.steps.find(s => s.id === stepId);

      // 准备步骤输入
      const stepInput = await this.prepareStepInput(
        step,
        input,
        stepResults
      );

      // 执行步骤
      const stepExecution = {
        id: step.id,
        tool: step.tool,
        startTime: Date.now()
      };

      try {
        const result = await this.executeStep(step, stepInput, context);

        stepResults.set(step.id, result);
        stepExecution.status = 'completed';
        stepExecution.result = result;

      } catch (error) {
        stepExecution.status = 'failed';
        stepExecution.error = error.message;

        if (!step.continueOnError) {
          throw error;
        }

        stepResults.set(step.id, null);
      }

      stepExecution.endTime = Date.now();
      execution.steps.push(stepExecution);
      executedSteps.add(step.id);
    }

    // 返回最终结果
    const finalStep = this.steps[this.steps.length - 1];
    return stepResults.get(finalStep.id);
  }

  buildExecutionOrder() {
    const order = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (stepId) => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error('Circular dependency detected');
      }

      visiting.add(stepId);

      const step = this.steps.find(s => s.id === stepId);
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          visit(dep);
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
      order.push(stepId);
    };

    for (const step of this.steps) {
      visit(step.id);
    }

    return order;
  }

  async prepareStepInput(step, workflowInput, stepResults) {
    if (step.input) {
      // 使用自定义输入映射
      const input = {};

      for (const [key, mapping] of Object.entries(step.input)) {
        if (typeof mapping === 'string') {
          // 引用前一个步骤结果
          if (mapping.startsWith('$')) {
            const ref = mapping.substring(1);
            const [stepId, path] = ref.split('.');

            if (stepId === 'input') {
              input[key] = this.getPath(workflowInput, path);
            } else {
              input[key] = this.getPath(stepResults.get(stepId), path);
            }
          } else {
            input[key] = mapping;
          }
        } else {
          input[key] = mapping;
        }
      }

      return input;
    }

    // 默认:传递工作流输入
    return workflowInput;
  }

  async executeStep(step, input, context) {
    // 执行工具
    const result = await this.framework.executeTool(
      step.tool,
      input,
      context
    );

    // 如果定义了转换则应用
    if (step.transform) {
      return step.transform(result);
    }

    return result;
  }

  getPath(obj, path) {
    if (!path) return obj;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }

    return current;
  }
}
```

## 结论

Claude Code 中的自定义工具为通过专门功能扩展平台功能提供了一个强大而灵活的框架。通过全面的工具开发框架,开发者可以创建与 Claude Code 的 AI 助手无缝集成的工具,处理复杂操作、数据处理和系统集成。该框架通过参数验证确保类型安全,通过权限检查确保安全性,并通过重试机制和错误处理确保可靠性。

内置的自定义工具展示了可能性的广度,从文件系统操作和数据处理到 AI 集成和代码生成。工具组合和工作流功能使创建复杂的多步操作成为可能,这些操作结合多个工具以实现复杂的结果。通过适当的分类、缓存和性能监控,自定义工具可以扩展以处理要求苛刻的工作负载,同时保持响应性和效率。

自定义工具系统的可扩展性确保 Claude Code 能够适应各种用例和需求,允许开发者创建特定领域的工具来提高生产力并启用新的工作流。通过精心设计工具框架,Claude Code 在灵活性和结构之间保持平衡,在确保可靠性和安全性的同时实现创新。