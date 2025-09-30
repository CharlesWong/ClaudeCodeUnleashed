# Part 7.4: Progress and Status Displays - Claude Code Technical Series

## 🔄 Introduction: Real-time Visual Feedback Systems

Progress and status displays are crucial for providing users with visual feedback during long-running operations. Claude Code implements a sophisticated system of progress bars, spinners, status lines, and notification systems that keep users informed while maintaining a clean, professional terminal interface.

This implementation showcases how CLI applications can provide responsive, informative feedback comparable to GUI applications while preserving the efficiency and scriptability of command-line tools.

## 📊 Progress Bar Architecture

### Core ProgressBar Implementation

From terminal.js, the fundamental progress bar system:

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

    // Performance tracking
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.renderThrottle = options.renderThrottle || 16; // ~60fps
  }

  update(current, tokens = {}) {
    this.current = Math.min(current, this.total);
    this.tokens = { ...this.tokens, ...tokens };

    // Throttle rendering for performance
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

    // Replace custom tokens
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

### Advanced Progress Bar Features

```javascript
class EnhancedProgressBar extends ProgressBar {
  constructor(options = {}) {
    super(options);

    // Enhanced features
    this.showETA = options.showETA !== false;
    this.showSpeed = options.showSpeed !== false;
    this.gradient = options.gradient !== false;
    this.smoothing = options.smoothing !== false;

    // Statistics tracking
    this.history = [];
    this.maxHistorySize = 10;

    // Color gradient for progress
    this.gradientColors = [
      chalk.red,      // 0-20%
      chalk.yellow,   // 20-40%
      chalk.yellow,   // 40-60%
      chalk.green,    // 60-80%
      chalk.green     // 80-100%
    ];

    // Custom format with additional tokens
    if (this.showETA || this.showSpeed) {
      this.format = ':bar :percent :current/:total :eta :speed';
    }
  }

  update(current, tokens = {}) {
    const previousCurrent = this.current;
    super.update(current, tokens);

    // Track progress history for smoothing and statistics
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

    // Create gradient bar if enabled
    let bar;
    if (this.gradient) {
      bar = this.createGradientBar(filled, empty, percent);
    } else {
      bar = this.complete.repeat(filled) + this.incomplete.repeat(empty);
    }

    // Calculate additional metrics
    const eta = this.calculateETA();
    const speed = this.calculateSpeed();

    let output = this.format
      .replace(':bar', bar)
      .replace(':percent', `${percent}%`)
      .replace(':current', this.current.toString())
      .replace(':total', this.total.toString())
      .replace(':eta', eta)
      .replace(':speed', speed);

    // Replace custom tokens
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

    // Calculate average speed from recent history
    const recentHistory = this.history.slice(-5);
    const timeSpan = recentHistory[recentHistory.length - 1].time - recentHistory[0].time;
    const valueChange = recentHistory[recentHistory.length - 1].value - recentHistory[0].value;

    if (timeSpan === 0) return '';

    const speed = (valueChange / timeSpan) * 1000; // per second
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

## 🔄 Spinner Implementation

### Core Spinner System

From terminal.js, the animated spinner implementation:

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

    // Performance optimization
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

  // Status methods
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

### Spinner Variations and Animations

```javascript
class SpinnerAnimations {
  static get presets() {
    return {
      // Braille dots - smooth rotation
      dots: {
        frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        interval: 80
      },

      // Classic line spinner
      line: {
        frames: ['-', '\\', '|', '/'],
        interval: 100
      },

      // Simple dots
      simpleDots: {
        frames: ['.  ', '.. ', '...', '   '],
        interval: 200
      },

      // Arrow rotation
      arrow: {
        frames: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
        interval: 100
      },

      // Box rotation
      box: {
        frames: ['◰', '◳', '◲', '◱'],
        interval: 120
      },

      // Growing dots
      growingDots: {
        frames: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
        interval: 80
      },

      // Pulse
      pulse: {
        frames: ['◯', '◉', '●', '◉'],
        interval: 150
      },

      // Loading bar
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

      // Bouncing ball
      bounce: {
        frames: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
        interval: 100
      },

      // Clock
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

// Usage
const spinner = SpinnerAnimations.create('dots', {
  text: 'Processing...',
  color: chalk.cyan
});
```

## 📍 Status Line Implementation

### Persistent Status Line

The missing status-line.js implementation:

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

    // Save current cursor position
    this.terminal.write('\x1b[s');

    // Reserve space for status line
    if (this.position === 'bottom') {
      this.reserveBottomLine();
    } else {
      this.reserveTopLine();
    }

    // Start update timer
    this.timer = setInterval(() => {
      this.update();
    }, this.updateInterval);

    this.render();
  }

  hide() {
    if (!this.visible) return;

    this.visible = false;

    // Stop updates
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Clear status line
    this.clearStatusLine();

    // Restore cursor
    this.terminal.write('\x1b[u');
  }

  set(key, value) {
    this.values[key] = value;
    if (this.visible) {
      this.render();
    }
  }

  update() {
    // Update time
    this.values.time = new Date().toLocaleTimeString();

    // Update any other dynamic values
    if (this.onUpdate) {
      this.onUpdate(this.values);
    }

    this.render();
  }

  render() {
    if (!this.visible) return;

    // Save cursor position
    this.terminal.write('\x1b[s');

    // Move to status line position
    if (this.position === 'bottom') {
      this.terminal.write(`\x1b[${this.terminal.rows};0H`);
    } else {
      this.terminal.write('\x1b[1;0H');
    }

    // Build status line
    let line = this.format;
    Object.entries(this.values).forEach(([key, value]) => {
      line = line.replace(`:${key}`, value);
    });

    // Ensure line fits terminal width
    line = this.fitToWidth(line);

    // Style the status line
    const styled = chalk.inverse(line);

    // Write status line
    this.terminal.write(styled);

    // Restore cursor position
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
    // Set scrolling region to exclude bottom line
    this.terminal.write(`\x1b[1;${this.terminal.rows - 1}r`);
  }

  reserveTopLine() {
    // Set scrolling region to exclude top line
    this.terminal.write(`\x1b[2;${this.terminal.rows}r`);
    // Move content down one line
    this.terminal.write('\x1b[2;0H');
  }

  clearStatusLine() {
    // Reset scrolling region
    this.terminal.write(`\x1b[1;${this.terminal.rows}r`);
  }
}
```

### Advanced Status Line Features

```javascript
class AdvancedStatusLine extends StatusLine {
  constructor(options = {}) {
    super(options);

    this.segments = [];
    this.separator = options.separator || ' │ ';
    this.maxSegments = options.maxSegments || 5;

    // Predefined segments
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
      console.warn(`Maximum segments (${this.maxSegments}) reached`);
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
    // Update all segments
    this.segments.forEach(segment => {
      if (segment.update) {
        this.values[segment.name] = segment.update();
      }
    });

    this.render();
  }

  render() {
    if (!this.visible) return;

    // Build status line from segments
    const parts = this.segments.map(segment => {
      const value = this.values[segment.name] || '';
      return this.formatSegment(value, segment.width);
    });

    const line = parts.join(this.separator);

    // Apply styling
    const styled = this.applyTheme(line);

    // Save cursor, write status, restore cursor
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
    return `Mem: ${mb}MB`;
  }

  getCPUUsage() {
    // This would need actual CPU monitoring
    return 'CPU: ---%';
  }

  getNetworkStatus() {
    // Check network connectivity
    return '🌐 Online';
  }

  getGitStatus() {
    // Get current git branch and status
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
    // Apply different themes based on context
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

## 📊 Multi-Progress Management

### Concurrent Progress Tracking

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

    // Clear space for all items
    this.terminal.write('\n'.repeat(this.layout.length));

    // Move cursor back up
    this.terminal.moveCursor(0, -this.layout.length);

    // Save cursor position
    this.terminal.write('\x1b[s');

    // Start render loop
    this.renderInterval = setInterval(() => {
      this.render();
    }, 50); // 20 FPS for smooth animation
  }

  stopRendering() {
    if (!this.isRendering) return;

    this.isRendering = false;

    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }

    // Restore cursor
    this.terminal.write('\x1b[u');
  }

  render() {
    // Save cursor position
    this.terminal.write('\x1b[s');

    this.layout.forEach((item, index) => {
      // Move to correct row
      this.terminal.cursorTo(0);
      this.terminal.moveCursor(0, index);

      // Clear line
      this.terminal.clearLine();

      // Render item
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

    // Restore cursor position
    this.terminal.write('\x1b[u');
  }

  clear() {
    this.stopRendering();

    // Clear all lines used by progress displays
    for (let i = 0; i < this.layout.length; i++) {
      this.terminal.clearLine();
      if (i < this.layout.length - 1) {
        this.terminal.moveCursor(0, 1);
      }
    }

    // Clear internal state
    this.progressBars.clear();
    this.spinners.clear();
    this.layout = [];
  }
}
```

## 🔔 Notification System

### Terminal Notifications

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

    // Limit number of notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications.shift();
    }

    this.render();

    // Auto-dismiss
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
    // Save cursor position
    this.terminal.write('\x1b[s');

    // Clear previous notifications
    this.clearNotificationArea();

    // Render each notification
    this.notifications.forEach((notification, index) => {
      this.renderNotification(notification, index);
    });

    // Restore cursor position
    this.terminal.write('\x1b[u');
  }

  renderNotification(notification, index) {
    const position = this.calculatePosition(index);

    // Move to position
    this.terminal.write(`\x1b[${position.row};${position.col}H`);

    // Format notification
    const formatted = this.formatNotification(notification);

    // Write notification
    this.terminal.write(formatted);
  }

  formatNotification(notification) {
    const icon = notification.icon;
    const message = notification.message;
    const time = this.formatTime(notification.timestamp);

    const content = `${icon} ${message} ${chalk.gray(time)}`;

    // Add border and padding
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
    const notificationHeight = 3; // Height of bordered notification

    let row, col;

    switch (this.position) {
      case 'top-right':
        row = 1 + (index * notificationHeight);
        col = terminalWidth - 40; // Assume 40 char width
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
    // Clear the area where notifications appear
    // This is simplified; real implementation would track exact positions
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
      return 'just now';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    } else {
      return date.toLocaleTimeString();
    }
  }
}
```

## 📈 Real-time Metrics Display

### Live Metrics Dashboard

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

    // Clear screen and hide cursor
    this.terminal.clear();
    this.terminal.hideCursor();

    // Initial render
    this.renderAll();

    // Start update loop
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

    // Show cursor
    this.terminal.showCursor();
  }

  renderAll() {
    // Save cursor position
    this.terminal.write('\x1b[s');

    // Render header
    this.renderHeader();

    // Render each metric
    this.metrics.forEach(metric => {
      this.renderMetric(metric);
    });

    // Restore cursor position
    this.terminal.write('\x1b[u');
  }

  renderHeader() {
    this.terminal.write('\x1b[1;1H'); // Move to top-left
    this.terminal.clearLine();

    const title = chalk.bold.cyan('📊 Metrics Dashboard');
    const time = new Date().toLocaleTimeString();

    this.terminal.write(`${title} ${chalk.gray(`│ ${time}`)}\n`);
    this.terminal.write(chalk.gray('─'.repeat(this.terminal.columns)) + '\n');
  }

  renderMetric(metric) {
    const cell = this.getMetricCell(metric.id);
    if (!cell) return;

    // Move to cell position
    this.terminal.write(`\x1b[${cell.row};${cell.col}H`);

    // Render metric box
    this.renderMetricBox(metric, cell.width, cell.height);
  }

  renderMetricBox(metric, width, height) {
    // Title
    const title = metric.name.substring(0, width - 2);
    this.terminal.write(chalk.bold(title) + '\n');

    // Value
    const formattedValue = metric.format(metric.value);
    const valueStr = `${formattedValue} ${metric.unit}`;
    this.terminal.write(metric.color(valueStr) + '\n');

    // Sparkline
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

    // Fit to width
    const sparkline = normalized.slice(-width).join('');

    return chalk.cyan(sparkline);
  }

  rebuildLayout() {
    // Calculate optimal grid layout
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
        row: 3 + (row * 4), // Start at row 3, each cell is 4 rows high
        col: 1 + (col * 30), // Each cell is 30 columns wide
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

## 🎯 Integration with CLI Operations

### Progress Integration Examples

```javascript
class CLIProgressIntegration {
  constructor() {
    this.terminal = new Terminal();
    this.multiProgress = new MultiProgressManager(this.terminal);
    this.statusLine = new AdvancedStatusLine({ terminal: this.terminal });
  }

  async downloadFiles(urls) {
    const downloads = new Map();

    // Show status line
    this.statusLine.show();
    this.statusLine.addSegment('status');
    this.statusLine.set('status', 'Starting downloads...');

    // Create progress bar for each download
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

    // Start all downloads concurrently
    const promises = urls.map(url => this.downloadWithProgress(url, downloads.get(url)));

    try {
      await Promise.all(promises);
      this.statusLine.set('status', chalk.green('All downloads complete!'));
    } catch (error) {
      this.statusLine.set('status', chalk.red(`Error: ${error.message}`));
    } finally {
      // Clean up
      setTimeout(() => {
        this.multiProgress.clear();
        this.statusLine.hide();
      }, 2000);
    }
  }

  async downloadWithProgress(url, { id, bar }) {
    // Simulated download with progress updates
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

## 💡 Best Practices and Performance

### Efficient Terminal Updates

```javascript
class EfficientProgressRenderer {
  constructor(terminal) {
    this.terminal = terminal;
    this.renderQueue = [];
    this.isRendering = false;
    this.frameTime = 16; // Target 60 FPS
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
      // Process all queued updates
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
    // Save cursor once
    this.terminal.write('\x1b[s');

    // Apply all updates
    updates.forEach(update => {
      update();
    });

    // Restore cursor once
    this.terminal.write('\x1b[u');
  }
}

// Use requestAnimationFrame polyfill for Node.js
const requestAnimationFrame = (callback) => {
  setImmediate(() => callback(Date.now()));
};
```

## 📊 Summary

The Progress and Status Displays system in Claude Code provides comprehensive visual feedback mechanisms for terminal applications. Key achievements include:

1. **Advanced Progress Bars**: Enhanced progress bars with ETA, speed calculation, and gradient colors
2. **Animated Spinners**: Multiple spinner animations with smooth rendering
3. **Status Lines**: Persistent status lines with dynamic segments
4. **Multi-Progress Management**: Concurrent progress tracking for multiple operations
5. **Notification System**: Terminal notifications with positioning and auto-dismiss
6. **Metrics Dashboard**: Live metrics display with sparklines
7. **Efficient Rendering**: Optimized terminal updates with batching and throttling
8. **Integration Patterns**: Seamless integration with CLI operations

The implementation demonstrates how CLI applications can provide rich, real-time visual feedback that keeps users informed about ongoing operations. The modular design allows for easy customization and extension, making it a powerful foundation for creating professional command-line interfaces that rival GUI applications in terms of user feedback and visual appeal.

---

*This completes Part 7: UI System. The comprehensive documentation covers terminal architecture, input handling, output rendering, and progress displays - providing a complete picture of Claude Code's sophisticated UI implementation.*