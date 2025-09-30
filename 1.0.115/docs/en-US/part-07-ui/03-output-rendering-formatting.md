# Part 7.3: Output Rendering and Formatting - Claude Code Technical Series

## 🎨 Introduction: Creating Beautiful Terminal Output

The Output Rendering and Formatting system in Claude Code transforms raw text and data into visually appealing, readable terminal output. This sophisticated implementation goes beyond basic text display, providing full markdown rendering, syntax highlighting, structured data presentation, and adaptive formatting that works across different terminal environments.

The system demonstrates how CLI applications can deliver rich, formatted output comparable to web interfaces while maintaining the efficiency and scriptability of command-line tools.

## 📐 Architecture Overview

### Core Rendering Components

The output rendering system consists of several specialized components:

```javascript
// Core rendering architecture from markdown.js and terminal.js

class RenderingSystem {
  constructor() {
    // Markdown Processing
    this.markdownRenderer = new MarkdownRenderer();

    // Terminal Output
    this.terminalRenderer = new TerminalRenderer();

    // Syntax Highlighting
    this.syntaxHighlighter = new SyntaxHighlighter();

    // Data Formatters
    this.tableFormatter = new TableFormatter();
    this.jsonFormatter = new JSONFormatter();

    // Output Streams
    this.outputBuffer = new OutputBuffer();
    this.streamProcessor = new StreamProcessor();
  }
}
```

## 📝 Markdown Rendering System

### MarkdownRenderer Implementation

The complete markdown rendering system from markdown.js:

```javascript
class MarkdownRenderer {
  constructor(options = {}) {
    this.options = {
      // Styling options
      code: chalk.yellow,
      blockquote: chalk.gray.italic,
      html: chalk.gray,
      heading: chalk.green.bold,
      firstHeading: chalk.magenta.underline.bold,
      hr: chalk.reset,
      listitem: chalk.reset,
      list: list => list,
      paragraph: chalk.reset,
      table: chalk.reset,
      tablerow: chalk.reset,
      tablecell: chalk.reset,
      strong: chalk.bold,
      em: chalk.italic,
      codespan: chalk.yellow,
      del: chalk.dim.gray.strikethrough,
      link: chalk.blue,
      href: chalk.blue.underline,
      text: chalk.reset,

      // Processing options
      unescape: true,
      emoji: true,
      width: 80,
      showSectionPrefix: false,
      reflowText: false,
      tab: 2,
      tableOptions: {},

      ...options
    };

    // Setup marked with terminal renderer
    this.setupMarked();
  }

  setupMarked() {
    // Create terminal renderer
    const renderer = new TerminalRenderer(this.options);

    // Override code block rendering for syntax highlighting
    const originalCode = renderer.code.bind(renderer);
    renderer.code = (code, language, escaped) => {
      if (language && this.options.syntaxHighlight !== false) {
        try {
          const highlighted = highlight(code, { language });
          return originalCode(highlighted, language, true);
        } catch (e) {
          // Fallback to original if highlighting fails
        }
      }
      return originalCode(code, language, escaped);
    };

    // Configure marked
    marked.setOptions({
      renderer,
      gfm: true,          // GitHub Flavored Markdown
      tables: true,       // Table support
      breaks: false,      // Line breaks
      pedantic: false,    // Don't be strict
      sanitize: false,    // Allow HTML
      smartLists: true,   // Smart list behavior
      smartypants: false  // Don't convert quotes
    });

    this.renderer = renderer;
  }
}
```

### Markdown Element Rendering

```javascript
// Heading rendering with hierarchical styling
renderHeading(text, level) {
  const styles = [
    chalk.red.bold.underline,      // h1
    chalk.yellow.bold,              // h2
    chalk.green.bold,               // h3
    chalk.cyan.bold,                // h4
    chalk.blue,                     // h5
    chalk.magenta                   // h6
  ];

  const style = styles[level - 1] || chalk.white;
  const prefix = '  '.repeat(Math.max(0, level - 1));

  return `\n${prefix}${style(text)}\n`;
}

// List rendering with proper indentation
renderList(items, ordered = false) {
  return items.map((item, index) => {
    const prefix = ordered ? `${index + 1}. ` : '• ';
    const indent = ' '.repeat(this.options.tab);

    // Handle nested lists
    if (typeof item === 'object' && item.items) {
      const nestedList = this.renderList(item.items, item.ordered);
      return prefix + item.text + '\n' +
             nestedList.split('\n').map(l => indent + l).join('\n');
    }

    return prefix + item;
  }).join('\n');
}

// Table rendering with borders
renderTable(headers, rows) {
  const Table = require('cli-table3');

  const table = new Table({
    head: headers.map(h => chalk.bold(h)),
    style: {
      head: ['green'],
      border: ['gray'],
      ...this.options.tableOptions
    }
  });

  rows.forEach(row => {
    table.push(row);
  });

  return table.toString();
}
```

### Inline Markdown Processing

```javascript
renderInline(markdown) {
  if (!markdown) return '';

  try {
    // Process inline elements only
    let result = markdown;

    // Bold text
    result = result.replace(/\*\*(.*?)\*\*/g, (match, text) =>
      chalk.bold(text)
    );

    // Italic text
    result = result.replace(/\*(.*?)\*/g, (match, text) =>
      chalk.italic(text)
    );

    // Inline code
    result = result.replace(/`([^`]+)`/g, (match, code) =>
      chalk.yellow(code)
    );

    // Links
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (match, text, url) => `${chalk.blue(text)} ${chalk.gray(`(${url})`)}`
    );

    // Strikethrough
    result = result.replace(/~~(.*?)~~/g, (match, text) =>
      chalk.strikethrough(text)
    );

    return result;
  } catch (error) {
    return markdown; // Return raw on error
  }
}
```

## 🎨 Syntax Highlighting

### Code Highlighting Implementation

```javascript
class SyntaxHighlighter {
  constructor() {
    this.themes = {
      default: this.createDefaultTheme(),
      monokai: this.createMonokaiTheme(),
      github: this.createGithubTheme()
    };

    this.currentTheme = 'default';
  }

  highlight(code, language) {
    const theme = this.themes[this.currentTheme];

    switch (language?.toLowerCase()) {
      case 'javascript':
      case 'js':
        return this.highlightJavaScript(code, theme);

      case 'python':
      case 'py':
        return this.highlightPython(code, theme);

      case 'json':
        return this.highlightJSON(code, theme);

      case 'bash':
      case 'shell':
      case 'sh':
        return this.highlightBash(code, theme);

      case 'markdown':
      case 'md':
        return this.highlightMarkdown(code, theme);

      default:
        return code; // No highlighting for unknown languages
    }
  }

  highlightJavaScript(code, theme) {
    let highlighted = code;

    // Keywords
    const keywords = /\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await|new|this|super|extends|static|get|set|typeof|instanceof|in|of|try|catch|finally|throw|switch|case|break|continue|default|do|yield)\b/g;
    highlighted = highlighted.replace(keywords, theme.keyword('$1'));

    // Strings (single and double quotes)
    highlighted = highlighted.replace(
      /(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g,
      theme.string('$&')
    );

    // Comments
    highlighted = highlighted.replace(
      /(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm,
      theme.comment('$&')
    );

    // Numbers
    highlighted = highlighted.replace(
      /\b(\d+\.?\d*)\b/g,
      theme.number('$1')
    );

    // Functions
    highlighted = highlighted.replace(
      /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
      (match, name) => theme.function(name) + '('
    );

    // Classes
    highlighted = highlighted.replace(
      /\bclass\s+([A-Z][a-zA-Z0-9_$]*)/g,
      (match, name) => theme.keyword('class') + ' ' + theme.class(name)
    );

    return highlighted;
  }

  highlightPython(code, theme) {
    let highlighted = code;

    // Keywords
    const keywords = /\b(def|class|if|elif|else|for|while|return|import|from|as|with|try|except|finally|raise|assert|pass|break|continue|global|nonlocal|lambda|yield|async|await|and|or|not|is|in|True|False|None)\b/g;
    highlighted = highlighted.replace(keywords, theme.keyword('$1'));

    // Strings
    highlighted = highlighted.replace(
      /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*')/g,
      theme.string('$&')
    );

    // Comments
    highlighted = highlighted.replace(
      /#.*$/gm,
      theme.comment('$&')
    );

    // Decorators
    highlighted = highlighted.replace(
      /@\w+/g,
      theme.decorator('$&')
    );

    // Functions
    highlighted = highlighted.replace(
      /\bdef\s+(\w+)/g,
      (match, name) => theme.keyword('def') + ' ' + theme.function(name)
    );

    return highlighted;
  }

  createDefaultTheme() {
    return {
      keyword: text => chalk.magenta(text),
      string: text => chalk.green(text),
      comment: text => chalk.gray(text),
      number: text => chalk.cyan(text),
      function: text => chalk.blue(text),
      class: text => chalk.yellow(text),
      decorator: text => chalk.cyan(text)
    };
  }
}
```

### Language-Specific Highlighting

```javascript
// JSON highlighting with proper structure
highlightJSON(code, theme) {
  try {
    // Parse to validate and format
    const parsed = JSON.parse(code);
    const formatted = JSON.stringify(parsed, null, 2);

    return formatted
      // Keys
      .replace(/"([^"]+)":/g, (match, key) =>
        `"${theme.keyword(key)}":`
      )
      // String values
      .replace(/:\s*"([^"]*)"/g, (match, value) =>
        `: "${theme.string(value)}"`
      )
      // Numbers
      .replace(/:\s*(\d+\.?\d*)/g, (match, num) =>
        `: ${theme.number(num)}`
      )
      // Booleans and null
      .replace(/:\s*(true|false|null)/g, (match, val) =>
        `: ${theme.keyword(val)}`
      );
  } catch (e) {
    // If invalid JSON, do basic highlighting
    return code;
  }
}

// Bash/Shell highlighting
highlightBash(code, theme) {
  let highlighted = code;

  // Comments
  highlighted = highlighted.replace(
    /#.*$/gm,
    theme.comment('$&')
  );

  // Strings
  highlighted = highlighted.replace(
    /(["'])(?:(?=(\\?))\2[\s\S])*?\1/g,
    theme.string('$&')
  );

  // Variables
  highlighted = highlighted.replace(
    /\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?/g,
    theme.variable('$&')
  );

  // Commands
  const commands = /\b(echo|cd|ls|pwd|mkdir|rm|cp|mv|cat|grep|sed|awk|find|chmod|chown|tar|gzip|curl|wget|git|npm|node|python|pip)\b/g;
  highlighted = highlighted.replace(commands, theme.command('$1'));

  // Flags
  highlighted = highlighted.replace(
    /\s(-{1,2}[a-zA-Z0-9-]+)/g,
    (match, flag) => ' ' + theme.flag(flag)
  );

  return highlighted;
}
```

## 📊 Data Formatting

### Table Formatting System

```javascript
class TableFormatter {
  constructor(options = {}) {
    this.defaultOptions = {
      border: true,
      padding: 1,
      align: 'left',
      truncate: false,
      maxColumnWidth: 50,
      style: {
        border: chalk.gray,
        header: chalk.bold
      }
    };

    this.options = { ...this.defaultOptions, ...options };
  }

  format(data, columns) {
    // Auto-detect columns if not provided
    if (!columns && data.length > 0) {
      columns = Object.keys(data[0]);
    }

    // Calculate column widths
    const widths = this.calculateColumnWidths(data, columns);

    // Generate output
    const lines = [];

    // Top border
    if (this.options.border) {
      lines.push(this.renderBorder(widths, '┌', '─', '┬', '┐'));
    }

    // Header
    lines.push(this.renderRow(
      columns.map(col => this.options.style.header(col)),
      widths
    ));

    // Header separator
    if (this.options.border) {
      lines.push(this.renderBorder(widths, '├', '─', '┼', '┤'));
    }

    // Data rows
    data.forEach(row => {
      const values = columns.map(col => this.formatCell(row[col]));
      lines.push(this.renderRow(values, widths));
    });

    // Bottom border
    if (this.options.border) {
      lines.push(this.renderBorder(widths, '└', '─', '┴', '┘'));
    }

    return lines.join('\n');
  }

  calculateColumnWidths(data, columns) {
    const widths = {};

    columns.forEach(col => {
      // Start with header width
      widths[col] = col.length;

      // Check all data
      data.forEach(row => {
        const value = String(row[col] || '');
        widths[col] = Math.max(widths[col], stripAnsi(value).length);
      });

      // Apply max width if truncation is enabled
      if (this.options.truncate && widths[col] > this.options.maxColumnWidth) {
        widths[col] = this.options.maxColumnWidth;
      }
    });

    return widths;
  }

  formatCell(value) {
    if (value === null || value === undefined) {
      return chalk.gray('null');
    }

    if (typeof value === 'boolean') {
      return value ? chalk.green('true') : chalk.red('false');
    }

    if (typeof value === 'number') {
      return chalk.cyan(value.toString());
    }

    if (value instanceof Date) {
      return chalk.blue(value.toISOString());
    }

    return String(value);
  }

  renderRow(cells, widths) {
    const columns = Object.keys(widths);
    const formatted = columns.map((col, i) => {
      const cell = cells[i] || '';
      const width = widths[col];

      return this.padCell(cell, width);
    });

    if (this.options.border) {
      return '│ ' + formatted.join(' │ ') + ' │';
    } else {
      return formatted.join('  ');
    }
  }

  padCell(content, width) {
    const actualWidth = stripAnsi(content).length;

    if (actualWidth > width && this.options.truncate) {
      return this.truncate(content, width);
    }

    const padding = ' '.repeat(Math.max(0, width - actualWidth));

    switch (this.options.align) {
      case 'right':
        return padding + content;
      case 'center':
        const leftPad = Math.floor(padding.length / 2);
        const rightPad = padding.length - leftPad;
        return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
      default: // left
        return content + padding;
    }
  }

  truncate(str, width) {
    const stripped = stripAnsi(str);
    if (stripped.length <= width) return str;

    return str.substring(0, width - 3) + '...';
  }
}
```

### JSON Formatting

```javascript
class JSONFormatter {
  constructor(options = {}) {
    this.options = {
      indent: 2,
      colors: true,
      depth: 10,
      compact: false,
      sorted: false,
      ...options
    };
  }

  format(data) {
    if (this.options.compact) {
      return this.formatCompact(data);
    }

    return this.formatPretty(data, 0);
  }

  formatPretty(data, depth = 0) {
    if (depth > this.options.depth) {
      return chalk.gray('[Object]');
    }

    const indent = ' '.repeat(depth * this.options.indent);
    const nextIndent = ' '.repeat((depth + 1) * this.options.indent);

    if (data === null) {
      return this.colorize('null', 'null');
    }

    if (typeof data === 'boolean') {
      return this.colorize(String(data), 'boolean');
    }

    if (typeof data === 'number') {
      return this.colorize(String(data), 'number');
    }

    if (typeof data === 'string') {
      return this.colorize(`"${this.escapeString(data)}"`, 'string');
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return '[]';
      }

      const items = data.map(item =>
        nextIndent + this.formatPretty(item, depth + 1)
      );

      return '[\n' + items.join(',\n') + '\n' + indent + ']';
    }

    if (typeof data === 'object') {
      const keys = this.options.sorted
        ? Object.keys(data).sort()
        : Object.keys(data);

      if (keys.length === 0) {
        return '{}';
      }

      const pairs = keys.map(key => {
        const formattedKey = this.colorize(`"${key}"`, 'key');
        const formattedValue = this.formatPretty(data[key], depth + 1);
        return `${nextIndent}${formattedKey}: ${formattedValue}`;
      });

      return '{\n' + pairs.join(',\n') + '\n' + indent + '}';
    }

    return String(data);
  }

  formatCompact(data) {
    return JSON.stringify(data);
  }

  escapeString(str) {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  colorize(text, type) {
    if (!this.options.colors) return text;

    switch (type) {
      case 'key':
        return chalk.blue(text);
      case 'string':
        return chalk.green(text);
      case 'number':
        return chalk.cyan(text);
      case 'boolean':
        return chalk.yellow(text);
      case 'null':
        return chalk.gray(text);
      default:
        return text;
    }
  }
}
```

## 🎯 Stream Processing

### Real-time Output Streaming

```javascript
class OutputStreamProcessor {
  constructor(terminal) {
    this.terminal = terminal;
    this.buffer = '';
    this.lineBuffer = [];
    this.mode = 'normal'; // normal, code, raw
    this.codeLanguage = '';
  }

  process(chunk) {
    this.buffer += chunk;

    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      this.processLine(line);
    }
  }

  processLine(line) {
    // Detect mode changes
    if (line.startsWith('```')) {
      if (this.mode === 'normal') {
        // Entering code block
        const match = line.match(/```(\w+)?/);
        this.codeLanguage = match?.[1] || '';
        this.mode = 'code';
        this.startCodeBlock();
      } else if (this.mode === 'code') {
        // Exiting code block
        this.endCodeBlock();
        this.mode = 'normal';
      }
      return;
    }

    // Process based on mode
    switch (this.mode) {
      case 'code':
        this.outputCode(line);
        break;

      case 'raw':
        this.outputRaw(line);
        break;

      default:
        this.outputFormatted(line);
    }
  }

  startCodeBlock() {
    const lang = this.codeLanguage || 'text';
    this.terminal.write('\n');
    this.terminal.write(chalk.gray('┌─ '));
    this.terminal.write(chalk.cyan(lang.toUpperCase()));
    this.terminal.write(chalk.gray(' ' + '─'.repeat(Math.max(0, 70 - lang.length))));
    this.terminal.write('\n');
  }

  endCodeBlock() {
    this.terminal.write(chalk.gray('└' + '─'.repeat(75)));
    this.terminal.write('\n');
  }

  outputCode(line) {
    // Apply syntax highlighting if available
    const highlighted = this.highlightCode(line, this.codeLanguage);
    this.terminal.write(chalk.gray('│ '));
    this.terminal.write(highlighted);
    this.terminal.write('\n');
  }

  outputFormatted(line) {
    // Apply inline formatting
    const formatted = this.formatInline(line);
    this.terminal.write(formatted);
    this.terminal.write('\n');
  }

  outputRaw(line) {
    this.terminal.write(line);
    this.terminal.write('\n');
  }

  flush() {
    // Output any remaining buffer content
    if (this.buffer) {
      this.outputFormatted(this.buffer);
      this.buffer = '';
    }
  }
}
```

## 📈 Progress Indicators

### Advanced Progress Display

```javascript
class ProgressDisplay {
  constructor(terminal) {
    this.terminal = terminal;
    this.bars = new Map();
    this.spinners = new Map();
  }

  createProgressBar(id, options = {}) {
    const bar = {
      id,
      total: options.total || 100,
      current: 0,
      format: options.format || ':bar :percent :eta',
      width: options.width || 40,
      complete: options.complete || '█',
      incomplete: options.incomplete || '░',
      startTime: Date.now(),
      lastUpdate: Date.now()
    };

    this.bars.set(id, bar);
    return bar;
  }

  updateProgress(id, current, tokens = {}) {
    const bar = this.bars.get(id);
    if (!bar) return;

    bar.current = Math.min(current, bar.total);
    bar.lastUpdate = Date.now();

    this.renderProgressBar(bar, tokens);
  }

  renderProgressBar(bar, tokens = {}) {
    const percent = Math.floor((bar.current / bar.total) * 100);
    const filled = Math.floor((bar.current / bar.total) * bar.width);
    const empty = bar.width - filled;

    // Calculate ETA
    const elapsed = Date.now() - bar.startTime;
    const rate = bar.current / elapsed;
    const remaining = (bar.total - bar.current) / rate;
    const eta = this.formatTime(remaining);

    // Build bar
    const barStr = bar.complete.repeat(filled) + bar.incomplete.repeat(empty);

    // Format output
    let output = bar.format
      .replace(':bar', barStr)
      .replace(':percent', `${percent}%`)
      .replace(':current', bar.current.toString())
      .replace(':total', bar.total.toString())
      .replace(':elapsed', this.formatTime(elapsed))
      .replace(':eta', eta);

    // Replace custom tokens
    Object.entries(tokens).forEach(([key, value]) => {
      output = output.replace(`:${key}`, value);
    });

    // Render
    this.terminal.clearLine();
    this.terminal.write(output);
    this.terminal.cursorTo(0);
  }

  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
```

### Multi-Progress Display

```javascript
class MultiProgressDisplay {
  constructor(terminal) {
    this.terminal = terminal;
    this.tasks = new Map();
    this.renderInterval = null;
    this.startY = 0;
  }

  addTask(id, name, total) {
    const task = {
      id,
      name,
      total,
      current: 0,
      status: 'pending',
      startTime: Date.now()
    };

    this.tasks.set(id, task);

    if (!this.renderInterval) {
      this.start();
    }

    return task;
  }

  updateTask(id, current, status) {
    const task = this.tasks.get(id);
    if (!task) return;

    task.current = current;
    task.status = status;

    if (current >= task.total) {
      task.status = 'complete';
    }
  }

  start() {
    // Save cursor position
    this.terminal.write('\x1b[s');
    this.startY = this.terminal.rows;

    this.renderInterval = setInterval(() => {
      this.render();
    }, 100);
  }

  render() {
    // Restore cursor position
    this.terminal.write('\x1b[u');

    // Clear area
    for (let i = 0; i < this.tasks.size; i++) {
      this.terminal.clearLine();
      this.terminal.moveCursor(0, 1);
    }

    // Move back up
    this.terminal.moveCursor(0, -this.tasks.size);

    // Render each task
    let line = 0;
    for (const task of this.tasks.values()) {
      this.renderTask(task);
      if (line < this.tasks.size - 1) {
        this.terminal.write('\n');
      }
      line++;
    }
  }

  renderTask(task) {
    const percent = Math.floor((task.current / task.total) * 100);
    const width = 30;
    const filled = Math.floor((task.current / task.total) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    const statusIcon = {
      pending: chalk.gray('⏳'),
      running: chalk.yellow('🔄'),
      complete: chalk.green('✓'),
      error: chalk.red('✗')
    }[task.status];

    const name = task.name.padEnd(20);
    const percentStr = `${percent}%`.padStart(4);

    this.terminal.write(
      `${statusIcon} ${chalk.cyan(name)} [${bar}] ${percentStr}`
    );
  }

  stop() {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
  }
}
```

## 🎭 Adaptive Formatting

### Terminal Capability Detection

```javascript
class AdaptiveFormatter {
  constructor(terminal) {
    this.terminal = terminal;
    this.capabilities = this.detectCapabilities();
  }

  detectCapabilities() {
    return {
      colors: this.supportsColors(),
      unicode: this.supportsUnicode(),
      width: this.terminal.columns || 80,
      height: this.terminal.rows || 24,
      isTTY: this.terminal.isTTY,
      isCI: this.detectCI(),
      isDumb: process.env.TERM === 'dumb'
    };
  }

  supportsColors() {
    if (process.env.FORCE_COLOR === '0') return false;
    if (process.env.FORCE_COLOR) return true;

    if (!this.terminal.isTTY) return false;
    if (process.platform === 'win32') return true;

    const term = process.env.TERM;
    if (!term || term === 'dumb') return false;

    return /color|ansi|cygwin|linux/i.test(term);
  }

  supportsUnicode() {
    if (process.platform === 'win32') {
      return false; // Conservative default for Windows
    }

    const lang = process.env.LANG || process.env.LC_ALL || process.env.LC_CTYPE;
    return lang ? /UTF-?8/i.test(lang) : false;
  }

  detectCI() {
    return !!(
      process.env.CI ||
      process.env.CONTINUOUS_INTEGRATION ||
      process.env.TRAVIS ||
      process.env.CIRCLECI ||
      process.env.JENKINS_HOME ||
      process.env.GITLAB_CI ||
      process.env.GITHUB_ACTIONS
    );
  }

  format(content, options = {}) {
    // Apply adaptive formatting based on capabilities
    if (!this.capabilities.colors) {
      content = stripAnsi(content);
    }

    if (!this.capabilities.unicode) {
      content = this.replaceUnicode(content);
    }

    if (this.capabilities.isDumb) {
      content = this.simplifyForDumbTerminal(content);
    }

    if (this.capabilities.isCI) {
      content = this.formatForCI(content);
    }

    return content;
  }

  replaceUnicode(text) {
    // Replace common Unicode characters with ASCII equivalents
    const replacements = {
      '✓': '[OK]',
      '✗': '[FAIL]',
      '⚠': '[WARN]',
      'ℹ': '[INFO]',
      '█': '#',
      '░': '.',
      '•': '*',
      '→': '->',
      '←': '<-',
      '↑': '^',
      '↓': 'v',
      '┌': '+',
      '┐': '+',
      '└': '+',
      '┘': '+',
      '─': '-',
      '│': '|',
      '├': '+',
      '┤': '+',
      '┬': '+',
      '┴': '+',
      '┼': '+'
    };

    let result = text;
    Object.entries(replacements).forEach(([unicode, ascii]) => {
      result = result.replace(new RegExp(unicode, 'g'), ascii);
    });

    return result;
  }

  simplifyForDumbTerminal(text) {
    // Remove all formatting for dumb terminals
    return stripAnsi(text)
      .replace(/\s+/g, ' ')
      .trim();
  }

  formatForCI(text) {
    // Add special markers for CI environments
    const lines = text.split('\n');
    return lines.map(line => {
      if (line.includes('[ERROR]') || line.includes('✗')) {
        return `::error::${stripAnsi(line)}`;
      }
      if (line.includes('[WARN]') || line.includes('⚠')) {
        return `::warning::${stripAnsi(line)}`;
      }
      return line;
    }).join('\n');
  }
}
```

## 🎨 Theme Support

### Customizable Color Themes

```javascript
class ThemeManager {
  constructor() {
    this.themes = {
      default: {
        primary: chalk.cyan,
        secondary: chalk.blue,
        success: chalk.green,
        warning: chalk.yellow,
        error: chalk.red,
        info: chalk.gray,
        muted: chalk.dim,
        highlight: chalk.inverse
      },

      dark: {
        primary: chalk.white,
        secondary: chalk.gray,
        success: chalk.greenBright,
        warning: chalk.yellowBright,
        error: chalk.redBright,
        info: chalk.blueBright,
        muted: chalk.dim.gray,
        highlight: chalk.bgGray.white
      },

      light: {
        primary: chalk.black,
        secondary: chalk.gray,
        success: chalk.green,
        warning: chalk.yellow,
        error: chalk.red,
        info: chalk.blue,
        muted: chalk.gray,
        highlight: chalk.bgYellow.black
      },

      monochrome: {
        primary: chalk.white,
        secondary: chalk.gray,
        success: chalk.white,
        warning: chalk.gray,
        error: chalk.white.bold,
        info: chalk.gray,
        muted: chalk.dim,
        highlight: chalk.inverse
      }
    };

    this.activeTheme = 'default';
  }

  setTheme(name) {
    if (this.themes[name]) {
      this.activeTheme = name;
    }
  }

  get theme() {
    return this.themes[this.activeTheme];
  }

  apply(type, text) {
    const theme = this.theme;
    const style = theme[type];

    return style ? style(text) : text;
  }

  createCustomTheme(name, definition) {
    this.themes[name] = {
      ...this.themes.default,
      ...definition
    };
  }
}
```

## 💡 Best Practices

### Output Buffering and Performance

```javascript
class OutputBuffer {
  constructor(terminal, options = {}) {
    this.terminal = terminal;
    this.buffer = [];
    this.flushInterval = options.flushInterval || 16; // ~60fps
    this.maxBufferSize = options.maxBufferSize || 1000;
    this.timer = null;
  }

  write(content) {
    this.buffer.push(content);

    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    } else if (!this.timer) {
      this.scheduleFlush();
    }
  }

  scheduleFlush() {
    this.timer = setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    // Combine all buffered content
    const content = this.buffer.join('');
    this.buffer = [];

    // Write to terminal in one operation
    this.terminal.write(content);
  }

  clear() {
    this.buffer = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
```

## 📊 Summary

The Output Rendering and Formatting system in Claude Code provides a comprehensive solution for creating beautiful, readable terminal output. Key achievements include:

1. **Full Markdown Support**: Complete markdown rendering with terminal-appropriate styling
2. **Syntax Highlighting**: Multi-language syntax highlighting with customizable themes
3. **Data Formatting**: Sophisticated table and JSON formatting with color coding
4. **Stream Processing**: Real-time output streaming with mode detection
5. **Progress Indicators**: Advanced progress bars with ETA and multi-task support
6. **Adaptive Formatting**: Automatic adjustment based on terminal capabilities
7. **Theme Support**: Customizable color themes for different preferences
8. **Performance Optimization**: Output buffering and efficient rendering

The implementation demonstrates how CLI applications can deliver rich, formatted output that enhances readability and user experience while maintaining compatibility across different terminal environments. The modular design allows for easy customization and extension, making it a powerful foundation for any terminal-based application.

---

*Next in Part 7.4: Progress and Status Displays - Deep dive into progress bars, spinners, status lines, and real-time update mechanisms.*