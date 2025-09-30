# 第 9.1 部分:开发环境设置

## 简介

Claude Code CLI 开发环境为构建、测试、调试和部署 AI 驱动的命令行应用程序提供了全面的设置。本章探讨支持高效开发 Claude Code 系统的开发工具、环境配置和工作流程。

## 目录
1. [环境先决条件](#环境先决条件)
2. [项目结构](#项目结构)
3. [开发依赖](#开发依赖)
4. [环境配置](#环境配置)
5. [开发脚本](#开发脚本)
6. [IDE 集成](#ide-集成)
7. [开发工作流](#开发工作流)
8. [性能影响](#性能影响)

## 环境先决条件

### Node.js 要求

```javascript
// package.json 配置
{
  "engines": {
    "node": ">=16.0.0"  // 最低 Node.js 版本
  }
}
```

### 平台支持

```javascript
class PlatformDetector {
  constructor() {
    this.platform = process.platform;
    this.arch = process.arch;
    this.nodeVersion = process.version;
  }

  checkCompatibility() {
    const supportedPlatforms = ['darwin', 'linux', 'win32'];
    const supportedArchitectures = ['x64', 'arm64'];

    const issues = [];

    // 检查平台
    if (!supportedPlatforms.includes(this.platform)) {
      issues.push(`不支持的平台: ${this.platform}`);
    }

    // 检查架构
    if (!supportedArchitectures.includes(this.arch)) {
      issues.push(`不支持的架构: ${this.arch}`);
    }

    // 检查 Node.js 版本
    const minVersion = 16;
    const currentVersion = parseInt(this.nodeVersion.slice(1).split('.')[0]);

    if (currentVersion < minVersion) {
      issues.push(`Node.js 版本 ${this.nodeVersion} 低于最低要求 v${minVersion}`);
    }

    return {
      compatible: issues.length === 0,
      issues,
      platform: this.platform,
      arch: this.arch,
      nodeVersion: this.nodeVersion
    };
  }

  getPlatformSpecificConfig() {
    const configs = {
      darwin: {
        shell: process.env.SHELL || '/bin/zsh',
        pathSeparator: ':',
        homeDir: process.env.HOME,
        tempDir: '/tmp',
        configDir: `${process.env.HOME}/.config/claude-code`
      },
      linux: {
        shell: process.env.SHELL || '/bin/bash',
        pathSeparator: ':',
        homeDir: process.env.HOME,
        tempDir: '/tmp',
        configDir: `${process.env.HOME}/.config/claude-code`
      },
      win32: {
        shell: process.env.COMSPEC || 'cmd.exe',
        pathSeparator: ';',
        homeDir: process.env.USERPROFILE,
        tempDir: process.env.TEMP,
        configDir: `${process.env.APPDATA}\\claude-code`
      }
    };

    return configs[this.platform] || configs.linux;
  }
}
```

## 项目结构

### 目录组织

```javascript
class ProjectStructure {
  static getStructure() {
    return {
      root: '/',
      src: {
        cli: {
          'main.js': 'CLI 应用程序入口点',
          agents: {
            'agent-orchestrator.js': '代理管理系统',
            'general.js': '通用代理',
            'output-style.js': '输出样式配置代理',
            'status-line.js': '状态行配置代理',
            'loop-implementations.js': '对话循环实现',
            'loop-supporting-functions.js': '循环支持函数',
            'main-conversation-loop.js': '主对话处理器'
          },
          ui: {
            'terminal.js': '终端 UI 实现',
            'markdown.js': 'Markdown 渲染',
            'progress.js': '进度指示器',
            'status-line.js': '状态行显示'
          }
        },
        sdk: {
          core: {
            'Application.js': '核心应用程序类',
            'EventBus.js': '事件系统',
            'react.js': '类 React 组件'
          },
          services: {
            'ConfigService.js': '配置管理',
            'ApiService.js': 'API 客户端服务'
          },
          utils: {
            'circular-buffer.js': '循环缓冲区实现',
            'command-parser.js': '命令解析工具',
            'process-helpers.js': '进程管理帮助器',
            'shell-info.js': 'Shell 信息工具',
            'logger.js': '日志记录工具',
            'config.js': '配置帮助器'
          }
        },
        tools: {
          'index.js': '工具注册和导出',
          'bash.js': 'Bash 命令执行',
          'bash-implementation.js': 'Bash 实现细节',
          'shell-management.js': 'Shell 会话管理',
          'read.js': '文件读取工具',
          'write.js': '文件写入工具',
          'edit.js': '文件编辑工具',
          'grep.js': '模式搜索工具',
          'glob.js': '文件匹配工具',
          'webfetch.js': 'Web 获取工具',
          'websearch.js': 'Web 搜索工具',
          'task.js': '任务执行工具'
        },
        api: {
          'client.js': 'API 客户端实现',
          'streaming.js': '流处理',
          'errors.js': '错误定义',
          'messages.js': '消息处理',
          'rate-limiting.js': '速率限制管理'
        }
      },
      tests: {
        integration: {
          'comprehensive-test.js': '综合测试套件',
          'full-functionality-test.js': '完整功能测试'
        },
        unit: {
          'circular-buffer.test.js': '循环缓冲区测试',
          'command-parser.test.js': '命令解析器测试',
          'shell-info.test.js': 'Shell 信息测试'
        }
      },
      docs: {
        'INDEX.md': '文档索引',
        'architecture-reference': '架构文档',
        'deobfuscation-process': '反混淆文档'
      },
      'package.json': '项目配置',
      'README.md': '项目文档',
      '.gitignore': 'Git 忽略配置',
      'CLAUDE.md': 'Claude 特定指令'
    };
  }

  static validateStructure() {
    const fs = require('fs');
    const path = require('path');

    const errors = [];
    const warnings = [];

    // 检查关键目录
    const criticalDirs = [
      'src/cli',
      'src/sdk',
      'src/tools',
      'src/api'
    ];

    for (const dir of criticalDirs) {
      if (!fs.existsSync(dir)) {
        errors.push(`缺少关键目录: ${dir}`);
      }
    }

    // 检查关键文件
    const criticalFiles = [
      'src/cli/main.js',
      'src/tools/index.js',
      'package.json'
    ];

    for (const file of criticalFiles) {
      if (!fs.existsSync(file)) {
        errors.push(`缺少关键文件: ${file}`);
      }
    }

    // 检查可选但推荐的文件
    const recommendedFiles = [
      'README.md',
      '.gitignore',
      'tests/integration/comprehensive-test.js'
    ];

    for (const file of recommendedFiles) {
      if (!fs.existsSync(file)) {
        warnings.push(`缺少推荐文件: ${file}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
```

## 开发依赖

### 包配置

```javascript
// package.json
{
  "name": "claude-code-cli",
  "version": "1.0.115",
  "description": "Claude Code CLI - AI 驱动的开发助手",
  "main": "src/cli/main.js",
  "type": "module",  // ES6 模块

  "dependencies": {
    // API 和网络
    "axios": "^1.6.0",

    // CLI 工具
    "chalk": "^4.1.2",
    "commander": "^11.0.0",
    "inquirer": "^8.2.6",

    // Markdown 和语法高亮
    "marked": "^9.0.0",
    "marked-terminal": "^6.0.0",
    "cli-highlight": "^2.1.11",

    // UI 组件
    "cli-table3": "^0.6.3",
    "ora": "^5.4.1",

    // 配置和验证
    "dotenv": "^16.0.3",
    "zod": "^3.22.0"
  },

  "devDependencies": {
    // 代码质量
    "eslint": "^8.50.0",
    "prettier": "^3.0.0",

    // 测试(待添加)
    "@types/node": "^20.0.0",
    "vitest": "^0.34.0",

    // 构建工具(待添加)
    "esbuild": "^0.19.0",
    "tsup": "^7.0.0"
  }
}
```

### 依赖管理器

```javascript
class DependencyManager {
  constructor() {
    this.packageJson = null;
    this.lockFile = null;
  }

  async checkDependencies() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { execSync } = await import('child_process');

    try {
      // 加载 package.json
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageContent = await fs.readFile(packagePath, 'utf8');
      this.packageJson = JSON.parse(packageContent);

      // 检查锁文件
      const npmLockPath = path.join(process.cwd(), 'package-lock.json');
      const yarnLockPath = path.join(process.cwd(), 'yarn.lock');

      if (await fs.access(npmLockPath).then(() => true).catch(() => false)) {
        this.lockFile = 'npm';
      } else if (await fs.access(yarnLockPath).then(() => true).catch(() => false)) {
        this.lockFile = 'yarn';
      }

      // 验证已安装的依赖
      const nodeModulesPath = path.join(process.cwd(), 'node_modules');
      const hasNodeModules = await fs.access(nodeModulesPath)
        .then(() => true)
        .catch(() => false);

      if (!hasNodeModules) {
        return {
          installed: false,
          message: '依赖未安装。运行 npm install 或 yarn install。'
        };
      }

      // 检查过时的依赖
      const outdated = this.checkOutdated();

      // 检查安全漏洞
      const vulnerabilities = this.checkVulnerabilities();

      return {
        installed: true,
        lockFile: this.lockFile,
        outdated,
        vulnerabilities
      };

    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  checkOutdated() {
    try {
      const { execSync } = require('child_process');
      const result = execSync('npm outdated --json', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      return JSON.parse(result || '{}');
    } catch {
      return {};
    }
  }

  checkVulnerabilities() {
    try {
      const { execSync } = require('child_process');
      const result = execSync('npm audit --json', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      const audit = JSON.parse(result);
      return {
        total: audit.metadata.vulnerabilities.total,
        high: audit.metadata.vulnerabilities.high,
        moderate: audit.metadata.vulnerabilities.moderate,
        low: audit.metadata.vulnerabilities.low
      };
    } catch {
      return null;
    }
  }

  async installDependencies() {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const packageManager = this.lockFile || 'npm';
      const child = spawn(packageManager, ['install'], {
        stdio: 'inherit',
        shell: true
      });

      child.on('close', code => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`安装失败,退出码 ${code}`));
        }
      });
    });
  }
}
```

## 环境配置

### 配置系统

```javascript
class EnvironmentConfig {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.config = {};
    this.configSources = [];
  }

  async initialize() {
    // 按优先级顺序从多个来源加载
    await this.loadEnvironmentVariables();
    await this.loadDotEnv();
    await this.loadConfigFile();
    await this.loadUserConfig();
    await this.loadProjectConfig();

    // 合并和验证
    this.config = this.mergeConfigs();
    this.validateConfig();

    return this.config;
  }

  async loadEnvironmentVariables() {
    // 系统环境变量
    const envConfig = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-3-opus-20240229',
      CLAUDE_MAX_TOKENS: parseInt(process.env.CLAUDE_MAX_TOKENS || '4096'),
      DEBUG: process.env.DEBUG === 'true',
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      NO_COLOR: process.env.NO_COLOR === 'true',
      CI: process.env.CI === 'true'
    };

    this.configSources.push({
      source: 'environment',
      config: envConfig
    });
  }

  async loadDotEnv() {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // 加载 .env 文件(如果存在)
      const envPath = path.join(process.cwd(), '.env');
      const envContent = await fs.readFile(envPath, 'utf8');

      const envConfig = {};
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          envConfig[key] = value;
        }
      });

      this.configSources.push({
        source: 'dotenv',
        config: envConfig
      });
    } catch {
      // 未找到 .env 文件,跳过
    }
  }

  async loadConfigFile() {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // 加载 claude-code.config.json(如果存在)
      const configPath = path.join(process.cwd(), 'claude-code.config.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);

      this.configSources.push({
        source: 'config-file',
        config
      });
    } catch {
      // 未找到配置文件,跳过
    }
  }

  async loadUserConfig() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    try {
      // 加载用户级配置
      const homeDir = os.homedir();
      const userConfigPath = path.join(homeDir, '.claude-code', 'config.json');
      const configContent = await fs.readFile(userConfigPath, 'utf8');
      const config = JSON.parse(configContent);

      this.configSources.push({
        source: 'user-config',
        config
      });
    } catch {
      // 未找到用户配置,跳过
    }
  }

  async loadProjectConfig() {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // 加载项目特定配置
      const projectConfigPath = path.join(process.cwd(), '.claude-code', 'config.json');
      const configContent = await fs.readFile(projectConfigPath, 'utf8');
      const config = JSON.parse(configContent);

      this.configSources.push({
        source: 'project-config',
        config
      });
    } catch {
      // 未找到项目配置,跳过
    }
  }

  mergeConfigs() {
    // 按优先级顺序合并配置(后面的来源覆盖前面的)
    let merged = {};

    for (const { config } of this.configSources) {
      merged = { ...merged, ...config };
    }

    // 应用环境特定覆盖
    if (this.env === 'development') {
      merged.DEBUG = merged.DEBUG !== false;
      merged.LOG_LEVEL = merged.LOG_LEVEL || 'debug';
    } else if (this.env === 'production') {
      merged.DEBUG = false;
      merged.LOG_LEVEL = merged.LOG_LEVEL || 'error';
    } else if (this.env === 'test') {
      merged.LOG_LEVEL = 'silent';
      merged.NO_COLOR = true;
    }

    return merged;
  }

  validateConfig() {
    const errors = [];

    // 必需配置
    if (!this.config.ANTHROPIC_API_KEY) {
      errors.push('需要 ANTHROPIC_API_KEY');
    }

    // 验证 API 密钥格式
    if (this.config.ANTHROPIC_API_KEY &&
        !this.config.ANTHROPIC_API_KEY.startsWith('sk-')) {
      errors.push('无效的 ANTHROPIC_API_KEY 格式');
    }

    // 验证模型
    const validModels = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0'
    ];

    if (this.config.CLAUDE_MODEL &&
        !validModels.includes(this.config.CLAUDE_MODEL)) {
      errors.push(`无效的模型: ${this.config.CLAUDE_MODEL}`);
    }

    // 验证令牌限制
    if (this.config.CLAUDE_MAX_TOKENS &&
        (this.config.CLAUDE_MAX_TOKENS < 1 ||
         this.config.CLAUDE_MAX_TOKENS > 200000)) {
      errors.push('CLAUDE_MAX_TOKENS 必须在 1 到 200000 之间');
    }

    if (errors.length > 0) {
      throw new Error(`配置错误:\n${errors.join('\n')}`);
    }
  }
}
```

## 开发脚本

### NPM 脚本配置

```javascript
// package.json scripts 部分
{
  "scripts": {
    // 主要执行
    "start": "node src/cli/main.js",
    "chat": "node src/cli/main.js chat",
    "ask": "node src/cli/main.js ask",

    // 开发
    "dev": "NODE_ENV=development node --watch src/cli/main.js",
    "debug": "NODE_ENV=development DEBUG=true node --inspect src/cli/main.js",

    // 测试
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:integration": "node tests/integration/comprehensive-test.js",

    // 代码质量
    "lint": "eslint src/**/*.js",
    "lint:fix": "eslint src/**/*.js --fix",
    "format": "prettier --write src/**/*.js",
    "format:check": "prettier --check src/**/*.js",

    // 构建和部署
    "build": "esbuild src/cli/main.js --bundle --platform=node --outfile=dist/claude-code.js",
    "build:min": "esbuild src/cli/main.js --bundle --minify --platform=node --outfile=dist/claude-code.min.js",
    "package": "npm run build && npm pack",

    // 文档
    "docs": "jsdoc -c jsdoc.config.json",
    "docs:serve": "npx http-server docs -p 8080",

    // 工具
    "clean": "rm -rf node_modules dist coverage",
    "reinstall": "npm run clean && npm install",
    "check-deps": "npm outdated",
    "audit": "npm audit",
    "audit:fix": "npm audit fix"
  }
}
```

### 自定义开发脚本

```javascript
class DevelopmentScripts {
  static async runScript(scriptName, args = []) {
    const { spawn } = await import('child_process');
    const scripts = {
      // 带热重载的开发服务器
      'dev-server': {
        command: 'nodemon',
        args: [
          '--watch', 'src',
          '--ext', 'js,json',
          '--exec', 'node src/cli/main.js',
          ...args
        ]
      },

      // 带性能分析运行
      'profile': {
        command: 'node',
        args: [
          '--prof',
          '--prof-process',
          'src/cli/main.js',
          ...args
        ]
      },

      // 内存泄漏检测
      'check-leaks': {
        command: 'node',
        args: [
          '--expose-gc',
          '--trace-gc',
          'src/cli/main.js',
          ...args
        ]
      },

      // 打包分析
      'analyze': {
        command: 'esbuild',
        args: [
          'src/cli/main.js',
          '--bundle',
          '--analyze',
          '--platform=node',
          ...args
        ]
      },

      // 类型检查(使用 JSDoc)
      'typecheck': {
        command: 'tsc',
        args: [
          '--allowJs',
          '--checkJs',
          '--noEmit',
          'src/**/*.js',
          ...args
        ]
      }
    };

    const script = scripts[scriptName];
    if (!script) {
      throw new Error(`未知脚本: ${scriptName}`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(script.command, script.args, {
        stdio: 'inherit',
        shell: true
      });

      child.on('close', code => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`脚本失败,退出码 ${code}`));
        }
      });
    });
  }
}
```

## IDE 集成

### VSCode 配置

```javascript
// .vscode/settings.json
const vscodeSettings = {
  // JavaScript 设置
  "javascript.preferences.quoteStyle": "single",
  "javascript.updateImportsOnFileMove.enabled": "always",
  "javascript.suggest.autoImports": true,

  // ESLint 集成
  "eslint.enable": true,
  "eslint.autoFixOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },

  // Prettier 集成
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,

  // 文件关联
  "files.associations": {
    "*.js": "javascript",
    "*.json": "jsonc",
    "*.md": "markdown"
  },

  // 排除模式
  "files.exclude": {
    "node_modules": true,
    "dist": true,
    "coverage": true,
    ".nyc_output": true
  },

  // 搜索排除
  "search.exclude": {
    "node_modules": true,
    "dist": true,
    "package-lock.json": true
  }
};

// .vscode/launch.json
const vscodeDebugConfig = {
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "调试 CLI",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/cli/main.js",
      "args": ["chat"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "true"
      }
    },
    {
      "type": "node",
      "request": "launch",
      "name": "调试测试",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/tests/integration/comprehensive-test.js"
    },
    {
      "type": "node",
      "request": "attach",
      "name": "附加到进程",
      "port": 9229,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
};

// .vscode/tasks.json
const vscodeTasks = {
  "version": "2.0.0",
  "tasks": [
    {
      "label": "运行测试",
      "type": "npm",
      "script": "test",
      "group": {
        "kind": "test",
        "isDefault": true
      },
      "problemMatcher": []
    },
    {
      "label": "代码检查",
      "type": "npm",
      "script": "lint",
      "problemMatcher": ["$eslint-stylish"]
    },
    {
      "label": "构建",
      "type": "npm",
      "script": "build",
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "problemMatcher": []
    }
  ]
};
```

### ESLint 配置

```javascript
// .eslintrc.js
module.exports = {
  env: {
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // 代码风格
    'indent': ['error', 2],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],

    // 最佳实践
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],

    // ES6
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-template': 'error',
    'no-var': 'error',

    // 异步
    'no-async-promise-executor': 'error',
    'require-await': 'warn'
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'coverage/'
  ]
};
```

### Prettier 配置

```javascript
// .prettierrc.js
module.exports = {
  // 行长度
  printWidth: 80,

  // 制表符
  tabWidth: 2,
  useTabs: false,

  // 分号
  semi: true,

  // 引号
  singleQuote: true,
  quoteProps: 'as-needed',

  // 尾随逗号
  trailingComma: 'es5',

  // 括号
  bracketSpacing: true,
  bracketSameLine: false,

  // 箭头函数
  arrowParens: 'avoid',

  // 嵌入格式
  embeddedLanguageFormatting: 'auto',

  // 行尾
  endOfLine: 'lf'
};
```

## 开发工作流

### Git 工作流

```javascript
class GitWorkflow {
  static async setupGitHooks() {
    const fs = await import('fs/promises');
    const path = await import('path');

    // 预提交钩子
    const preCommitHook = `#!/bin/sh
# 运行代码检查
npm run lint || exit 1

# 运行测试
npm test || exit 1

# 检查格式
npm run format:check || exit 1

echo "✅ 预提交检查通过"
`;

    // 预推送钩子
    const prePushHook = `#!/bin/sh
# 运行集成测试
npm run test:integration || exit 1

# 检查安全漏洞
npm audit || exit 1

echo "✅ 预推送检查通过"
`;

    // 提交消息钩子
    const commitMsgHook = `#!/bin/sh
# 验证提交消息格式
commit_regex='^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{1,50}'
commit_message=$(cat $1)

if ! echo "$commit_message" | grep -qE "$commit_regex"; then
  echo "❌ 无效的提交消息格式"
  echo "格式: <类型>(<范围>): <主题>"
  echo "示例: feat(cli): 添加新命令"
  exit 1
fi

echo "✅ 提交消息已验证"
`;

    // 安装钩子
    const hooksDir = path.join(process.cwd(), '.git', 'hooks');

    await fs.writeFile(
      path.join(hooksDir, 'pre-commit'),
      preCommitHook,
      { mode: 0o755 }
    );

    await fs.writeFile(
      path.join(hooksDir, 'pre-push'),
      prePushHook,
      { mode: 0o755 }
    );

    await fs.writeFile(
      path.join(hooksDir, 'commit-msg'),
      commitMsgHook,
      { mode: 0o755 }
    );

    console.log('Git 钩子安装成功');
  }

  static async checkBranch() {
    const { execSync } = await import('child_process');

    const currentBranch = execSync('git branch --show-current', {
      encoding: 'utf8'
    }).trim();

    const protectedBranches = ['main', 'master', 'production'];

    if (protectedBranches.includes(currentBranch)) {
      console.warn(`⚠️  在受保护分支上工作: ${currentBranch}`);
      console.warn('考虑创建功能分支');
    }

    return currentBranch;
  }
}
```

### 开发命令

```javascript
class DevelopmentCommands {
  static commands = {
    // 启动开发会话
    'dev:start': async () => {
      console.log('🚀 启动开发环境...');

      // 检查依赖
      const depManager = new DependencyManager();
      const deps = await depManager.checkDependencies();

      if (!deps.installed) {
        console.log('📦 安装依赖...');
        await depManager.installDependencies();
      }

      // 检查环境
      const envConfig = new EnvironmentConfig();
      await envConfig.initialize();

      // 启动开发服务器
      await DevelopmentScripts.runScript('dev-server');
    },

    // 运行质量检查
    'dev:check': async () => {
      console.log('🔍 运行质量检查...');

      const { execSync } = await import('child_process');

      // 代码检查
      console.log('📝 检查代码...');
      execSync('npm run lint', { stdio: 'inherit' });

      // 格式检查
      console.log('🎨 检查格式...');
      execSync('npm run format:check', { stdio: 'inherit' });

      // 测试
      console.log('🧪 运行测试...');
      execSync('npm test', { stdio: 'inherit' });

      // 安全检查
      console.log('🔒 检查安全性...');
      execSync('npm audit', { stdio: 'inherit' });

      console.log('✅ 所有检查通过!');
    },

    // 生成文档
    'dev:docs': async () => {
      console.log('📚 生成文档...');

      const { execSync } = await import('child_process');

      execSync('npm run docs', { stdio: 'inherit' });
      console.log('📖 文档已生成在 docs/');

      console.log('🌐 启动文档服务器...');
      execSync('npm run docs:serve', { stdio: 'inherit' });
    },

    // 性能分析
    'dev:profile': async () => {
      console.log('📊 开始性能分析...');

      await DevelopmentScripts.runScript('profile', ['chat']);

      console.log('📈 已生成性能数据');
      console.log('使用 Chrome DevTools 或 clinic.js 进行分析');
    }
  };

  static async run(command) {
    const cmd = this.commands[command];
    if (!cmd) {
      throw new Error(`未知的开发命令: ${command}`);
    }

    await cmd();
  }
}
```

## 性能影响

### 开发性能监控

```javascript
class DevelopmentPerformance {
  static async measureStartupTime() {
    const startTime = process.hrtime.bigint();

    // 加载主模块
    await import('../src/cli/main.js');

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1e6; // 转换为毫秒

    return {
      startupTime: duration,
      threshold: 500, // 目标: < 500ms
      status: duration < 500 ? '良好' : '需要改进'
    };
  }

  static async measureBundleSize() {
    const fs = await import('fs/promises');
    const path = await import('path');

    const results = {};

    // 测量源代码大小
    const srcDir = path.join(process.cwd(), 'src');
    results.sourceSize = await this.getDirectorySize(srcDir);

    // 测量依赖大小
    const nodeModulesDir = path.join(process.cwd(), 'node_modules');
    results.dependenciesSize = await this.getDirectorySize(nodeModulesDir);

    // 测量打包大小(如果存在)
    const bundlePath = path.join(process.cwd(), 'dist', 'claude-code.js');
    try {
      const stats = await fs.stat(bundlePath);
      results.bundleSize = stats.size;
    } catch {
      results.bundleSize = null;
    }

    return {
      ...results,
      totalSize: results.sourceSize + results.dependenciesSize,
      recommendations: this.getSizeRecommendations(results)
    };
  }

  static async getDirectorySize(dir) {
    const fs = await import('fs/promises');
    const path = await import('path');

    let size = 0;

    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
          size += await this.getDirectorySize(filePath);
        } else {
          size += stats.size;
        }
      }
    } catch {
      // 目录不存在或无法读取
    }

    return size;
  }

  static getSizeRecommendations(results) {
    const recommendations = [];

    // 检查源代码大小
    if (results.sourceSize > 10 * 1024 * 1024) { // 10MB
      recommendations.push('考虑将源代码拆分为更小的模块');
    }

    // 检查依赖大小
    if (results.dependenciesSize > 100 * 1024 * 1024) { // 100MB
      recommendations.push('依赖较大。检查并移除未使用的包');
    }

    // 检查打包大小
    if (results.bundleSize && results.bundleSize > 5 * 1024 * 1024) { // 5MB
      recommendations.push('打包大小较大。考虑代码拆分或树摇优化');
    }

    return recommendations;
  }

  static async analyzeModuleLoad() {
    const Module = await import('module');
    const originalRequire = Module.prototype.require;
    const loadTimes = new Map();

    // 修补 require 以测量加载时间
    Module.prototype.require = function(id) {
      const startTime = process.hrtime.bigint();
      const result = originalRequire.apply(this, arguments);
      const endTime = process.hrtime.bigint();

      const duration = Number(endTime - startTime) / 1e6;
      loadTimes.set(id, duration);

      return result;
    };

    // 加载应用程序
    await import('../src/cli/main.js');

    // 恢复原始 require
    Module.prototype.require = originalRequire;

    // 分析结果
    const slowModules = [];
    for (const [module, time] of loadTimes) {
      if (time > 100) { // 加载时间超过 100ms 的模块
        slowModules.push({ module, time });
      }
    }

    return {
      totalModules: loadTimes.size,
      totalLoadTime: Array.from(loadTimes.values()).reduce((a, b) => a + b, 0),
      slowModules: slowModules.sort((a, b) => b.time - a.time).slice(0, 10)
    };
  }
}
```

## 总结

Claude Code 开发环境为构建和维护 AI 驱动的 CLI 应用程序提供了全面的设置。主要特性包括:

1. **平台独立性**:支持 macOS、Linux 和 Windows,提供平台特定配置
2. **现代 JavaScript**:全程使用 ES6 模块,具有适当的导入/导出语法
3. **依赖管理**:自动依赖检查和安装,带安全审计
4. **配置系统**:多源配置,带环境特定覆盖
5. **开发脚本**:用于开发、测试和部署的全面 NPM 脚本
6. **IDE 集成**:全面支持 VSCode,包括调试、代码检查和格式化
7. **质量保证**:集成 ESLint 和 Prettier,带 Git 钩子
8. **性能监控**:开发时性能跟踪和优化

该环境支持快速开发迭代和生产就绪构建,重点关注可维护性和代码质量。

## 下一步

在下一节中,我们将探讨用于确保 Claude Code 系统可靠性和正确性的测试框架和策略。

---

*Claude Code 技术系列的一部分 - 开发工具*