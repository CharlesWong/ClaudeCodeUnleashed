# Part 9.1: Development Environment Setup

## Introduction

The Claude Code CLI development environment provides a comprehensive setup for building, testing, debugging, and deploying AI-powered command-line applications. This chapter explores the development tooling, environment configuration, and workflows that enable efficient development of the Claude Code system.

## Table of Contents
1. [Environment Prerequisites](#environment-prerequisites)
2. [Project Structure](#project-structure)
3. [Development Dependencies](#development-dependencies)
4. [Environment Configuration](#environment-configuration)
5. [Development Scripts](#development-scripts)
6. [IDE Integration](#ide-integration)
7. [Development Workflow](#development-workflow)
8. [Performance Implications](#performance-implications)

## Environment Prerequisites

### Node.js Requirements

```javascript
// package.json configuration
{
  "engines": {
    "node": ">=16.0.0"  // Minimum Node.js version
  }
}
```

### Platform Support

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

    // Check platform
    if (!supportedPlatforms.includes(this.platform)) {
      issues.push(`Unsupported platform: ${this.platform}`);
    }

    // Check architecture
    if (!supportedArchitectures.includes(this.arch)) {
      issues.push(`Unsupported architecture: ${this.arch}`);
    }

    // Check Node.js version
    const minVersion = 16;
    const currentVersion = parseInt(this.nodeVersion.slice(1).split('.')[0]);

    if (currentVersion < minVersion) {
      issues.push(`Node.js version ${this.nodeVersion} is below minimum v${minVersion}`);
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

## Project Structure

### Directory Organization

```javascript
class ProjectStructure {
  static getStructure() {
    return {
      root: '/',
      src: {
        cli: {
          'main.js': 'Entry point for CLI application',
          agents: {
            'agent-orchestrator.js': 'Agent management system',
            'general.js': 'General-purpose agent',
            'output-style.js': 'Output style configuration agent',
            'status-line.js': 'Status line configuration agent',
            'loop-implementations.js': 'Conversation loop implementations',
            'loop-supporting-functions.js': 'Support functions for loops',
            'main-conversation-loop.js': 'Main conversation handler'
          },
          ui: {
            'terminal.js': 'Terminal UI implementation',
            'markdown.js': 'Markdown rendering',
            'progress.js': 'Progress indicators',
            'status-line.js': 'Status line display'
          }
        },
        sdk: {
          core: {
            'Application.js': 'Core application class',
            'EventBus.js': 'Event system',
            'react.js': 'React-like components'
          },
          services: {
            'ConfigService.js': 'Configuration management',
            'ApiService.js': 'API client service'
          },
          utils: {
            'circular-buffer.js': 'Circular buffer implementation',
            'command-parser.js': 'Command parsing utilities',
            'process-helpers.js': 'Process management helpers',
            'shell-info.js': 'Shell information utilities',
            'logger.js': 'Logging utilities',
            'config.js': 'Configuration helpers'
          }
        },
        tools: {
          'index.js': 'Tool registry and exports',
          'bash.js': 'Bash command execution',
          'bash-implementation.js': 'Bash implementation details',
          'shell-management.js': 'Shell session management',
          'read.js': 'File reading tool',
          'write.js': 'File writing tool',
          'edit.js': 'File editing tool',
          'grep.js': 'Pattern searching tool',
          'glob.js': 'File globbing tool',
          'webfetch.js': 'Web fetching tool',
          'websearch.js': 'Web searching tool',
          'task.js': 'Task execution tool'
        },
        api: {
          'client.js': 'API client implementation',
          'streaming.js': 'Stream processing',
          'errors.js': 'Error definitions',
          'messages.js': 'Message handling',
          'rate-limiting.js': 'Rate limit management'
        }
      },
      tests: {
        integration: {
          'comprehensive-test.js': 'Comprehensive test suite',
          'full-functionality-test.js': 'Full functionality tests'
        },
        unit: {
          'circular-buffer.test.js': 'Circular buffer tests',
          'command-parser.test.js': 'Command parser tests',
          'shell-info.test.js': 'Shell info tests'
        }
      },
      docs: {
        'INDEX.md': 'Documentation index',
        'architecture-reference': 'Architecture documentation',
        'deobfuscation-process': 'Deobfuscation documentation'
      },
      'package.json': 'Project configuration',
      'README.md': 'Project documentation',
      '.gitignore': 'Git ignore configuration',
      'CLAUDE.md': 'Claude-specific instructions'
    };
  }

  static validateStructure() {
    const fs = require('fs');
    const path = require('path');

    const errors = [];
    const warnings = [];

    // Check critical directories
    const criticalDirs = [
      'src/cli',
      'src/sdk',
      'src/tools',
      'src/api'
    ];

    for (const dir of criticalDirs) {
      if (!fs.existsSync(dir)) {
        errors.push(`Missing critical directory: ${dir}`);
      }
    }

    // Check critical files
    const criticalFiles = [
      'src/cli/main.js',
      'src/tools/index.js',
      'package.json'
    ];

    for (const file of criticalFiles) {
      if (!fs.existsSync(file)) {
        errors.push(`Missing critical file: ${file}`);
      }
    }

    // Check optional but recommended
    const recommendedFiles = [
      'README.md',
      '.gitignore',
      'tests/integration/comprehensive-test.js'
    ];

    for (const file of recommendedFiles) {
      if (!fs.existsSync(file)) {
        warnings.push(`Missing recommended file: ${file}`);
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

## Development Dependencies

### Package Configuration

```javascript
// package.json
{
  "name": "claude-code-cli",
  "version": "1.0.115",
  "description": "Claude Code CLI - AI-powered development assistant",
  "main": "src/cli/main.js",
  "type": "module",  // ES6 modules

  "dependencies": {
    // API and networking
    "axios": "^1.6.0",

    // CLI utilities
    "chalk": "^4.1.2",
    "commander": "^11.0.0",
    "inquirer": "^8.2.6",

    // Markdown and syntax highlighting
    "marked": "^9.0.0",
    "marked-terminal": "^6.0.0",
    "cli-highlight": "^2.1.11",

    // UI components
    "cli-table3": "^0.6.3",
    "ora": "^5.4.1",

    // Configuration and validation
    "dotenv": "^16.0.3",
    "zod": "^3.22.0"
  },

  "devDependencies": {
    // Code quality
    "eslint": "^8.50.0",
    "prettier": "^3.0.0",

    // Testing (to be added)
    "@types/node": "^20.0.0",
    "vitest": "^0.34.0",

    // Build tools (to be added)
    "esbuild": "^0.19.0",
    "tsup": "^7.0.0"
  }
}
```

### Dependency Manager

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
      // Load package.json
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageContent = await fs.readFile(packagePath, 'utf8');
      this.packageJson = JSON.parse(packageContent);

      // Check for lock file
      const npmLockPath = path.join(process.cwd(), 'package-lock.json');
      const yarnLockPath = path.join(process.cwd(), 'yarn.lock');

      if (await fs.access(npmLockPath).then(() => true).catch(() => false)) {
        this.lockFile = 'npm';
      } else if (await fs.access(yarnLockPath).then(() => true).catch(() => false)) {
        this.lockFile = 'yarn';
      }

      // Verify installed dependencies
      const nodeModulesPath = path.join(process.cwd(), 'node_modules');
      const hasNodeModules = await fs.access(nodeModulesPath)
        .then(() => true)
        .catch(() => false);

      if (!hasNodeModules) {
        return {
          installed: false,
          message: 'Dependencies not installed. Run npm install or yarn install.'
        };
      }

      // Check for outdated dependencies
      const outdated = this.checkOutdated();

      // Check for security vulnerabilities
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
          reject(new Error(`Installation failed with code ${code}`));
        }
      });
    });
  }
}
```

## Environment Configuration

### Configuration System

```javascript
class EnvironmentConfig {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.config = {};
    this.configSources = [];
  }

  async initialize() {
    // Load from multiple sources in priority order
    await this.loadEnvironmentVariables();
    await this.loadDotEnv();
    await this.loadConfigFile();
    await this.loadUserConfig();
    await this.loadProjectConfig();

    // Merge and validate
    this.config = this.mergeConfigs();
    this.validateConfig();

    return this.config;
  }

  async loadEnvironmentVariables() {
    // System environment variables
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
      // Load .env file if it exists
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
      // .env file not found, skip
    }
  }

  async loadConfigFile() {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // Load claude-code.config.json if it exists
      const configPath = path.join(process.cwd(), 'claude-code.config.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);

      this.configSources.push({
        source: 'config-file',
        config
      });
    } catch {
      // Config file not found, skip
    }
  }

  async loadUserConfig() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    try {
      // Load user-level config
      const homeDir = os.homedir();
      const userConfigPath = path.join(homeDir, '.claude-code', 'config.json');
      const configContent = await fs.readFile(userConfigPath, 'utf8');
      const config = JSON.parse(configContent);

      this.configSources.push({
        source: 'user-config',
        config
      });
    } catch {
      // User config not found, skip
    }
  }

  async loadProjectConfig() {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // Load project-specific config
      const projectConfigPath = path.join(process.cwd(), '.claude-code', 'config.json');
      const configContent = await fs.readFile(projectConfigPath, 'utf8');
      const config = JSON.parse(configContent);

      this.configSources.push({
        source: 'project-config',
        config
      });
    } catch {
      // Project config not found, skip
    }
  }

  mergeConfigs() {
    // Merge configs in priority order (later sources override earlier)
    let merged = {};

    for (const { config } of this.configSources) {
      merged = { ...merged, ...config };
    }

    // Apply environment-specific overrides
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

    // Required configurations
    if (!this.config.ANTHROPIC_API_KEY) {
      errors.push('ANTHROPIC_API_KEY is required');
    }

    // Validate API key format
    if (this.config.ANTHROPIC_API_KEY &&
        !this.config.ANTHROPIC_API_KEY.startsWith('sk-')) {
      errors.push('Invalid ANTHROPIC_API_KEY format');
    }

    // Validate model
    const validModels = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0'
    ];

    if (this.config.CLAUDE_MODEL &&
        !validModels.includes(this.config.CLAUDE_MODEL)) {
      errors.push(`Invalid model: ${this.config.CLAUDE_MODEL}`);
    }

    // Validate token limit
    if (this.config.CLAUDE_MAX_TOKENS &&
        (this.config.CLAUDE_MAX_TOKENS < 1 ||
         this.config.CLAUDE_MAX_TOKENS > 200000)) {
      errors.push('CLAUDE_MAX_TOKENS must be between 1 and 200000');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration errors:\n${errors.join('\n')}`);
    }
  }
}
```

## Development Scripts

### NPM Script Configuration

```javascript
// package.json scripts section
{
  "scripts": {
    // Main execution
    "start": "node src/cli/main.js",
    "chat": "node src/cli/main.js chat",
    "ask": "node src/cli/main.js ask",

    // Development
    "dev": "NODE_ENV=development node --watch src/cli/main.js",
    "debug": "NODE_ENV=development DEBUG=true node --inspect src/cli/main.js",

    // Testing
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:integration": "node tests/integration/comprehensive-test.js",

    // Code quality
    "lint": "eslint src/**/*.js",
    "lint:fix": "eslint src/**/*.js --fix",
    "format": "prettier --write src/**/*.js",
    "format:check": "prettier --check src/**/*.js",

    // Build and deployment
    "build": "esbuild src/cli/main.js --bundle --platform=node --outfile=dist/claude-code.js",
    "build:min": "esbuild src/cli/main.js --bundle --minify --platform=node --outfile=dist/claude-code.min.js",
    "package": "npm run build && npm pack",

    // Documentation
    "docs": "jsdoc -c jsdoc.config.json",
    "docs:serve": "npx http-server docs -p 8080",

    // Utilities
    "clean": "rm -rf node_modules dist coverage",
    "reinstall": "npm run clean && npm install",
    "check-deps": "npm outdated",
    "audit": "npm audit",
    "audit:fix": "npm audit fix"
  }
}
```

### Custom Development Scripts

```javascript
class DevelopmentScripts {
  static async runScript(scriptName, args = []) {
    const { spawn } = await import('child_process');
    const scripts = {
      // Development server with hot reload
      'dev-server': {
        command: 'nodemon',
        args: [
          '--watch', 'src',
          '--ext', 'js,json',
          '--exec', 'node src/cli/main.js',
          ...args
        ]
      },

      // Run with profiling
      'profile': {
        command: 'node',
        args: [
          '--prof',
          '--prof-process',
          'src/cli/main.js',
          ...args
        ]
      },

      // Memory leak detection
      'check-leaks': {
        command: 'node',
        args: [
          '--expose-gc',
          '--trace-gc',
          'src/cli/main.js',
          ...args
        ]
      },

      // Bundle analysis
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

      // Type checking (with JSDoc)
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
      throw new Error(`Unknown script: ${scriptName}`);
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
          reject(new Error(`Script failed with code ${code}`));
        }
      });
    });
  }
}
```

## IDE Integration

### VSCode Configuration

```javascript
// .vscode/settings.json
const vscodeSettings = {
  // JavaScript settings
  "javascript.preferences.quoteStyle": "single",
  "javascript.updateImportsOnFileMove.enabled": "always",
  "javascript.suggest.autoImports": true,

  // ESLint integration
  "eslint.enable": true,
  "eslint.autoFixOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },

  // Prettier integration
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,

  // File associations
  "files.associations": {
    "*.js": "javascript",
    "*.json": "jsonc",
    "*.md": "markdown"
  },

  // Exclude patterns
  "files.exclude": {
    "node_modules": true,
    "dist": true,
    "coverage": true,
    ".nyc_output": true
  },

  // Search exclude
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
      "name": "Debug CLI",
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
      "name": "Debug Tests",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/tests/integration/comprehensive-test.js"
    },
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Process",
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
      "label": "Run Tests",
      "type": "npm",
      "script": "test",
      "group": {
        "kind": "test",
        "isDefault": true
      },
      "problemMatcher": []
    },
    {
      "label": "Lint",
      "type": "npm",
      "script": "lint",
      "problemMatcher": ["$eslint-stylish"]
    },
    {
      "label": "Build",
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

### ESLint Configuration

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
    // Code style
    'indent': ['error', 2],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],

    // Best practices
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

    // Async
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

### Prettier Configuration

```javascript
// .prettierrc.js
module.exports = {
  // Line length
  printWidth: 80,

  // Tabs
  tabWidth: 2,
  useTabs: false,

  // Semicolons
  semi: true,

  // Quotes
  singleQuote: true,
  quoteProps: 'as-needed',

  // Trailing commas
  trailingComma: 'es5',

  // Brackets
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow functions
  arrowParens: 'avoid',

  // Format embedded
  embeddedLanguageFormatting: 'auto',

  // Line endings
  endOfLine: 'lf'
};
```

## Development Workflow

### Git Workflow

```javascript
class GitWorkflow {
  static async setupGitHooks() {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Pre-commit hook
    const preCommitHook = `#!/bin/sh
# Run linting
npm run lint || exit 1

# Run tests
npm test || exit 1

# Check formatting
npm run format:check || exit 1

echo "✅ Pre-commit checks passed"
`;

    // Pre-push hook
    const prePushHook = `#!/bin/sh
# Run integration tests
npm run test:integration || exit 1

# Check for security vulnerabilities
npm audit || exit 1

echo "✅ Pre-push checks passed"
`;

    // Commit message hook
    const commitMsgHook = `#!/bin/sh
# Validate commit message format
commit_regex='^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{1,50}'
commit_message=$(cat $1)

if ! echo "$commit_message" | grep -qE "$commit_regex"; then
  echo "❌ Invalid commit message format"
  echo "Format: <type>(<scope>): <subject>"
  echo "Example: feat(cli): add new command"
  exit 1
fi

echo "✅ Commit message validated"
`;

    // Install hooks
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

    console.log('Git hooks installed successfully');
  }

  static async checkBranch() {
    const { execSync } = await import('child_process');

    const currentBranch = execSync('git branch --show-current', {
      encoding: 'utf8'
    }).trim();

    const protectedBranches = ['main', 'master', 'production'];

    if (protectedBranches.includes(currentBranch)) {
      console.warn(`⚠️  Working on protected branch: ${currentBranch}`);
      console.warn('Consider creating a feature branch');
    }

    return currentBranch;
  }
}
```

### Development Commands

```javascript
class DevelopmentCommands {
  static commands = {
    // Start development session
    'dev:start': async () => {
      console.log('🚀 Starting development environment...');

      // Check dependencies
      const depManager = new DependencyManager();
      const deps = await depManager.checkDependencies();

      if (!deps.installed) {
        console.log('📦 Installing dependencies...');
        await depManager.installDependencies();
      }

      // Check environment
      const envConfig = new EnvironmentConfig();
      await envConfig.initialize();

      // Start development server
      await DevelopmentScripts.runScript('dev-server');
    },

    // Run quality checks
    'dev:check': async () => {
      console.log('🔍 Running quality checks...');

      const { execSync } = await import('child_process');

      // Linting
      console.log('📝 Linting code...');
      execSync('npm run lint', { stdio: 'inherit' });

      // Formatting
      console.log('🎨 Checking formatting...');
      execSync('npm run format:check', { stdio: 'inherit' });

      // Tests
      console.log('🧪 Running tests...');
      execSync('npm test', { stdio: 'inherit' });

      // Security
      console.log('🔒 Checking security...');
      execSync('npm audit', { stdio: 'inherit' });

      console.log('✅ All checks passed!');
    },

    // Generate documentation
    'dev:docs': async () => {
      console.log('📚 Generating documentation...');

      const { execSync } = await import('child_process');

      execSync('npm run docs', { stdio: 'inherit' });
      console.log('📖 Documentation generated in docs/');

      console.log('🌐 Starting documentation server...');
      execSync('npm run docs:serve', { stdio: 'inherit' });
    },

    // Profile performance
    'dev:profile': async () => {
      console.log('📊 Starting performance profiling...');

      await DevelopmentScripts.runScript('profile', ['chat']);

      console.log('📈 Profile data generated');
      console.log('Use Chrome DevTools or clinic.js to analyze');
    }
  };

  static async run(command) {
    const cmd = this.commands[command];
    if (!cmd) {
      throw new Error(`Unknown development command: ${command}`);
    }

    await cmd();
  }
}
```

## Performance Implications

### Development Performance Monitoring

```javascript
class DevelopmentPerformance {
  static async measureStartupTime() {
    const startTime = process.hrtime.bigint();

    // Load main module
    await import('../src/cli/main.js');

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1e6; // Convert to ms

    return {
      startupTime: duration,
      threshold: 500, // Target: < 500ms
      status: duration < 500 ? 'good' : 'needs improvement'
    };
  }

  static async measureBundleSize() {
    const fs = await import('fs/promises');
    const path = await import('path');

    const results = {};

    // Measure source size
    const srcDir = path.join(process.cwd(), 'src');
    results.sourceSize = await this.getDirectorySize(srcDir);

    // Measure dependencies size
    const nodeModulesDir = path.join(process.cwd(), 'node_modules');
    results.dependenciesSize = await this.getDirectorySize(nodeModulesDir);

    // Measure bundle size if exists
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
      // Directory doesn't exist or can't be read
    }

    return size;
  }

  static getSizeRecommendations(results) {
    const recommendations = [];

    // Check source size
    if (results.sourceSize > 10 * 1024 * 1024) { // 10MB
      recommendations.push('Consider splitting source into smaller modules');
    }

    // Check dependencies size
    if (results.dependenciesSize > 100 * 1024 * 1024) { // 100MB
      recommendations.push('Dependencies are large. Review and remove unused packages');
    }

    // Check bundle size
    if (results.bundleSize && results.bundleSize > 5 * 1024 * 1024) { // 5MB
      recommendations.push('Bundle size is large. Consider code splitting or tree shaking');
    }

    return recommendations;
  }

  static async analyzeModuleLoad() {
    const Module = await import('module');
    const originalRequire = Module.prototype.require;
    const loadTimes = new Map();

    // Monkey-patch require to measure load times
    Module.prototype.require = function(id) {
      const startTime = process.hrtime.bigint();
      const result = originalRequire.apply(this, arguments);
      const endTime = process.hrtime.bigint();

      const duration = Number(endTime - startTime) / 1e6;
      loadTimes.set(id, duration);

      return result;
    };

    // Load application
    await import('../src/cli/main.js');

    // Restore original require
    Module.prototype.require = originalRequire;

    // Analyze results
    const slowModules = [];
    for (const [module, time] of loadTimes) {
      if (time > 100) { // Modules taking >100ms to load
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

## Summary

The Claude Code development environment provides a comprehensive setup for building and maintaining the AI-powered CLI application. Key features include:

1. **Platform Independence**: Supports macOS, Linux, and Windows with platform-specific configurations
2. **Modern JavaScript**: Uses ES6 modules throughout with proper import/export syntax
3. **Dependency Management**: Automated dependency checking and installation with security auditing
4. **Configuration System**: Multi-source configuration with environment-specific overrides
5. **Development Scripts**: Comprehensive NPM scripts for development, testing, and deployment
6. **IDE Integration**: Full VSCode support with debugging, linting, and formatting
7. **Quality Assurance**: Integrated ESLint and Prettier with Git hooks
8. **Performance Monitoring**: Development-time performance tracking and optimization

The environment supports both rapid development iteration and production-ready builds, with a focus on maintainability and code quality.

## Next Steps

In the next section, we'll explore the testing frameworks and strategies used to ensure reliability and correctness of the Claude Code system.

---

*Part of the Claude Code Technical Series - Development Tools*