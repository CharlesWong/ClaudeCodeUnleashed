# Part 11.2: Extension Development

## Introduction

Extension development for Claude Code enables developers to create powerful additions that enhance the platform's functionality. This comprehensive guide covers the complete development lifecycle, from initial setup through testing, debugging, and deployment. Extensions can range from simple utility functions to complex integrations with external services, all while leveraging Claude Code's robust API and security model.

## Extension Development Environment

### Setting Up the Development Environment

```javascript
// extension-dev-setup.js
import { ExtensionDevKit } from '@claude-code/sdk';
import { createProject, DevServer } from '@claude-code/dev-tools';
import path from 'path';
import fs from 'fs-extra';

class ExtensionDevelopmentEnvironment {
  constructor(options = {}) {
    this.projectName = options.projectName;
    this.projectPath = options.path || process.cwd();
    this.template = options.template || 'basic';

    this.devServer = null;
    this.watcher = null;
    this.builder = null;
  }

  async initialize() {
    // Create project structure
    await this.createProjectStructure();

    // Install dependencies
    await this.installDependencies();

    // Set up development tools
    await this.setupDevTools();

    // Initialize Git repository
    await this.initializeGit();

    console.log(`Extension project "${this.projectName}" initialized successfully`);
  }

  async createProjectStructure() {
    const structure = {
      'src': {
        'index.js': this.getMainTemplate(),
        'commands': {},
        'tools': {},
        'views': {},
        'utils': {}
      },
      'tests': {
        'unit': {},
        'integration': {}
      },
      'assets': {},
      'docs': {
        'README.md': this.getReadmeTemplate()
      },
      'plugin.json': this.getManifestTemplate(),
      'package.json': this.getPackageJsonTemplate(),
      '.gitignore': this.getGitignoreTemplate(),
      '.eslintrc.json': this.getEslintConfigTemplate(),
      'tsconfig.json': this.getTypeScriptConfigTemplate()
    };

    await this.createStructure(this.projectPath, structure);
  }

  async createStructure(basePath, structure) {
    for (const [name, content] of Object.entries(structure)) {
      const fullPath = path.join(basePath, name);

      if (typeof content === 'string') {
        // It's a file
        await fs.writeFile(fullPath, content);
      } else {
        // It's a directory
        await fs.ensureDir(fullPath);
        if (Object.keys(content).length > 0) {
          await this.createStructure(fullPath, content);
        }
      }
    }
  }

  getManifestTemplate() {
    return JSON.stringify({
      id: this.projectName.toLowerCase().replace(/\s+/g, '-'),
      name: this.projectName,
      version: '1.0.0',
      description: 'A Claude Code extension',
      author: {
        name: 'Your Name',
        email: 'you@example.com'
      },
      main: 'src/index.js',
      engines: {
        'claude-code': '^1.0.0'
      },
      permissions: [
        'file-read',
        'tool-access'
      ],
      contributes: {
        commands: [],
        tools: [],
        views: [],
        configuration: {}
      },
      activationEvents: [
        'onStartup'
      ],
      dependencies: {},
      scripts: {
        build: 'claude-ext build',
        test: 'claude-ext test',
        package: 'claude-ext package'
      }
    }, null, 2);
  }

  getMainTemplate() {
    return `/**
 * ${this.projectName} Extension
 * Main entry point
 */

class ${this.projectName.replace(/\s+/g, '')}Extension {
  constructor() {
    this.context = null;
    this.isActivated = false;
  }

  /**
   * Initialize the extension
   * @param {ExtensionContext} context - Extension context
   */
  async initialize(context) {
    this.context = context;

    // Register commands
    await this.registerCommands();

    // Register tools
    await this.registerTools();

    // Set up event listeners
    this.setupEventListeners();

    context.logger.info('Extension initialized');
  }

  /**
   * Activate the extension
   */
  async activate() {
    if (this.isActivated) return;

    this.isActivated = true;
    this.context.logger.info('Extension activated');
  }

  /**
   * Deactivate the extension
   */
  async deactivate() {
    if (!this.isActivated) return;

    this.isActivated = false;
    this.context.logger.info('Extension deactivated');
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // Clean up any resources
    this.context.logger.info('Extension cleaned up');
  }

  registerCommands() {
    // Register extension commands
    this.context.commands.register({
      id: 'example.command',
      title: 'Example Command',
      handler: async (args) => {
        this.context.logger.info('Example command executed', args);
        return { success: true };
      }
    });
  }

  registerTools() {
    // Register extension tools
    this.context.tools.register({
      name: 'ExampleTool',
      description: 'An example tool',
      parameters: {
        message: {
          type: 'string',
          description: 'Message to display'
        }
      },
      handler: async (params) => {
        return {
          result: \`Tool executed with message: \${params.message}\`
        };
      }
    });
  }

  setupEventListeners() {
    // Listen to events
    this.context.events.on('message', (message) => {
      this.context.logger.debug('Message received:', message);
    });
  }
}

// Export the extension
export default ${this.projectName.replace(/\s+/g, '')}Extension;
`;
  }
}
```

### Extension SDK

```javascript
// extension-sdk.js
export class ExtensionContext {
  constructor(plugin, api) {
    this.plugin = plugin;
    this.api = api;

    // Core APIs
    this.commands = new CommandRegistry(this);
    this.tools = new ToolRegistry(this);
    this.events = new EventBus(this);
    this.storage = new StorageAPI(this);
    this.ui = new UIAPI(this);
    this.workspace = new WorkspaceAPI(this);
    this.logger = new Logger(plugin.id);

    // Extension metadata
    this.extensionPath = plugin.path;
    this.extensionId = plugin.id;
    this.globalState = new GlobalState(plugin.id);
    this.workspaceState = new WorkspaceState(plugin.id);
    this.secrets = new SecretsAPI(plugin.id);

    // Subscriptions management
    this.subscriptions = [];
  }

  /**
   * Get extension configuration
   */
  getConfiguration(section) {
    return this.api.config.get(`extensions.${this.extensionId}.${section}`);
  }

  /**
   * Update extension configuration
   */
  async updateConfiguration(section, value) {
    await this.api.config.set(
      `extensions.${this.extensionId}.${section}`,
      value
    );
  }

  /**
   * Register a disposable resource
   */
  registerDisposable(disposable) {
    this.subscriptions.push(disposable);
    return disposable;
  }

  /**
   * Show an information message
   */
  showInformationMessage(message, ...items) {
    return this.ui.showMessage({
      type: 'info',
      message,
      actions: items
    });
  }

  /**
   * Show a warning message
   */
  showWarningMessage(message, ...items) {
    return this.ui.showMessage({
      type: 'warning',
      message,
      actions: items
    });
  }

  /**
   * Show an error message
   */
  showErrorMessage(message, ...items) {
    return this.ui.showMessage({
      type: 'error',
      message,
      actions: items
    });
  }

  /**
   * Show input box
   */
  showInputBox(options) {
    return this.ui.showInput(options);
  }

  /**
   * Show quick pick
   */
  showQuickPick(items, options) {
    return this.ui.showQuickPick(items, options);
  }

  /**
   * Get workspace folders
   */
  getWorkspaceFolders() {
    return this.workspace.getFolders();
  }

  /**
   * Open a text document
   */
  openTextDocument(uri) {
    return this.workspace.openDocument(uri);
  }

  /**
   * Create a file system watcher
   */
  createFileSystemWatcher(pattern, options) {
    return this.workspace.createWatcher(pattern, options);
  }

  /**
   * Execute a command
   */
  executeCommand(command, ...args) {
    return this.commands.execute(command, ...args);
  }

  /**
   * Register a command
   */
  registerCommand(command, callback) {
    return this.commands.register(command, callback);
  }

  /**
   * Register a tool
   */
  registerTool(tool) {
    return this.tools.register(tool);
  }

  /**
   * Clean up all subscriptions
   */
  dispose() {
    for (const subscription of this.subscriptions) {
      if (subscription && typeof subscription.dispose === 'function') {
        subscription.dispose();
      }
    }
    this.subscriptions = [];
  }
}
```

## Extension Components

### Commands

```javascript
// extension-commands.js
class ExtensionCommand {
  constructor(definition) {
    this.id = definition.id;
    this.title = definition.title;
    this.category = definition.category || 'Extension';
    this.description = definition.description;
    this.handler = definition.handler;
    this.keybinding = definition.keybinding;
    this.when = definition.when;
    this.icon = definition.icon;
  }

  async execute(context, ...args) {
    try {
      // Validate preconditions
      if (this.when && !await this.evaluateCondition(this.when, context)) {
        throw new Error('Command precondition not met');
      }

      // Execute handler
      const result = await this.handler.call(context, ...args);

      // Track command execution
      context.telemetry?.track('command.executed', {
        commandId: this.id,
        success: true
      });

      return result;

    } catch (error) {
      context.logger.error(`Command ${this.id} failed:`, error);

      context.telemetry?.track('command.executed', {
        commandId: this.id,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  async evaluateCondition(condition, context) {
    // Evaluate 'when' clause
    if (typeof condition === 'string') {
      return context.when.evaluate(condition);
    }

    if (typeof condition === 'function') {
      return condition(context);
    }

    return true;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      category: this.category,
      description: this.description,
      keybinding: this.keybinding,
      when: this.when,
      icon: this.icon
    };
  }
}

class CommandRegistry {
  constructor(context) {
    this.context = context;
    this.commands = new Map();
    this.handlers = new Map();
  }

  register(definition, handler) {
    // Support both object and separate parameters
    if (typeof definition === 'string') {
      definition = {
        id: definition,
        handler: handler
      };
    }

    const command = new ExtensionCommand(definition);
    this.commands.set(command.id, command);

    // Register with global command system
    const disposable = this.context.api.commands.register(
      command.id,
      (...args) => command.execute(this.context, ...args)
    );

    return {
      command,
      dispose: () => {
        this.commands.delete(command.id);
        disposable.dispose();
      }
    };
  }

  execute(commandId, ...args) {
    const command = this.commands.get(commandId);

    if (command) {
      return command.execute(this.context, ...args);
    }

    // Try global command
    return this.context.api.commands.execute(commandId, ...args);
  }

  getCommand(commandId) {
    return this.commands.get(commandId);
  }

  getCommands() {
    return Array.from(this.commands.values());
  }
}
```

### Tools

```javascript
// extension-tools.js
class ExtensionTool {
  constructor(definition) {
    this.name = definition.name;
    this.description = definition.description;
    this.parameters = this.parseParameters(definition.parameters);
    this.handler = definition.handler;
    this.category = definition.category || 'Extension';
    this.icon = definition.icon;
    this.permissions = definition.permissions || [];
    this.rateLimit = definition.rateLimit;
    this.timeout = definition.timeout || 30000;
  }

  parseParameters(params) {
    if (!params) return {};

    // Convert to JSON Schema format
    const schema = {
      type: 'object',
      properties: {},
      required: []
    };

    for (const [key, param] of Object.entries(params)) {
      schema.properties[key] = {
        type: param.type || 'string',
        description: param.description,
        default: param.default,
        enum: param.enum,
        pattern: param.pattern
      };

      if (param.required) {
        schema.required.push(key);
      }
    }

    return schema;
  }

  async execute(params, context) {
    try {
      // Validate parameters
      const validated = await this.validateParameters(params);

      // Check permissions
      await this.checkPermissions(context);

      // Apply rate limiting
      if (this.rateLimit) {
        await this.checkRateLimit(context);
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(
        this.handler.bind(context),
        validated,
        this.timeout
      );

      // Track execution
      context.telemetry?.track('tool.executed', {
        tool: this.name,
        success: true
      });

      return result;

    } catch (error) {
      context.logger.error(`Tool ${this.name} failed:`, error);

      context.telemetry?.track('tool.executed', {
        tool: this.name,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  async validateParameters(params) {
    // Use a JSON schema validator
    const Ajv = require('ajv');
    const ajv = new Ajv({ useDefaults: true });

    const validate = ajv.compile(this.parameters);
    const valid = validate(params);

    if (!valid) {
      throw new Error(`Invalid parameters: ${ajv.errorsText(validate.errors)}`);
    }

    return params;
  }

  async checkPermissions(context) {
    for (const permission of this.permissions) {
      if (!context.hasPermission(permission)) {
        throw new Error(`Missing permission: ${permission}`);
      }
    }
  }

  async checkRateLimit(context) {
    const key = `rateLimit:${context.extensionId}:${this.name}`;
    const limit = this.rateLimit.limit;
    const window = this.rateLimit.window;

    // Implement rate limiting logic
    const count = await context.storage.get(key, 0);
    if (count >= limit) {
      throw new Error('Rate limit exceeded');
    }

    await context.storage.set(key, count + 1, { ttl: window });
  }

  async executeWithTimeout(handler, params, timeout) {
    return Promise.race([
      handler(params),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), timeout)
      )
    ]);
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      category: this.category,
      icon: this.icon,
      permissions: this.permissions,
      rateLimit: this.rateLimit,
      timeout: this.timeout
    };
  }
}

class ToolRegistry {
  constructor(context) {
    this.context = context;
    this.tools = new Map();
  }

  register(definition) {
    const tool = new ExtensionTool(definition);
    this.tools.set(tool.name, tool);

    // Register with global tool system
    const disposable = this.context.api.tools.register({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      handler: (params) => tool.execute(params, this.context)
    });

    return {
      tool,
      dispose: () => {
        this.tools.delete(tool.name);
        disposable.dispose();
      }
    };
  }

  getTool(name) {
    return this.tools.get(name);
  }

  getTools() {
    return Array.from(this.tools.values());
  }

  async execute(toolName, params) {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    return tool.execute(params, this.context);
  }
}
```

### Views and UI Components

```javascript
// extension-views.js
class ExtensionView {
  constructor(definition) {
    this.id = definition.id;
    this.title = definition.title;
    this.type = definition.type || 'webview';
    this.icon = definition.icon;
    this.priority = definition.priority || 0;
    this.when = definition.when;
    this.preserveState = definition.preserveState || false;

    this.content = null;
    this.webview = null;
    this.isVisible = false;
    this.state = {};
  }

  async render(context) {
    switch (this.type) {
      case 'webview':
        return this.renderWebview(context);
      case 'tree':
        return this.renderTreeView(context);
      case 'panel':
        return this.renderPanel(context);
      default:
        throw new Error(`Unknown view type: ${this.type}`);
    }
  }

  async renderWebview(context) {
    const webview = context.ui.createWebview({
      id: this.id,
      title: this.title,
      enableScripts: true,
      retainContextWhenHidden: this.preserveState
    });

    // Set HTML content
    webview.html = await this.getWebviewContent(context);

    // Handle messages from webview
    webview.onDidReceiveMessage((message) => {
      this.handleWebviewMessage(message, context);
    });

    // Track state changes
    webview.onDidChangeViewState((e) => {
      this.isVisible = e.webviewPanel.visible;
      if (this.isVisible) {
        this.onDidBecomeVisible(context);
      } else {
        this.onDidBecomeHidden(context);
      }
    });

    this.webview = webview;
    return webview;
  }

  async getWebviewContent(context) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.title}</title>
    <style>
        body {
            font-family: var(--font-family);
            background: var(--background);
            color: var(--foreground);
            padding: 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        button {
            background: var(--button-background);
            color: var(--button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }

        button:hover {
            background: var(--button-hover-background);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${this.title}</h1>
        <div id="content">
            <!-- Dynamic content here -->
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Restore state
        const state = vscode.getState() || {};

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            handleMessage(message);
        });

        function handleMessage(message) {
            switch (message.type) {
                case 'update':
                    updateContent(message.data);
                    break;
                case 'setState':
                    Object.assign(state, message.state);
                    vscode.setState(state);
                    break;
            }
        }

        function sendMessage(message) {
            vscode.postMessage(message);
        }

        function updateContent(data) {
            document.getElementById('content').innerHTML = data;
        }
    </script>
</body>
</html>`;
  }

  handleWebviewMessage(message, context) {
    switch (message.type) {
      case 'command':
        context.commands.execute(message.command, ...message.args);
        break;

      case 'getData':
        this.webview.postMessage({
          type: 'data',
          data: this.getData(message.key)
        });
        break;

      case 'saveState':
        this.state = message.state;
        break;

      default:
        context.logger.warn(`Unknown webview message type: ${message.type}`);
    }
  }

  onDidBecomeVisible(context) {
    context.logger.debug(`View ${this.id} became visible`);
  }

  onDidBecomeHidden(context) {
    context.logger.debug(`View ${this.id} became hidden`);
  }

  async renderTreeView(context) {
    const treeDataProvider = {
      getTreeItem: (element) => this.getTreeItem(element, context),
      getChildren: (element) => this.getChildren(element, context),
      getParent: (element) => this.getParent(element, context)
    };

    const treeView = context.ui.createTreeView(this.id, {
      treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });

    // Handle selection changes
    treeView.onDidChangeSelection((e) => {
      this.onTreeSelectionChanged(e.selection, context);
    });

    return treeView;
  }

  async getTreeItem(element, context) {
    // Override in subclass
    return {
      label: element.label,
      collapsibleState: element.children ? 1 : 0,
      contextValue: element.type,
      iconPath: element.icon
    };
  }

  async getChildren(element, context) {
    // Override in subclass
    return [];
  }

  async getParent(element, context) {
    // Override in subclass
    return element.parent;
  }

  onTreeSelectionChanged(selection, context) {
    context.logger.debug(`Tree selection changed:`, selection);
  }
}

class ViewRegistry {
  constructor(context) {
    this.context = context;
    this.views = new Map();
  }

  register(definition) {
    const view = new ExtensionView(definition);
    this.views.set(view.id, view);

    return {
      view,
      dispose: () => {
        this.views.delete(view.id);
        if (view.webview) {
          view.webview.dispose();
        }
      }
    };
  }

  async show(viewId) {
    const view = this.views.get(viewId);
    if (!view) {
      throw new Error(`View not found: ${viewId}`);
    }

    return view.render(this.context);
  }

  getView(viewId) {
    return this.views.get(viewId);
  }

  getViews() {
    return Array.from(this.views.values());
  }
}
```

## Testing Extensions

### Unit Testing

```javascript
// extension-testing.js
import { ExtensionTestRunner } from '@claude-code/test-framework';
import { mock, stub, spy } from 'sinon';
import { expect } from 'chai';

class ExtensionTester {
  constructor() {
    this.runner = new ExtensionTestRunner();
    this.mocks = new Map();
    this.stubs = new Map();
    this.spies = new Map();
  }

  /**
   * Create a test context for extension
   */
  createTestContext(options = {}) {
    const context = {
      extensionId: options.extensionId || 'test-extension',
      extensionPath: options.path || '/test/path',

      // Mock APIs
      commands: this.createMockCommandRegistry(),
      tools: this.createMockToolRegistry(),
      events: this.createMockEventBus(),
      storage: this.createMockStorage(),
      ui: this.createMockUI(),
      workspace: this.createMockWorkspace(),
      logger: this.createMockLogger(),

      // State
      globalState: new Map(),
      workspaceState: new Map(),
      secrets: new Map(),

      // Subscriptions
      subscriptions: []
    };

    // Apply overrides
    Object.assign(context, options.overrides || {});

    return context;
  }

  createMockCommandRegistry() {
    const commands = new Map();

    return {
      register: spy((id, handler) => {
        commands.set(id, handler);
        return { dispose: () => commands.delete(id) };
      }),
      execute: spy(async (id, ...args) => {
        const handler = commands.get(id);
        if (handler) {
          return handler(...args);
        }
        throw new Error(`Command not found: ${id}`);
      }),
      getCommands: () => Array.from(commands.keys())
    };
  }

  createMockToolRegistry() {
    const tools = new Map();

    return {
      register: spy((definition) => {
        tools.set(definition.name, definition);
        return { dispose: () => tools.delete(definition.name) };
      }),
      execute: spy(async (name, params) => {
        const tool = tools.get(name);
        if (tool) {
          return tool.handler(params);
        }
        throw new Error(`Tool not found: ${name}`);
      }),
      getTools: () => Array.from(tools.values())
    };
  }

  createMockEventBus() {
    const listeners = new Map();

    return {
      on: spy((event, handler) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event).add(handler);
        return { dispose: () => listeners.get(event)?.delete(handler) };
      }),
      emit: spy((event, ...args) => {
        const handlers = listeners.get(event);
        if (handlers) {
          for (const handler of handlers) {
            handler(...args);
          }
        }
      }),
      once: spy((event, handler) => {
        const wrapper = (...args) => {
          handler(...args);
          listeners.get(event)?.delete(wrapper);
        };
        return this.on(event, wrapper);
      })
    };
  }

  createMockStorage() {
    const storage = new Map();

    return {
      get: spy((key, defaultValue) => {
        return storage.get(key) ?? defaultValue;
      }),
      set: spy((key, value) => {
        storage.set(key, value);
        return Promise.resolve();
      }),
      delete: spy((key) => {
        storage.delete(key);
        return Promise.resolve();
      }),
      clear: spy(() => {
        storage.clear();
        return Promise.resolve();
      })
    };
  }

  createMockUI() {
    return {
      showMessage: stub().resolves(),
      showInput: stub().resolves('user input'),
      showQuickPick: stub().resolves({ label: 'selected' }),
      createWebview: stub().returns({
        html: '',
        postMessage: stub(),
        onDidReceiveMessage: stub(),
        dispose: stub()
      }),
      createTreeView: stub().returns({
        reveal: stub(),
        onDidChangeSelection: stub(),
        dispose: stub()
      })
    };
  }

  createMockWorkspace() {
    return {
      getFolders: stub().returns([{ uri: '/workspace', name: 'workspace' }]),
      openDocument: stub().resolves({ uri: '/test/file.js' }),
      createWatcher: stub().returns({
        onDidCreate: stub(),
        onDidChange: stub(),
        onDidDelete: stub(),
        dispose: stub()
      }),
      fs: {
        readFile: stub().resolves('file content'),
        writeFile: stub().resolves(),
        stat: stub().resolves({ isFile: () => true })
      }
    };
  }

  createMockLogger() {
    return {
      debug: spy(),
      info: spy(),
      warn: spy(),
      error: spy()
    };
  }

  /**
   * Run extension tests
   */
  async runTests(extension, tests) {
    const results = [];

    for (const test of tests) {
      try {
        await this.runner.run(async () => {
          const context = this.createTestContext(test.contextOptions);

          // Initialize extension
          await extension.initialize(context);

          // Run test
          await test.fn(extension, context);

          // Verify assertions
          test.assertions?.(extension, context);
        });

        results.push({
          name: test.name,
          passed: true
        });

      } catch (error) {
        results.push({
          name: test.name,
          passed: false,
          error: error.message,
          stack: error.stack
        });
      }
    }

    return results;
  }

  /**
   * Test command execution
   */
  async testCommand(context, commandId, args, expectedResult) {
    const result = await context.commands.execute(commandId, ...args);

    expect(result).to.deep.equal(expectedResult);
    expect(context.commands.execute).to.have.been.calledWith(commandId, ...args);
  }

  /**
   * Test tool execution
   */
  async testTool(context, toolName, params, expectedResult) {
    const result = await context.tools.execute(toolName, params);

    expect(result).to.deep.equal(expectedResult);
    expect(context.tools.execute).to.have.been.calledWith(toolName, params);
  }

  /**
   * Test event handling
   */
  async testEvent(context, event, data, expectedHandler) {
    context.events.emit(event, data);

    expect(expectedHandler).to.have.been.calledWith(data);
  }

  /**
   * Clean up test resources
   */
  cleanup() {
    this.mocks.forEach(m => m.restore());
    this.stubs.forEach(s => s.restore());
    this.spies.forEach(s => s.restore());

    this.mocks.clear();
    this.stubs.clear();
    this.spies.clear();
  }
}

// Example test suite
describe('MyExtension', () => {
  let tester;
  let extension;

  beforeEach(() => {
    tester = new ExtensionTester();
    extension = new MyExtension();
  });

  afterEach(() => {
    tester.cleanup();
  });

  it('should register commands on initialization', async () => {
    const context = tester.createTestContext();

    await extension.initialize(context);

    expect(context.commands.register).to.have.been.called;
    expect(context.commands.getCommands()).to.include('myextension.command');
  });

  it('should handle tool execution', async () => {
    const context = tester.createTestContext();

    await extension.initialize(context);

    const result = await context.tools.execute('MyTool', {
      message: 'test'
    });

    expect(result).to.have.property('result');
    expect(result.result).to.include('test');
  });

  it('should respond to events', async () => {
    const context = tester.createTestContext();

    await extension.initialize(context);

    context.events.emit('message', { content: 'test message' });

    expect(context.logger.debug).to.have.been.calledWith(
      'Message received:',
      { content: 'test message' }
    );
  });
});
```

## Building and Packaging

### Build System

```javascript
// extension-builder.js
import webpack from 'webpack';
import path from 'path';
import fs from 'fs-extra';
import { createHash } from 'crypto';
import archiver from 'archiver';

class ExtensionBuilder {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.manifest = null;
    this.outputPath = path.join(projectPath, 'dist');
  }

  async build(options = {}) {
    console.log('Building extension...');

    // Load manifest
    this.manifest = await this.loadManifest();

    // Clean output directory
    await fs.emptyDir(this.outputPath);

    // Bundle JavaScript
    await this.bundleJavaScript(options);

    // Copy assets
    await this.copyAssets();

    // Generate metadata
    await this.generateMetadata();

    // Validate build
    await this.validateBuild();

    console.log('Build complete!');
  }

  async loadManifest() {
    const manifestPath = path.join(this.projectPath, 'plugin.json');
    return fs.readJson(manifestPath);
  }

  async bundleJavaScript(options) {
    const config = {
      mode: options.mode || 'production',
      entry: path.join(this.projectPath, this.manifest.main),
      output: {
        path: this.outputPath,
        filename: 'extension.js',
        library: {
          type: 'commonjs2'
        }
      },
      target: 'node',
      externals: {
        'vscode': 'commonjs vscode',
        '@claude-code/sdk': 'commonjs @claude-code/sdk'
      },
      module: {
        rules: [
          {
            test: /\.js$/,
            exclude: /node_modules/,
            use: {
              loader: 'babel-loader',
              options: {
                presets: ['@babel/preset-env']
              }
            }
          },
          {
            test: /\.ts$/,
            use: 'ts-loader',
            exclude: /node_modules/
          }
        ]
      },
      resolve: {
        extensions: ['.js', '.ts', '.json']
      },
      optimization: {
        minimize: options.minimize !== false
      }
    };

    return new Promise((resolve, reject) => {
      webpack(config, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        if (stats.hasErrors()) {
          reject(new Error(stats.toString()));
          return;
        }

        console.log(stats.toString({ colors: true }));
        resolve();
      });
    });
  }

  async copyAssets() {
    const assetsPath = path.join(this.projectPath, 'assets');

    if (await fs.pathExists(assetsPath)) {
      await fs.copy(assetsPath, path.join(this.outputPath, 'assets'));
    }

    // Copy manifest
    await fs.copy(
      path.join(this.projectPath, 'plugin.json'),
      path.join(this.outputPath, 'plugin.json')
    );

    // Copy README
    const readmePath = path.join(this.projectPath, 'README.md');
    if (await fs.pathExists(readmePath)) {
      await fs.copy(readmePath, path.join(this.outputPath, 'README.md'));
    }
  }

  async generateMetadata() {
    const metadata = {
      name: this.manifest.name,
      version: this.manifest.version,
      buildTime: new Date().toISOString(),
      checksum: await this.calculateChecksum(),
      files: await this.getFileList()
    };

    await fs.writeJson(
      path.join(this.outputPath, 'metadata.json'),
      metadata,
      { spaces: 2 }
    );
  }

  async calculateChecksum() {
    const hash = createHash('sha256');
    const files = await this.getFileList();

    for (const file of files) {
      const content = await fs.readFile(
        path.join(this.outputPath, file)
      );
      hash.update(content);
    }

    return hash.digest('hex');
  }

  async getFileList() {
    const files = [];

    async function walk(dir, base = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = path.join(base, entry.name);

        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), relativePath);
        } else {
          files.push(relativePath);
        }
      }
    }

    await walk(this.outputPath);
    return files;
  }

  async validateBuild() {
    // Check required files exist
    const requiredFiles = [
      'extension.js',
      'plugin.json'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(this.outputPath, file);
      if (!await fs.pathExists(filePath)) {
        throw new Error(`Required file missing: ${file}`);
      }
    }

    // Validate manifest
    const manifest = await fs.readJson(
      path.join(this.outputPath, 'plugin.json')
    );

    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new Error('Invalid manifest');
    }
  }

  async package() {
    const packagePath = path.join(
      this.projectPath,
      `${this.manifest.id}-${this.manifest.version}.ccext`
    );

    const output = fs.createWriteStream(packagePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`Package created: ${packagePath}`);
        console.log(`Size: ${archive.pointer()} bytes`);
        resolve(packagePath);
      });

      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(this.outputPath, false);
      archive.finalize();
    });
  }
}
```

## Deployment and Distribution

### Extension Publishing

```javascript
// extension-publisher.js
class ExtensionPublisher {
  constructor(options = {}) {
    this.registry = options.registry || 'https://registry.claude-code.io';
    this.apiKey = options.apiKey;
  }

  async publish(packagePath, options = {}) {
    console.log('Publishing extension...');

    // Validate package
    const validation = await this.validatePackage(packagePath);
    if (!validation.valid) {
      throw new Error(`Package validation failed: ${validation.errors.join(', ')}`);
    }

    // Extract metadata
    const metadata = await this.extractMetadata(packagePath);

    // Check if version already exists
    if (!options.force) {
      const exists = await this.versionExists(metadata.id, metadata.version);
      if (exists) {
        throw new Error(`Version ${metadata.version} already published`);
      }
    }

    // Upload package
    const uploadResult = await this.uploadPackage(packagePath, metadata);

    // Register in registry
    await this.registerExtension(metadata, uploadResult);

    console.log(`Extension published successfully!`);
    console.log(`ID: ${metadata.id}`);
    console.log(`Version: ${metadata.version}`);
    console.log(`URL: ${this.registry}/extensions/${metadata.id}`);

    return {
      id: metadata.id,
      version: metadata.version,
      url: uploadResult.url
    };
  }

  async validatePackage(packagePath) {
    const errors = [];

    // Check file exists
    if (!await fs.pathExists(packagePath)) {
      errors.push('Package file not found');
    }

    // Check file size
    const stats = await fs.stat(packagePath);
    if (stats.size > 50 * 1024 * 1024) { // 50MB limit
      errors.push('Package size exceeds 50MB limit');
    }

    // Verify package structure
    try {
      const files = await this.listPackageFiles(packagePath);

      if (!files.includes('plugin.json')) {
        errors.push('Missing plugin.json');
      }

      if (!files.includes('extension.js')) {
        errors.push('Missing extension.js');
      }

    } catch (error) {
      errors.push(`Failed to read package: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async extractMetadata(packagePath) {
    const zip = new AdmZip(packagePath);
    const manifestEntry = zip.getEntry('plugin.json');

    if (!manifestEntry) {
      throw new Error('Manifest not found in package');
    }

    const manifest = JSON.parse(manifestEntry.getData().toString());

    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      permissions: manifest.permissions,
      engines: manifest.engines
    };
  }

  async uploadPackage(packagePath, metadata) {
    const formData = new FormData();
    formData.append('package', fs.createReadStream(packagePath));
    formData.append('metadata', JSON.stringify(metadata));

    const response = await fetch(`${this.registry}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  async registerExtension(metadata, uploadResult) {
    const response = await fetch(`${this.registry}/api/extensions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...metadata,
        packageUrl: uploadResult.url,
        checksum: uploadResult.checksum,
        publishedAt: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.statusText}`);
    }

    return response.json();
  }

  async versionExists(extensionId, version) {
    try {
      const response = await fetch(
        `${this.registry}/api/extensions/${extensionId}/versions/${version}`
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  async listPackageFiles(packagePath) {
    const zip = new AdmZip(packagePath);
    return zip.getEntries().map(entry => entry.entryName);
  }
}
```

## Conclusion

Extension development for Claude Code provides developers with a powerful framework for extending the platform's capabilities. Through the comprehensive SDK, developers can create commands, tools, views, and integrate with external services while maintaining security and performance. The development environment includes robust testing frameworks, build systems, and deployment tools that streamline the extension creation process.

The extension system's architecture ensures that extensions are isolated, secure, and performant, while providing rich APIs for interacting with the Claude Code platform. From simple utility functions to complex integrations, the extension development framework supports a wide range of use cases. The built-in testing, building, and publishing tools ensure that extensions meet quality standards and can be easily distributed to users through the extension registry, fostering a vibrant ecosystem of extensions that enhance Claude Code's functionality.