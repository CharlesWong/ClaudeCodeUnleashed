# Part 11.3: API Extensions

## Introduction

API Extensions in Claude Code provide a powerful mechanism for extending the platform's capabilities through custom APIs, service integrations, and protocol implementations. This system enables developers to create new API endpoints, integrate with external services, implement custom protocols, and extend the Model Context Protocol (MCP) with additional functionality. The API extension framework ensures type safety, security, and performance while maintaining backward compatibility and enabling seamless integration with existing Claude Code features.

## Core API Extension Framework

### API Extension Manager

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
    // Set up global middleware
    this.setupGlobalMiddleware();

    // Load built-in extensions
    await this.loadBuiltInExtensions();

    // Initialize routes
    this.initializeRoutes();

    this.isInitialized = true;
    this.emit('initialized');
  }

  registerExtension(extension) {
    if (this.extensions.has(extension.id)) {
      throw new Error(`Extension already registered: ${extension.id}`);
    }

    // Validate extension
    this.validateExtension(extension);

    // Register routes
    if (extension.routes) {
      this.registerRoutes(extension);
    }

    // Register validators
    if (extension.validators) {
      this.registerValidators(extension);
    }

    // Register transformers
    if (extension.transformers) {
      this.registerTransformers(extension);
    }

    // Store extension
    this.extensions.set(extension.id, extension);

    // Initialize extension
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

    // Validate routes
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

      // Create route handler
      const handler = this.createRouteHandler(extension, route);

      // Register with router
      const method = route.method.toLowerCase();
      this.router[method](fullPath, handler);

      // Store route mapping
      this.routes.set(`${method}:${fullPath}`, {
        extension: extension.id,
        route
      });
    }
  }

  createRouteHandler(extension, route) {
    return async (req, res, next) => {
      try {
        // Create request context
        const context = {
          extension: extension.id,
          route: route.path,
          method: route.method,
          request: req,
          response: res,
          user: req.user,
          session: req.session
        };

        // Apply rate limiting
        if (this.config.rateLimiting && route.rateLimit !== false) {
          await this.rateLimiter.check(context);
        }

        // Validate request
        if (route.validation) {
          await this.validateRequest(req, route.validation);
        }

        // Apply transformers
        if (route.transformers) {
          req = await this.applyTransformers(req, route.transformers);
        }

        // Execute handler
        const result = await this.executeWithTimeout(
          () => route.handler(req, res, context),
          route.timeout || this.config.timeout
        );

        // Transform response
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
    // Validate params
    if (validation.params) {
      const errors = validateSchema(req.params, validation.params);
      if (errors.length > 0) {
        throw new ValidationError('Invalid parameters', errors);
      }
    }

    // Validate query
    if (validation.query) {
      const errors = validateSchema(req.query, validation.query);
      if (errors.length > 0) {
        throw new ValidationError('Invalid query', errors);
      }
    }

    // Validate body
    if (validation.body) {
      const errors = validateSchema(req.body, validation.body);
      if (errors.length > 0) {
        throw new ValidationError('Invalid request body', errors);
      }
    }

    // Validate headers
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

      // API methods
      registerRoute: (route) => this.registerRoute(extension, route),
      registerValidator: (name, validator) => this.registerValidator(extension, name, validator),
      registerTransformer: (name, transformer) => this.registerTransformer(extension, name, transformer),

      // Utility methods
      callExtension: (id, method, ...args) => this.callExtension(id, method, ...args),
      getExtension: (id) => this.extensions.get(id)
    };
  }
}
```

### RESTful API Extensions

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

    // Generate routes
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

    // Generate paths for each resource
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

    // List route (GET /resources)
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

    // Create route (POST /resources)
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

    // Read route (GET /resources/:id)
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

    // Update route (PUT /resources/:id)
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

    // Partial update route (PATCH /resources/:id)
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

    // Delete route (DELETE /resources/:id)
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

    // Bulk operations
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
        // Execute before hook
        if (this.hooks[`before${method.charAt(0).toUpperCase() + method.slice(1)}`]) {
          await this.hooks[`before${method.charAt(0).toUpperCase() + method.slice(1)}`](req, res, context);
        }

        // Execute controller method
        const result = await this.controller[method](req, res, context);

        // Execute after hook
        if (this.hooks[`after${method.charAt(0).toUpperCase() + method.slice(1)}`]) {
          await this.hooks[`after${method.charAt(0).toUpperCase() + method.slice(1)}`](result, req, res, context);
        }

        return result;

      } catch (error) {
        // Execute error hook
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

## GraphQL API Extensions

### GraphQL Extension System

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
    // Combine all type definitions
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

    // Build executable schema
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
    // Simple type inference - would need more sophisticated implementation
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

// Example GraphQL extension
class UserGraphQLExtension extends GraphQLAPIExtension {
  constructor() {
    super({
      id: 'user-graphql',
      name: 'User GraphQL API',
      version: '1.0.0'
    });

    this.setupSchema();
  }

  setupSchema() {
    // Add type definitions
    this.addTypeDefs(`
      type User {
        id: ID!
        username: String!
        email: String!
        profile: UserProfile
        posts: [Post!]!
        createdAt: DateTime!
        updatedAt: DateTime!
      }

      type UserProfile {
        displayName: String
        bio: String
        avatarUrl: String
        location: String
      }

      type Post {
        id: ID!
        title: String!
        content: String!
        author: User!
        tags: [String!]!
        publishedAt: DateTime
        createdAt: DateTime!
        updatedAt: DateTime!
      }

      input CreateUserInput {
        username: String!
        email: String!
        password: String!
        profile: UserProfileInput
      }

      input UserProfileInput {
        displayName: String
        bio: String
        avatarUrl: String
        location: String
      }

      input UpdateUserInput {
        username: String
        email: String
        profile: UserProfileInput
      }

      scalar DateTime
    `);

    // Add resolvers
    this.addResolvers({
      Query: {
        user: async (parent, { id }, context) => {
          return context.dataSources.users.findById(id);
        },
        users: async (parent, { filter, limit, offset }, context) => {
          return context.dataSources.users.findAll({ filter, limit, offset });
        },
        me: async (parent, args, context) => {
          if (!context.user) {
            throw new Error('Not authenticated');
          }
          return context.dataSources.users.findById(context.user.id);
        }
      },

      Mutation: {
        createUser: async (parent, { input }, context) => {
          return context.dataSources.users.create(input);
        },
        updateUser: async (parent, { id, input }, context) => {
          // Check authorization
          if (context.user.id !== id && !context.user.isAdmin) {
            throw new Error('Not authorized');
          }
          return context.dataSources.users.update(id, input);
        },
        deleteUser: async (parent, { id }, context) => {
          // Check authorization
          if (context.user.id !== id && !context.user.isAdmin) {
            throw new Error('Not authorized');
          }
          return context.dataSources.users.delete(id);
        }
      },

      User: {
        posts: async (user, args, context) => {
          return context.dataSources.posts.findByUserId(user.id);
        },
        profile: async (user, args, context) => {
          if (user.profile) return user.profile;
          return context.dataSources.profiles.findByUserId(user.id);
        }
      },

      DateTime: {
        serialize: (value) => value.toISOString(),
        parseValue: (value) => new Date(value),
        parseLiteral: (ast) => {
          if (ast.kind === 'StringValue') {
            return new Date(ast.value);
          }
          return null;
        }
      }
    });

    // Add subscriptions
    this.addSubscription('userUpdated', {
      type: 'User!',
      subscribe: (parent, { userId }, context) => {
        return context.pubsub.asyncIterator(`user.updated.${userId}`);
      }
    });

    this.addSubscription('postPublished', {
      type: 'Post!',
      subscribe: (parent, args, context) => {
        return context.pubsub.asyncIterator('post.published');
      }
    });

    // Add data sources
    this.addDataSource('users', UserDataSource);
    this.addDataSource('posts', PostDataSource);
    this.addDataSource('profiles', ProfileDataSource);
  }
}
```

## Model Context Protocol (MCP) Extensions

### MCP Extension Framework

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
   * Register a tool for MCP
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
   * Register a resource provider
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
   * Register a prompt template
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
   * Register a sampling provider
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
   * Handle MCP requests
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

    // Validate input
    if (tool.inputSchema) {
      const validation = this.validateInput(params.arguments, tool.inputSchema);
      if (!validation.valid) {
        throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
      }
    }

    // Execute tool
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
    // Implement JSON Schema validation
    const errors = [];

    // Check required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in input)) {
          errors.push(`Missing required property: ${prop}`);
        }
      }
    }

    // Check property types
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

// Example MCP Extension
class FileSystemMCPExtension extends MCPExtension {
  constructor() {
    super({
      id: 'filesystem-mcp',
      name: 'FileSystem MCP Extension',
      version: '1.0.0',
      capabilities: ['tools', 'resources']
    });

    this.setupTools();
    this.setupResources();
  }

  setupTools() {
    // File read tool
    this.registerTool({
      name: 'fs_read',
      description: 'Read a file from the filesystem',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file'
          }
        },
        required: ['path']
      },
      handler: async ({ path }) => {
        const fs = require('fs').promises;
        const content = await fs.readFile(path, 'utf8');
        return content;
      }
    });

    // File write tool
    this.registerTool({
      name: 'fs_write',
      description: 'Write content to a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file'
          },
          content: {
            type: 'string',
            description: 'Content to write'
          }
        },
        required: ['path', 'content']
      },
      handler: async ({ path, content }) => {
        const fs = require('fs').promises;
        await fs.writeFile(path, content, 'utf8');
        return `File written successfully: ${path}`;
      }
    });

    // Directory list tool
    this.registerTool({
      name: 'fs_list',
      description: 'List files in a directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory'
          },
          recursive: {
            type: 'boolean',
            description: 'List recursively'
          }
        },
        required: ['path']
      },
      handler: async ({ path, recursive = false }) => {
        const fs = require('fs').promises;
        const files = [];

        async function listDir(dir) {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = `${dir}/${entry.name}`;

            files.push({
              path: fullPath,
              type: entry.isDirectory() ? 'directory' : 'file'
            });

            if (recursive && entry.isDirectory()) {
              await listDir(fullPath);
            }
          }
        }

        await listDir(path);
        return files;
      }
    });
  }

  setupResources() {
    // Current directory resource
    this.registerResource({
      uri: 'file:///${cwd}',
      name: 'Current Directory',
      description: 'Current working directory information',
      handler: async () => {
        const cwd = process.cwd();
        const fs = require('fs').promises;
        const files = await fs.readdir(cwd);

        return JSON.stringify({
          path: cwd,
          files
        }, null, 2);
      }
    });

    // Environment variables resource
    this.registerResource({
      uri: 'env://variables',
      name: 'Environment Variables',
      description: 'System environment variables',
      mimeType: 'application/json',
      handler: async () => {
        return JSON.stringify(process.env, null, 2);
      }
    });
  }
}
```

## WebSocket API Extensions

### WebSocket Extension System

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
    // Create WebSocket server
    this.server = new WebSocket.Server({
      port: this.config.port,
      path: this.path,
      maxPayload: this.config.maxMessageSize,
      verifyClient: this.verifyClient.bind(this)
    });

    // Set up event handlers
    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleServerError.bind(this));

    // Start heartbeat
    this.startHeartbeat();

    console.log(`WebSocket server listening on port ${this.config.port}`);
  }

  async verifyClient(info, cb) {
    try {
      // Run middleware
      for (const middleware of this.middleware) {
        const result = await middleware(info);
        if (result === false) {
          cb(false, 401, 'Unauthorized');
          return;
        }
      }

      // Check client limit
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

    // Set up client event handlers
    ws.on('message', (data) => this.handleMessage(client, data));
    ws.on('pong', () => this.handlePong(client));
    ws.on('close', () => this.handleDisconnection(client));
    ws.on('error', (error) => this.handleClientError(client, error));

    // Send welcome message
    this.send(client, {
      type: 'connected',
      clientId,
      timestamp: Date.now()
    });

    this.emit('client-connected', client);
  }

  async handleMessage(client, data) {
    try {
      // Parse message
      const message = this.parseMessage(data);

      // Validate message
      if (!message.type) {
        throw new Error('Message type required');
      }

      // Get handler
      const handler = this.handlers.get(message.type);

      if (!handler) {
        throw new Error(`Unknown message type: ${message.type}`);
      }

      // Execute handler
      const response = await handler(message, client);

      // Send response if any
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
    // Leave all rooms
    for (const room of client.rooms) {
      this.leaveRoom(client, room);
    }

    // Remove client
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

      // Handle binary data
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
    // Close all client connections
    for (const [id, client] of this.clients) {
      client.ws.close(1000, 'Server shutdown');
    }

    // Close server
    return new Promise((resolve) => {
      this.server.close(resolve);
    });
  }
}
```

## API Gateway and Routing

### API Gateway

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

    // Register routes
    for (const route of api.routes) {
      const fullPath = `${basePath}${route.path}`;
      this.registerRoute(fullPath, route, api);
    }

    // Register middleware
    if (api.middleware) {
      this.registerMiddleware(api.middleware, basePath);
    }

    // Register transformers
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
      // Apply global middleware
      await this.applyMiddleware(req, res, this.middleware);

      // Apply route middleware
      if (route.middleware) {
        await this.applyMiddleware(req, res, route.middleware);
      }

      // Check cache
      if (this.config.caching && route.cache) {
        const cached = await this.checkCache(req);
        if (cached) {
          return this.sendResponse(res, cached);
        }
      }

      // Apply rate limiting
      if (route.rateLimit) {
        await this.applyRateLimit(req, route);
      }

      // Transform request
      if (route.requestTransformer) {
        req = await this.applyTransformer(req, route.requestTransformer);
      }

      // Execute handler
      const result = await this.executeWithTimeout(
        () => route.handler(req, res),
        route.timeout || this.config.timeout
      );

      // Transform response
      let response = result;
      if (route.responseTransformer) {
        response = await this.applyTransformer(response, route.responseTransformer);
      }

      // Cache response
      if (this.config.caching && route.cache) {
        await this.cacheResponse(req, response, route.cache);
      }

      // Send response
      this.sendResponse(res, response);

    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  findRoute(key) {
    // Direct match
    if (this.routes.has(key)) {
      return this.routes.get(key);
    }

    // Pattern matching
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

    // Convert route path to regex
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

## Conclusion

API Extensions in Claude Code provide a comprehensive framework for extending the platform's API capabilities through various protocols and architectures. The system supports RESTful APIs, GraphQL, WebSocket connections, and Model Context Protocol (MCP) extensions, enabling developers to create powerful integrations and custom functionality. Through careful design of the extension framework, type safety, validation, and middleware systems, Claude Code ensures that API extensions are secure, performant, and maintainable.

The flexibility of the API extension system allows for diverse use cases, from simple REST endpoints to complex real-time communication systems and AI model integrations. The gateway architecture provides centralized management of routing, caching, rate limiting, and transformation, while individual extension types can implement their specific protocols and patterns. This modular approach ensures that Claude Code can adapt to evolving API standards and integration requirements while maintaining a consistent and reliable extension ecosystem.