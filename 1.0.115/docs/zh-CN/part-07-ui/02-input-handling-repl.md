# 第七部分 7.2：输入处理和 REPL - Claude Code 技术系列

## 🎮 简介：构建交互式命令行体验

Read-Eval-Print Loop（REPL）是 Claude Code 交互界面的核心，为用户提供了将 AI 辅助与传统命令行操作无缝融合的对话体验。这个实现超越了简单的输入循环，创建了一个处理流式响应、工具执行、速率限制和对话管理的复杂环境。

该架构展示了现代 CLI 应用程序如何提供丰富的交互体验，同时保持命令行工具预期的响应性和效率。

## 🔄 REPL 架构概述

### 核心组件

REPL 系统由几个相互连接的组件组成：

```javascript
// ClaudeCodeCLI 类中的主要 REPL 组件

class ClaudeCodeCLI {
  constructor() {
    // UI 组件
    this.terminal = null;           // 终端接口
    this.markdownRenderer = null;   // Markdown 格式化

    // API 组件
    this.apiClient = null;          // Anthropic API 客户端
    this.conversationManager = null; // 对话状态
    this.rateLimiter = null;        // 速率限制管理

    // 工具系统
    this.tools = new Map();         // 可用工具
    this.agents = null;             // 代理编排

    // 状态管理
    this.isRunning = false;         // REPL 状态
    this.currentConversation = null; // 活动对话
  }
}
```

### 初始化管道

初始化过程建立所有必要的组件：

```javascript
async initialize() {
  try {
    // 1. 加载配置
    this.config = new ConfigManager();
    await this.config.load();

    // 2. 初始化终端 UI
    this.terminal = new Terminal({
      colors: this.config.get('colors', true),
      spinner: this.config.get('spinner', true)
    });

    // 3. 初始化 markdown 渲染器
    this.markdownRenderer = new MarkdownRenderer({
      syntaxHighlight: this.config.get('syntaxHighlight', true)
    });

    // 4. 获取 API 密钥
    const apiKey = this.config.get('apiKey') || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ClaudeCodeError('找不到 API 密钥。');
    }

    // 5. 初始化 API 客户端
    this.apiClient = new APIClient({
      apiKey,
      baseURL: this.config.get('apiUrl', 'https://api.anthropic.com'),
      maxRetries: this.config.get('maxRetries', 3),
      timeout: this.config.get('timeout', 30000)
    });

    // 6-11. 初始化剩余组件...

    this.terminal.write(chalk.green('✓ 初始化成功\n'));
  } catch (error) {
    console.error(chalk.red('初始化失败:'), error.message);
    process.exit(1);
  }
}
```

## 📝 主 REPL 循环实现

### 交互模式入口点

`runInteractive()` 方法实现主 REPL 循环：

```javascript
async runInteractive() {
  this.isRunning = true;

  // 显示欢迎横幅
  this.terminal.write(chalk.cyan(`
╔══════════════════════════════════════╗
║     Claude Code CLI v${VERSION}     ║
║     交互模式                         ║
╚══════════════════════════════════════╝
`));

  this.terminal.write(chalk.gray('输入 "exit" 退出, "help" 查看命令。\n\n'));

  // 创建新对话
  this.currentConversation = await this.conversationManager.create();

  // 主 REPL 循环
  while (this.isRunning) {
    try {
      // 1. 获取用户输入
      const input = await this.terminal.prompt('> ');

      if (!input || input.trim() === '') continue;

      // 2. 处理特殊命令
      if (this.handleCommand(input)) continue;

      // 3. 检查速率限制
      const rateLimitState = await this.rateLimiter.checkLimit();
      if (rateLimitState.limited) {
        this.terminal.error(`速率限制超出: ${rateLimitState.message}`);
        continue;
      }

      // 4. 如果接近限制，显示警告
      if (rateLimitState.severity === 'warning') {
        this.terminal.warn(rateLimitState.message);
      }

      // 5. 将用户消息添加到对话
      await this.currentConversation.addMessage('user', input);

      // 6. 发送到 API 并处理响应
      await this.sendMessage();

    } catch (error) {
      this.errorHandler.handle(error);
    }
  }

  // 退出时清理
  await this.cleanup();
}
```

### 输入处理管道

输入处理遵循结构化管道：

```javascript
// 输入验证和预处理
class InputProcessor {
  process(input) {
    // 1. 修剪和标准化
    const normalized = input.trim();

    // 2. 检查空输入
    if (!normalized) return null;

    // 3. 检测多行粘贴
    if (this.isMultiLinePaste(normalized)) {
      return this.processMultiLine(normalized);
    }

    // 4. 检测命令前缀
    if (normalized.startsWith('/')) {
      return { type: 'command', content: normalized.slice(1) };
    }

    // 5. 常规消息
    return { type: 'message', content: normalized };
  }

  isMultiLinePaste(text) {
    // 检测输入是否来自粘贴操作
    return text.includes('\n') && text.length > 100;
  }

  processMultiLine(text) {
    // 处理多行代码块
    const codeBlockPattern = /```[\s\S]*```/;
    if (codeBlockPattern.test(text)) {
      return { type: 'code', content: text };
    }
    return { type: 'message', content: text };
  }
}
```

## 💬 命令处理系统

### 内置命令

REPL 提供几个内置命令：

```javascript
handleCommand(input) {
  const cmd = input.trim().toLowerCase();

  switch (cmd) {
    case 'exit':
    case 'quit':
      this.isRunning = false;
      return true;

    case 'help':
      this.showHelp();
      return true;

    case 'clear':
      this.terminal.clear();
      return true;

    case 'reset':
      this.currentConversation = this.conversationManager.create();
      this.terminal.write(chalk.green('对话已重置。\n'));
      return true;

    case 'config':
      const config = this.config.getAll();
      this.terminal.write(JSON.stringify(config, null, 2) + '\n');
      return true;

    case 'history':
      this.showHistory();
      return true;

    case 'save':
      await this.saveConversation();
      return true;

    case 'load':
      await this.loadConversation();
      return true;

    default:
      return false;
  }
}
```

### 扩展命令系统

带参数的更复杂命令处理：

```javascript
class CommandParser {
  constructor() {
    this.commands = new Map([
      ['set', this.handleSet.bind(this)],
      ['get', this.handleGet.bind(this)],
      ['run', this.handleRun.bind(this)],
      ['exec', this.handleExec.bind(this)],
      ['model', this.handleModel.bind(this)],
      ['tokens', this.handleTokens.bind(this)]
    ]);
  }

  parse(input) {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (this.commands.has(command)) {
      return this.commands.get(command)(args);
    }

    return null;
  }

  handleSet(args) {
    // 处理配置设置
    if (args.length < 2) {
      return { error: '用法: set <key> <value>' };
    }

    const [key, ...valueParts] = args;
    const value = valueParts.join(' ');

    return {
      action: 'setConfig',
      key,
      value
    };
  }

  handleModel(args) {
    // 切换模型
    const validModels = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];

    if (args.length === 0) {
      return { action: 'showCurrentModel' };
    }

    const model = args[0];
    if (!validModels.includes(model)) {
      return { error: `无效模型。请从以下选择：${validModels.join(', ')}` };
    }

    return {
      action: 'switchModel',
      model
    };
  }
}
```

## 🌊 流式响应处理

### API 消息发送

`sendMessage()` 方法处理 API 通信：

```javascript
async sendMessage() {
  const spinner = this.terminal.spinner('思考中...');
  spinner.start();

  try {
    // 1. 准备请求
    const messages = this.currentConversation.getMessages();
    const tools = this.getToolDefinitions();

    // 2. 发送到带流式的 API
    const stream = await this.apiClient.sendMessage(this.currentConversation, {
      stream: true,
      tools: tools.length > 0 ? tools : undefined,
      system: this.getSystemPrompt()
    });

    spinner.stop();

    // 3. 处理流式响应
    const streamHandler = new StreamHandler();
    let responseText = '';
    const toolUses = [];

    streamHandler.on('content', (content) => {
      responseText += content;
      // 实时渲染 markdown
      if (this.config.get('markdown', true)) {
        process.stdout.write(this.markdownRenderer.renderInline(content));
      } else {
        process.stdout.write(content);
      }
    });

    streamHandler.on('tool_use', async (tool) => {
      toolUses.push(tool);
    });

    await streamHandler.handleStream(stream);

    // 4. 将助手响应添加到对话
    if (responseText) {
      await this.currentConversation.addMessage('assistant', responseText);
    }

    // 5. 执行任何工具使用
    for (const toolUse of toolUses) {
      await this.executeToolWithFeedback(toolUse);
    }

    this.terminal.write('\n');

  } catch (error) {
    spinner.stop();
    throw error;
  }
}
```

### 实时流处理

```javascript
class StreamProcessor {
  constructor(terminal, markdownRenderer) {
    this.terminal = terminal;
    this.markdownRenderer = markdownRenderer;
    this.buffer = '';
    this.isCodeBlock = false;
    this.codeLanguage = '';
  }

  processChunk(chunk) {
    this.buffer += chunk;

    // 检测代码块边界
    const codeBlockStart = /```(\w+)?\n/;
    const codeBlockEnd = /```/;

    if (codeBlockStart.test(this.buffer) && !this.isCodeBlock) {
      this.isCodeBlock = true;
      const match = this.buffer.match(codeBlockStart);
      this.codeLanguage = match[1] || 'text';
      this.startCodeBlock();
    }

    if (this.isCodeBlock && codeBlockEnd.test(this.buffer)) {
      this.endCodeBlock();
      this.isCodeBlock = false;
    }

    // 基于内容类型渲染
    if (this.isCodeBlock) {
      this.renderCode(chunk);
    } else {
      this.renderMarkdown(chunk);
    }
  }

  startCodeBlock() {
    // 设置语法高亮
    this.terminal.write(chalk.gray('\n┌─ 代码 '));
    this.terminal.write(chalk.cyan(this.codeLanguage));
    this.terminal.write(chalk.gray(' ─\n│ '));
  }

  endCodeBlock() {
    this.terminal.write(chalk.gray('\n└─────\n'));
  }

  renderCode(text) {
    // 如果可用，应用语法高亮
    const highlighted = this.highlightCode(text, this.codeLanguage);
    this.terminal.write(highlighted);
  }

  renderMarkdown(text) {
    const rendered = this.markdownRenderer.renderInline(text);
    this.terminal.write(rendered);
  }
}
```

## 🔧 工具执行集成

### 工具注册和发现

```javascript
registerTools() {
  // 文件操作工具
  this.tools.set('read', new ReadTool());
  this.tools.set('write', new WriteTool());
  this.tools.set('edit', new EditTool());
  this.tools.set('multiedit', new MultiEditTool());

  // 系统工具
  this.tools.set('bash', new BashTool({
    shellExecutor: this.shellExecutor
  }));
  this.tools.set('grep', new GrepTool());
  this.tools.set('glob', new GlobTool());

  // 网络工具
  this.tools.set('webfetch', new WebFetchTool());
  this.tools.set('websearch', new WebSearchTool());

  // 代理工具
  this.tools.set('task', new TaskTool({
    agentManager: this.agents
  }));
}

getToolDefinitions() {
  const toolDefs = [];

  for (const [name, tool] of this.tools) {
    if (tool.getDefinition) {
      const definition = tool.getDefinition();

      // 添加权限检查
      if (this.checkToolPermission(name)) {
        toolDefs.push(definition);
      }
    }
  }

  return toolDefs;
}
```

### 带反馈的工具执行

```javascript
async executeToolWithFeedback(toolUse) {
  // 显示工具执行开始
  this.terminal.write(chalk.gray(`\n[正在执行 ${toolUse.name}...]\n`));

  // 为长时间运行的工具创建进度指示器
  const shouldShowProgress = ['bash', 'webfetch', 'task'].includes(toolUse.name);
  let progressIndicator = null;

  if (shouldShowProgress) {
    progressIndicator = this.terminal.spinner(`正在运行 ${toolUse.name}`);
    progressIndicator.start();
  }

  try {
    // 执行工具
    const result = await this.executeTool(toolUse);

    if (progressIndicator) {
      progressIndicator.succeed(`${toolUse.name} 完成`);
    } else {
      this.terminal.write(chalk.green(`✓ ${toolUse.name} 完成\n`));
    }

    // 基于类型显示工具结果
    this.displayToolResult(toolUse.name, result);

    // 将工具结果添加到对话
    await this.currentConversation.addMessage('tool', {
      toolUse,
      result
    });

  } catch (error) {
    if (progressIndicator) {
      progressIndicator.fail(`${toolUse.name} 失败`);
    }

    this.terminal.error(`工具错误: ${error.message}`);

    // 将错误添加到对话以获取上下文
    await this.currentConversation.addMessage('tool', {
      toolUse,
      error: error.message
    });
  }
}

displayToolResult(toolName, result) {
  switch (toolName) {
    case 'read':
      // 显示带语法高亮的文件内容
      this.displayFileContent(result);
      break;

    case 'bash':
      // 显示命令输出
      this.displayCommandOutput(result);
      break;

    case 'grep':
      // 显示搜索结果
      this.displaySearchResults(result);
      break;

    default:
      // 通用结果显示
      if (typeof result === 'string') {
        this.terminal.write(result + '\n');
      } else {
        this.terminal.write(JSON.stringify(result, null, 2) + '\n');
      }
  }
}
```

## 📊 对话管理

### 消息历史处理

```javascript
class ConversationManager {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 100;
    this.messages = [];
    this.metadata = {
      created: Date.now(),
      model: null,
      tokenCount: 0
    };
  }

  async create() {
    this.messages = [];
    this.metadata.created = Date.now();
    return this;
  }

  async addMessage(role, content) {
    const message = {
      role,
      content,
      timestamp: Date.now()
    };

    this.messages.push(message);

    // 如果超出限制，修剪旧消息
    if (this.messages.length > this.maxMessages) {
      this.trimMessages();
    }

    // 更新令牌计数
    this.metadata.tokenCount = await this.calculateTokenCount();

    return message;
  }

  trimMessages() {
    // 保留系统消息和最近消息
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const recentMessages = this.messages.slice(-this.maxMessages);

    this.messages = [...systemMessages, ...recentMessages];
  }

  getMessages() {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  async saveHistory() {
    const historyPath = path.join(
      os.homedir(),
      '.claude-code',
      'history',
      `${Date.now()}.json`
    );

    await fs.promises.writeFile(
      historyPath,
      JSON.stringify({
        messages: this.messages,
        metadata: this.metadata
      }, null, 2)
    );
  }
}
```

## ⚡ 速率限制集成

### 速率限制管理

```javascript
class RateLimiter {
  constructor(options = {}) {
    this.limits = {
      requestsPerMinute: options.requestsPerMinute || 50,
      tokensPerMinute: options.tokensPerMinute || 100000,
      requestsPerDay: options.requestsPerDay || 5000
    };

    this.usage = {
      requests: [],
      tokens: [],
      dailyRequests: 0,
      lastReset: Date.now()
    };
  }

  async checkLimit() {
    const now = Date.now();

    // 清理旧条目
    this.cleanOldEntries(now);

    // 检查分钟限制
    const recentRequests = this.usage.requests.filter(
      t => now - t < 60000
    ).length;

    if (recentRequests >= this.limits.requestsPerMinute) {
      return {
        limited: true,
        message: '速率限制超出。请等待后再发送另一条消息。',
        retryAfter: 60000 - (now - Math.min(...this.usage.requests))
      };
    }

    // 检查是否接近限制
    if (recentRequests >= this.limits.requestsPerMinute * 0.8) {
      return {
        limited: false,
        severity: 'warning',
        message: `接近速率限制 (${recentRequests}/${this.limits.requestsPerMinute} 请求)`
      };
    }

    return { limited: false };
  }

  recordRequest(tokenCount) {
    const now = Date.now();
    this.usage.requests.push(now);
    this.usage.tokens.push({ time: now, count: tokenCount });
    this.usage.dailyRequests++;
  }

  cleanOldEntries(now) {
    // 删除超过 1 分钟的条目
    this.usage.requests = this.usage.requests.filter(
      t => now - t < 60000
    );

    this.usage.tokens = this.usage.tokens.filter(
      entry => now - entry.time < 60000
    );

    // 重置每日计数器
    if (now - this.usage.lastReset > 86400000) {
      this.usage.dailyRequests = 0;
      this.usage.lastReset = now;
    }
  }
}
```

## 🎨 输出格式化

### 终端中的 Markdown 渲染

```javascript
class TerminalMarkdownRenderer {
  renderInline(text) {
    let formatted = text;

    // 粗体文本
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, chalk.bold('$1'));

    // 斜体文本
    formatted = formatted.replace(/\*(.*?)\*/g, chalk.italic('$1'));

    // 内联代码
    formatted = formatted.replace(/`([^`]+)`/g, chalk.yellow('$1'));

    // 链接
    formatted = formatted.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (match, text, url) => `${chalk.blue(text)} ${chalk.gray(`(${url})`)}`
    );

    return formatted;
  }

  renderCodeBlock(code, language) {
    const lines = code.split('\n');
    const maxLineNumWidth = String(lines.length).length;

    return lines.map((line, index) => {
      const lineNum = String(index + 1).padStart(maxLineNumWidth, ' ');
      return chalk.gray(`${lineNum} │ `) + this.highlightSyntax(line, language);
    }).join('\n');
  }

  highlightSyntax(line, language) {
    // 简单的语法高亮
    switch (language) {
      case 'javascript':
      case 'js':
        return this.highlightJavaScript(line);
      case 'python':
      case 'py':
        return this.highlightPython(line);
      default:
        return line;
    }
  }

  highlightJavaScript(line) {
    let highlighted = line;

    // 关键字
    const keywords = /\b(const|let|var|function|class|if|else|for|while|return|import|export|async|await)\b/g;
    highlighted = highlighted.replace(keywords, chalk.magenta('$1'));

    // 字符串
    highlighted = highlighted.replace(/(["'])([^"']*)\1/g, chalk.green('$1$2$1'));

    // 注释
    highlighted = highlighted.replace(/(\/\/.*)$/, chalk.gray('$1'));

    return highlighted;
  }
}
```

## 🔍 错误处理和恢复

### 强大的错误管理

```javascript
class REPLErrorHandler {
  constructor(terminal) {
    this.terminal = terminal;
    this.errorLog = [];
  }

  handle(error) {
    // 记录错误以进行调试
    this.errorLog.push({
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack
    });

    // 分类和显示错误
    if (error instanceof ClaudeCodeError) {
      this.handleApplicationError(error);
    } else if (error.response) {
      this.handleAPIError(error);
    } else if (error.code === 'ECONNREFUSED') {
      this.handleNetworkError(error);
    } else {
      this.handleUnknownError(error);
    }
  }

  handleApplicationError(error) {
    this.terminal.write(chalk.red(`\n⚠ ${error.message}\n`));

    if (error.suggestions) {
      this.terminal.write(chalk.yellow('建议:\n'));
      error.suggestions.forEach(suggestion => {
        this.terminal.write(`  • ${suggestion}\n`);
      });
    }
  }

  handleAPIError(error) {
    const status = error.response?.status;

    switch (status) {
      case 401:
        this.terminal.write(chalk.red('\n⚠ 身份验证失败。请检查您的 API 密钥。\n'));
        break;
      case 429:
        this.terminal.write(chalk.yellow('\n⚠ 速率限制超出。请等待后重试。\n'));
        break;
      case 500:
        this.terminal.write(chalk.red('\n⚠ API 服务器错误。请稍后再试。\n'));
        break;
      default:
        this.terminal.write(chalk.red(`\n⚠ API 错误 (${status}): ${error.message}\n`));
    }
  }

  handleNetworkError(error) {
    this.terminal.write(chalk.red('\n⚠ 网络错误：无法连接到 API。\n'));
    this.terminal.write(chalk.yellow('请检查您的互联网连接。\n'));
  }

  handleUnknownError(error) {
    this.terminal.write(chalk.red(`\n⚠ 意外错误: ${error.message}\n`));

    if (process.env.DEBUG) {
      this.terminal.write(chalk.gray(error.stack + '\n'));
    }
  }
}
```

## 🚀 高级 REPL 功能

### 多行输入处理

```javascript
class MultiLineInputHandler {
  constructor(terminal) {
    this.terminal = terminal;
    this.buffer = [];
    this.isMultiLine = false;
    this.delimiter = '```';
  }

  async readMultiLine() {
    this.terminal.write(chalk.gray('输入多行输入。在新行上以 ``` 结束。\n'));
    this.buffer = [];
    this.isMultiLine = true;

    while (this.isMultiLine) {
      const line = await this.terminal.prompt('... ');

      if (line.trim() === this.delimiter) {
        this.isMultiLine = false;
      } else {
        this.buffer.push(line);
      }
    }

    return this.buffer.join('\n');
  }
}
```

### 上下文感知的自动完成

```javascript
class AutoCompleteProvider {
  constructor(tools, commands) {
    this.tools = tools;
    this.commands = commands;
    this.history = [];
  }

  getSuggestions(input) {
    const suggestions = [];

    // 命令建议
    if (input.startsWith('/')) {
      const prefix = input.slice(1);
      suggestions.push(
        ...this.commands
          .filter(cmd => cmd.startsWith(prefix))
          .map(cmd => '/' + cmd)
      );
    }

    // 工具名称建议
    const toolPattern = /@(\w*)$/;
    const match = input.match(toolPattern);
    if (match) {
      const prefix = match[1];
      suggestions.push(
        ...Array.from(this.tools.keys())
          .filter(name => name.startsWith(prefix))
          .map(name => input.replace(toolPattern, '@' + name))
      );
    }

    // 历史建议
    if (input.length > 2) {
      suggestions.push(
        ...this.history
          .filter(h => h.startsWith(input))
          .slice(0, 3)
      );
    }

    return suggestions;
  }
}
```

### 会话管理

```javascript
class SessionManager {
  constructor(config) {
    this.config = config;
    this.sessionPath = path.join(
      os.homedir(),
      '.claude-code',
      'sessions'
    );
  }

  async saveSession(conversation, metadata) {
    const sessionId = Date.now();
    const sessionFile = path.join(
      this.sessionPath,
      `${sessionId}.json`
    );

    const sessionData = {
      id: sessionId,
      timestamp: Date.now(),
      conversation: conversation.getMessages(),
      metadata: {
        ...metadata,
        model: this.config.get('model'),
        toolsUsed: Array.from(metadata.toolsUsed || [])
      }
    };

    await fs.promises.writeFile(
      sessionFile,
      JSON.stringify(sessionData, null, 2)
    );

    return sessionId;
  }

  async loadSession(sessionId) {
    const sessionFile = path.join(
      this.sessionPath,
      `${sessionId}.json`
    );

    const data = await fs.promises.readFile(sessionFile, 'utf-8');
    return JSON.parse(data);
  }

  async listSessions() {
    const files = await fs.promises.readdir(this.sessionPath);
    const sessions = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await this.loadSession(
          file.replace('.json', '')
        );
        sessions.push({
          id: data.id,
          timestamp: data.timestamp,
          messageCount: data.conversation.length
        });
      }
    }

    return sessions.sort((a, b) => b.timestamp - a.timestamp);
  }
}
```

## 💡 最佳实践和优化

### 性能优化

```javascript
class REPLPerformanceOptimizer {
  constructor() {
    this.cache = new Map();
    this.metrics = {
      responseTime: [],
      toolExecutionTime: new Map()
    };
  }

  // 缓存常用响应
  cacheResponse(input, response) {
    const key = this.hashInput(input);
    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });

    // 限制缓存大小
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  getCachedResponse(input) {
    const key = this.hashInput(input);
    const cached = this.cache.get(key);

    if (cached) {
      // 检查缓存是否仍然有效（5 分钟）
      if (Date.now() - cached.timestamp < 300000) {
        return cached.response;
      }
      this.cache.delete(key);
    }

    return null;
  }

  recordMetric(type, duration) {
    if (type === 'response') {
      this.metrics.responseTime.push(duration);
      // 仅保留最后 100 次测量
      if (this.metrics.responseTime.length > 100) {
        this.metrics.responseTime.shift();
      }
    } else {
      if (!this.metrics.toolExecutionTime.has(type)) {
        this.metrics.toolExecutionTime.set(type, []);
      }
      this.metrics.toolExecutionTime.get(type).push(duration);
    }
  }

  getAverageResponseTime() {
    const times = this.metrics.responseTime;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }
}
```

### 内存管理

```javascript
class MemoryManager {
  constructor(maxMemoryMB = 500) {
    this.maxMemory = maxMemoryMB * 1024 * 1024;
    this.checkInterval = 60000; // 每分钟检查一次

    setInterval(() => this.checkMemory(), this.checkInterval);
  }

  checkMemory() {
    const usage = process.memoryUsage();

    if (usage.heapUsed > this.maxMemory) {
      this.performCleanup();
    }
  }

  performCleanup() {
    // 如果可用，强制垃圾收集
    if (global.gc) {
      global.gc();
    }

    // 清理缓存
    this.clearOldConversations();
    this.clearToolCache();
  }

  clearOldConversations() {
    // 特定于对话存储的实现
  }

  clearToolCache() {
    // 清理任何工具特定的缓存
  }
}
```

## 📊 总结

Claude Code 中的输入处理和 REPL 实现代表了复杂的交互式命令行体验。关键成就包括：

1. **强大的 REPL 循环**：具有错误恢复的完整读取-评估-打印循环
2. **流处理**：API 流式响应的实时处理
3. **命令系统**：带参数支持的可扩展命令处理
4. **工具集成**：各种工具的无缝执行和结果显示
5. **对话管理**：完整的历史跟踪和会话持久性
6. **速率限制**：带警告的智能速率限制管理
7. **错误处理**：全面的错误分类和恢复
8. **性能优化**：缓存、指标和内存管理
9. **高级功能**：多行输入、自动完成和会话管理

实现展示了现代 CLI 应用程序如何提供丰富的交互体验，同时保持命令行工具预期的效率和可脚本性。模块化设计允许轻松扩展和自定义，使其成为 AI 驱动的命令行应用程序的强大基础。

---

*下一个第七部分 7.3：输出渲染和格式化 - 深入探讨 markdown 渲染、语法高亮和终端输出格式化技术。*