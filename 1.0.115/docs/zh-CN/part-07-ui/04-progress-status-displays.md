# 第七部分 7.4：进度和状态显示 - Claude Code 技术系列

## 🔄 简介：实时视觉反馈系统

进度和状态显示对于在长时间运行的操作期间为用户提供视觉反馈至关重要。Claude Code 实现了一个复杂的进度条、旋转器、状态行和通知系统，在保持清洁、专业的终端界面的同时，让用户了解情况。

这个实现展示了 CLI 应用程序如何在保持命令行工具的效率和可脚本性的同时，提供与 GUI 应用程序相媲美的响应式、信息性反馈。

## 📊 进度条架构

### 核心 ProgressBar 实现

来自 terminal.js 的基础进度条系统：

```javascript
class ProgressBar {
  constructor(options = {}) {
    this.terminal = options.terminal || new Terminal();
    this.total = options.total || 100;
    this.current = 0;
    this.width = options.width || 40;
    this.complete = options.complete || '█';
    this.incomplete = options.incomplete || '░';
    this.format = options.format || ':bar :percent :current/:total';
    this.tokens = {};

    // 性能跟踪
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.renderThrottle = options.renderThrottle || 16; // ~60fps
  }

  update(current, tokens = {}) {
    this.current = Math.min(current, this.total);
    this.tokens = { ...this.tokens, ...tokens };

    // 限制渲染性能
    const now = Date.now();
    if (now - this.lastUpdate >= this.renderThrottle) {
      this.render();
      this.lastUpdate = now;
    }
  }

  render() {
    const percent = Math.floor((this.current / this.total) * 100);
    const filled = Math.floor((this.current / this.total) * this.width);
    const empty = this.width - filled;

    const bar = this.complete.repeat(filled) + this.incomplete.repeat(empty);

    let output = this.format
      .replace(':bar', bar)
      .replace(':percent', `${percent}%`)
      .replace(':current', this.current.toString())
      .replace(':total', this.total.toString());

    // 替换自定义令牌
    Object.keys(this.tokens).forEach(key => {
      output = output.replace(`:${key}`, this.tokens[key]);
    });

    this.terminal.clearLine();
    this.terminal.write(output);
    this.terminal.cursorTo(0);
  }

  complete() {
    this.update(this.total);
    this.terminal.writeLine('');
  }
}
```

### 高级进度条功能

```javascript
class EnhancedProgressBar extends ProgressBar {
  constructor(options = {}) {
    super(options);

    // 增强功能
    this.showETA = options.showETA !== false;
    this.showSpeed = options.showSpeed !== false;
    this.gradient = options.gradient !== false;
    this.smoothing = options.smoothing !== false;

    // 统计跟踪
    this.history = [];
    this.maxHistorySize = 10;

    // 进度的颜色渐变
    this.gradientColors = [
      chalk.red,      // 0-20%
      chalk.yellow,   // 20-40%
      chalk.yellow,   // 40-60%
      chalk.green,    // 60-80%
      chalk.green     // 80-100%
    ];

    // 带附加令牌的自定义格式
    if (this.showETA || this.showSpeed) {
      this.format = ':bar :percent :current/:total :eta :speed';
    }
  }

  update(current, tokens = {}) {
    const previousCurrent = this.current;
    super.update(current, tokens);

    // 跟踪进度历史以进行平滑和统计
    if (this.smoothing) {
      this.history.push({
        value: current,
        time: Date.now(),
        delta: current - previousCurrent
      });

      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }
    }
  }

  render() {
    const percent = Math.floor((this.current / this.total) * 100);
    const filled = Math.floor((this.current / this.total) * this.width);
    const empty = this.width - filled;

    // 如果启用，创建渐变条
    let bar;
    if (this.gradient) {
      bar = this.createGradientBar(filled, empty, percent);
    } else {
      bar = this.complete.repeat(filled) + this.incomplete.repeat(empty);
    }

    // 计算附加指标
    const eta = this.calculateETA();
    const speed = this.calculateSpeed();

    let output = this.format
      .replace(':bar', bar)
      .replace(':percent', `${percent}%`)
      .replace(':current', this.current.toString())
      .replace(':total', this.total.toString())
      .replace(':eta', eta)
      .replace(':speed', speed);

    // 替换自定义令牌
    Object.keys(this.tokens).forEach(key => {
      output = output.replace(`:${key}`, this.tokens[key]);
    });

    this.terminal.clearLine();
    this.terminal.write(output);
    this.terminal.cursorTo(0);
  }

  createGradientBar(filled, empty, percent) {
    const colorIndex = Math.floor((percent / 100) * this.gradientColors.length);
    const color = this.gradientColors[Math.min(colorIndex, this.gradientColors.length - 1)];

    return color(this.complete.repeat(filled)) + chalk.gray(this.incomplete.repeat(empty));
  }

  calculateETA() {
    if (!this.showETA || this.current === 0) return '';

    const elapsed = Date.now() - this.startTime;
    const rate = this.current / elapsed;
    const remaining = (this.total - this.current) / rate;

    return `ETA: ${this.formatTime(remaining)}`;
  }

  calculateSpeed() {
    if (!this.showSpeed || this.history.length < 2) return '';

    // 从最近历史计算平均速度
    const recentHistory = this.history.slice(-5);
    const timeSpan = recentHistory[recentHistory.length - 1].time - recentHistory[0].time;
    const valueChange = recentHistory[recentHistory.length - 1].value - recentHistory[0].value;

    if (timeSpan === 0) return '';

    const speed = (valueChange / timeSpan) * 1000; // 每秒
    return `${speed.toFixed(2)}/s`;
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

## 🔄 旋转器实现

### 核心旋转器系统

来自 terminal.js 的动画旋转器实现：

```javascript
class Spinner {
  constructor(options = {}) {
    this.terminal = options.terminal || new Terminal();
    this.text = options.text || '';
    this.frames = options.frames || ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.interval = options.interval || 80;
    this.color = options.color || chalk.cyan;

    this.frameIndex = 0;
    this.timer = null;
    this.isSpinning = false;

    // 性能优化
    this.stream = process.stdout;
    this.linesToClear = 1;
  }

  start(text) {
    if (text) {
      this.text = text;
    }

    if (this.isSpinning) {
      return;
    }

    this.isSpinning = true;
    this.terminal.hideCursor();

    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, this.interval);
  }

  stop() {
    if (!this.isSpinning) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    this.isSpinning = false;

    this.terminal.clearLine();
    this.terminal.showCursor();
  }

  render() {
    const frame = this.frames[this.frameIndex];
    const output = `${this.color(frame)} ${this.text}`;

    this.terminal.clearLine();
    this.terminal.write(output);
    this.terminal.cursorTo(0);
  }

  // 状态方法
  succeed(text) {
    this.stop();
    this.terminal.writeLine(`${chalk.green('✔')} ${text || this.text}`);
  }

  fail(text) {
    this.stop();
    this.terminal.writeLine(`${chalk.red('✖')} ${text || this.text}`);
  }

  warn(text) {
    this.stop();
    this.terminal.writeLine(`${chalk.yellow('⚠')} ${text || this.text}`);
  }

  info(text) {
    this.stop();
    this.terminal.writeLine(`${chalk.blue('ℹ')} ${text || this.text}`);
  }
}
```

### 旋转器变化和动画

```javascript
class SpinnerAnimations {
  static get presets() {
    return {
      // 盲文点 - 平滑旋转
      dots: {
        frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        interval: 80
      },

      // 经典线旋转器
      line: {
        frames: ['-', '\\', '|', '/'],
        interval: 100
      },

      // 简单点
      simpleDots: {
        frames: ['.  ', '.. ', '...', '   '],
        interval: 200
      },

      // 箭头旋转
      arrow: {
        frames: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
        interval: 100
      },

      // 盒子旋转
      box: {
        frames: ['◰', '◳', '◲', '◱'],
        interval: 120
      },

      // 增长点
      growingDots: {
        frames: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
        interval: 80
      },

      // 脉冲
      pulse: {
        frames: ['◯', '◉', '●', '◉'],
        interval: 150
      },

      // 加载条
      bar: {
        frames: [
          '[    ]',
          '[=   ]',
          '[==  ]',
          '[=== ]',
          '[ ===]',
          '[  ==]',
          '[   =]',
          '[    ]'
        ],
        interval: 100
      },

      // 弹跳球
      bounce: {
        frames: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
        interval: 100
      },

      // 时钟
      clock: {
        frames: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
        interval: 100
      }
    };
  }

  static create(type, options = {}) {
    const preset = this.presets[type] || this.presets.dots;
    return new Spinner({
      ...preset,
      ...options
    });
  }
}

// 用法
const spinner = SpinnerAnimations.create('dots', {
  text: '正在处理...',
  color: chalk.cyan
});
```

## 📍 状态行实现

### 持久状态行

缺失的 status-line.js 实现：

```javascript
class StatusLine {
  constructor(options = {}) {
    this.terminal = options.terminal || new Terminal();
    this.position = options.position || 'bottom'; // top, bottom
    this.format = options.format || ':status | :time';
    this.updateInterval = options.updateInterval || 1000;
    this.visible = false;

    this.values = {
      status: '',
      time: ''
    };

    this.timer = null;
    this.savedCursor = null;
  }

  show() {
    if (this.visible) return;

    this.visible = true;

    // 保存当前光标位置
    this.terminal.write('\x1b[s');

    // 为状态行保留空间
    if (this.position === 'bottom') {
      this.reserveBottomLine();
    } else {
      this.reserveTopLine();
    }

    // 启动更新计时器
    this.timer = setInterval(() => {
      this.update();
    }, this.updateInterval);

    this.render();
  }

  hide() {
    if (!this.visible) return;

    this.visible = false;

    // 停止更新
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // 清除状态行
    this.clearStatusLine();

    // 恢复光标
    this.terminal.write('\x1b[u');
  }

  set(key, value) {
    this.values[key] = value;
    if (this.visible) {
      this.render();
    }
  }

  update() {
    // 更新时间
    this.values.time = new Date().toLocaleTimeString();

    // 更新任何其他动态值
    if (this.onUpdate) {
      this.onUpdate(this.values);
    }

    this.render();
  }

  render() {
    if (!this.visible) return;

    // 保存光标位置
    this.terminal.write('\x1b[s');

    // 移动到状态行位置
    if (this.position === 'bottom') {
      this.terminal.write(`\x1b[${this.terminal.rows};0H`);
    } else {
      this.terminal.write('\x1b[1;0H');
    }

    // 构建状态行
    let line = this.format;
    Object.entries(this.values).forEach(([key, value]) => {
      line = line.replace(`:${key}`, value);
    });

    // 确保行适合终端宽度
    line = this.fitToWidth(line);

    // 样式状态行
    const styled = chalk.inverse(line);

    // 写入状态行
    this.terminal.write(styled);

    // 恢复光标位置
    this.terminal.write('\x1b[u');
  }

  fitToWidth(text) {
    const width = this.terminal.columns;
    const stripped = stripAnsi(text);

    if (stripped.length > width) {
      return text.substring(0, width - 3) + '...';
    } else if (stripped.length < width) {
      return text + ' '.repeat(width - stripped.length);
    }

    return text;
  }

  reserveBottomLine() {
    // 设置滚动区域以排除底行
    this.terminal.write(`\x1b[1;${this.terminal.rows - 1}r`);
  }

  reserveTopLine() {
    // 设置滚动区域以排除顶行
    this.terminal.write(`\x1b[2;${this.terminal.rows}r`);
    // 将内容向下移动一行
    this.terminal.write('\x1b[2;0H');
  }

  clearStatusLine() {
    // 重置滚动区域
    this.terminal.write(`\x1b[1;${this.terminal.rows}r`);
  }
}
```

### 高级状态行功能

```javascript
class AdvancedStatusLine extends StatusLine {
  constructor(options = {}) {
    super(options);

    this.segments = [];
    this.separator = options.separator || ' │ ';
    this.maxSegments = options.maxSegments || 5;

    // 预定义段
    this.availableSegments = {
      time: {
        update: () => new Date().toLocaleTimeString(),
        width: 8
      },
      memory: {
        update: () => this.getMemoryUsage(),
        width: 12
      },
      cpu: {
        update: () => this.getCPUUsage(),
        width: 10
      },
      network: {
        update: () => this.getNetworkStatus(),
        width: 8
      },
      git: {
        update: () => this.getGitStatus(),
        width: 20
      },
      path: {
        update: () => this.getCurrentPath(),
        width: 30
      }
    };
  }

  addSegment(name, options = {}) {
    if (this.segments.length >= this.maxSegments) {
      console.warn(`已达到最大段数 (${this.maxSegments})`);
      return;
    }

    const segment = {
      name,
      ...this.availableSegments[name],
      ...options
    };

    this.segments.push(segment);
    this.update();
  }

  removeSegment(name) {
    this.segments = this.segments.filter(s => s.name !== name);
    this.update();
  }

  update() {
    // 更新所有段
    this.segments.forEach(segment => {
      if (segment.update) {
        this.values[segment.name] = segment.update();
      }
    });

    this.render();
  }

  render() {
    if (!this.visible) return;

    // 从段构建状态行
    const parts = this.segments.map(segment => {
      const value = this.values[segment.name] || '';
      return this.formatSegment(value, segment.width);
    });

    const line = parts.join(this.separator);

    // 应用样式
    const styled = this.applyTheme(line);

    // 保存光标，写状态，恢复光标
    this.terminal.write('\x1b[s');
    this.moveToStatusPosition();
    this.terminal.write(styled);
    this.terminal.write('\x1b[u');
  }

  formatSegment(value, width) {
    const str = String(value);

    if (str.length > width) {
      return str.substring(0, width - 1) + '…';
    } else if (str.length < width) {
      return str + ' '.repeat(width - str.length);
    }

    return str;
  }

  getMemoryUsage() {
    const usage = process.memoryUsage();
    const mb = Math.round(usage.heapUsed / 1024 / 1024);
    return `内存: ${mb}MB`;
  }

  getCPUUsage() {
    // 这需要实际的 CPU 监控
    return 'CPU: ---%';
  }

  getNetworkStatus() {
    // 检查网络连接
    return '🌐 在线';
  }

  getGitStatus() {
    // 获取当前 git 分支和状态
    try {
      const branch = execSync('git branch --show-current').toString().trim();
      const status = execSync('git status --porcelain').toString();
      const dirty = status.length > 0 ? '*' : '';
      return `git:${branch}${dirty}`;
    } catch {
      return '';
    }
  }

  getCurrentPath() {
    const cwd = process.cwd();
    const home = os.homedir();
    return cwd.replace(home, '~');
  }

  applyTheme(line) {
    // 根据上下文应用不同主题
    if (this.values.error) {
      return chalk.bgRed.white(line);
    } else if (this.values.warning) {
      return chalk.bgYellow.black(line);
    } else {
      return chalk.bgBlue.white(line);
    }
  }
}
```

## 📊 多进度管理

### 并发进度跟踪

```javascript
class MultiProgressManager {
  constructor(terminal) {
    this.terminal = terminal;
    this.progressBars = new Map();
    this.spinners = new Map();
    this.layout = [];
    this.renderInterval = null;
    this.isRendering = false;
  }

  addProgressBar(id, options = {}) {
    const bar = new EnhancedProgressBar({
      ...options,
      terminal: this.terminal
    });

    this.progressBars.set(id, {
      bar,
      row: this.layout.length,
      visible: true
    });

    this.layout.push({ type: 'progress', id });
    this.startRendering();

    return bar;
  }

  addSpinner(id, options = {}) {
    const spinner = new Spinner({
      ...options,
      terminal: this.terminal
    });

    this.spinners.set(id, {
      spinner,
      row: this.layout.length,
      visible: true
    });

    this.layout.push({ type: 'spinner', id });
    this.startRendering();

    return spinner;
  }

  remove(id) {
    this.progressBars.delete(id);
    this.spinners.delete(id);
    this.layout = this.layout.filter(item => item.id !== id);

    if (this.layout.length === 0) {
      this.stopRendering();
    }
  }

  startRendering() {
    if (this.isRendering) return;

    this.isRendering = true;

    // 为所有项目清除空间
    this.terminal.write('\n'.repeat(this.layout.length));

    // 将光标移回上面
    this.terminal.moveCursor(0, -this.layout.length);

    // 保存光标位置
    this.terminal.write('\x1b[s');

    // 启动渲染循环
    this.renderInterval = setInterval(() => {
      this.render();
    }, 50); // 20 FPS 用于流畅动画
  }

  stopRendering() {
    if (!this.isRendering) return;

    this.isRendering = false;

    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }

    // 恢复光标
    this.terminal.write('\x1b[u');
  }

  render() {
    // 保存光标位置
    this.terminal.write('\x1b[s');

    this.layout.forEach((item, index) => {
      // 移动到正确的行
      this.terminal.cursorTo(0);
      this.terminal.moveCursor(0, index);

      // 清除行
      this.terminal.clearLine();

      // 渲染项目
      if (item.type === 'progress') {
        const entry = this.progressBars.get(item.id);
        if (entry && entry.visible) {
          entry.bar.render();
        }
      } else if (item.type === 'spinner') {
        const entry = this.spinners.get(item.id);
        if (entry && entry.visible) {
          entry.spinner.render();
        }
      }
    });

    // 恢复光标位置
    this.terminal.write('\x1b[u');
  }

  clear() {
    this.stopRendering();

    // 清除进度显示使用的所有行
    for (let i = 0; i < this.layout.length; i++) {
      this.terminal.clearLine();
      if (i < this.layout.length - 1) {
        this.terminal.moveCursor(0, 1);
      }
    }

    // 清除内部状态
    this.progressBars.clear();
    this.spinners.clear();
    this.layout = [];
  }
}
```

## 🔔 通知系统

### 终端通知

```javascript
class NotificationManager {
  constructor(terminal) {
    this.terminal = terminal;
    this.notifications = [];
    this.maxNotifications = 5;
    this.notificationTimeout = 5000;
    this.position = 'top-right'; // top-right, top-left, bottom-right, bottom-left
  }

  notify(message, type = 'info', options = {}) {
    const notification = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date(),
      duration: options.duration || this.notificationTimeout,
      icon: this.getIcon(type),
      color: this.getColor(type)
    };

    this.notifications.push(notification);

    // 限制通知数量
    if (this.notifications.length > this.maxNotifications) {
      this.notifications.shift();
    }

    this.render();

    // 自动关闭
    if (notification.duration > 0) {
      setTimeout(() => {
        this.dismiss(notification.id);
      }, notification.duration);
    }

    return notification.id;
  }

  dismiss(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.render();
  }

  render() {
    // 保存光标位置
    this.terminal.write('\x1b[s');

    // 清除先前的通知
    this.clearNotificationArea();

    // 渲染每个通知
    this.notifications.forEach((notification, index) => {
      this.renderNotification(notification, index);
    });

    // 恢复光标位置
    this.terminal.write('\x1b[u');
  }

  renderNotification(notification, index) {
    const position = this.calculatePosition(index);

    // 移动到位置
    this.terminal.write(`\x1b[${position.row};${position.col}H`);

    // 格式化通知
    const formatted = this.formatNotification(notification);

    // 写入通知
    this.terminal.write(formatted);
  }

  formatNotification(notification) {
    const icon = notification.icon;
    const message = notification.message;
    const time = this.formatTime(notification.timestamp);

    const content = `${icon} ${message} ${chalk.gray(time)}`;

    // 添加边框和填充
    const border = this.createBorder(content);

    return notification.color(border);
  }

  createBorder(content) {
    const width = stripAnsi(content).length + 4;
    const top = '╭' + '─'.repeat(width - 2) + '╮';
    const middle = `│ ${content} │`;
    const bottom = '╰' + '─'.repeat(width - 2) + '╯';

    return `${top}\n${middle}\n${bottom}`;
  }

  calculatePosition(index) {
    const terminalWidth = this.terminal.columns;
    const terminalHeight = this.terminal.rows;
    const notificationHeight = 3; // 带边框通知的高度

    let row, col;

    switch (this.position) {
      case 'top-right':
        row = 1 + (index * notificationHeight);
        col = terminalWidth - 40; // 假设 40 字符宽度
        break;

      case 'top-left':
        row = 1 + (index * notificationHeight);
        col = 1;
        break;

      case 'bottom-right':
        row = terminalHeight - ((index + 1) * notificationHeight);
        col = terminalWidth - 40;
        break;

      case 'bottom-left':
        row = terminalHeight - ((index + 1) * notificationHeight);
        col = 1;
        break;

      default:
        row = 1 + (index * notificationHeight);
        col = terminalWidth - 40;
    }

    return { row, col };
  }

  clearNotificationArea() {
    // 清除显示通知的区域
    // 这是简化的；实际实现会跟踪确切位置
  }

  getIcon(type) {
    const icons = {
      success: '✔',
      error: '✖',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }

  getColor(type) {
    const colors = {
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.blue
    };
    return colors[type] || colors.info;
  }

  formatTime(date) {
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    } else {
      return date.toLocaleTimeString();
    }
  }
}
```

## 📈 实时指标显示

### 实时指标仪表板

```javascript
class MetricsDashboard {
  constructor(terminal) {
    this.terminal = terminal;
    this.metrics = new Map();
    this.layout = {
      rows: 0,
      cols: 0,
      cells: []
    };
    this.updateInterval = 1000;
    this.isActive = false;
  }

  addMetric(id, options = {}) {
    const metric = {
      id,
      name: options.name || id,
      value: 0,
      unit: options.unit || '',
      format: options.format || ((v) => v.toString()),
      sparkline: options.sparkline !== false,
      history: [],
      maxHistory: options.maxHistory || 20,
      color: options.color || chalk.white
    };

    this.metrics.set(id, metric);
    this.rebuildLayout();
  }

  updateMetric(id, value) {
    const metric = this.metrics.get(id);
    if (!metric) return;

    metric.value = value;
    metric.history.push(value);

    if (metric.history.length > metric.maxHistory) {
      metric.history.shift();
    }

    if (this.isActive) {
      this.renderMetric(metric);
    }
  }

  start() {
    if (this.isActive) return;

    this.isActive = true;

    // 清屏并隐藏光标
    this.terminal.clear();
    this.terminal.hideCursor();

    // 初始渲染
    this.renderAll();

    // 启动更新循环
    this.timer = setInterval(() => {
      this.renderAll();
    }, this.updateInterval);
  }

  stop() {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // 显示光标
    this.terminal.showCursor();
  }

  renderAll() {
    // 保存光标位置
    this.terminal.write('\x1b[s');

    // 渲染标题
    this.renderHeader();

    // 渲染每个指标
    this.metrics.forEach(metric => {
      this.renderMetric(metric);
    });

    // 恢复光标位置
    this.terminal.write('\x1b[u');
  }

  renderHeader() {
    this.terminal.write('\x1b[1;1H'); // 移动到左上角
    this.terminal.clearLine();

    const title = chalk.bold.cyan('📊 指标仪表板');
    const time = new Date().toLocaleTimeString();

    this.terminal.write(`${title} ${chalk.gray(`│ ${time}`)}\n`);
    this.terminal.write(chalk.gray('─'.repeat(this.terminal.columns)) + '\n');
  }

  renderMetric(metric) {
    const cell = this.getMetricCell(metric.id);
    if (!cell) return;

    // 移动到单元格位置
    this.terminal.write(`\x1b[${cell.row};${cell.col}H`);

    // 渲染指标框
    this.renderMetricBox(metric, cell.width, cell.height);
  }

  renderMetricBox(metric, width, height) {
    // 标题
    const title = metric.name.substring(0, width - 2);
    this.terminal.write(chalk.bold(title) + '\n');

    // 值
    const formattedValue = metric.format(metric.value);
    const valueStr = `${formattedValue} ${metric.unit}`;
    this.terminal.write(metric.color(valueStr) + '\n');

    // 迷你图
    if (metric.sparkline && metric.history.length > 0) {
      const sparkline = this.createSparkline(metric.history, width);
      this.terminal.write(sparkline + '\n');
    }
  }

  createSparkline(data, width) {
    if (data.length === 0) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

    const normalized = data.map(v => {
      const normalized = (v - min) / range;
      const index = Math.floor(normalized * (chars.length - 1));
      return chars[index];
    });

    // 适合宽度
    const sparkline = normalized.slice(-width).join('');

    return chalk.cyan(sparkline);
  }

  rebuildLayout() {
    // 计算最佳网格布局
    const count = this.metrics.size;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    this.layout = {
      rows,
      cols,
      cells: []
    };

    let index = 0;
    for (const [id] of this.metrics) {
      const row = Math.floor(index / cols);
      const col = index % cols;

      this.layout.cells.push({
        id,
        row: 3 + (row * 4), // 从第 3 行开始，每个单元格高 4 行
        col: 1 + (col * 30), // 每个单元格宽 30 列
        width: 28,
        height: 3
      });

      index++;
    }
  }

  getMetricCell(id) {
    return this.layout.cells.find(cell => cell.id === id);
  }
}
```

## 🎯 与 CLI 操作的集成

### 进度集成示例

```javascript
class CLIProgressIntegration {
  constructor() {
    this.terminal = new Terminal();
    this.multiProgress = new MultiProgressManager(this.terminal);
    this.statusLine = new AdvancedStatusLine({ terminal: this.terminal });
  }

  async downloadFiles(urls) {
    const downloads = new Map();

    // 显示状态行
    this.statusLine.show();
    this.statusLine.addSegment('status');
    this.statusLine.set('status', '开始下载...');

    // 为每个下载创建进度条
    urls.forEach((url, index) => {
      const id = `download-${index}`;
      const bar = this.multiProgress.addProgressBar(id, {
        total: 100,
        format: `[${index + 1}/${urls.length}] :bar :percent :speed`,
        showETA: true,
        gradient: true
      });

      downloads.set(url, { id, bar });
    });

    // 同时开始所有下载
    const promises = urls.map(url => this.downloadWithProgress(url, downloads.get(url)));

    try {
      await Promise.all(promises);
      this.statusLine.set('status', chalk.green('所有下载完成！'));
    } catch (error) {
      this.statusLine.set('status', chalk.red(`错误: ${error.message}`));
    } finally {
      // 清理
      setTimeout(() => {
        this.multiProgress.clear();
        this.statusLine.hide();
      }, 2000);
    }
  }

  async downloadWithProgress(url, { id, bar }) {
    // 带进度更新的模拟下载
    return new Promise((resolve, reject) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          bar.complete();
          resolve();
        } else {
          bar.update(progress, {
            speed: `${Math.round(Math.random() * 10)}MB/s`
          });
        }
      }, 500);
    });
  }
}
```

## 💡 最佳实践和性能

### 高效终端更新

```javascript
class EfficientProgressRenderer {
  constructor(terminal) {
    this.terminal = terminal;
    this.renderQueue = [];
    this.isRendering = false;
    this.frameTime = 16; // 目标 60 FPS
    this.lastRender = 0;
  }

  queueUpdate(update) {
    this.renderQueue.push(update);

    if (!this.isRendering) {
      this.startRenderLoop();
    }
  }

  startRenderLoop() {
    this.isRendering = true;
    requestAnimationFrame(() => this.renderFrame());
  }

  renderFrame() {
    const now = Date.now();

    if (now - this.lastRender >= this.frameTime) {
      // 处理所有排队的更新
      const updates = this.renderQueue.splice(0);
      this.batchRender(updates);
      this.lastRender = now;
    }

    if (this.renderQueue.length > 0) {
      requestAnimationFrame(() => this.renderFrame());
    } else {
      this.isRendering = false;
    }
  }

  batchRender(updates) {
    // 保存光标一次
    this.terminal.write('\x1b[s');

    // 应用所有更新
    updates.forEach(update => {
      update();
    });

    // 恢复光标一次
    this.terminal.write('\x1b[u');
  }
}

// 为 Node.js 使用 requestAnimationFrame polyfill
const requestAnimationFrame = (callback) => {
  setImmediate(() => callback(Date.now()));
};
```

## 📊 总结

Claude Code 中的进度和状态显示系统为终端应用程序提供了全面的视觉反馈机制。关键成就包括：

1. **高级进度条**：带 ETA、速度计算和渐变颜色的增强进度条
2. **动画旋转器**：多种旋转器动画，渲染流畅
3. **状态行**：带动态段的持久状态行
4. **多进度管理**：多个操作的并发进度跟踪
5. **通知系统**：带定位和自动关闭的终端通知
6. **指标仪表板**：带迷你图的实时指标显示
7. **高效渲染**：带批处理和限流的优化终端更新
8. **集成模式**：与 CLI 操作的无缝集成

实现展示了 CLI 应用程序如何提供丰富的实时视觉反馈，让用户了解正在进行的操作。模块化设计允许轻松定制和扩展，使其成为创建专业命令行界面的强大基础，在用户反馈和视觉吸引力方面与 GUI 应用程序相媲美。

---

*这完成了第七部分：UI 系统。全面的文档涵盖了终端架构、输入处理、输出渲染和进度显示 - 提供了 Claude Code 复杂 UI 实现的完整图片。*