/**
 * Conversation Loop Core for Claude Code
 * Main REPL implementation, message handling, and context management
 * Extracted from stdin/stdout handling and conversation patterns
 */

import { EventEmitter } from 'events';
import { Transform, Readable } from 'stream';
import { getLogger } from '../utils/logging.js';
import { ErrorRecoveryManager } from '../error/error-recovery.js';

/**
 * Conversation states
 */
export const ConversationState = {
  IDLE: 'idle',
  WAITING_INPUT: 'waiting_input',
  PROCESSING: 'processing',
  STREAMING: 'streaming',
  ERROR: 'error',
  TERMINATED: 'terminated'
};

/**
 * Message types
 */
export const MessageType = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL_USE: 'tool_use',
  TOOL_RESULT: 'tool_result',
  ERROR: 'error',
  DEBUG: 'debug'
};

/**
 * Input modes
 */
export const InputMode = {
  NORMAL: 'normal',
  MULTILINE: 'multiline',
  RAW: 'raw',
  PASTE: 'paste'
};

/**
 * Conversation context
 */
export class ConversationContext {
  constructor() {
    this.messages = [];
    this.variables = new Map();
    this.metadata = {};
    this.tokenCount = 0;
    this.startTime = Date.now();
    this.lastInteractionTime = Date.now();
    this.state = ConversationState.IDLE;
    this.currentModel = null;
    this.temperature = 0;
  }

  /**
   * Add message to context
   */
  addMessage(type, content, metadata = {}) {
    const message = {
      type,
      content,
      metadata,
      timestamp: Date.now()
    };

    this.messages.push(message);
    this.lastInteractionTime = Date.now();
    return message;
  }

  /**
   * Get conversation history
   */
  getHistory(limit = null) {
    if (limit === null) {
      return [...this.messages];
    }
    return this.messages.slice(-limit);
  }

  /**
   * Clear context
   */
  clear() {
    this.messages = [];
    this.variables.clear();
    this.tokenCount = 0;
  }

  /**
   * Set variable
   */
  setVariable(key, value) {
    this.variables.set(key, value);
  }

  /**
   * Get variable
   */
  getVariable(key) {
    return this.variables.get(key);
  }

  /**
   * Update state
   */
  setState(state) {
    const oldState = this.state;
    this.state = state;
    return { oldState, newState: state };
  }

  /**
   * Get context summary
   */
  getSummary() {
    return {
      messageCount: this.messages.length,
      tokenCount: this.tokenCount,
      duration: Date.now() - this.startTime,
      state: this.state,
      model: this.currentModel
    };
  }
}

/**
 * Input handler
 * Original: stdin handling patterns from lines 6855, 7316, 7325
 */
export class InputHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.stdin = options.stdin || process.stdin;
    this.mode = InputMode.NORMAL;
    this.buffer = '';
    this.multilineBuffer = [];
    this.pasteBuffer = [];
    this.pasteTimeout = null;
    this.pasteTimeoutMs = options.pasteTimeout || 500;
    this.isRawMode = false;
    this.encoding = 'utf8';
    this.logger = getLogger('input-handler');

    this.setupStdin();
  }

  /**
   * Setup stdin
   * Original: stdin configuration patterns
   */
  setupStdin() {
    // Check if TTY
    if (this.stdin.isTTY) {
      this.stdin.setEncoding(this.encoding);
      this.logger.debug('TTY input mode detected');
    } else {
      this.logger.debug('Non-TTY input mode');
    }

    // Set up event listeners
    this.stdin.on('data', this.handleData.bind(this));
    this.stdin.on('end', this.handleEnd.bind(this));
    this.stdin.on('error', this.handleError.bind(this));
  }

  /**
   * Handle input data
   */
  handleData(chunk) {
    const data = chunk.toString();

    // Check for paste mode
    if (this.detectPasteMode(data)) {
      this.handlePaste(data);
      return;
    }

    // Process based on current mode
    switch (this.mode) {
      case InputMode.RAW:
        this.handleRawInput(data);
        break;
      case InputMode.MULTILINE:
        this.handleMultilineInput(data);
        break;
      default:
        this.handleNormalInput(data);
    }
  }

  /**
   * Handle normal input
   */
  handleNormalInput(data) {
    this.buffer += data;

    // Check for newline
    const lines = this.buffer.split('\n');
    if (lines.length > 1) {
      // Process complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          this.emit('line', line);
        }
      }
      // Keep incomplete line in buffer
      this.buffer = lines[lines.length - 1];
    }
  }

  /**
   * Handle multiline input
   */
  handleMultilineInput(data) {
    this.multilineBuffer.push(data);

    // Check for end marker
    if (data.includes('```') || data.includes('EOF')) {
      const content = this.multilineBuffer.join('');
      this.multilineBuffer = [];
      this.mode = InputMode.NORMAL;
      this.emit('multiline', content);
    }
  }

  /**
   * Handle raw input
   */
  handleRawInput(data) {
    // Pass through raw keystrokes
    for (const char of data) {
      this.emit('key', char);
    }
  }

  /**
   * Detect paste mode
   */
  detectPasteMode(data) {
    // Multiple lines at once suggests paste
    return data.split('\n').length > 2;
  }

  /**
   * Handle paste
   */
  handlePaste(data) {
    this.pasteBuffer.push(data);

    // Clear existing timeout
    if (this.pasteTimeout) {
      clearTimeout(this.pasteTimeout);
    }

    // Set new timeout
    this.pasteTimeout = setTimeout(() => {
      const pastedContent = this.pasteBuffer.join('');
      this.pasteBuffer = [];
      this.emit('paste', pastedContent);
    }, this.pasteTimeoutMs);
  }

  /**
   * Set raw mode
   * Original: setRawMode pattern from lines 7366-7373
   */
  setRawMode(enabled) {
    if (!this.stdin.isTTY) {
      throw new Error('Raw mode is not supported on non-TTY stdin');
    }

    this.isRawMode = enabled;
    this.stdin.setRawMode(enabled);

    if (enabled) {
      this.mode = InputMode.RAW;
      this.logger.debug('Raw mode enabled');
    } else {
      this.mode = InputMode.NORMAL;
      this.logger.debug('Raw mode disabled');
    }
  }

  /**
   * Handle end of input
   */
  handleEnd() {
    this.emit('end');
  }

  /**
   * Handle input error
   */
  handleError(error) {
    this.logger.error('Input error', { error });
    this.emit('error', error);
  }

  /**
   * Set input mode
   */
  setMode(mode) {
    this.mode = mode;
    this.emit('modeChange', mode);
  }

  /**
   * Clear buffers
   */
  clear() {
    this.buffer = '';
    this.multilineBuffer = [];
    this.pasteBuffer = [];
    if (this.pasteTimeout) {
      clearTimeout(this.pasteTimeout);
      this.pasteTimeout = null;
    }
  }

  /**
   * Destroy handler
   */
  destroy() {
    this.clear();
    this.stdin.removeAllListeners();
    if (this.isRawMode) {
      this.setRawMode(false);
    }
  }
}

/**
 * Output handler
 */
export class OutputHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;
    this.useColors = options.colors ?? true;
    this.logger = getLogger('output-handler');
    this.buffer = [];
    this.isStreaming = false;
  }

  /**
   * Write to stdout
   */
  write(content, options = {}) {
    const output = this.formatOutput(content, options);

    if (options.stream) {
      this.streamWrite(output);
    } else {
      this.stdout.write(output);
    }

    this.emit('write', { content, options });
  }

  /**
   * Write to stderr
   */
  writeError(content) {
    this.stderr.write(this.formatError(content));
    this.emit('error', content);
  }

  /**
   * Stream write
   */
  streamWrite(content) {
    this.isStreaming = true;

    // Write character by character for streaming effect
    let index = 0;
    const interval = setInterval(() => {
      if (index < content.length) {
        this.stdout.write(content[index]);
        index++;
      } else {
        clearInterval(interval);
        this.isStreaming = false;
        this.emit('streamEnd');
      }
    }, 10);
  }

  /**
   * Format output
   */
  formatOutput(content, options = {}) {
    if (!this.useColors) {
      return content;
    }

    // Apply formatting based on options
    let formatted = content;

    if (options.bold) {
      formatted = `\x1b[1m${formatted}\x1b[0m`;
    }

    if (options.color) {
      const colorCode = this.getColorCode(options.color);
      formatted = `\x1b[${colorCode}m${formatted}\x1b[0m`;
    }

    return formatted;
  }

  /**
   * Format error
   */
  formatError(content) {
    if (this.useColors) {
      return `\x1b[31m${content}\x1b[0m`; // Red
    }
    return content;
  }

  /**
   * Get color code
   */
  getColorCode(color) {
    const colors = {
      black: 30,
      red: 31,
      green: 32,
      yellow: 33,
      blue: 34,
      magenta: 35,
      cyan: 36,
      white: 37
    };
    return colors[color] || 37;
  }

  /**
   * Clear screen
   */
  clear() {
    if (this.stdout.isTTY) {
      this.stdout.write('\x1b[2J\x1b[0;0H');
    }
  }

  /**
   * New line
   */
  newLine() {
    this.stdout.write('\n');
  }
}

/**
 * Main conversation loop
 * Core REPL implementation
 */
export class ConversationLoop extends EventEmitter {
  constructor(options = {}) {
    super();
    this.context = new ConversationContext();
    this.inputHandler = new InputHandler(options);
    this.outputHandler = new OutputHandler(options);
    this.errorRecovery = new ErrorRecoveryManager();
    this.logger = getLogger('conversation-loop');

    // Configuration
    this.prompt = options.prompt || '> ';
    this.multilinePrompt = options.multilinePrompt || '... ';
    this.exitCommands = options.exitCommands || ['exit', 'quit', 'bye'];
    this.isRunning = false;
    this.isPaused = false;

    // Message processor (to be injected)
    this.messageProcessor = options.messageProcessor || null;

    this.setupHandlers();
  }

  /**
   * Setup event handlers
   */
  setupHandlers() {
    // Input events
    this.inputHandler.on('line', this.handleLine.bind(this));
    this.inputHandler.on('multiline', this.handleMultiline.bind(this));
    this.inputHandler.on('paste', this.handlePaste.bind(this));
    this.inputHandler.on('key', this.handleKey.bind(this));
    this.inputHandler.on('end', this.handleInputEnd.bind(this));
    this.inputHandler.on('error', this.handleInputError.bind(this));

    // Process events
    process.on('SIGINT', this.handleInterrupt.bind(this));
    process.on('SIGTERM', this.handleTerminate.bind(this));
  }

  /**
   * Start conversation loop
   * Original: main loop pattern with async iteration
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Conversation loop already running');
      return;
    }

    this.isRunning = true;
    this.context.setState(ConversationState.IDLE);

    this.logger.info('Starting conversation loop');
    this.emit('start');

    // Show initial prompt
    this.showPrompt();

    // Start processing loop
    try {
      await this.processLoop();
    } catch (error) {
      this.logger.error('Conversation loop error', { error });
      this.emit('error', error);
    }
  }

  /**
   * Process loop
   */
  async processLoop() {
    while (this.isRunning) {
      // Wait for next event
      await new Promise(resolve => {
        this.once('continue', resolve);
      });

      if (this.isPaused) {
        await this.waitForResume();
      }
    }
  }

  /**
   * Handle line input
   */
  async handleLine(line) {
    // Check for exit commands
    if (this.exitCommands.includes(line.toLowerCase())) {
      await this.stop();
      return;
    }

    // Check for special commands
    if (line.startsWith('/')) {
      await this.handleCommand(line);
      return;
    }

    // Process as message
    await this.processMessage(line);
  }

  /**
   * Handle multiline input
   */
  async handleMultiline(content) {
    await this.processMessage(content);
  }

  /**
   * Handle paste
   */
  async handlePaste(content) {
    this.logger.debug('Paste detected', { length: content.length });
    await this.processMessage(content);
  }

  /**
   * Handle key press
   */
  handleKey(key) {
    // Handle special keys
    switch (key) {
      case '\x03': // Ctrl+C
        this.handleInterrupt();
        break;
      case '\x04': // Ctrl+D
        this.handleEOF();
        break;
      case '\x1a': // Ctrl+Z
        this.handleSuspend();
        break;
    }
  }

  /**
   * Process message
   */
  async processMessage(content) {
    if (!content.trim()) {
      this.showPrompt();
      this.emit('continue');
      return;
    }

    try {
      // Update context
      this.context.setState(ConversationState.PROCESSING);
      this.context.addMessage(MessageType.USER, content);

      // Show processing indicator
      this.outputHandler.write('Processing...\n', { color: 'gray' });

      // Process through message processor
      if (this.messageProcessor) {
        const response = await this.errorRecovery.executeWithRetry(
          () => this.messageProcessor(content, this.context)
        );

        // Handle response
        await this.handleResponse(response);
      } else {
        // Echo mode if no processor
        this.outputHandler.write(`Echo: ${content}\n`);
      }

    } catch (error) {
      this.handleProcessingError(error);
    } finally {
      this.context.setState(ConversationState.IDLE);
      this.showPrompt();
      this.emit('continue');
    }
  }

  /**
   * Handle response
   */
  async handleResponse(response) {
    if (!response) return;

    // Add to context
    this.context.addMessage(MessageType.ASSISTANT, response);

    // Output response
    if (typeof response === 'string') {
      this.outputHandler.write(response + '\n');
    } else if (response.stream) {
      // Handle streaming response
      await this.handleStreamingResponse(response.stream);
    } else {
      this.outputHandler.write(JSON.stringify(response, null, 2) + '\n');
    }
  }

  /**
   * Handle streaming response
   */
  async handleStreamingResponse(stream) {
    this.context.setState(ConversationState.STREAMING);

    for await (const chunk of stream) {
      this.outputHandler.write(chunk, { stream: true });
    }

    this.outputHandler.newLine();
  }

  /**
   * Handle command
   */
  async handleCommand(command) {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;
      case 'clear':
        this.outputHandler.clear();
        break;
      case 'history':
        this.showHistory();
        break;
      case 'context':
        this.showContext();
        break;
      case 'multiline':
        this.inputHandler.setMode(InputMode.MULTILINE);
        this.outputHandler.write('Multiline mode - use ``` to end\n');
        break;
      case 'model':
        if (args[0]) {
          this.context.currentModel = args[0];
          this.outputHandler.write(`Model set to: ${args[0]}\n`);
        } else {
          this.outputHandler.write(`Current model: ${this.context.currentModel}\n`);
        }
        break;
      default:
        this.outputHandler.write(`Unknown command: ${cmd}\n`, { color: 'red' });
    }

    this.showPrompt();
    this.emit('continue');
  }

  /**
   * Show prompt
   */
  showPrompt() {
    const prompt = this.inputHandler.mode === InputMode.MULTILINE
      ? this.multilinePrompt
      : this.prompt;

    this.outputHandler.write(prompt, { color: 'cyan' });
  }

  /**
   * Show help
   */
  showHelp() {
    const help = `
Available commands:
  /help         - Show this help
  /clear        - Clear screen
  /history      - Show conversation history
  /context      - Show context information
  /multiline    - Enter multiline mode
  /model [name] - Get or set model
  exit/quit/bye - Exit conversation

Special keys:
  Ctrl+C - Interrupt current operation
  Ctrl+D - Exit
  Ctrl+Z - Suspend
`;
    this.outputHandler.write(help);
  }

  /**
   * Show history
   */
  showHistory() {
    const history = this.context.getHistory(10);
    this.outputHandler.write('Recent history:\n');

    history.forEach((msg, i) => {
      const prefix = msg.type === MessageType.USER ? 'User: ' : 'Assistant: ';
      const preview = msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '');
      this.outputHandler.write(`${i + 1}. ${prefix}${preview}\n`);
    });
  }

  /**
   * Show context
   */
  showContext() {
    const summary = this.context.getSummary();
    this.outputHandler.write('Context:\n');
    this.outputHandler.write(JSON.stringify(summary, null, 2) + '\n');
  }

  /**
   * Handle processing error
   */
  handleProcessingError(error) {
    this.logger.error('Processing error', { error });
    this.context.setState(ConversationState.ERROR);
    this.outputHandler.writeError(`Error: ${error.message}\n`);
    this.emit('processingError', error);
  }

  /**
   * Handle interrupt
   */
  handleInterrupt() {
    this.logger.info('Interrupt received');

    if (this.context.state === ConversationState.PROCESSING) {
      this.outputHandler.write('\nInterrupted\n', { color: 'yellow' });
      this.emit('interrupt');
    } else {
      this.outputHandler.write('\nUse exit/quit to leave\n');
    }

    this.showPrompt();
    this.emit('continue');
  }

  /**
   * Handle EOF
   */
  handleEOF() {
    this.logger.info('EOF received');
    this.stop();
  }

  /**
   * Handle suspend
   */
  handleSuspend() {
    this.logger.info('Suspend requested');
    this.pause();
  }

  /**
   * Handle terminate
   */
  handleTerminate() {
    this.logger.info('Termination signal received');
    this.stop(true);
  }

  /**
   * Handle input end
   */
  handleInputEnd() {
    this.logger.info('Input stream ended');
    this.stop();
  }

  /**
   * Handle input error
   */
  handleInputError(error) {
    this.logger.error('Input stream error', { error });
    this.outputHandler.writeError(`Input error: ${error.message}\n`);
  }

  /**
   * Pause loop
   */
  pause() {
    this.isPaused = true;
    this.emit('pause');
  }

  /**
   * Resume loop
   */
  resume() {
    this.isPaused = false;
    this.emit('resume');
  }

  /**
   * Wait for resume
   */
  async waitForResume() {
    await new Promise(resolve => {
      this.once('resume', resolve);
    });
  }

  /**
   * Stop conversation loop
   */
  async stop(immediate = false) {
    if (!this.isRunning) return;

    this.logger.info('Stopping conversation loop');
    this.isRunning = false;
    this.context.setState(ConversationState.TERMINATED);

    if (!immediate) {
      this.outputHandler.write('\nGoodbye!\n', { color: 'green' });
    }

    // Cleanup
    this.inputHandler.destroy();

    // Restore stdin if needed
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.unref();
    }

    this.emit('stop');
    process.exit(0);
  }

  /**
   * Set message processor
   */
  setMessageProcessor(processor) {
    this.messageProcessor = processor;
  }

  /**
   * Get context
   */
  getContext() {
    return this.context;
  }
}

// Export utility functions
export function createConversationLoop(options) {
  return new ConversationLoop(options);
}

export function createInputHandler(options) {
  return new InputHandler(options);
}

export function createOutputHandler(options) {
  return new OutputHandler(options);
}

export default {
  ConversationState,
  MessageType,
  InputMode,
  ConversationContext,
  InputHandler,
  OutputHandler,
  ConversationLoop,
  createConversationLoop,
  createInputHandler,
  createOutputHandler
};