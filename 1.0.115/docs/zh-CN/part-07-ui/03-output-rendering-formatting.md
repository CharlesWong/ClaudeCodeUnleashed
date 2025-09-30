# 第七部分 7.3：输出渲染和格式化 - Claude Code 技术系列

## 🎨 简介：创建美观的终端输出

Claude Code 中的输出渲染和格式化系统将原始文本和数据转换为视觉吸引力强、可读性高的终端输出。这个复杂的实现超越了基本的文本显示，提供完整的 markdown 渲染、语法高亮、结构化数据展示以及在不同终端环境中工作的自适应格式化。

该系统展示了 CLI 应用程序如何在保持命令行工具效率和可脚本性的同时，提供与 Web 界面相媲美的丰富格式化输出。

## 📐 架构概述

### 核心渲染组件

输出渲染系统由几个专门的组件组成：

```javascript
// 来自 markdown.js 和 terminal.js 的核心渲染架构

class RenderingSystem {
  constructor() {
    // Markdown 处理
    this.markdownRenderer = new MarkdownRenderer();

    // 终端输出
    this.terminalRenderer = new TerminalRenderer();

    // 语法高亮
    this.syntaxHighlighter = new SyntaxHighlighter();

    // 数据格式化器
    this.tableFormatter = new TableFormatter();
    this.jsonFormatter = new JSONFormatter();

    // 输出流
    this.outputBuffer = new OutputBuffer();
    this.streamProcessor = new StreamProcessor();
  }
}
```

## 📝 Markdown 渲染系统

### MarkdownRenderer 实现

来自 markdown.js 的完整 markdown 渲染系统：

```javascript
class MarkdownRenderer {
  constructor(options = {}) {
    this.options = {
      // 样式选项
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

      // 处理选项
      unescape: true,
      emoji: true,
      width: 80,
      showSectionPrefix: false,
      reflowText: false,
      tab: 2,
      tableOptions: {},

      ...options
    };

    // 设置带终端渲染器的 marked
    this.setupMarked();
  }

  setupMarked() {
    // 创建终端渲染器
    const renderer = new TerminalRenderer(this.options);

    // 覆盖代码块渲染以进行语法高亮
    const originalCode = renderer.code.bind(renderer);
    renderer.code = (code, language, escaped) => {
      if (language && this.options.syntaxHighlight !== false) {
        try {
          const highlighted = highlight(code, { language });
          return originalCode(highlighted, language, true);
        } catch (e) {
          // 高亮失败时回退到原始
        }
      }
      return originalCode(code, language, escaped);
    };

    // 配置 marked
    marked.setOptions({
      renderer,
      gfm: true,          // GitHub Flavored Markdown
      tables: true,       // 表格支持
      breaks: false,      // 换行符
      pedantic: false,    // 不要严格
      sanitize: false,    // 允许 HTML
      smartLists: true,   // 智能列表行为
      smartypants: false  // 不转换引号
    });

    this.renderer = renderer;
  }
}
```

### Markdown 元素渲染

```javascript
// 分层样式的标题渲染
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

// 带适当缩进的列表渲染
renderList(items, ordered = false) {
  return items.map((item, index) => {
    const prefix = ordered ? `${index + 1}. ` : '• ';
    const indent = ' '.repeat(this.options.tab);

    // 处理嵌套列表
    if (typeof item === 'object' && item.items) {
      const nestedList = this.renderList(item.items, item.ordered);
      return prefix + item.text + '\n' +
             nestedList.split('\n').map(l => indent + l).join('\n');
    }

    return prefix + item;
  }).join('\n');
}

// 带边框的表格渲染
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

### 内联 Markdown 处理

```javascript
renderInline(markdown) {
  if (!markdown) return '';

  try {
    // 仅处理内联元素
    let result = markdown;

    // 粗体文本
    result = result.replace(/\*\*(.*?)\*\*/g, (match, text) =>
      chalk.bold(text)
    );

    // 斜体文本
    result = result.replace(/\*(.*?)\*/g, (match, text) =>
      chalk.italic(text)
    );

    // 内联代码
    result = result.replace(/`([^`]+)`/g, (match, code) =>
      chalk.yellow(code)
    );

    // 链接
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (match, text, url) => `${chalk.blue(text)} ${chalk.gray(`(${url})`)}`
    );

    // 删除线
    result = result.replace(/~~(.*?)~~/g, (match, text) =>
      chalk.strikethrough(text)
    );

    return result;
  } catch (error) {
    return markdown; // 出错时返回原始
  }
}
```

## 🎨 语法高亮

### 代码高亮实现

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
        return code; // 对未知语言不进行高亮
    }
  }

  highlightJavaScript(code, theme) {
    let highlighted = code;

    // 关键字
    const keywords = /\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await|new|this|super|extends|static|get|set|typeof|instanceof|in|of|try|catch|finally|throw|switch|case|break|continue|default|do|yield)\b/g;
    highlighted = highlighted.replace(keywords, theme.keyword('$1'));

    // 字符串（单引号和双引号）
    highlighted = highlighted.replace(
      /(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g,
      theme.string('$&')
    );

    // 注释
    highlighted = highlighted.replace(
      /(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm,
      theme.comment('$&')
    );

    // 数字
    highlighted = highlighted.replace(
      /\b(\d+\.?\d*)\b/g,
      theme.number('$1')
    );

    // 函数
    highlighted = highlighted.replace(
      /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
      (match, name) => theme.function(name) + '('
    );

    // 类
    highlighted = highlighted.replace(
      /\bclass\s+([A-Z][a-zA-Z0-9_$]*)/g,
      (match, name) => theme.keyword('class') + ' ' + theme.class(name)
    );

    return highlighted;
  }

  highlightPython(code, theme) {
    let highlighted = code;

    // 关键字
    const keywords = /\b(def|class|if|elif|else|for|while|return|import|from|as|with|try|except|finally|raise|assert|pass|break|continue|global|nonlocal|lambda|yield|async|await|and|or|not|is|in|True|False|None)\b/g;
    highlighted = highlighted.replace(keywords, theme.keyword('$1'));

    // 字符串
    highlighted = highlighted.replace(
      /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*')/g,
      theme.string('$&')
    );

    // 注释
    highlighted = highlighted.replace(
      /#.*$/gm,
      theme.comment('$&')
    );

    // 装饰器
    highlighted = highlighted.replace(
      /@\w+/g,
      theme.decorator('$&')
    );

    // 函数
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

### 特定语言的高亮

```javascript
// 带适当结构的 JSON 高亮
highlightJSON(code, theme) {
  try {
    // 解析以验证和格式化
    const parsed = JSON.parse(code);
    const formatted = JSON.stringify(parsed, null, 2);

    return formatted
      // 键
      .replace(/"([^"]+)":/g, (match, key) =>
        `"${theme.keyword(key)}":`
      )
      // 字符串值
      .replace(/:\s*"([^"]*)"/g, (match, value) =>
        `: "${theme.string(value)}"`
      )
      // 数字
      .replace(/:\s*(\d+\.?\d*)/g, (match, num) =>
        `: ${theme.number(num)}`
      )
      // 布尔值和 null
      .replace(/:\s*(true|false|null)/g, (match, val) =>
        `: ${theme.keyword(val)}`
      );
  } catch (e) {
    // 如果 JSON 无效，进行基本高亮
    return code;
  }
}

// Bash/Shell 高亮
highlightBash(code, theme) {
  let highlighted = code;

  // 注释
  highlighted = highlighted.replace(
    /#.*$/gm,
    theme.comment('$&')
  );

  // 字符串
  highlighted = highlighted.replace(
    /(["'])(?:(?=(\\?))\2[\s\S])*?\1/g,
    theme.string('$&')
  );

  // 变量
  highlighted = highlighted.replace(
    /\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?/g,
    theme.variable('$&')
  );

  // 命令
  const commands = /\b(echo|cd|ls|pwd|mkdir|rm|cp|mv|cat|grep|sed|awk|find|chmod|chown|tar|gzip|curl|wget|git|npm|node|python|pip)\b/g;
  highlighted = highlighted.replace(commands, theme.command('$1'));

  // 标志
  highlighted = highlighted.replace(
    /\s(-{1,2}[a-zA-Z0-9-]+)/g,
    (match, flag) => ' ' + theme.flag(flag)
  );

  return highlighted;
}
```

## 📊 数据格式化

### 表格格式化系统

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
    // 如果未提供，自动检测列
    if (!columns && data.length > 0) {
      columns = Object.keys(data[0]);
    }

    // 计算列宽度
    const widths = this.calculateColumnWidths(data, columns);

    // 生成输出
    const lines = [];

    // 顶部边框
    if (this.options.border) {
      lines.push(this.renderBorder(widths, '┌', '─', '┬', '┐'));
    }

    // 标题
    lines.push(this.renderRow(
      columns.map(col => this.options.style.header(col)),
      widths
    ));

    // 标题分隔符
    if (this.options.border) {
      lines.push(this.renderBorder(widths, '├', '─', '┼', '┤'));
    }

    // 数据行
    data.forEach(row => {
      const values = columns.map(col => this.formatCell(row[col]));
      lines.push(this.renderRow(values, widths));
    });

    // 底部边框
    if (this.options.border) {
      lines.push(this.renderBorder(widths, '└', '─', '┴', '┘'));
    }

    return lines.join('\n');
  }

  calculateColumnWidths(data, columns) {
    const widths = {};

    columns.forEach(col => {
      // 从标题宽度开始
      widths[col] = col.length;

      // 检查所有数据
      data.forEach(row => {
        const value = String(row[col] || '');
        widths[col] = Math.max(widths[col], stripAnsi(value).length);
      });

      // 如果启用截断，应用最大宽度
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

### JSON 格式化

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

## 🎯 流处理

### 实时输出流

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

    // 处理完整行
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // 在缓冲区中保留不完整行

    for (const line of lines) {
      this.processLine(line);
    }
  }

  processLine(line) {
    // 检测模式变化
    if (line.startsWith('```')) {
      if (this.mode === 'normal') {
        // 进入代码块
        const match = line.match(/```(\w+)?/);
        this.codeLanguage = match?.[1] || '';
        this.mode = 'code';
        this.startCodeBlock();
      } else if (this.mode === 'code') {
        // 退出代码块
        this.endCodeBlock();
        this.mode = 'normal';
      }
      return;
    }

    // 基于模式处理
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
    // 如果可用，应用语法高亮
    const highlighted = this.highlightCode(line, this.codeLanguage);
    this.terminal.write(chalk.gray('│ '));
    this.terminal.write(highlighted);
    this.terminal.write('\n');
  }

  outputFormatted(line) {
    // 应用内联格式化
    const formatted = this.formatInline(line);
    this.terminal.write(formatted);
    this.terminal.write('\n');
  }

  outputRaw(line) {
    this.terminal.write(line);
    this.terminal.write('\n');
  }

  flush() {
    // 输出任何剩余的缓冲区内容
    if (this.buffer) {
      this.outputFormatted(this.buffer);
      this.buffer = '';
    }
  }
}
```

## 📈 进度指示器

### 高级进度显示

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

    // 计算 ETA
    const elapsed = Date.now() - bar.startTime;
    const rate = bar.current / elapsed;
    const remaining = (bar.total - bar.current) / rate;
    const eta = this.formatTime(remaining);

    // 构建条形
    const barStr = bar.complete.repeat(filled) + bar.incomplete.repeat(empty);

    // 格式化输出
    let output = bar.format
      .replace(':bar', barStr)
      .replace(':percent', `${percent}%`)
      .replace(':current', bar.current.toString())
      .replace(':total', bar.total.toString())
      .replace(':elapsed', this.formatTime(elapsed))
      .replace(':eta', eta);

    // 替换自定义令牌
    Object.entries(tokens).forEach(([key, value]) => {
      output = output.replace(`:${key}`, value);
    });

    // 渲染
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

### 多进度显示

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
    // 保存光标位置
    this.terminal.write('\x1b[s');
    this.startY = this.terminal.rows;

    this.renderInterval = setInterval(() => {
      this.render();
    }, 100);
  }

  render() {
    // 恢复光标位置
    this.terminal.write('\x1b[u');

    // 清理区域
    for (let i = 0; i < this.tasks.size; i++) {
      this.terminal.clearLine();
      this.terminal.moveCursor(0, 1);
    }

    // 向上移动
    this.terminal.moveCursor(0, -this.tasks.size);

    // 渲染每个任务
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

## 🎭 自适应格式化

### 终端能力检测

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
      return false; // Windows 的保守默认
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
    // 基于能力应用自适应格式化
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
    // 用 ASCII 等价替换常见 Unicode 字符
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
    // 为愚蠢终端删除所有格式化
    return stripAnsi(text)
      .replace(/\s+/g, ' ')
      .trim();
  }

  formatForCI(text) {
    // 为 CI 环境添加特殊标记
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

## 🎨 主题支持

### 可定制的颜色主题

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

## 💡 最佳实践

### 输出缓冲和性能

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

    // 合并所有缓冲内容
    const content = this.buffer.join('');
    this.buffer = [];

    // 在一次操作中写入终端
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

## 📊 总结

Claude Code 中的输出渲染和格式化系统为创建美观、可读的终端输出提供了全面的解决方案。关键成就包括：

1. **完整的 Markdown 支持**：带终端适当样式的完整 markdown 渲染
2. **语法高亮**：带可定制主题的多语言语法高亮
3. **数据格式化**：带颜色编码的复杂表格和 JSON 格式化
4. **流处理**：带模式检测的实时输出流
5. **进度指示器**：带 ETA 和多任务支持的高级进度条
6. **自适应格式化**：基于终端能力的自动调整
7. **主题支持**：用于不同偏好的可定制颜色主题
8. **性能优化**：输出缓冲和高效渲染

实现展示了 CLI 应用程序如何提供丰富的格式化输出，增强可读性和用户体验，同时保持不同终端环境的兼容性。模块化设计允许轻松定制和扩展，使其成为任何基于终端的应用程序的强大基础。

---

*下一个第七部分 7.4：进度和状态显示 - 深入探讨进度条、旋转器、状态行和实时更新机制。*