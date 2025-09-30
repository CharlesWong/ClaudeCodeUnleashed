# Part 11.4: Custom Tools

## Introduction

Custom tools in Claude Code represent a powerful extension mechanism that allows developers to create specialized functionality that integrates seamlessly with the AI assistant's capabilities. These tools extend beyond simple commands, providing structured interfaces for complex operations, data processing, and integration with external systems. The custom tools framework ensures type safety, validation, error handling, and proper integration with Claude Code's permission and security systems.

## Tool Development Framework

### Custom Tool Architecture

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
   * Register a custom tool
   */
  registerTool(definition) {
    // Validate tool definition
    this.validateToolDefinition(definition);

    // Create tool instance
    const tool = new CustomTool({
      ...definition,
      framework: this
    });

    // Register tool
    this.tools.set(tool.name, tool);

    // Register in category
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category).add(tool.name);

    // Emit registration event
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
   * Execute a tool
   */
  async executeTool(toolName, params, context) {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Check if already executing
    const executionId = this.generateExecutionId(toolName, params);
    if (this.activeExecutions.has(executionId)) {
      return this.activeExecutions.get(executionId);
    }

    // Create execution promise
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

    // Check cache
    if (tool.cacheable && this.config.caching) {
      const cached = this.checkCache(tool, params);
      if (cached) {
        this.metrics.executions++;
        this.metrics.successes++;
        return cached;
      }
    }

    // Retry loop
    while (attempt <= (tool.retryable ? this.config.retryPolicy.maxRetries : 0)) {
      try {
        // Apply middleware
        for (const middleware of this.middleware) {
          await middleware(tool, params, context);
        }

        // Validate parameters
        if (this.config.validation) {
          await tool.validateParameters(params);
        }

        // Check permissions
        await tool.checkPermissions(context);

        // Execute with timeout
        const result = await this.executeWithTimeout(
          () => tool.execute(params, context),
          tool.timeout || this.config.defaultTimeout
        );

        // Update metrics
        this.updateMetrics(tool, startTime, true);

        // Cache result
        if (tool.cacheable && this.config.caching) {
          this.cacheResult(tool, params, result);
        }

        // Emit success event
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

        // Check if retryable
        if (!tool.retryable || attempt > this.config.retryPolicy.maxRetries) {
          break;
        }

        // Calculate delay
        const delay = this.config.retryPolicy.initialDelay *
          Math.pow(this.config.retryPolicy.backoffMultiplier, attempt - 1);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));

        this.emit('tool-retry', {
          tool: tool.name,
          attempt,
          error: error.message
        });
      }
    }

    // Update metrics for failure
    this.updateMetrics(tool, startTime, false);

    // Emit failure event
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
    const ttl = tool.cacheTTL || 300000; // 5 minutes default

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

    // Update tool-specific metrics
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
    // Create Zod validators for parameters
    for (const [key, schema] of Object.entries(this.parameters)) {
      this.validators.set(key, this.createValidator(schema));
    }
  }

  createValidator(schema) {
    if (typeof schema === 'string') {
      // Simple type
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

    // Complex schema
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
    // Apply preprocessors
    let processedParams = params;
    for (const preprocessor of this.preprocessors) {
      processedParams = await preprocessor(processedParams, context);
    }

    // Execute handler
    let result = await this.handler(processedParams, context);

    // Apply postprocessors
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

### Tool Categories and Organization

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

    // Sort by priority
    result.sort((a, b) => b.priority - a.priority);

    return result;
  }

  searchTools(query, options = {}) {
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (const [categoryName, tools] of this.categories) {
      const metadata = this.categoryMetadata.get(categoryName);

      // Check category match
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

      // Check tool matches
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

// Built-in categories
class BuiltInCategories {
  static initialize(categoryManager) {
    // File system tools
    categoryManager.defineCategory('filesystem', {
      description: 'File and directory operations',
      icon: '📁',
      priority: 10,
      permissions: ['file-read', 'file-write']
    });

    // Network tools
    categoryManager.defineCategory('network', {
      description: 'Network and HTTP operations',
      icon: '🌐',
      priority: 9,
      permissions: ['network']
    });

    // Data processing tools
    categoryManager.defineCategory('data', {
      description: 'Data transformation and processing',
      icon: '📊',
      priority: 8
    });

    // Development tools
    categoryManager.defineCategory('development', {
      description: 'Development and debugging tools',
      icon: '🛠️',
      priority: 7,
      permissions: ['shell']
    });

    // AI/ML tools
    categoryManager.defineCategory('ai', {
      description: 'AI and machine learning tools',
      icon: '🤖',
      priority: 6,
      permissions: ['api-access']
    });

    // Utility tools
    categoryManager.defineCategory('utility', {
      description: 'General utility tools',
      icon: '🔧',
      priority: 5
    });

    // Custom tools
    categoryManager.defineCategory('custom', {
      description: 'User-defined custom tools',
      icon: '⚡',
      priority: 1
    });
  }
}
```

## Built-in Custom Tools

### File System Tools

```javascript
// FileSystemTools.js
class FileSystemTools {
  static register(framework) {
    // Advanced file search tool
    framework.registerTool({
      name: 'FileSearch',
      description: 'Advanced file search with pattern matching and content search',
      category: 'filesystem',
      parameters: {
        path: {
          type: 'string',
          description: 'Directory to search in',
          required: true
        },
        pattern: {
          type: 'string',
          description: 'File name pattern (glob)',
          default: '*'
        },
        contentPattern: {
          type: 'string',
          description: 'Content pattern to search for'
        },
        recursive: {
          type: 'boolean',
          description: 'Search recursively',
          default: true
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth for recursive search',
          default: 10
        },
        excludePatterns: {
          type: 'array',
          description: 'Patterns to exclude',
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

            // Check exclusions
            if (params.excludePatterns.some(pattern =>
              entry.name.includes(pattern))) {
              continue;
            }

            if (entry.isDirectory() && params.recursive) {
              await searchDirectory(fullPath, depth + 1);
            } else if (entry.isFile()) {
              // Check file name pattern
              if (!glob.minimatch(entry.name, params.pattern)) {
                continue;
              }

              // Check content pattern if specified
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
      cacheTTL: 60000 // 1 minute
    });

    // File transformation tool
    framework.registerTool({
      name: 'FileTransform',
      description: 'Transform file contents with custom operations',
      category: 'filesystem',
      parameters: {
        inputPath: {
          type: 'string',
          description: 'Input file path',
          required: true
        },
        outputPath: {
          type: 'string',
          description: 'Output file path'
        },
        operations: {
          type: 'array',
          description: 'Transformation operations',
          required: true
        }
      },
      handler: async (params, context) => {
        const fs = require('fs').promises;

        // Read input file
        let content = await fs.readFile(params.inputPath, 'utf8');

        // Apply transformations
        for (const operation of params.operations) {
          content = await applyOperation(content, operation);
        }

        // Write output
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
              // Custom transformation function
              return operation.fn(content);

            default:
              return content;
          }
        }
      },
      permissions: ['file-read', 'file-write']
    });

    // Directory sync tool
    framework.registerTool({
      name: 'DirectorySync',
      description: 'Synchronize directories with various strategies',
      category: 'filesystem',
      parameters: {
        source: {
          type: 'string',
          description: 'Source directory',
          required: true
        },
        target: {
          type: 'string',
          description: 'Target directory',
          required: true
        },
        strategy: {
          type: 'string',
          enum: ['mirror', 'merge', 'update'],
          description: 'Sync strategy',
          default: 'merge'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying',
          default: false
        },
        excludePatterns: {
          type: 'array',
          description: 'Patterns to exclude'
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

          // Get target entries
          const targetEntries = targetExists
            ? await fs.readdir(target, { withFileTypes: true })
            : [];

          const targetMap = new Map(
            targetEntries.map(e => [e.name, e])
          );

          // Process source entries
          for (const entry of sourceEntries) {
            const sourcePath = path.join(source, entry.name);
            const targetPath = path.join(target, entry.name);
            const relPath = path.join(relativePath, entry.name);

            // Check exclusions
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
                // File doesn't exist in target
                changes.created.push(relPath);
                if (!params.dryRun) {
                  await fs.copy(sourcePath, targetPath);
                }
              } else {
                // File exists, check if update needed
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

          // Handle deletions (mirror strategy only)
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
      timeout: 60000 // 1 minute
    });
  }
}
```

### Data Processing Tools

```javascript
// DataProcessingTools.js
class DataProcessingTools {
  static register(framework) {
    // JSON transformation tool
    framework.registerTool({
      name: 'JSONTransform',
      description: 'Transform JSON data with JSONPath and custom operations',
      category: 'data',
      parameters: {
        data: {
          type: 'object',
          description: 'Input JSON data',
          required: true
        },
        transformations: {
          type: 'array',
          description: 'Transformation operations',
          required: true
        }
      },
      handler: async (params, context) => {
        const jp = require('jsonpath');
        let data = JSON.parse(JSON.stringify(params.data)); // Deep copy

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

    // CSV processing tool
    framework.registerTool({
      name: 'CSVProcessor',
      description: 'Process CSV data with filtering, transformation, and aggregation',
      category: 'data',
      parameters: {
        input: {
          type: 'string',
          description: 'CSV content or file path',
          required: true
        },
        inputType: {
          type: 'string',
          enum: ['content', 'file'],
          default: 'content'
        },
        operations: {
          type: 'array',
          description: 'Processing operations'
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

        // Load data
        let content = params.input;
        if (params.inputType === 'file') {
          content = await fs.readFile(params.input, 'utf8');
        }

        // Parse CSV
        let records = csv.parse(content, {
          columns: true,
          skip_empty_lines: true
        });

        // Apply operations
        for (const op of params.operations || []) {
          records = await applyOperation(records, op);
        }

        // Format output
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

    // Text analysis tool
    framework.registerTool({
      name: 'TextAnalyzer',
      description: 'Analyze text with various NLP operations',
      category: 'data',
      parameters: {
        text: {
          type: 'string',
          description: 'Text to analyze',
          required: true
        },
        analyses: {
          type: 'array',
          description: 'Analysis types to perform',
          enum: ['sentiment', 'entities', 'keywords', 'summary', 'language', 'statistics'],
          default: ['statistics']
        }
      },
      handler: async (params, context) => {
        const results = {};

        // Statistics
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

        // Keywords extraction
        if (params.analyses.includes('keywords')) {
          const words = params.text.toLowerCase().split(/\W+/);
          const wordFreq = {};

          for (const word of words) {
            if (word.length > 3) { // Skip short words
              wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
          }

          results.keywords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({ word, count }));
        }

        // Language detection
        if (params.analyses.includes('language')) {
          // Simple language detection based on common words
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

        // Summary generation
        if (params.analyses.includes('summary')) {
          const sentences = params.text.split(/[.!?]+/).filter(s => s.trim());

          // Simple extractive summarization
          const importantSentences = sentences
            .map(sentence => ({
              text: sentence.trim(),
              score: sentence.split(/\s+/).length // Simple scoring by length
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

### AI Integration Tools

```javascript
// AIIntegrationTools.js
class AIIntegrationTools {
  static register(framework) {
    // Code generation tool
    framework.registerTool({
      name: 'CodeGenerator',
      description: 'Generate code based on specifications',
      category: 'ai',
      parameters: {
        specification: {
          type: 'string',
          description: 'Code specification or requirements',
          required: true
        },
        language: {
          type: 'string',
          description: 'Programming language',
          enum: ['javascript', 'python', 'typescript', 'java', 'go', 'rust'],
          required: true
        },
        style: {
          type: 'object',
          description: 'Code style preferences',
          properties: {
            indentation: { type: 'string', enum: ['spaces', 'tabs'] },
            indentSize: { type: 'number' },
            quotes: { type: 'string', enum: ['single', 'double'] },
            semicolons: { type: 'boolean' }
          }
        },
        context: {
          type: 'object',
          description: 'Additional context for generation'
        }
      },
      handler: async (params, context) => {
        // Template-based code generation
        const templates = {
          javascript: {
            class: (name, methods) => `class ${name} {
  constructor() {
    // Initialize
  }

${methods.map(m => `  ${m}() {
    // TODO: Implement ${m}
  }`).join('\n\n')}
}`,
            function: (name, params, body) => `function ${name}(${params.join(', ')}) {
  ${body || '// TODO: Implement'}
}`,
            asyncFunction: (name, params, body) => `async function ${name}(${params.join(', ')}) {
  ${body || '// TODO: Implement'}
}`
          },
          python: {
            class: (name, methods) => `class ${name}:
    def __init__(self):
        # Initialize
        pass

${methods.map(m => `    def ${m}(self):
        # TODO: Implement ${m}
        pass`).join('\n\n')}`,
            function: (name, params, body) => `def ${name}(${params.join(', ')}):
    ${body || '# TODO: Implement'}`,
            asyncFunction: (name, params, body) => `async def ${name}(${params.join(', ')}):
    ${body || '# TODO: Implement'}`
          }
        };

        // Parse specification
        const spec = this.parseSpecification(params.specification);

        // Generate code based on specification
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

        // Apply style preferences
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
        // Simple specification parser
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

        // Apply indentation
        if (style.indentation === 'tabs') {
          styled = styled.replace(/^ {2,}/gm, m => '\t'.repeat(m.length / 2));
        } else if (style.indentSize) {
          const spaces = ' '.repeat(style.indentSize);
          styled = styled.replace(/^ {2}/gm, spaces);
        }

        // Apply quotes
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

    // Code analysis tool
    framework.registerTool({
      name: 'CodeAnalyzer',
      description: 'Analyze code for quality, complexity, and issues',
      category: 'ai',
      parameters: {
        code: {
          type: 'string',
          description: 'Code to analyze',
          required: true
        },
        language: {
          type: 'string',
          description: 'Programming language',
          required: true
        },
        checks: {
          type: 'array',
          description: 'Checks to perform',
          enum: ['complexity', 'quality', 'security', 'performance', 'style'],
          default: ['complexity', 'quality']
        }
      },
      handler: async (params, context) => {
        const analysis = {};

        // Complexity analysis
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

        // Quality checks
        if (params.checks.includes('quality')) {
          const issues = [];

          // Check for common issues
          if (params.code.includes('console.log')) {
            issues.push({
              type: 'warning',
              message: 'Console.log statements found',
              line: this.findLine(params.code, 'console.log')
            });
          }

          if (params.code.includes('TODO') || params.code.includes('FIXME')) {
            issues.push({
              type: 'info',
              message: 'TODO/FIXME comments found',
              line: this.findLine(params.code, /TODO|FIXME/)
            });
          }

          if (params.language === 'javascript' && !params.code.includes('use strict')) {
            issues.push({
              type: 'warning',
              message: 'Missing "use strict" directive'
            });
          }

          analysis.quality = {
            issues,
            score: Math.max(0, 100 - issues.length * 10)
          };
        }

        // Security checks
        if (params.checks.includes('security')) {
          const vulnerabilities = [];

          // Check for common security issues
          if (params.code.includes('eval(')) {
            vulnerabilities.push({
              type: 'critical',
              message: 'Use of eval() detected',
              line: this.findLine(params.code, 'eval(')
            });
          }

          if (params.code.match(/password|secret|key/i) &&
              params.code.match(/["'][^"']+["']/)) {
            vulnerabilities.push({
              type: 'warning',
              message: 'Possible hardcoded credentials'
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

## Tool Composition and Workflows

### Tool Workflow Engine

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
    // Validate step dependencies
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

    // Build execution order
    const executionOrder = this.buildExecutionOrder();

    for (const stepId of executionOrder) {
      const step = this.steps.find(s => s.id === stepId);

      // Prepare step input
      const stepInput = await this.prepareStepInput(
        step,
        input,
        stepResults
      );

      // Execute step
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

    // Return final result
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
      // Use custom input mapping
      const input = {};

      for (const [key, mapping] of Object.entries(step.input)) {
        if (typeof mapping === 'string') {
          // Reference to previous step result
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

    // Default: pass through workflow input
    return workflowInput;
  }

  async executeStep(step, input, context) {
    // Execute tool
    const result = await this.framework.executeTool(
      step.tool,
      input,
      context
    );

    // Apply transformation if defined
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

## Conclusion

Custom tools in Claude Code provide a powerful and flexible framework for extending the platform's capabilities with specialized functionality. Through the comprehensive tool development framework, developers can create tools that integrate seamlessly with Claude Code's AI assistant, handling complex operations, data processing, and system integrations. The framework ensures type safety through parameter validation, security through permission checks, and reliability through retry mechanisms and error handling.

The built-in custom tools demonstrate the breadth of possibilities, from file system operations and data processing to AI integration and code generation. The tool composition and workflow capabilities enable the creation of complex multi-step operations that combine multiple tools to achieve sophisticated outcomes. With proper categorization, caching, and performance monitoring, custom tools can scale to handle demanding workloads while maintaining responsiveness and efficiency.

The extensibility of the custom tools system ensures that Claude Code can adapt to diverse use cases and requirements, allowing developers to create domain-specific tools that enhance productivity and enable new workflows. Through careful design of the tool framework, Claude Code maintains a balance between flexibility and structure, enabling innovation while ensuring reliability and security.