/**
 * Claude Code Build System
 *
 * Comprehensive build configuration and automation for Claude Code CLI.
 * Handles webpack bundling, optimization, release automation, and CI/CD integration.
 *
 * Extracted from claude-code-full-extract.js (lines ~42000-42800)
 * Part of the 85% → 87% extraction phase
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync, spawn } from 'child_process';
import { createHash } from 'crypto';

/**
 * Build Configuration Manager
 * Manages build settings, environments, and targets
 */
export class BuildConfig {
  constructor(options = {}) {
    this.mode = options.mode || process.env.NODE_ENV || 'development';
    this.target = options.target || 'node';
    this.platform = options.platform || process.platform;
    this.arch = options.arch || process.arch;

    this.paths = {
      src: options.srcPath || './src',
      dist: options.distPath || './dist',
      cache: options.cachePath || './.cache',
      temp: options.tempPath || './.tmp',
      assets: options.assetsPath || './assets'
    };

    this.optimization = {
      minimize: this.mode === 'production',
      splitChunks: options.splitChunks !== false,
      treeShaking: options.treeShaking !== false,
      sideEffects: false,
      concatenateModules: true,
      removeAvailableModules: true,
      removeEmptyChunks: true
    };

    this.output = {
      filename: options.filename || 'claude-code.js',
      library: 'ClaudeCode',
      libraryTarget: 'commonjs2',
      globalObject: 'this',
      hashFunction: 'sha256',
      hashDigestLength: 8
    };
  }

  /**
   * Get webpack configuration
   */
  getWebpackConfig() {
    return {
      mode: this.mode,
      target: this.target,
      entry: {
        main: path.join(this.paths.src, 'index.js'),
        cli: path.join(this.paths.src, 'cli.js')
      },
      output: {
        path: path.resolve(this.paths.dist),
        filename: this.mode === 'production'
          ? '[name].[contenthash].js'
          : '[name].js',
        ...this.output
      },
      optimization: this.optimization,
      module: {
        rules: this.getModuleRules()
      },
      plugins: this.getPlugins(),
      resolve: {
        extensions: ['.js', '.json', '.node'],
        alias: this.getAliases()
      },
      externals: this.getExternals(),
      performance: {
        hints: this.mode === 'production' ? 'warning' : false,
        maxEntrypointSize: 5000000,
        maxAssetSize: 5000000
      }
    };
  }

  /**
   * Get module rules for webpack
   */
  getModuleRules() {
    return [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: [
              '@babel/plugin-transform-runtime',
              '@babel/plugin-proposal-class-properties'
            ]
          }
        }
      },
      {
        test: /\.json$/,
        type: 'json'
      },
      {
        test: /\.node$/,
        use: 'node-loader'
      }
    ];
  }

  /**
   * Get webpack plugins
   */
  getPlugins() {
    const plugins = [
      {
        name: 'DefinePlugin',
        config: {
          'process.env.NODE_ENV': JSON.stringify(this.mode),
          'process.env.VERSION': JSON.stringify(this.getVersion()),
          'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString())
        }
      }
    ];

    if (this.mode === 'production') {
      plugins.push(
        {
          name: 'TerserPlugin',
          config: {
            terserOptions: {
              compress: {
                drop_console: true,
                drop_debugger: true,
                pure_funcs: ['console.log', 'console.debug']
              },
              mangle: {
                safari10: true
              },
              output: {
                comments: false,
                ascii_only: true
              }
            }
          }
        },
        {
          name: 'CompressionPlugin',
          config: {
            algorithm: 'gzip',
            test: /\.(js|json)$/,
            threshold: 10240,
            minRatio: 0.8
          }
        }
      );
    }

    return plugins;
  }

  /**
   * Get path aliases
   */
  getAliases() {
    return {
      '@': path.resolve(this.paths.src),
      '@tools': path.resolve(this.paths.src, 'tools'),
      '@utils': path.resolve(this.paths.src, 'utils'),
      '@api': path.resolve(this.paths.src, 'api'),
      '@ui': path.resolve(this.paths.src, 'ui')
    };
  }

  /**
   * Get external dependencies
   */
  getExternals() {
    return {
      'node:fs': 'commonjs fs',
      'node:path': 'commonjs path',
      'node:child_process': 'commonjs child_process',
      'node:os': 'commonjs os',
      'node:crypto': 'commonjs crypto',
      'electron': 'commonjs electron'
    };
  }

  /**
   * Get version from package.json
   */
  getVersion() {
    try {
      const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}

/**
 * Build Pipeline
 * Orchestrates the entire build process
 */
export class BuildPipeline extends EventEmitter {
  constructor(config) {
    super();
    this.config = config instanceof BuildConfig ? config : new BuildConfig(config);
    this.steps = [];
    this.results = [];
  }

  /**
   * Add build step
   */
  addStep(name, handler) {
    this.steps.push({ name, handler });
    return this;
  }

  /**
   * Run the build pipeline
   */
  async run() {
    this.emit('start', { steps: this.steps.length });

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      this.emit('step:start', { step: step.name, index: i });

      try {
        const result = await step.handler(this.config);
        this.results.push({ step: step.name, success: true, result });
        this.emit('step:complete', { step: step.name, index: i, result });
      } catch (error) {
        this.results.push({ step: step.name, success: false, error });
        this.emit('step:error', { step: step.name, index: i, error });

        if (!this.config.continueOnError) {
          this.emit('error', { step: step.name, error });
          throw error;
        }
      }
    }

    this.emit('complete', { results: this.results });
    return this.results;
  }

  /**
   * Create standard build pipeline
   */
  static createStandard(config) {
    const pipeline = new BuildPipeline(config);

    return pipeline
      .addStep('clean', async (cfg) => {
        await fs.rm(cfg.paths.dist, { recursive: true, force: true });
        await fs.mkdir(cfg.paths.dist, { recursive: true });
      })
      .addStep('lint', async () => {
        execSync('npm run lint', { stdio: 'inherit' });
      })
      .addStep('test', async () => {
        execSync('npm test', { stdio: 'inherit' });
      })
      .addStep('build', async (cfg) => {
        const webpackConfig = cfg.getWebpackConfig();
        execSync(`webpack --config ${JSON.stringify(webpackConfig)}`, {
          stdio: 'inherit'
        });
      })
      .addStep('optimize', async (cfg) => {
        if (cfg.mode === 'production') {
          execSync(`terser ${cfg.paths.dist}/*.js -c -m -o ${cfg.paths.dist}/`, {
            stdio: 'inherit'
          });
        }
      })
      .addStep('bundle', async (cfg) => {
        const files = await fs.readdir(cfg.paths.dist);
        const jsFiles = files.filter(f => f.endsWith('.js'));

        for (const file of jsFiles) {
          const content = await fs.readFile(path.join(cfg.paths.dist, file));
          const hash = createHash('sha256').update(content).digest('hex');
          await fs.writeFile(
            path.join(cfg.paths.dist, `${file}.sha256`),
            hash
          );
        }
      });
  }
}

/**
 * Release Manager
 * Handles version management and release automation
 */
export class ReleaseManager {
  constructor(options = {}) {
    this.versionFile = options.versionFile || './package.json';
    this.changelogFile = options.changelogFile || './CHANGELOG.md';
    this.tagPrefix = options.tagPrefix || 'v';
    this.remote = options.remote || 'origin';
    this.branch = options.branch || 'main';
  }

  /**
   * Bump version
   */
  async bumpVersion(type = 'patch') {
    const pkg = JSON.parse(await fs.readFile(this.versionFile, 'utf8'));
    const [major, minor, patch] = pkg.version.split('.').map(Number);

    let newVersion;
    switch (type) {
      case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
      case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
      case 'patch':
      default:
        newVersion = `${major}.${minor}.${patch + 1}`;
    }

    pkg.version = newVersion;
    await fs.writeFile(this.versionFile, JSON.stringify(pkg, null, 2));

    return newVersion;
  }

  /**
   * Generate changelog
   */
  async generateChangelog(version) {
    const lastTag = execSync('git describe --tags --abbrev=0', {
      encoding: 'utf8'
    }).trim();

    const commits = execSync(`git log ${lastTag}..HEAD --oneline`, {
      encoding: 'utf8'
    }).trim().split('\n');

    const changes = {
      features: [],
      fixes: [],
      breaking: [],
      other: []
    };

    for (const commit of commits) {
      if (commit.includes('feat:')) {
        changes.features.push(commit);
      } else if (commit.includes('fix:')) {
        changes.fixes.push(commit);
      } else if (commit.includes('BREAKING:')) {
        changes.breaking.push(commit);
      } else {
        changes.other.push(commit);
      }
    }

    let changelog = `## [${version}] - ${new Date().toISOString().split('T')[0]}\n\n`;

    if (changes.breaking.length) {
      changelog += '### Breaking Changes\n';
      changes.breaking.forEach(c => changelog += `- ${c}\n`);
      changelog += '\n';
    }

    if (changes.features.length) {
      changelog += '### Features\n';
      changes.features.forEach(c => changelog += `- ${c}\n`);
      changelog += '\n';
    }

    if (changes.fixes.length) {
      changelog += '### Bug Fixes\n';
      changes.fixes.forEach(c => changelog += `- ${c}\n`);
      changelog += '\n';
    }

    if (changes.other.length) {
      changelog += '### Other Changes\n';
      changes.other.forEach(c => changelog += `- ${c}\n`);
      changelog += '\n';
    }

    const existingChangelog = await fs.readFile(this.changelogFile, 'utf8').catch(() => '');
    await fs.writeFile(this.changelogFile, changelog + existingChangelog);

    return changelog;
  }

  /**
   * Create release
   */
  async createRelease(type = 'patch') {
    // Bump version
    const version = await this.bumpVersion(type);
    console.log(`Bumped version to ${version}`);

    // Generate changelog
    const changelog = await this.generateChangelog(version);
    console.log('Generated changelog');

    // Commit changes
    execSync('git add -A', { stdio: 'inherit' });
    execSync(`git commit -m "Release ${version}"`, { stdio: 'inherit' });

    // Create tag
    execSync(`git tag ${this.tagPrefix}${version}`, { stdio: 'inherit' });

    // Push changes
    execSync(`git push ${this.remote} ${this.branch}`, { stdio: 'inherit' });
    execSync(`git push ${this.remote} ${this.tagPrefix}${version}`, { stdio: 'inherit' });

    console.log(`Released version ${version}`);
    return { version, changelog };
  }
}

/**
 * CI/CD Integration
 * GitHub Actions and other CI/CD platform support
 */
export class CICDIntegration {
  constructor(platform = 'github') {
    this.platform = platform;
    this.workflows = new Map();
  }

  /**
   * Create GitHub Actions workflow
   */
  createGitHubWorkflow(name, options = {}) {
    const workflow = {
      name: name || 'CI/CD Pipeline',
      on: options.triggers || {
        push: { branches: ['main', 'develop'] },
        pull_request: { branches: ['main'] },
        release: { types: ['created'] }
      },
      jobs: {
        build: this.createBuildJob(options),
        test: this.createTestJob(options),
        deploy: this.createDeployJob(options)
      }
    };

    this.workflows.set(name, workflow);
    return workflow;
  }

  /**
   * Create build job
   */
  createBuildJob(options = {}) {
    return {
      'runs-on': options.runner || 'ubuntu-latest',
      strategy: {
        matrix: {
          'node-version': options.nodeVersions || ['18.x', '20.x']
        }
      },
      steps: [
        {
          name: 'Checkout',
          uses: 'actions/checkout@v3'
        },
        {
          name: 'Setup Node.js',
          uses: 'actions/setup-node@v3',
          with: {
            'node-version': '${{ matrix.node-version }}',
            cache: 'npm'
          }
        },
        {
          name: 'Install dependencies',
          run: 'npm ci'
        },
        {
          name: 'Build',
          run: 'npm run build'
        },
        {
          name: 'Upload artifacts',
          uses: 'actions/upload-artifact@v3',
          with: {
            name: 'build-artifacts',
            path: 'dist/'
          }
        }
      ]
    };
  }

  /**
   * Create test job
   */
  createTestJob(options = {}) {
    return {
      'runs-on': options.runner || 'ubuntu-latest',
      needs: 'build',
      steps: [
        {
          name: 'Checkout',
          uses: 'actions/checkout@v3'
        },
        {
          name: 'Setup Node.js',
          uses: 'actions/setup-node@v3',
          with: {
            'node-version': '20.x',
            cache: 'npm'
          }
        },
        {
          name: 'Install dependencies',
          run: 'npm ci'
        },
        {
          name: 'Run tests',
          run: 'npm test -- --coverage'
        },
        {
          name: 'Upload coverage',
          uses: 'codecov/codecov-action@v3',
          with: {
            file: './coverage/lcov.info'
          }
        }
      ]
    };
  }

  /**
   * Create deploy job
   */
  createDeployJob(options = {}) {
    return {
      'runs-on': options.runner || 'ubuntu-latest',
      needs: ['build', 'test'],
      if: "github.event_name == 'release'",
      steps: [
        {
          name: 'Checkout',
          uses: 'actions/checkout@v3'
        },
        {
          name: 'Setup Node.js',
          uses: 'actions/setup-node@v3',
          with: {
            'node-version': '20.x',
            'registry-url': 'https://registry.npmjs.org'
          }
        },
        {
          name: 'Download artifacts',
          uses: 'actions/download-artifact@v3',
          with: {
            name: 'build-artifacts',
            path: 'dist/'
          }
        },
        {
          name: 'Publish to NPM',
          run: 'npm publish',
          env: {
            NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}'
          }
        }
      ]
    };
  }

  /**
   * Save workflow to file
   */
  async saveWorkflow(name, outputPath = '.github/workflows') {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`Workflow "${name}" not found`);
    }

    await fs.mkdir(outputPath, { recursive: true });
    const yamlContent = this.toYAML(workflow);
    const filename = `${name.toLowerCase().replace(/\s+/g, '-')}.yml`;
    await fs.writeFile(path.join(outputPath, filename), yamlContent);

    return path.join(outputPath, filename);
  }

  /**
   * Convert to YAML
   */
  toYAML(obj, indent = 0) {
    let yaml = '';
    const spaces = ' '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.toYAML(value, indent + 2);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach(item => {
          if (typeof item === 'object') {
            yaml += `${spaces}  -\n`;
            yaml += this.toYAML(item, indent + 4);
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        });
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }

    return yaml;
  }
}

/**
 * Build Utilities
 */
export class BuildUtils {
  /**
   * Get build info
   */
  static getBuildInfo() {
    return {
      version: process.env.VERSION || 'dev',
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      commit: this.getGitCommit(),
      branch: this.getGitBranch(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  /**
   * Get git commit hash
   */
  static getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get git branch
   */
  static getGitBranch() {
    try {
      return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Clean build artifacts
   */
  static async clean(paths = ['dist', '.cache', '.tmp']) {
    for (const p of paths) {
      await fs.rm(p, { recursive: true, force: true });
    }
  }

  /**
   * Copy assets
   */
  static async copyAssets(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const files = await fs.readdir(src);

    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stat = await fs.stat(srcPath);

      if (stat.isDirectory()) {
        await this.copyAssets(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

// Export default build configuration
export const defaultConfig = new BuildConfig({
  mode: process.env.NODE_ENV || 'development',
  srcPath: './src',
  distPath: './dist'
});

// Export convenience functions
export function createBuildPipeline(config) {
  return BuildPipeline.createStandard(config || defaultConfig);
}

export function createReleaseManager(options) {
  return new ReleaseManager(options);
}

export function createCICD(platform = 'github') {
  return new CICDIntegration(platform);
}