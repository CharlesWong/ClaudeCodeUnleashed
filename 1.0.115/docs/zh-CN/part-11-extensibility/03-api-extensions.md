# Part 11.3: API 扩展

## 简介

Claude Code 中的 API 扩展提供了一种强大的机制,用于通过自定义 API、服务集成和协议实现来扩展平台功能。该系统使开发者能够创建新的 API 端点、与外部服务集成、实现自定义协议,并通过附加功能扩展模型上下文协议(MCP)。API 扩展框架确保类型安全、安全性和性能,同时保持向后兼容性并实现与现有 Claude Code 功能的无缝集成。

## 核心 API 扩展框架

### API 扩展管理器

```javascript
// APIExtensionManager.js
import { EventEmitter } from 'events';
import { Router } from 'express';
import { validateSchema } from './validators';
import { RateLimiter } from './rate-limiter';

class APIExtensionManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.extensions = new Map();
    this.routes = new Map();
    this.middleware = [];
    this.validators = new Map();
    this.transformers = new Map();

    this.config = {
      baseUrl: options.baseUrl || '/api/extensions',
      maxRequestSize: options.maxRequestSize || '10mb',
      timeout: options.timeout || 30000,
      rateLimiting: options.rateLimiting !== false,
      authentication: options.authentication !== false,
      cors: options.cors || {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
      },
      ...options
    };

    this.router = new Router();
    this.rateLimiter = new RateLimiter(this.config.rateLimiting);
    this.isInitialized = false;
  }

  async initialize() {
    // 设置全局中间件
    this.setupGlobalMiddleware();

    // 加载内置扩展
    await this.loadBuiltInExtensions();

    // 初始化路由
    this.initializeRoutes();

    this.isInitialized = true;
    this.emit('initialized');
  }

  registerExtension(extension) {
    if (this.extensions.has(extension.id)) {
      throw new Error(`Extension already registered: ${extension.id}`);
    }

    // 验证扩展
    this.validateExtension(extension);

    // 注册路由
    if (extension.routes) {
      this.registerRoutes(extension);
    }

    // 注册验证器
    if (extension.validators) {
      this.registerValidators(extension);
    }

    // 注册转换器
    if (extension.transformers) {
      this.registerTransformers(extension);
    }

    // 存储扩展
    this.extensions.set(extension.id, extension);

    // 初始化扩展
    if (extension.initialize) {
      extension.initialize(this.createExtensionContext(extension));
    }

    this.emit('extension-registered', extension);
  }

  validateExtension(extension) {
    const required = ['id', 'name', 'version'];

    for (const field of required) {
      if (!extension[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // 验证路由
    if (extension.routes) {
      for (const route of extension.routes) {
        this.validateRoute(route);
      }
    }
  }

  validateRoute(route) {
    if (!route.path || !route.method || !route.handler) {
      throw new Error('Invalid route definition');
    }

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(route.method.toUpperCase())) {
      throw new Error(`Invalid HTTP method: ${route.method}`);
    }
  }

  registerRoutes(extension) {
    for (const route of extension.routes) {
      const fullPath = `${this.config.baseUrl}/${extension.id}${route.path}`;

      // 创建路由处理器
      const handler = this.createRouteHandler(extension, route);

      // 注册到路由器
      const method = route.method.toLowerCase();
      this.router[method](fullPath, handler);

      // 存储路由映射
      this.routes.set(`${method}:${fullPath}`, {
        extension: extension.id,
        route
      });
    }
  }

  createRouteHandler(extension, route) {
    return async (req, res, next) => {
      try {
        // 创建请求上下文
        const context = {
          extension: extension.id,
          route: route.path,
          method: route.method,
          request: req,
          response: res,
          user: req.user,
          session: req.session
        };

        // 应用速率限制
        if (this.config.rateLimiting && route.rateLimit !== false) {
          await this.rateLimiter.check(context);
        }

        // 验证请求
        if (route.validation) {
          await this.validateRequest(req, route.validation);
        }

        // 应用转换器
        if (route.transformers) {
          req = await this.applyTransformers(req, route.transformers);
        }

        // 执行处理器
        const result = await this.executeWithTimeout(
          () => route.handler(req, res, context),
          route.timeout || this.config.timeout
        );

        // 转换响应
        if (route.responseTransformer) {
          const transformed = await route.responseTransformer(result, context);
          res.json(transformed);
        } else if (result !== undefined) {
          res.json(result);
        }

      } catch (error) {
        next(error);
      }
    };
  }

  async validateRequest(req, validation) {
    // 验证参数
    if (validation.params) {
      const errors = validateSchema(req.params, validation.params);
      if (errors.length > 0) {
        throw new ValidationError('Invalid parameters', errors);
      }
    }

    // 验证查询
    if (validation.query) {
      const errors = validateSchema(req.query, validation.query);
      if (errors.length > 0) {
        throw new ValidationError('Invalid query', errors);
      }
    }

    // 验证主体
    if (validation.body) {
      const errors = validateSchema(req.body, validation.body);
      if (errors.length > 0) {
        throw new ValidationError('Invalid request body', errors);
      }
    }

    // 验证头部
    if (validation.headers) {
      const errors = validateSchema(req.headers, validation.headers);
      if (errors.length > 0) {
        throw new ValidationError('Invalid headers', errors);
      }
    }
  }

  async executeWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);
  }

  createExtensionContext(extension) {
    return {
      id: extension.id,
      config: this.config,
      logger: this.createExtensionLogger(extension),
      storage: this.createExtensionStorage(extension),
      events: this.createExtensionEventBus(extension),

      // API 方法
      registerRoute: (route) => this.registerRoute(extension, route),
      registerValidator: (name, validator) => this.registerValidator(extension, name, validator),
      registerTransformer: (name, transformer) => this.registerTransformer(extension, name, transformer),

      // 实用方法
      callExtension: (id, method, ...args) => this.callExtension(id, method, ...args),
      getExtension: (id) => this.extensions.get(id)
    };
  }
}
```

### RESTful API 扩展

```javascript
// RESTfulAPIExtension.js
class RESTfulAPIExtension {
  constructor(options = {}) {
    this.id = options.id;
    this.name = options.name;
    this.version = options.version;
    this.basePath = options.basePath || `/api/${options.id}`;

    this.resources = new Map();
    this.controllers = new Map();
    this.middleware = [];
  }

  defineResource(name, definition) {
    const resource = new RESTfulResource({
      name,
      ...definition
    });

    this.resources.set(name, resource);

    // 生成路由
    const routes = resource.generateRoutes();

    return {
      resource,
      routes
    };
  }

  generateOpenAPISpec() {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: this.name,
        version: this.version,
        description: `API specification for ${this.name}`
      },
      servers: [
        {
          url: this.basePath,
          description: 'Extension API'
        }
      ],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {}
      }
    };

    // 为每个资源生成路径
    for (const [name, resource] of this.resources) {
      const paths = resource.generateOpenAPIPaths();
      Object.assign(spec.paths, paths);

      const schemas = resource.generateSchemas();
      Object.assign(spec.components.schemas, schemas);
    }

    return spec;
  }
}

class RESTfulResource {
  constructor(options) {
    this.name = options.name;
    this.singular = options.singular || this.name.slice(0, -1);
    this.schema = options.schema;
    this.controller = options.controller;
    this.middleware = options.middleware || [];
    this.hooks = options.hooks || {};
  }

  generateRoutes() {
    const routes = [];

    // 列表路由 (GET /resources)
    if (this.controller.index) {
      routes.push({
        method: 'GET',
        path: `/${this.name}`,
        handler: this.wrapHandler('index'),
        middleware: [...this.middleware, ...(this.hooks.beforeIndex || [])],
        validation: {
          query: this.schema.listQuery
        }
      });
    }

    // 创建路由 (POST /resources)
    if (this.controller.create) {
      routes.push({
        method: 'POST',
        path: `/${this.name}`,
        handler: this.wrapHandler('create'),
        middleware: [...this.middleware, ...(this.hooks.beforeCreate || [])],
        validation: {
          body: this.schema.create
        }
      });
    }

    // 读取路由 (GET /resources/:id)
    if (this.controller.show) {
      routes.push({
        method: 'GET',
        path: `/${this.name}/:id`,
        handler: this.wrapHandler('show'),
        middleware: [...this.middleware, ...(this.hooks.beforeShow || [])],
        validation: {
          params: { id: { type: 'string', required: true } }
        }
      });
    }

    // 更新路由 (PUT /resources/:id)
    if (this.controller.update) {
      routes.push({
        method: 'PUT',
        path: `/${this.name}/:id`,
        handler: this.wrapHandler('update'),
        middleware: [...this.middleware, ...(this.hooks.beforeUpdate || [])],
        validation: {
          params: { id: { type: 'string', required: true } },
          body: this.schema.update
        }
      });
    }

    // 部分更新路由 (PATCH /resources/:id)
    if (this.controller.patch) {
      routes.push({
        method: 'PATCH',
        path: `/${this.name}/:id`,
        handler: this.wrapHandler('patch'),
        middleware: [...this.middleware, ...(this.hooks.beforePatch || [])],
        validation: {
          params: { id: { type: 'string', required: true } },
          body: this.schema.patch
        }
      });
    }

    // 删除路由 (DELETE /resources/:id)
    if (this.controller.destroy) {
      routes.push({
        method: 'DELETE',
        path: `/${this.name}/:id`,
        handler: this.wrapHandler('destroy'),
        middleware: [...this.middleware, ...(this.hooks.beforeDestroy || [])],
        validation: {
          params: { id: { type: 'string', required: true } }
        }
      });
    }

    // 批量操作
    if (this.controller.bulkCreate) {
      routes.push({
        method: 'POST',
        path: `/${this.name}/bulk`,
        handler: this.wrapHandler('bulkCreate'),
        validation: {
          body: { type: 'array', items: this.schema.create }
        }
      });
    }

    if (this.controller.bulkUpdate) {
      routes.push({
        method: 'PUT',
        path: `/${this.name}/bulk`,
        handler: this.wrapHandler('bulkUpdate'),
        validation: {
          body: { type: 'array', items: this.schema.update }
        }
      });
    }

    if (this.controller.bulkDelete) {
      routes.push({
        method: 'DELETE',
        path: `/${this.name}/bulk`,
        handler: this.wrapHandler('bulkDelete'),
        validation: {
          body: { ids: { type: 'array', items: { type: 'string' } } }
        }
      });
    }

    return routes;
  }

  wrapHandler(method) {
    return async (req, res, context) => {
      try {
        // 执行前置钩子
        if (this.hooks[`before${method.charAt(0).toUpperCase() + method.slice(1)}`]) {
          await this.hooks[`before${method.charAt(0).toUpperCase() + method.slice(1)}`](req, res, context);
        }

        // 执行控制器方法
        const result = await this.controller[method](req, res, context);

        // 执行后置钩子
        if (this.hooks[`after${method.charAt(0).toUpperCase() + method.slice(1)}`]) {
          await this.hooks[`after${method.charAt(0).toUpperCase() + method.slice(1)}`](result, req, res, context);
        }

        return result;

      } catch (error) {
        // 执行错误钩子
        if (this.hooks.onError) {
          await this.hooks.onError(error, req, res, context);
        }
        throw error;
      }
    };
  }

  generateOpenAPIPaths() {
    const paths = {};
    const routes = this.generateRoutes();

    for (const route of routes) {
      const path = route.path.replace(/:(\w+)/g, '{$1}');

      if (!paths[path]) {
        paths[path] = {};
      }

      paths[path][route.method.toLowerCase()] = {
        summary: `${route.method} ${this.name}`,
        operationId: `${route.method.toLowerCase()}${this.name}`,
        parameters: this.generateParameters(route),
        requestBody: this.generateRequestBody(route),
        responses: this.generateResponses(route)
      };
    }

    return paths;
  }

  generateSchemas() {
    return {
      [this.singular]: this.schema.model,
      [`${this.singular}Create`]: this.schema.create,
      [`${this.singular}Update`]: this.schema.update,
      [`${this.singular}List`]: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: `#/components/schemas/${this.singular}` }
          },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' }
        }
      }
    };
  }
}
```

## GraphQL API 扩展

### GraphQL 扩展系统

```javascript
// GraphQLAPIExtension.js
import { GraphQLSchema, GraphQLObjectType, GraphQLList, GraphQLNonNull } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { mergeSchemas } from '@graphql-tools/merge';

class GraphQLAPIExtension {
  constructor(options = {}) {
    this.id = options.id;
    this.name = options.name;
    this.version = options.version;

    this.typeDefs = [];
    this.resolvers = {};
    this.directives = {};
    this.subscriptions = {};
    this.dataSources = new Map();

    this.schema = null;
  }

  addTypeDefs(typeDefs) {
    if (Array.isArray(typeDefs)) {
      this.typeDefs.push(...typeDefs);
    } else {
      this.typeDefs.push(typeDefs);
    }
  }

  addResolvers(resolvers) {
    this.mergeResolvers(this.resolvers, resolvers);
  }

  mergeResolvers(target, source) {
    for (const [type, fields] of Object.entries(source)) {
      if (!target[type]) {
        target[type] = {};
      }

      for (const [field, resolver] of Object.entries(fields)) {
        target[type][field] = resolver;
      }
    }
  }

  addDirective(name, implementation) {
    this.directives[name] = implementation;
  }

  addSubscription(name, definition) {
    this.subscriptions[name] = definition;
  }

  addDataSource(name, dataSource) {
    this.dataSources.set(name, dataSource);
  }

  buildSchema() {
    // 组合所有类型定义
    const combinedTypeDefs = `
      ${this.typeDefs.join('\n')}

      type Query {
        ${this.generateQueryFields()}
      }

      type Mutation {
        ${this.generateMutationFields()}
      }

      ${Object.keys(this.subscriptions).length > 0 ? `
      type Subscription {
        ${this.generateSubscriptionFields()}
      }` : ''}
    `;

    // 构建可执行模式
    this.schema = makeExecutableSchema({
      typeDefs: combinedTypeDefs,
      resolvers: this.resolvers,
      schemaDirectives: this.directives
    });

    return this.schema;
  }

  generateQueryFields() {
    const queries = [];

    for (const [type, fields] of Object.entries(this.resolvers.Query || {})) {
      queries.push(`${type}: ${this.inferReturnType(fields[type])}`);
    }

    return queries.join('\n    ') || '_empty: String';
  }

  generateMutationFields() {
    const mutations = [];

    for (const [type, fields] of Object.entries(this.resolvers.Mutation || {})) {
      mutations.push(`${type}: ${this.inferReturnType(fields[type])}`);
    }

    return mutations.join('\n    ') || '_empty: String';
  }

  generateSubscriptionFields() {
    const subscriptions = [];

    for (const [name, definition] of Object.entries(this.subscriptions)) {
      subscriptions.push(`${name}: ${definition.type}`);
    }

    return subscriptions.join('\n    ');
  }

  inferReturnType(resolver) {
    // 简单的类型推断 - 需要更复杂的实现
    return 'String';
  }

  createContext(request) {
    return {
      request,
      dataSources: this.createDataSourcesContext(),
      user: request.user,
      extensionId: this.id
    };
  }

  createDataSourcesContext() {
    const context = {};

    for (const [name, DataSource] of this.dataSources) {
      context[name] = new DataSource();
    }

    return context;
  }
}
```

## 模型上下文协议(MCP)扩展

### MCP 扩展框架

```javascript
// MCPExtension.js
class MCPExtension {
  constructor(options = {}) {
    this.id = options.id;
    this.name = options.name;
    this.version = options.version;
    this.capabilities = options.capabilities || [];

    this.handlers = new Map();
    this.resources = new Map();
    this.tools = new Map();
    this.prompts = new Map();
    this.samplers = new Map();
  }

  /**
   * 为 MCP 注册工具
   */
  registerTool(definition) {
    const tool = {
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      handler: definition.handler,
      category: definition.category || 'custom',
      permissions: definition.permissions || []
    };

    this.tools.set(tool.name, tool);

    return {
      tool,
      dispose: () => this.tools.delete(tool.name)
    };
  }

  /**
   * 注册资源提供者
   */
  registerResource(definition) {
    const resource = {
      uri: definition.uri,
      name: definition.name,
      description: definition.description,
      mimeType: definition.mimeType || 'text/plain',
      handler: definition.handler,
      schema: definition.schema
    };

    this.resources.set(resource.uri, resource);

    return {
      resource,
      dispose: () => this.resources.delete(resource.uri)
    };
  }

  /**
   * 注册提示模板
   */
  registerPrompt(definition) {
    const prompt = {
      name: definition.name,
      description: definition.description,
      arguments: definition.arguments || [],
      template: definition.template,
      handler: definition.handler,
      examples: definition.examples || []
    };

    this.prompts.set(prompt.name, prompt);

    return {
      prompt,
      dispose: () => this.prompts.delete(prompt.name)
    };
  }

  /**
   * 注册采样提供者
   */
  registerSampler(definition) {
    const sampler = {
      name: definition.name,
      description: definition.description,
      handler: definition.handler,
      config: definition.config || {}
    };

    this.samplers.set(sampler.name, sampler);

    return {
      sampler,
      dispose: () => this.samplers.delete(sampler.name)
    };
  }

  /**
   * 处理 MCP 请求
   */
  async handleRequest(request) {
    switch (request.method) {
      case 'tools/list':
        return this.listTools();

      case 'tools/call':
        return this.callTool(request.params);

      case 'resources/list':
        return this.listResources();

      case 'resources/read':
        return this.readResource(request.params);

      case 'prompts/list':
        return this.listPrompts();

      case 'prompts/get':
        return this.getPrompt(request.params);

      case 'sampling/createMessage':
        return this.createSampledMessage(request.params);

      default:
        throw new Error(`Unknown method: ${request.method}`);
    }
  }

  async listTools() {
    const tools = [];

    for (const [name, tool] of this.tools) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      });
    }

    return { tools };
  }

  async callTool(params) {
    const tool = this.tools.get(params.name);

    if (!tool) {
      throw new Error(`Tool not found: ${params.name}`);
    }

    // 验证输入
    if (tool.inputSchema) {
      const validation = this.validateInput(params.arguments, tool.inputSchema);
      if (!validation.valid) {
        throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
      }
    }

    // 执行工具
    const result = await tool.handler(params.arguments);

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async listResources() {
    const resources = [];

    for (const [uri, resource] of this.resources) {
      resources.push({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType
      });
    }

    return { resources };
  }

  async readResource(params) {
    const resource = this.resources.get(params.uri);

    if (!resource) {
      throw new Error(`Resource not found: ${params.uri}`);
    }

    const content = await resource.handler(params);

    return {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: content
        }
      ]
    };
  }

  validateInput(input, schema) {
    // 实现 JSON Schema 验证
    const errors = [];

    // 检查必需属性
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in input)) {
          errors.push(`Missing required property: ${prop}`);
        }
      }
    }

    // 检查属性类型
    if (schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in input) {
          const value = input[prop];
          const type = propSchema.type;

          if (type && typeof value !== type) {
            errors.push(`Invalid type for ${prop}: expected ${type}, got ${typeof value}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## WebSocket API 扩展

### WebSocket 扩展系统

```javascript
// WebSocketAPIExtension.js
import WebSocket from 'ws';
import { EventEmitter } from 'events';

class WebSocketAPIExtension extends EventEmitter {
  constructor(options = {}) {
    super();

    this.id = options.id;
    this.name = options.name;
    this.version = options.version;
    this.path = options.path || `/ws/${options.id}`;

    this.server = null;
    this.clients = new Map();
    this.rooms = new Map();
    this.handlers = new Map();
    this.middleware = [];

    this.config = {
      port: options.port || 8080,
      heartbeat: options.heartbeat || 30000,
      maxClients: options.maxClients || 1000,
      maxMessageSize: options.maxMessageSize || 1024 * 1024, // 1MB
      ...options
    };
  }

  async initialize() {
    // 创建 WebSocket 服务器
    this.server = new WebSocket.Server({
      port: this.config.port,
      path: this.path,
      maxPayload: this.config.maxMessageSize,
      verifyClient: this.verifyClient.bind(this)
    });

    // 设置事件处理器
    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleServerError.bind(this));

    // 启动心跳
    this.startHeartbeat();

    console.log(`WebSocket server listening on port ${this.config.port}`);
  }

  async verifyClient(info, cb) {
    try {
      // 运行中间件
      for (const middleware of this.middleware) {
        const result = await middleware(info);
        if (result === false) {
          cb(false, 401, 'Unauthorized');
          return;
        }
      }

      // 检查客户端限制
      if (this.clients.size >= this.config.maxClients) {
        cb(false, 503, 'Server full');
        return;
      }

      cb(true);
    } catch (error) {
      cb(false, 500, 'Internal error');
    }
  }

  handleConnection(ws, request) {
    const clientId = this.generateClientId();
    const client = {
      id: clientId,
      ws,
      request,
      isAlive: true,
      metadata: {},
      rooms: new Set(),
      subscriptions: new Set()
    };

    this.clients.set(clientId, client);

    // 设置客户端事件处理器
    ws.on('message', (data) => this.handleMessage(client, data));
    ws.on('pong', () => this.handlePong(client));
    ws.on('close', () => this.handleDisconnection(client));
    ws.on('error', (error) => this.handleClientError(client, error));

    // 发送欢迎消息
    this.send(client, {
      type: 'connected',
      clientId,
      timestamp: Date.now()
    });

    this.emit('client-connected', client);
  }

  async handleMessage(client, data) {
    try {
      // 解析消息
      const message = this.parseMessage(data);

      // 验证消息
      if (!message.type) {
        throw new Error('Message type required');
      }

      // 获取处理器
      const handler = this.handlers.get(message.type);

      if (!handler) {
        throw new Error(`Unknown message type: ${message.type}`);
      }

      // 执行处理器
      const response = await handler(message, client);

      // 如果有响应则发送
      if (response) {
        this.send(client, response);
      }

    } catch (error) {
      this.send(client, {
        type: 'error',
        error: error.message
      });
    }
  }

  registerHandler(type, handler) {
    this.handlers.set(type, handler);

    return {
      dispose: () => this.handlers.delete(type)
    };
  }

  send(client, message) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  broadcast(message, filter) {
    for (const [id, client] of this.clients) {
      if (!filter || filter(client)) {
        this.send(client, message);
      }
    }
  }

  broadcastToRoom(room, message, excludeClient) {
    const roomClients = this.rooms.get(room);

    if (!roomClients) return;

    for (const clientId of roomClients) {
      if (clientId === excludeClient?.id) continue;

      const client = this.clients.get(clientId);
      if (client) {
        this.send(client, message);
      }
    }
  }

  joinRoom(client, room) {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }

    this.rooms.get(room).add(client.id);
    client.rooms.add(room);

    this.broadcastToRoom(room, {
      type: 'room-joined',
      room,
      clientId: client.id
    }, client);
  }

  leaveRoom(client, room) {
    const roomClients = this.rooms.get(room);

    if (roomClients) {
      roomClients.delete(client.id);

      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }

    client.rooms.delete(room);

    this.broadcastToRoom(room, {
      type: 'room-left',
      room,
      clientId: client.id
    });
  }

  handleDisconnection(client) {
    // 离开所有房间
    for (const room of client.rooms) {
      this.leaveRoom(client, room);
    }

    // 移除客户端
    this.clients.delete(client.id);

    this.emit('client-disconnected', client);
  }

  handleClientError(client, error) {
    console.error(`Client ${client.id} error:`, error);
    this.emit('client-error', { client, error });
  }

  handleServerError(error) {
    console.error('Server error:', error);
    this.emit('server-error', error);
  }

  handlePong(client) {
    client.isAlive = true;
  }

  startHeartbeat() {
    setInterval(() => {
      for (const [id, client] of this.clients) {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(id);
          continue;
        }

        client.isAlive = false;
        client.ws.ping();
      }
    }, this.config.heartbeat);
  }

  parseMessage(data) {
    try {
      if (typeof data === 'string') {
        return JSON.parse(data);
      }

      // 处理二进制数据
      return {
        type: 'binary',
        data: data
      };
    } catch {
      throw new Error('Invalid message format');
    }
  }

  generateClientId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async shutdown() {
    // 关闭所有客户端连接
    for (const [id, client] of this.clients) {
      client.ws.close(1000, 'Server shutdown');
    }

    // 关闭服务器
    return new Promise((resolve) => {
      this.server.close(resolve);
    });
  }
}
```

## API 网关和路由

### API 网关

```javascript
// APIGateway.js
class APIGateway {
  constructor(options = {}) {
    this.routes = new Map();
    this.middleware = [];
    this.transformers = new Map();
    this.rateLimiters = new Map();
    this.cache = new Map();

    this.config = {
      prefix: options.prefix || '/api',
      version: options.version || 'v1',
      timeout: options.timeout || 30000,
      caching: options.caching !== false,
      compression: options.compression !== false,
      ...options
    };
  }

  registerAPI(api) {
    const basePath = `${this.config.prefix}/${this.config.version}/${api.id}`;

    // 注册路由
    for (const route of api.routes) {
      const fullPath = `${basePath}${route.path}`;
      this.registerRoute(fullPath, route, api);
    }

    // 注册中间件
    if (api.middleware) {
      this.registerMiddleware(api.middleware, basePath);
    }

    // 注册转换器
    if (api.transformers) {
      for (const [name, transformer] of Object.entries(api.transformers)) {
        this.transformers.set(`${api.id}.${name}`, transformer);
      }
    }
  }

  registerRoute(path, route, api) {
    const key = `${route.method}:${path}`;

    this.routes.set(key, {
      ...route,
      api: api.id,
      path,
      originalPath: route.path
    });
  }

  async handleRequest(req, res) {
    const key = `${req.method}:${req.path}`;
    const route = this.findRoute(key);

    if (!route) {
      return this.sendError(res, 404, 'Route not found');
    }

    try {
      // 应用全局中间件
      await this.applyMiddleware(req, res, this.middleware);

      // 应用路由中间件
      if (route.middleware) {
        await this.applyMiddleware(req, res, route.middleware);
      }

      // 检查缓存
      if (this.config.caching && route.cache) {
        const cached = await this.checkCache(req);
        if (cached) {
          return this.sendResponse(res, cached);
        }
      }

      // 应用速率限制
      if (route.rateLimit) {
        await this.applyRateLimit(req, route);
      }

      // 转换请求
      if (route.requestTransformer) {
        req = await this.applyTransformer(req, route.requestTransformer);
      }

      // 执行处理器
      const result = await this.executeWithTimeout(
        () => route.handler(req, res),
        route.timeout || this.config.timeout
      );

      // 转换响应
      let response = result;
      if (route.responseTransformer) {
        response = await this.applyTransformer(response, route.responseTransformer);
      }

      // 缓存响应
      if (this.config.caching && route.cache) {
        await this.cacheResponse(req, response, route.cache);
      }

      // 发送响应
      this.sendResponse(res, response);

    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  findRoute(key) {
    // 直接匹配
    if (this.routes.has(key)) {
      return this.routes.get(key);
    }

    // 模式匹配
    for (const [routeKey, route] of this.routes) {
      if (this.matchRoute(key, routeKey)) {
        return route;
      }
    }

    return null;
  }

  matchRoute(requestKey, routeKey) {
    const [reqMethod, reqPath] = requestKey.split(':');
    const [routeMethod, routePath] = routeKey.split(':');

    if (reqMethod !== routeMethod) {
      return false;
    }

    // 将路由路径转换为正则表达式
    const pattern = routePath
      .replace(/:[^/]+/g, '([^/]+)')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${pattern}$`);
    return regex.test(reqPath);
  }

  async applyMiddleware(req, res, middleware) {
    for (const mw of middleware) {
      await new Promise((resolve, reject) => {
        mw(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  async executeWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);
  }

  sendResponse(res, data) {
    res.status(200).json({
      success: true,
      data
    });
  }

  sendError(res, status, message, details) {
    res.status(status).json({
      success: false,
      error: {
        message,
        details
      }
    });
  }

  handleError(error, req, res) {
    console.error('API Gateway error:', error);

    if (error.name === 'ValidationError') {
      this.sendError(res, 400, 'Validation error', error.details);
    } else if (error.name === 'UnauthorizedError') {
      this.sendError(res, 401, 'Unauthorized');
    } else if (error.name === 'ForbiddenError') {
      this.sendError(res, 403, 'Forbidden');
    } else if (error.name === 'NotFoundError') {
      this.sendError(res, 404, 'Not found');
    } else if (error.name === 'RateLimitError') {
      this.sendError(res, 429, 'Too many requests');
    } else {
      this.sendError(res, 500, 'Internal server error');
    }
  }
}
```

## 结论

Claude Code 中的 API 扩展提供了一个全面的框架,用于通过各种协议和架构扩展平台的 API 功能。该系统支持 RESTful API、GraphQL、WebSocket 连接和模型上下文协议(MCP)扩展,使开发者能够创建强大的集成和自定义功能。通过精心设计的扩展框架、类型安全、验证和中间件系统,Claude Code 确保 API 扩展是安全的、高性能的和可维护的。

API 扩展系统的灵活性允许各种用例,从简单的 REST 端点到复杂的实时通信系统和 AI 模型集成。网关架构提供了路由、缓存、速率限制和转换的集中管理,而各个扩展类型可以实现其特定的协议和模式。这种模块化方法确保 Claude Code 能够适应不断发展的 API 标准和集成需求,同时保持一致和可靠的扩展生态系统。