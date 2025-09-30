# Part 11.2: 扩展开发

## 简介

Claude Code 的扩展开发使开发者能够创建增强平台功能的强大附加功能。本综合指南涵盖了完整的开发生命周期,从初始设置到测试、调试和部署。扩展可以从简单的实用函数到与外部服务的复杂集成,同时利用 Claude Code 强大的 API 和安全模型。

## 扩展开发环境

### 设置开发环境

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
    // 创建项目结构
    await this.createProjectStructure();

    // 安装依赖项
    await this.installDependencies();

    // 设置开发工具
    await this.setupDevTools();

    // 初始化 Git 仓库
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
        // 它是一个文件
        await fs.writeFile(fullPath, content);
      } else {
        // 它是一个目录
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

### 扩展 SDK

```javascript
// extension-sdk.js
export class ExtensionContext {
  constructor(plugin, api) {
    this.plugin = plugin;
    this.api = api;

    // 核心 API
    this.commands = new CommandRegistry(this);
    this.tools = new ToolRegistry(this);
    this.events = new EventBus(this);
    this.storage = new StorageAPI(this);
    this.ui = new UIAPI(this);
    this.workspace = new WorkspaceAPI(this);
    this.logger = new Logger(plugin.id);

    // 扩展元数据
    this.extensionPath = plugin.path;
    this.extensionId = plugin.id;
    this.globalState = new GlobalState(plugin.id);
    this.workspaceState = new WorkspaceState(plugin.id);
    this.secrets = new SecretsAPI(plugin.id);

    // 订阅管理
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

## 扩展组件

### 命令

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
      // 验证前置条件
      if (this.when && !await this.evaluateCondition(this.when, context)) {
        throw new Error('Command precondition not met');
      }

      // 执行处理器
      const result = await this.handler.call(context, ...args);

      // 跟踪命令执行
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
    // 评估 'when' 子句
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
    // 支持对象和单独参数两种方式
    if (typeof definition === 'string') {
      definition = {
        id: definition,
        handler: handler
      };
    }

    const command = new ExtensionCommand(definition);
    this.commands.set(command.id, command);

    // 注册到全局命令系统
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

    // 尝试全局命令
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

### 工具

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

    // 转换为 JSON Schema 格式
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
      // 验证参数
      const validated = await this.validateParameters(params);

      // 检查权限
      await this.checkPermissions(context);

      // 应用速率限制
      if (this.rateLimit) {
        await this.checkRateLimit(context);
      }

      // 带超时执行
      const result = await this.executeWithTimeout(
        this.handler.bind(context),
        validated,
        this.timeout
      );

      // 跟踪执行
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
    // 使用 JSON schema 验证器
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

    // 实现速率限制逻辑
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

    // 注册到全局工具系统
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

### 视图和 UI 组件

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

    // 设置 HTML 内容
    webview.html = await this.getWebviewContent(context);

    // 处理来自 webview 的消息
    webview.onDidReceiveMessage((message) => {
      this.handleWebviewMessage(message, context);
    });

    // 跟踪状态变化
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

    // 处理选择变化
    treeView.onDidChangeSelection((e) => {
      this.onTreeSelectionChanged(e.selection, context);
    });

    return treeView;
  }

  async getTreeItem(element, context) {
    // 在子类中覆盖
    return {
      label: element.label,
      collapsibleState: element.children ? 1 : 0,
      contextValue: element.type,
      iconPath: element.icon
    };
  }

  async getChildren(element, context) {
    // 在子类中覆盖
    return [];
  }

  async getParent(element, context) {
    // 在子类中覆盖
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

## 测试扩展

### 单元测试

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

      // 模拟 API
      commands: this.createMockCommandRegistry(),
      tools: this.createMockToolRegistry(),
      events: this.createMockEventBus(),
      storage: this.createMockStorage(),
      ui: this.createMockUI(),
      workspace: this.createMockWorkspace(),
      logger: this.createMockLogger(),

      // 状态
      globalState: new Map(),
      workspaceState: new Map(),
      secrets: new Map(),

      // 订阅
      subscriptions: []
    };

    // 应用覆盖
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

          // 初始化扩展
          await extension.initialize(context);

          // 运行测试
          await test.fn(extension, context);

          // 验证断言
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

// 示例测试套件
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

## 构建和打包

### 构建系统

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

    // 加载清单
    this.manifest = await this.loadManifest();

    // 清理输出目录
    await fs.emptyDir(this.outputPath);

    // 打包 JavaScript
    await this.bundleJavaScript(options);

    // 复制资源
    await this.copyAssets();

    // 生成元数据
    await this.generateMetadata();

    // 验证构建
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

    // 复制清单
    await fs.copy(
      path.join(this.projectPath, 'plugin.json'),
      path.join(this.outputPath, 'plugin.json')
    );

    // 复制 README
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
    // 检查所需文件是否存在
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

    // 验证清单
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

## 部署和分发

### 扩展发布

```javascript
// extension-publisher.js
class ExtensionPublisher {
  constructor(options = {}) {
    this.registry = options.registry || 'https://registry.claude-code.io';
    this.apiKey = options.apiKey;
  }

  async publish(packagePath, options = {}) {
    console.log('Publishing extension...');

    // 验证包
    const validation = await this.validatePackage(packagePath);
    if (!validation.valid) {
      throw new Error(`Package validation failed: ${validation.errors.join(', ')}`);
    }

    // 提取元数据
    const metadata = await this.extractMetadata(packagePath);

    // 检查版本是否已存在
    if (!options.force) {
      const exists = await this.versionExists(metadata.id, metadata.version);
      if (exists) {
        throw new Error(`Version ${metadata.version} already published`);
      }
    }

    // 上传包
    const uploadResult = await this.uploadPackage(packagePath, metadata);

    // 在注册表中注册
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

    // 检查文件是否存在
    if (!await fs.pathExists(packagePath)) {
      errors.push('Package file not found');
    }

    // 检查文件大小
    const stats = await fs.stat(packagePath);
    if (stats.size > 50 * 1024 * 1024) { // 50MB 限制
      errors.push('Package size exceeds 50MB limit');
    }

    // 验证包结构
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

## 结论

Claude Code 的扩展开发为开发者提供了一个强大的框架来扩展平台功能。通过全面的 SDK,开发者可以创建命令、工具、视图,并与外部服务集成,同时保持安全性和性能。开发环境包括强大的测试框架、构建系统和部署工具,可以简化扩展创建过程。

扩展系统的架构确保扩展是隔离的、安全的和高性能的,同时提供丰富的 API 来与 Claude Code 平台交互。从简单的实用函数到复杂的集成,扩展开发框架支持广泛的用例。内置的测试、构建和发布工具确保扩展符合质量标准,并可以通过扩展注册表轻松分发给用户,培育一个增强 Claude Code 功能的活跃扩展生态系统。