# Part 7.2: Input Handling and REPL - Claude Code Technical Series

## 🎮 Introduction: Building an Interactive Command-Line Experience

The Read-Eval-Print Loop (REPL) is the heart of Claude Code's interactive interface, providing users with a conversational experience that seamlessly blends AI assistance with traditional command-line operations. This implementation goes beyond a simple input loop, creating a sophisticated environment that handles streaming responses, tool execution, rate limiting, and conversation management.

The architecture demonstrates how modern CLI applications can provide rich, interactive experiences while maintaining the responsiveness and efficiency expected from command-line tools.

## 🔄 REPL Architecture Overview

### Core Components

The REPL system consists of several interconnected components:

```javascript
// Main REPL components from ClaudeCodeCLI class

class ClaudeCodeCLI {
  constructor() {
    // UI Components
    this.terminal = null;           // Terminal interface
    this.markdownRenderer = null;   // Markdown formatting

    // API Components
    this.apiClient = null;          // Anthropic API client
    this.conversationManager = null; // Conversation state
    this.rateLimiter = null;        // Rate limit management

    // Tool System
    this.tools = new Map();         // Available tools
    this.agents = null;             // Agent orchestration

    // State Management
    this.isRunning = false;         // REPL state
    this.currentConversation = null; // Active conversation
  }
}
```

### Initialization Pipeline

The initialization process establishes all necessary components:

```javascript
async initialize() {
  try {
    // 1. Load configuration
    this.config = new ConfigManager();
    await this.config.load();

    // 2. Initialize terminal UI
    this.terminal = new Terminal({
      colors: this.config.get('colors', true),
      spinner: this.config.get('spinner', true)
    });

    // 3. Initialize markdown renderer
    this.markdownRenderer = new MarkdownRenderer({
      syntaxHighlight: this.config.get('syntaxHighlight', true)
    });

    // 4. Get API key
    const apiKey = this.config.get('apiKey') || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ClaudeCodeError('No API key found.');
    }

    // 5. Initialize API client
    this.apiClient = new APIClient({
      apiKey,
      baseURL: this.config.get('apiUrl', 'https://api.anthropic.com'),
      maxRetries: this.config.get('maxRetries', 3),
      timeout: this.config.get('timeout', 30000)
    });

    // 6-11. Initialize remaining components...

    this.terminal.write(chalk.green('✓ Initialized successfully\n'));
  } catch (error) {
    console.error(chalk.red('Initialization failed:'), error.message);
    process.exit(1);
  }
}
```

## 📝 Main REPL Loop Implementation

### Interactive Mode Entry Point

The `runInteractive()` method implements the main REPL loop:

```javascript
async runInteractive() {
  this.isRunning = true;

  // Display welcome banner
  this.terminal.write(chalk.cyan(`
╔══════════════════════════════════════╗
║     Claude Code CLI v${VERSION}     ║
║     Interactive Mode                 ║
╚══════════════════════════════════════╝
`));

  this.terminal.write(chalk.gray('Type "exit" to quit, "help" for commands.\n\n'));

  // Create new conversation
  this.currentConversation = await this.conversationManager.create();

  // Main REPL loop
  while (this.isRunning) {
    try {
      // 1. Get user input
      const input = await this.terminal.prompt('> ');

      if (!input || input.trim() === '') continue;

      // 2. Handle special commands
      if (this.handleCommand(input)) continue;

      // 3. Check rate limits
      const rateLimitState = await this.rateLimiter.checkLimit();
      if (rateLimitState.limited) {
        this.terminal.error(`Rate limit exceeded: ${rateLimitState.message}`);
        continue;
      }

      // 4. Show warning if approaching limit
      if (rateLimitState.severity === 'warning') {
        this.terminal.warn(rateLimitState.message);
      }

      // 5. Add user message to conversation
      await this.currentConversation.addMessage('user', input);

      // 6. Send to API and process response
      await this.sendMessage();

    } catch (error) {
      this.errorHandler.handle(error);
    }
  }

  // Cleanup on exit
  await this.cleanup();
}
```

### Input Processing Pipeline

The input processing follows a structured pipeline:

```javascript
// Input validation and preprocessing
class InputProcessor {
  process(input) {
    // 1. Trim and normalize
    const normalized = input.trim();

    // 2. Check for empty input
    if (!normalized) return null;

    // 3. Detect multi-line paste
    if (this.isMultiLinePaste(normalized)) {
      return this.processMultiLine(normalized);
    }

    // 4. Detect command prefix
    if (normalized.startsWith('/')) {
      return { type: 'command', content: normalized.slice(1) };
    }

    // 5. Regular message
    return { type: 'message', content: normalized };
  }

  isMultiLinePaste(text) {
    // Detect if input is from paste operation
    return text.includes('\n') && text.length > 100;
  }

  processMultiLine(text) {
    // Handle multi-line code blocks
    const codeBlockPattern = /```[\s\S]*```/;
    if (codeBlockPattern.test(text)) {
      return { type: 'code', content: text };
    }
    return { type: 'message', content: text };
  }
}
```

## 💬 Command Handling System

### Built-in Commands

The REPL provides several built-in commands:

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
      this.terminal.write(chalk.green('Conversation reset.\n'));
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

### Extended Command System

More sophisticated command handling with parameters:

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
    // Handle configuration setting
    if (args.length < 2) {
      return { error: 'Usage: set <key> <value>' };
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
    // Switch model
    const validModels = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];

    if (args.length === 0) {
      return { action: 'showCurrentModel' };
    }

    const model = args[0];
    if (!validModels.includes(model)) {
      return { error: `Invalid model. Choose from: ${validModels.join(', ')}` };
    }

    return {
      action: 'switchModel',
      model
    };
  }
}
```

## 🌊 Streaming Response Handling

### API Message Sending

The `sendMessage()` method handles API communication:

```javascript
async sendMessage() {
  const spinner = this.terminal.spinner('Thinking...');
  spinner.start();

  try {
    // 1. Prepare request
    const messages = this.currentConversation.getMessages();
    const tools = this.getToolDefinitions();

    // 2. Send to API with streaming
    const stream = await this.apiClient.sendMessage(this.currentConversation, {
      stream: true,
      tools: tools.length > 0 ? tools : undefined,
      system: this.getSystemPrompt()
    });

    spinner.stop();

    // 3. Handle streaming response
    const streamHandler = new StreamHandler();
    let responseText = '';
    const toolUses = [];

    streamHandler.on('content', (content) => {
      responseText += content;
      // Render markdown in real-time
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

    // 4. Add assistant response to conversation
    if (responseText) {
      await this.currentConversation.addMessage('assistant', responseText);
    }

    // 5. Execute any tool uses
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

### Real-time Stream Processing

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

    // Detect code block boundaries
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

    // Render based on content type
    if (this.isCodeBlock) {
      this.renderCode(chunk);
    } else {
      this.renderMarkdown(chunk);
    }
  }

  startCodeBlock() {
    // Setup syntax highlighting
    this.terminal.write(chalk.gray('\n┌─ Code '));
    this.terminal.write(chalk.cyan(this.codeLanguage));
    this.terminal.write(chalk.gray(' ─\n│ '));
  }

  endCodeBlock() {
    this.terminal.write(chalk.gray('\n└─────\n'));
  }

  renderCode(text) {
    // Apply syntax highlighting
    const highlighted = this.highlightCode(text, this.codeLanguage);
    this.terminal.write(highlighted);
  }

  renderMarkdown(text) {
    const rendered = this.markdownRenderer.renderInline(text);
    this.terminal.write(rendered);
  }
}
```

## 🔧 Tool Execution Integration

### Tool Registration and Discovery

```javascript
registerTools() {
  // File operation tools
  this.tools.set('read', new ReadTool());
  this.tools.set('write', new WriteTool());
  this.tools.set('edit', new EditTool());
  this.tools.set('multiedit', new MultiEditTool());

  // System tools
  this.tools.set('bash', new BashTool({
    shellExecutor: this.shellExecutor
  }));
  this.tools.set('grep', new GrepTool());
  this.tools.set('glob', new GlobTool());

  // Web tools
  this.tools.set('webfetch', new WebFetchTool());
  this.tools.set('websearch', new WebSearchTool());

  // Agent tools
  this.tools.set('task', new TaskTool({
    agentManager: this.agents
  }));
}

getToolDefinitions() {
  const toolDefs = [];

  for (const [name, tool] of this.tools) {
    if (tool.getDefinition) {
      const definition = tool.getDefinition();

      // Add permission checks
      if (this.checkToolPermission(name)) {
        toolDefs.push(definition);
      }
    }
  }

  return toolDefs;
}
```

### Tool Execution with Feedback

```javascript
async executeToolWithFeedback(toolUse) {
  // Show tool execution start
  this.terminal.write(chalk.gray(`\n[Executing ${toolUse.name}...]\n`));

  // Create progress indicator for long-running tools
  const shouldShowProgress = ['bash', 'webfetch', 'task'].includes(toolUse.name);
  let progressIndicator = null;

  if (shouldShowProgress) {
    progressIndicator = this.terminal.spinner(`Running ${toolUse.name}`);
    progressIndicator.start();
  }

  try {
    // Execute the tool
    const result = await this.executeTool(toolUse);

    if (progressIndicator) {
      progressIndicator.succeed(`${toolUse.name} completed`);
    } else {
      this.terminal.write(chalk.green(`✓ ${toolUse.name} completed\n`));
    }

    // Display tool result based on type
    this.displayToolResult(toolUse.name, result);

    // Add tool result to conversation
    await this.currentConversation.addMessage('tool', {
      toolUse,
      result
    });

  } catch (error) {
    if (progressIndicator) {
      progressIndicator.fail(`${toolUse.name} failed`);
    }

    this.terminal.error(`Tool error: ${error.message}`);

    // Add error to conversation for context
    await this.currentConversation.addMessage('tool', {
      toolUse,
      error: error.message
    });
  }
}

displayToolResult(toolName, result) {
  switch (toolName) {
    case 'read':
      // Display file content with syntax highlighting
      this.displayFileContent(result);
      break;

    case 'bash':
      // Display command output
      this.displayCommandOutput(result);
      break;

    case 'grep':
      // Display search results
      this.displaySearchResults(result);
      break;

    default:
      // Generic result display
      if (typeof result === 'string') {
        this.terminal.write(result + '\n');
      } else {
        this.terminal.write(JSON.stringify(result, null, 2) + '\n');
      }
  }
}
```

## 📊 Conversation Management

### Message History Handling

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

    // Trim old messages if limit exceeded
    if (this.messages.length > this.maxMessages) {
      this.trimMessages();
    }

    // Update token count
    this.metadata.tokenCount = await this.calculateTokenCount();

    return message;
  }

  trimMessages() {
    // Keep system messages and recent messages
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

## ⚡ Rate Limiting Integration

### Rate Limit Management

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

    // Clean old entries
    this.cleanOldEntries(now);

    // Check minute limits
    const recentRequests = this.usage.requests.filter(
      t => now - t < 60000
    ).length;

    if (recentRequests >= this.limits.requestsPerMinute) {
      return {
        limited: true,
        message: 'Rate limit exceeded. Please wait before sending another message.',
        retryAfter: 60000 - (now - Math.min(...this.usage.requests))
      };
    }

    // Check if approaching limit
    if (recentRequests >= this.limits.requestsPerMinute * 0.8) {
      return {
        limited: false,
        severity: 'warning',
        message: `Approaching rate limit (${recentRequests}/${this.limits.requestsPerMinute} requests)`
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
    // Remove entries older than 1 minute
    this.usage.requests = this.usage.requests.filter(
      t => now - t < 60000
    );

    this.usage.tokens = this.usage.tokens.filter(
      entry => now - entry.time < 60000
    );

    // Reset daily counter
    if (now - this.usage.lastReset > 86400000) {
      this.usage.dailyRequests = 0;
      this.usage.lastReset = now;
    }
  }
}
```

## 🎨 Output Formatting

### Markdown Rendering in Terminal

```javascript
class TerminalMarkdownRenderer {
  renderInline(text) {
    let formatted = text;

    // Bold text
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, chalk.bold('$1'));

    // Italic text
    formatted = formatted.replace(/\*(.*?)\*/g, chalk.italic('$1'));

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, chalk.yellow('$1'));

    // Links
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
    // Simple syntax highlighting
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

    // Keywords
    const keywords = /\b(const|let|var|function|class|if|else|for|while|return|import|export|async|await)\b/g;
    highlighted = highlighted.replace(keywords, chalk.magenta('$1'));

    // Strings
    highlighted = highlighted.replace(/(["'])([^"']*)\1/g, chalk.green('$1$2$1'));

    // Comments
    highlighted = highlighted.replace(/(\/\/.*)$/, chalk.gray('$1'));

    return highlighted;
  }
}
```

## 🔍 Error Handling and Recovery

### Robust Error Management

```javascript
class REPLErrorHandler {
  constructor(terminal) {
    this.terminal = terminal;
    this.errorLog = [];
  }

  handle(error) {
    // Log error for debugging
    this.errorLog.push({
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack
    });

    // Categorize and display error
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
      this.terminal.write(chalk.yellow('Suggestions:\n'));
      error.suggestions.forEach(suggestion => {
        this.terminal.write(`  • ${suggestion}\n`);
      });
    }
  }

  handleAPIError(error) {
    const status = error.response?.status;

    switch (status) {
      case 401:
        this.terminal.write(chalk.red('\n⚠ Authentication failed. Check your API key.\n'));
        break;
      case 429:
        this.terminal.write(chalk.yellow('\n⚠ Rate limit exceeded. Please wait before retrying.\n'));
        break;
      case 500:
        this.terminal.write(chalk.red('\n⚠ API server error. Please try again later.\n'));
        break;
      default:
        this.terminal.write(chalk.red(`\n⚠ API error (${status}): ${error.message}\n`));
    }
  }

  handleNetworkError(error) {
    this.terminal.write(chalk.red('\n⚠ Network error: Unable to connect to API.\n'));
    this.terminal.write(chalk.yellow('Please check your internet connection.\n'));
  }

  handleUnknownError(error) {
    this.terminal.write(chalk.red(`\n⚠ Unexpected error: ${error.message}\n`));

    if (process.env.DEBUG) {
      this.terminal.write(chalk.gray(error.stack + '\n'));
    }
  }
}
```

## 🚀 Advanced REPL Features

### Multi-line Input Handling

```javascript
class MultiLineInputHandler {
  constructor(terminal) {
    this.terminal = terminal;
    this.buffer = [];
    this.isMultiLine = false;
    this.delimiter = '```';
  }

  async readMultiLine() {
    this.terminal.write(chalk.gray('Enter multi-line input. End with ``` on a new line.\n'));
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

### Context-Aware Autocomplete

```javascript
class AutoCompleteProvider {
  constructor(tools, commands) {
    this.tools = tools;
    this.commands = commands;
    this.history = [];
  }

  getSuggestions(input) {
    const suggestions = [];

    // Command suggestions
    if (input.startsWith('/')) {
      const prefix = input.slice(1);
      suggestions.push(
        ...this.commands
          .filter(cmd => cmd.startsWith(prefix))
          .map(cmd => '/' + cmd)
      );
    }

    // Tool name suggestions
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

    // History suggestions
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

### Session Management

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

## 💡 Best Practices and Optimizations

### Performance Optimization

```javascript
class REPLPerformanceOptimizer {
  constructor() {
    this.cache = new Map();
    this.metrics = {
      responseTime: [],
      toolExecutionTime: new Map()
    };
  }

  // Cache frequently used responses
  cacheResponse(input, response) {
    const key = this.hashInput(input);
    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });

    // Limit cache size
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  getCachedResponse(input) {
    const key = this.hashInput(input);
    const cached = this.cache.get(key);

    if (cached) {
      // Check if cache is still valid (5 minutes)
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
      // Keep only last 100 measurements
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

### Memory Management

```javascript
class MemoryManager {
  constructor(maxMemoryMB = 500) {
    this.maxMemory = maxMemoryMB * 1024 * 1024;
    this.checkInterval = 60000; // Check every minute

    setInterval(() => this.checkMemory(), this.checkInterval);
  }

  checkMemory() {
    const usage = process.memoryUsage();

    if (usage.heapUsed > this.maxMemory) {
      this.performCleanup();
    }
  }

  performCleanup() {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Clear caches
    this.clearOldConversations();
    this.clearToolCache();
  }

  clearOldConversations() {
    // Implementation specific to conversation storage
  }

  clearToolCache() {
    // Clear any tool-specific caches
  }
}
```

## 📊 Summary

The Input Handling and REPL implementation in Claude Code represents a sophisticated interactive command-line experience. Key achievements include:

1. **Robust REPL Loop**: Complete read-eval-print loop with error recovery
2. **Stream Processing**: Real-time handling of API streaming responses
3. **Command System**: Extensible command handling with parameter support
4. **Tool Integration**: Seamless execution and result display for various tools
5. **Conversation Management**: Full history tracking and session persistence
6. **Rate Limiting**: Intelligent rate limit management with warnings
7. **Error Handling**: Comprehensive error categorization and recovery
8. **Performance Optimization**: Caching, metrics, and memory management
9. **Advanced Features**: Multi-line input, autocomplete, and session management

The implementation demonstrates how modern CLI applications can provide rich, interactive experiences while maintaining the efficiency and scriptability expected from command-line tools. The modular design allows for easy extension and customization, making it a robust foundation for AI-powered command-line applications.

---

*Next in Part 7.3: Output Rendering and Formatting - Deep dive into markdown rendering, syntax highlighting, and terminal output formatting techniques.*