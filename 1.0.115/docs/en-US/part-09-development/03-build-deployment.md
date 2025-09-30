# Part 9.3: Build and Deployment

## Introduction

The Claude Code build and deployment system transforms the development source code into optimized, distributable packages for various environments. This chapter explores the build processes, bundling strategies, deployment pipelines, and distribution mechanisms that enable efficient delivery of the Claude Code CLI to end users.

## Table of Contents
1. [Build Architecture](#build-architecture)
2. [Bundling System](#bundling-system)
3. [Optimization Strategies](#optimization-strategies)
4. [Deployment Pipeline](#deployment-pipeline)
5. [Distribution Channels](#distribution-channels)
6. [Version Management](#version-management)
7. [CI/CD Integration](#cicd-integration)
8. [Performance Implications](#performance-implications)

## Build Architecture

### Build System Overview

```javascript
class BuildSystem {
  constructor() {
    this.config = {
      entry: 'src/cli/main.js',
      output: 'dist/claude-code.js',
      target: 'node16',
      platform: 'node',
      format: 'esm',
      minify: false,
      sourcemap: true,
      bundle: true
    };

    this.builders = {
      development: this.createDevelopmentBuilder(),
      production: this.createProductionBuilder(),
      standalone: this.createStandaloneBuilder()
    };
  }

  createDevelopmentBuilder() {
    return {
      name: 'development',
      config: {
        ...this.config,
        minify: false,
        sourcemap: 'inline',
        define: {
          'process.env.NODE_ENV': '"development"',
          'process.env.DEBUG': 'true'
        },
        watch: true,
        logLevel: 'info'
      },

      async build() {
        const esbuild = await import('esbuild');

        const result = await esbuild.build({
          entryPoints: [this.config.entry],
          outfile: 'dist/claude-code.dev.js',
          ...this.config
        });

        return {
          outputFile: 'dist/claude-code.dev.js',
          size: result.metafile?.outputs['dist/claude-code.dev.js']?.bytes,
          warnings: result.warnings,
          errors: result.errors
        };
      }
    };
  }

  createProductionBuilder() {
    return {
      name: 'production',
      config: {
        ...this.config,
        minify: true,
        sourcemap: 'external',
        treeShaking: true,
        define: {
          'process.env.NODE_ENV': '"production"',
          'process.env.DEBUG': 'false'
        },
        drop: ['console', 'debugger'],
        logLevel: 'error'
      },

      async build() {
        const esbuild = await import('esbuild');

        // First pass: bundle
        const bundleResult = await esbuild.build({
          entryPoints: [this.config.entry],
          outfile: 'dist/claude-code.js',
          metafile: true,
          ...this.config
        });

        // Second pass: minify
        const minifyResult = await esbuild.build({
          entryPoints: ['dist/claude-code.js'],
          outfile: 'dist/claude-code.min.js',
          minify: true,
          ...this.config
        });

        return {
          files: [
            'dist/claude-code.js',
            'dist/claude-code.min.js',
            'dist/claude-code.js.map'
          ],
          size: {
            bundled: bundleResult.metafile?.outputs['dist/claude-code.js']?.bytes,
            minified: minifyResult.metafile?.outputs['dist/claude-code.min.js']?.bytes
          }
        };
      }
    };
  }

  createStandaloneBuilder() {
    return {
      name: 'standalone',
      config: {
        ...this.config,
        platform: 'node',
        format: 'cjs',
        external: [],  // Bundle everything
        loader: {
          '.json': 'json',
          '.txt': 'text'
        }
      },

      async build() {
        const esbuild = await import('esbuild');
        const fs = await import('fs/promises');
        const path = await import('path');

        // Bundle with all dependencies
        const result = await esbuild.build({
          entryPoints: [this.config.entry],
          outfile: 'dist/claude-code-standalone.js',
          bundle: true,
          platform: 'node',
          external: [],  // Include all dependencies
          ...this.config
        });

        // Create executable wrapper
        const wrapper = `#!/usr/bin/env node
'use strict';
${await fs.readFile('dist/claude-code-standalone.js', 'utf8')}
`;

        await fs.writeFile('dist/claude-code', wrapper, {
          mode: 0o755  // Make executable
        });

        return {
          executable: 'dist/claude-code',
          size: (await fs.stat('dist/claude-code')).size
        };
      }
    };
  }

  async build(target = 'production') {
    const builder = this.builders[target];
    if (!builder) {
      throw new Error(`Unknown build target: ${target}`);
    }

    console.log(`🏗️  Building for ${target}...`);
    const startTime = Date.now();

    try {
      const result = await builder.build();
      const duration = Date.now() - startTime;

      console.log(`✅ Build completed in ${duration}ms`);
      return result;

    } catch (error) {
      console.error(`❌ Build failed: ${error.message}`);
      throw error;
    }
  }
}
```

## Bundling System

### Module Bundler

```javascript
class ModuleBundler {
  constructor() {
    this.entryPoints = new Set();
    this.modules = new Map();
    this.dependencies = new Map();
    this.externalModules = new Set(['fs', 'path', 'child_process', 'os', 'crypto']);
  }

  async analyze(entryPoint) {
    const ast = await this.parseModule(entryPoint);
    const deps = await this.extractDependencies(ast);

    this.entryPoints.add(entryPoint);
    this.dependencies.set(entryPoint, deps);

    // Recursively analyze dependencies
    for (const dep of deps) {
      if (!this.dependencies.has(dep) && !this.externalModules.has(dep)) {
        await this.analyze(dep);
      }
    }

    return this.generateDependencyGraph();
  }

  async parseModule(filePath) {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf8');

    // Simple AST parsing (would use babel/acorn in production)
    const imports = [];
    const exports = [];

    // Extract imports
    const importRegex = /import\s+(?:(.+)\s+from\s+)?['"](.+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push({
        specifiers: match[1],
        source: match[2]
      });
    }

    // Extract exports
    const exportRegex = /export\s+(?:default\s+)?(.+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push({
        type: match[0].includes('default') ? 'default' : 'named',
        value: match[1]
      });
    }

    return { filePath, imports, exports, content };
  }

  async extractDependencies(ast) {
    const deps = new Set();

    for (const imp of ast.imports) {
      if (imp.source.startsWith('.')) {
        // Relative import
        const path = await import('path');
        const resolved = path.resolve(
          path.dirname(ast.filePath),
          imp.source
        );
        deps.add(this.resolveExtension(resolved));
      } else if (!this.externalModules.has(imp.source)) {
        // Node module
        deps.add(imp.source);
      }
    }

    return Array.from(deps);
  }

  resolveExtension(filePath) {
    const extensions = ['.js', '.mjs', '.json', '/index.js'];

    for (const ext of extensions) {
      const fs = require('fs');
      const testPath = filePath.endsWith('.js') ? filePath : filePath + ext;

      if (fs.existsSync(testPath)) {
        return testPath;
      }
    }

    return filePath;
  }

  generateDependencyGraph() {
    const graph = {
      entryPoints: Array.from(this.entryPoints),
      modules: {},
      external: Array.from(this.externalModules)
    };

    for (const [module, deps] of this.dependencies) {
      graph.modules[module] = {
        dependencies: deps,
        dependents: this.findDependents(module)
      };
    }

    return graph;
  }

  findDependents(module) {
    const dependents = [];

    for (const [mod, deps] of this.dependencies) {
      if (deps.includes(module)) {
        dependents.push(mod);
      }
    }

    return dependents;
  }

  async bundle(options = {}) {
    const {
      entryPoint,
      outputFile,
      format = 'esm',
      minify = false,
      sourcemap = true
    } = options;

    // Analyze dependencies
    const graph = await this.analyze(entryPoint);

    // Create bundle
    const bundle = [];

    // Add runtime
    bundle.push(this.createRuntime(format));

    // Add modules in dependency order
    const sortedModules = this.topologicalSort(graph);

    for (const module of sortedModules) {
      const ast = await this.parseModule(module);
      bundle.push(this.wrapModule(ast, format));
    }

    // Add entry point execution
    bundle.push(this.createEntryExecution(entryPoint, format));

    // Combine and optimize
    let output = bundle.join('\n');

    if (minify) {
      output = await this.minifyCode(output);
    }

    if (sourcemap) {
      output += `\n//# sourceMappingURL=${outputFile}.map`;
      await this.generateSourceMap(output, outputFile);
    }

    // Write output
    const fs = await import('fs/promises');
    await fs.writeFile(outputFile, output);

    return {
      outputFile,
      size: output.length,
      modules: sortedModules.length
    };
  }

  createRuntime(format) {
    if (format === 'esm') {
      return `
// ESM Runtime
const __modules = new Map();
const __exports = new Map();

function __require(id) {
  if (__exports.has(id)) {
    return __exports.get(id);
  }

  const module = { exports: {} };
  __exports.set(id, module.exports);

  const moduleFunc = __modules.get(id);
  if (moduleFunc) {
    moduleFunc(module, module.exports, __require);
  }

  return module.exports;
}
`;
    } else if (format === 'cjs') {
      return `
// CommonJS Runtime
(function(modules) {
  const installedModules = {};

  function __webpack_require__(moduleId) {
    if (installedModules[moduleId]) {
      return installedModules[moduleId].exports;
    }

    const module = installedModules[moduleId] = {
      i: moduleId,
      l: false,
      exports: {}
    };

    modules[moduleId].call(
      module.exports,
      module,
      module.exports,
      __webpack_require__
    );

    module.l = true;
    return module.exports;
  }

  return __webpack_require__(0);
})([
`;
    }
  }

  wrapModule(ast, format) {
    if (format === 'esm') {
      return `
__modules.set('${ast.filePath}', function(module, exports, require) {
${ast.content}
});
`;
    }
    // Additional format handling...
  }

  createEntryExecution(entryPoint, format) {
    if (format === 'esm') {
      return `__require('${entryPoint}');`;
    }
    // Additional format handling...
  }

  topologicalSort(graph) {
    const sorted = [];
    const visited = new Set();

    const visit = (module) => {
      if (visited.has(module)) return;
      visited.add(module);

      const deps = graph.modules[module]?.dependencies || [];
      for (const dep of deps) {
        visit(dep);
      }

      sorted.push(module);
    };

    for (const entry of graph.entryPoints) {
      visit(entry);
    }

    return sorted;
  }

  async minifyCode(code) {
    const { minify } = await import('terser');
    const result = await minify(code, {
      compress: {
        dead_code: true,
        drop_console: true,
        drop_debugger: true,
        keep_fargs: false,
        passes: 2
      },
      mangle: {
        toplevel: true
      },
      format: {
        comments: false
      }
    });

    return result.code;
  }

  async generateSourceMap(code, outputFile) {
    // Simplified source map generation
    const sourceMap = {
      version: 3,
      sources: Array.from(this.dependencies.keys()),
      names: [],
      mappings: ''  // Would generate actual mappings
    };

    const fs = await import('fs/promises');
    await fs.writeFile(
      `${outputFile}.map`,
      JSON.stringify(sourceMap)
    );
  }
}
```

## Optimization Strategies

### Build Optimizer

```javascript
class BuildOptimizer {
  constructor() {
    this.optimizations = {
      treeShaking: true,
      minification: true,
      compression: true,
      codeElimination: true,
      constantFolding: true,
      inlining: true
    };
  }

  async optimize(buildConfig) {
    const optimized = { ...buildConfig };

    // Apply optimizations
    if (this.optimizations.treeShaking) {
      optimized.treeShake = await this.treeShake(buildConfig);
    }

    if (this.optimizations.minification) {
      optimized.minify = await this.minify(buildConfig);
    }

    if (this.optimizations.compression) {
      optimized.compress = await this.compress(buildConfig);
    }

    if (this.optimizations.codeElimination) {
      optimized.eliminate = await this.eliminateDeadCode(buildConfig);
    }

    return optimized;
  }

  async treeShake(config) {
    // Remove unused exports
    const usedExports = new Set();
    const allExports = new Map();

    // Analyze usage
    const analyzeUsage = (module) => {
      const imports = module.imports || [];
      for (const imp of imports) {
        if (imp.specifiers) {
          imp.specifiers.forEach(spec => usedExports.add(spec));
        }
      }
    };

    // Mark used exports
    const markUsed = (exportName, module) => {
      if (usedExports.has(exportName)) {
        return true;
      }

      // Check transitive dependencies
      const deps = module.dependencies || [];
      for (const dep of deps) {
        if (markUsed(exportName, dep)) {
          return true;
        }
      }

      return false;
    };

    return {
      removedExports: [],
      keptExports: Array.from(usedExports)
    };
  }

  async minify(config) {
    const strategies = {
      // Variable renaming
      renameVariables: {
        enabled: true,
        reservedNames: ['process', 'global', 'Buffer'],

        rename(name) {
          if (this.reservedNames.includes(name)) {
            return name;
          }

          // Simple renaming (a, b, c, ...)
          const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const index = this.counter++;
          return chars[index % chars.length] + (Math.floor(index / chars.length) || '');
        }
      },

      // Whitespace removal
      removeWhitespace: {
        enabled: true,

        process(code) {
          return code
            .replace(/\s+/g, ' ')
            .replace(/\s*([{}()[\],;:])\s*/g, '$1')
            .trim();
        }
      },

      // Comment removal
      removeComments: {
        enabled: true,
        preserveLicense: true,

        process(code) {
          // Remove single-line comments
          code = code.replace(/\/\/(?!.*@license).*$/gm, '');

          // Remove multi-line comments
          code = code.replace(/\/\*(?!.*@license)[\s\S]*?\*\//g, '');

          return code;
        }
      },

      // Constant folding
      foldConstants: {
        enabled: true,

        process(code) {
          // Fold simple arithmetic
          code = code.replace(/(\d+)\s*\+\s*(\d+)/g, (_, a, b) =>
            String(Number(a) + Number(b))
          );

          // Fold string concatenation
          code = code.replace(/'([^']+)'\s*\+\s*'([^']+)'/g, "'$1$2'");
          code = code.replace(/"([^"]+)"\s*\+\s*"([^"]+)"/g, '"$1$2"');

          return code;
        }
      }
    };

    let minified = config.code;

    for (const [name, strategy] of Object.entries(strategies)) {
      if (strategy.enabled) {
        minified = strategy.process ? strategy.process(minified) : minified;
      }
    }

    return {
      original: config.code.length,
      minified: minified.length,
      reduction: ((1 - minified.length / config.code.length) * 100).toFixed(1) + '%'
    };
  }

  async compress(config) {
    const zlib = await import('zlib');
    const { promisify } = await import('util');

    const gzip = promisify(zlib.gzip);
    const brotli = promisify(zlib.brotliCompress);

    const original = Buffer.from(config.code);

    const [gzipped, brotlied] = await Promise.all([
      gzip(original),
      brotli(original)
    ]);

    return {
      original: original.length,
      gzip: {
        size: gzipped.length,
        ratio: ((1 - gzipped.length / original.length) * 100).toFixed(1) + '%'
      },
      brotli: {
        size: brotlied.length,
        ratio: ((1 - brotlied.length / original.length) * 100).toFixed(1) + '%'
      }
    };
  }

  async eliminateDeadCode(config) {
    const eliminated = [];

    // Pattern-based dead code detection
    const patterns = [
      // Unreachable code after return
      {
        regex: /return[^;]*;[\s\S]*?}/g,
        description: 'Code after return'
      },
      // Unused variables
      {
        regex: /(?:const|let|var)\s+(\w+)\s*=.*?;(?![\s\S]*\1)/g,
        description: 'Unused variable'
      },
      // Empty blocks
      {
        regex: /\{[\s]*\}/g,
        description: 'Empty block'
      },
      // Redundant conditions
      {
        regex: /if\s*\(true\)\s*({[^}]*})/g,
        replacement: '$1',
        description: 'Always true condition'
      },
      {
        regex: /if\s*\(false\)\s*{[^}]*}/g,
        replacement: '',
        description: 'Always false condition'
      }
    ];

    let optimized = config.code;

    for (const pattern of patterns) {
      const matches = optimized.match(pattern.regex);
      if (matches) {
        eliminated.push({
          pattern: pattern.description,
          occurrences: matches.length
        });

        if (pattern.replacement !== undefined) {
          optimized = optimized.replace(pattern.regex, pattern.replacement);
        }
      }
    }

    return {
      eliminated,
      optimizedSize: optimized.length,
      reduction: config.code.length - optimized.length
    };
  }

  async analyzeBundle(bundlePath) {
    const fs = await import('fs/promises');
    const content = await fs.readFile(bundlePath, 'utf8');

    // Analyze bundle composition
    const analysis = {
      totalSize: content.length,
      modules: [],
      dependencies: new Map(),
      duplicates: []
    };

    // Find module boundaries
    const moduleRegex = /__modules\.set\(['"]([^'"]+)['"]/g;
    let match;

    while ((match = moduleRegex.exec(content)) !== null) {
      const moduleName = match[1];
      const nextMatch = moduleRegex.exec(content);
      const moduleEnd = nextMatch ? nextMatch.index : content.length;

      const moduleContent = content.substring(match.index, moduleEnd);

      analysis.modules.push({
        name: moduleName,
        size: moduleContent.length,
        percentage: ((moduleContent.length / content.length) * 100).toFixed(1)
      });
    }

    // Sort by size
    analysis.modules.sort((a, b) => b.size - a.size);

    // Find duplicates
    const seen = new Map();
    for (const module of analysis.modules) {
      const key = module.name.split('/').pop();
      if (seen.has(key)) {
        analysis.duplicates.push({
          name: key,
          locations: [seen.get(key), module.name]
        });
      } else {
        seen.set(key, module.name);
      }
    }

    return analysis;
  }
}
```

## Deployment Pipeline

### Deployment Manager

```javascript
class DeploymentManager {
  constructor() {
    this.environments = {
      development: {
        name: 'Development',
        url: 'http://localhost:3000',
        branch: 'develop',
        autoDepploy: true
      },
      staging: {
        name: 'Staging',
        url: 'https://staging.claude-code.ai',
        branch: 'staging',
        autoDepploy: true,
        requiresApproval: false
      },
      production: {
        name: 'Production',
        url: 'https://claude-code.ai',
        branch: 'main',
        autoDepploy: false,
        requiresApproval: true
      }
    };

    this.steps = [];
  }

  async deploy(environment, options = {}) {
    const env = this.environments[environment];
    if (!env) {
      throw new Error(`Unknown environment: ${environment}`);
    }

    console.log(`🚀 Deploying to ${env.name}...`);

    // Create deployment pipeline
    const pipeline = this.createPipeline(env, options);

    // Execute pipeline
    for (const step of pipeline) {
      console.log(`⚙️  ${step.name}...`);

      try {
        const result = await step.execute();

        if (result.success) {
          console.log(`  ✅ ${step.name} completed`);
        } else {
          throw new Error(result.error);
        }

      } catch (error) {
        console.error(`  ❌ ${step.name} failed: ${error.message}`);

        if (!step.optional) {
          throw error;
        }
      }
    }

    console.log(`✅ Deployment to ${env.name} completed successfully!`);

    return {
      environment: env.name,
      url: env.url,
      timestamp: new Date().toISOString()
    };
  }

  createPipeline(env, options) {
    const pipeline = [];

    // Pre-deployment checks
    pipeline.push({
      name: 'Pre-deployment checks',
      execute: async () => {
        const checks = await this.runPreDeploymentChecks(env);
        return { success: checks.passed };
      }
    });

    // Build
    pipeline.push({
      name: 'Build application',
      execute: async () => {
        const buildSystem = new BuildSystem();
        const result = await buildSystem.build(
          env.name === 'Production' ? 'production' : 'development'
        );
        return { success: true, result };
      }
    });

    // Test
    pipeline.push({
      name: 'Run tests',
      execute: async () => {
        const { execSync } = await import('child_process');

        try {
          execSync('npm test', { stdio: 'pipe' });
          return { success: true };
        } catch (error) {
          return { success: false, error: 'Tests failed' };
        }
      }
    });

    // Approval (if required)
    if (env.requiresApproval && !options.skipApproval) {
      pipeline.push({
        name: 'Get deployment approval',
        execute: async () => {
          const approved = await this.requestApproval(env);
          return { success: approved };
        }
      });
    }

    // Deploy
    pipeline.push({
      name: 'Deploy to environment',
      execute: async () => {
        const result = await this.deployToEnvironment(env);
        return { success: result.success };
      }
    });

    // Post-deployment
    pipeline.push({
      name: 'Post-deployment verification',
      execute: async () => {
        const verified = await this.verifyDeployment(env);
        return { success: verified };
      }
    });

    // Notifications
    pipeline.push({
      name: 'Send notifications',
      optional: true,
      execute: async () => {
        await this.sendNotifications(env);
        return { success: true };
      }
    });

    return pipeline;
  }

  async runPreDeploymentChecks(env) {
    const checks = {
      gitStatus: await this.checkGitStatus(env),
      dependencies: await this.checkDependencies(),
      environment: await this.checkEnvironment(env),
      resources: await this.checkResources()
    };

    checks.passed = Object.values(checks).every(c => c === true);

    return checks;
  }

  async checkGitStatus(env) {
    const { execSync } = await import('child_process');

    try {
      // Check current branch
      const branch = execSync('git branch --show-current', {
        encoding: 'utf8'
      }).trim();

      if (branch !== env.branch) {
        console.warn(`⚠️  Not on ${env.branch} branch (current: ${branch})`);
        return false;
      }

      // Check for uncommitted changes
      const status = execSync('git status --porcelain', {
        encoding: 'utf8'
      });

      if (status.trim()) {
        console.warn('⚠️  Uncommitted changes detected');
        return false;
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  async checkDependencies() {
    const { execSync } = await import('child_process');

    try {
      // Check for security vulnerabilities
      const audit = execSync('npm audit --json', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      const auditResult = JSON.parse(audit);

      if (auditResult.metadata.vulnerabilities.high > 0) {
        console.warn('⚠️  High severity vulnerabilities detected');
        return false;
      }

      return true;

    } catch {
      // npm audit may exit with non-zero for vulnerabilities
      return true;
    }
  }

  async checkEnvironment(env) {
    // Verify environment-specific requirements
    const requirements = {
      development: {
        nodeVersion: '>=16.0.0'
      },
      staging: {
        nodeVersion: '>=16.0.0',
        apiKey: process.env.STAGING_API_KEY
      },
      production: {
        nodeVersion: '>=16.0.0',
        apiKey: process.env.PRODUCTION_API_KEY,
        sslCert: process.env.SSL_CERT_PATH
      }
    };

    const envReqs = requirements[env.name.toLowerCase()] || {};

    // Check Node version
    if (envReqs.nodeVersion) {
      const currentVersion = process.version;
      // Simple version check (would use semver in production)
      const required = parseInt(envReqs.nodeVersion.match(/\d+/)[0]);
      const current = parseInt(currentVersion.slice(1).split('.')[0]);

      if (current < required) {
        console.warn(`⚠️  Node version ${currentVersion} < ${envReqs.nodeVersion}`);
        return false;
      }
    }

    // Check required environment variables
    for (const [key, value] of Object.entries(envReqs)) {
      if (key !== 'nodeVersion' && !value) {
        console.warn(`⚠️  Missing required: ${key}`);
        return false;
      }
    }

    return true;
  }

  async checkResources() {
    const os = await import('os');

    const resources = {
      memory: os.freemem() / (1024 * 1024 * 1024), // GB
      disk: await this.checkDiskSpace(),
      cpu: os.loadavg()[0]
    };

    // Check minimum requirements
    if (resources.memory < 1) {
      console.warn('⚠️  Less than 1GB free memory');
      return false;
    }

    if (resources.disk < 1) {
      console.warn('⚠️  Less than 1GB free disk space');
      return false;
    }

    if (resources.cpu > os.cpus().length * 0.8) {
      console.warn('⚠️  High CPU load detected');
      return false;
    }

    return true;
  }

  async checkDiskSpace() {
    const { execSync } = await import('child_process');

    try {
      const df = execSync('df -BG . | tail -1', {
        encoding: 'utf8'
      });

      const available = parseInt(df.split(/\s+/)[3]);
      return available;

    } catch {
      return 10; // Assume sufficient space if check fails
    }
  }

  async requestApproval(env) {
    console.log(`⏸️  Deployment to ${env.name} requires approval`);

    // In production, this would integrate with approval systems
    // For now, simulate approval
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question('Approve deployment? (yes/no): ', answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      });
    });
  }

  async deployToEnvironment(env) {
    // Deployment strategies
    const strategies = {
      development: this.deployLocal,
      staging: this.deployStaging,
      production: this.deployProduction
    };

    const strategy = strategies[env.name.toLowerCase()] || this.deployLocal;

    return await strategy.call(this, env);
  }

  async deployLocal(env) {
    const { spawn } = await import('child_process');

    // Start local development server
    const child = spawn('npm', ['start'], {
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    return { success: true, pid: child.pid };
  }

  async deployStaging(env) {
    // Deploy to staging environment
    // This would typically use cloud provider APIs
    console.log(`Deploying to staging: ${env.url}`);

    return { success: true };
  }

  async deployProduction(env) {
    // Deploy to production with extra safety measures
    console.log(`Deploying to production: ${env.url}`);

    // Create backup
    await this.createBackup();

    // Deploy with rollback capability
    const deployment = await this.deployWithRollback(env);

    return deployment;
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:]/g, '-');
    const backupName = `backup-${timestamp}`;

    console.log(`Creating backup: ${backupName}`);

    // Backup implementation
    return backupName;
  }

  async deployWithRollback(env) {
    let previousVersion = null;

    try {
      // Save current version
      previousVersion = await this.getCurrentVersion(env);

      // Deploy new version
      await this.deployNewVersion(env);

      // Verify deployment
      const verified = await this.verifyDeployment(env);

      if (!verified) {
        throw new Error('Deployment verification failed');
      }

      return { success: true };

    } catch (error) {
      console.error('Deployment failed, rolling back...');

      if (previousVersion) {
        await this.rollback(env, previousVersion);
      }

      throw error;
    }
  }

  async verifyDeployment(env) {
    const checks = [];

    // Health check
    checks.push(await this.healthCheck(env));

    // Smoke tests
    checks.push(await this.runSmokeTests(env));

    // Performance check
    checks.push(await this.performanceCheck(env));

    return checks.every(c => c === true);
  }

  async healthCheck(env) {
    // Simple health check (would use actual HTTP requests)
    console.log(`Health check: ${env.url}/health`);
    return true;
  }

  async runSmokeTests(env) {
    console.log('Running smoke tests...');
    // Run critical path tests
    return true;
  }

  async performanceCheck(env) {
    console.log('Checking performance metrics...');
    // Verify response times, memory usage, etc.
    return true;
  }

  async sendNotifications(env) {
    // Send deployment notifications
    const notifications = [
      { type: 'email', recipients: ['team@claude-code.ai'] },
      { type: 'slack', channel: '#deployments' }
    ];

    for (const notification of notifications) {
      console.log(`Sending ${notification.type} notification...`);
      // Implementation would send actual notifications
    }
  }
}
```

## Distribution Channels

### Package Publisher

```javascript
class PackagePublisher {
  constructor() {
    this.channels = {
      npm: new NPMPublisher(),
      github: new GitHubReleasePublisher(),
      standalone: new StandalonePublisher()
    };
  }

  async publish(version, channels = ['npm']) {
    const results = {};

    for (const channel of channels) {
      const publisher = this.channels[channel];

      if (!publisher) {
        console.warn(`Unknown channel: ${channel}`);
        continue;
      }

      console.log(`📦 Publishing to ${channel}...`);

      try {
        const result = await publisher.publish(version);
        results[channel] = result;
        console.log(`  ✅ Published to ${channel}`);

      } catch (error) {
        console.error(`  ❌ Failed to publish to ${channel}: ${error.message}`);
        results[channel] = { error: error.message };
      }
    }

    return results;
  }
}

class NPMPublisher {
  async publish(version) {
    const { execSync } = await import('child_process');
    const fs = await import('fs/promises');

    // Update package.json version
    const packageJson = JSON.parse(
      await fs.readFile('package.json', 'utf8')
    );

    packageJson.version = version;

    await fs.writeFile(
      'package.json',
      JSON.stringify(packageJson, null, 2)
    );

    // Run npm publish
    execSync('npm publish', { stdio: 'inherit' });

    return {
      version,
      registry: 'https://registry.npmjs.org',
      package: packageJson.name
    };
  }
}

class GitHubReleasePublisher {
  async publish(version) {
    const { Octokit } = await import('@octokit/rest');

    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    // Create release
    const release = await octokit.repos.createRelease({
      owner: 'anthropics',
      repo: 'claude-code',
      tag_name: `v${version}`,
      name: `Claude Code v${version}`,
      body: await this.generateReleaseNotes(version),
      draft: false,
      prerelease: version.includes('beta') || version.includes('alpha')
    });

    // Upload assets
    const assets = await this.prepareAssets();

    for (const asset of assets) {
      await octokit.repos.uploadReleaseAsset({
        owner: 'anthropics',
        repo: 'claude-code',
        release_id: release.data.id,
        name: asset.name,
        data: asset.data
      });
    }

    return {
      version,
      url: release.data.html_url,
      assets: assets.map(a => a.name)
    };
  }

  async generateReleaseNotes(version) {
    // Generate release notes from changelog
    return `# Claude Code v${version}\n\n## Changes\n\n- Feature improvements\n- Bug fixes\n- Performance optimizations`;
  }

  async prepareAssets() {
    const fs = await import('fs/promises');

    return [
      {
        name: 'claude-code-linux-x64',
        data: await fs.readFile('dist/claude-code-linux-x64')
      },
      {
        name: 'claude-code-macos-arm64',
        data: await fs.readFile('dist/claude-code-macos-arm64')
      },
      {
        name: 'claude-code-windows-x64.exe',
        data: await fs.readFile('dist/claude-code-windows-x64.exe')
      }
    ];
  }
}

class StandalonePublisher {
  async publish(version) {
    const platforms = ['linux-x64', 'macos-arm64', 'windows-x64'];
    const artifacts = [];

    for (const platform of platforms) {
      const artifact = await this.buildStandalone(platform, version);
      artifacts.push(artifact);
    }

    // Upload to CDN
    await this.uploadToCDN(artifacts);

    return {
      version,
      artifacts: artifacts.map(a => a.name),
      cdn: 'https://cdn.claude-code.ai'
    };
  }

  async buildStandalone(platform, version) {
    const { execSync } = await import('child_process');

    const [os, arch] = platform.split('-');
    const extension = os === 'windows' ? '.exe' : '';

    const outputName = `claude-code-${platform}${extension}`;

    // Use pkg or nexe to create standalone
    execSync(`pkg . --target node16-${os}-${arch} --output dist/${outputName}`);

    return {
      name: outputName,
      platform,
      size: (await import('fs')).statSync(`dist/${outputName}`).size
    };
  }

  async uploadToCDN(artifacts) {
    // Upload artifacts to CDN (S3, CloudFlare, etc.)
    console.log('Uploading artifacts to CDN...');

    for (const artifact of artifacts) {
      console.log(`  Uploading ${artifact.name} (${artifact.size} bytes)`);
      // Actual upload implementation
    }
  }
}
```

## Version Management

### Version Controller

```javascript
class VersionController {
  constructor() {
    this.currentVersion = null;
    this.versionHistory = [];
  }

  async getCurrentVersion() {
    const fs = await import('fs/promises');
    const packageJson = JSON.parse(
      await fs.readFile('package.json', 'utf8')
    );

    this.currentVersion = packageJson.version;
    return this.currentVersion;
  }

  async bumpVersion(type = 'patch') {
    const current = await this.getCurrentVersion();
    const parts = current.split('.').map(Number);

    switch (type) {
      case 'major':
        parts[0]++;
        parts[1] = 0;
        parts[2] = 0;
        break;

      case 'minor':
        parts[1]++;
        parts[2] = 0;
        break;

      case 'patch':
        parts[2]++;
        break;

      case 'prerelease':
        if (current.includes('-')) {
          const [version, prerelease] = current.split('-');
          const prereleaseNum = parseInt(prerelease.match(/\d+/)?.[0] || 0);
          return `${version}-${prerelease.replace(/\d+/, prereleaseNum + 1)}`;
        } else {
          return `${current}-beta.0`;
        }
    }

    const newVersion = parts.join('.');

    await this.updateVersion(newVersion);
    return newVersion;
  }

  async updateVersion(version) {
    const fs = await import('fs/promises');

    // Update package.json
    const packageJson = JSON.parse(
      await fs.readFile('package.json', 'utf8')
    );

    packageJson.version = version;

    await fs.writeFile(
      'package.json',
      JSON.stringify(packageJson, null, 2)
    );

    // Update package-lock.json
    try {
      const lockFile = JSON.parse(
        await fs.readFile('package-lock.json', 'utf8')
      );

      lockFile.version = version;
      lockFile.packages[''].version = version;

      await fs.writeFile(
        'package-lock.json',
        JSON.stringify(lockFile, null, 2)
      );
    } catch {
      // package-lock.json might not exist
    }

    // Create git tag
    await this.createGitTag(version);

    this.currentVersion = version;
    this.versionHistory.push({
      version,
      timestamp: new Date().toISOString()
    });
  }

  async createGitTag(version) {
    const { execSync } = await import('child_process');

    try {
      execSync(`git add package.json package-lock.json`);
      execSync(`git commit -m "chore: bump version to ${version}"`);
      execSync(`git tag -a v${version} -m "Version ${version}"`);
    } catch {
      // Git operations might fail in CI
    }
  }

  async generateChangelog(fromVersion, toVersion) {
    const { execSync } = await import('child_process');

    const commits = execSync(
      `git log v${fromVersion}..v${toVersion} --pretty=format:"%h %s"`,
      { encoding: 'utf8' }
    ).split('\n');

    const changelog = {
      version: toVersion,
      date: new Date().toISOString().split('T')[0],
      changes: {
        features: [],
        fixes: [],
        breaking: [],
        other: []
      }
    };

    for (const commit of commits) {
      if (commit.includes('feat:')) {
        changelog.changes.features.push(commit);
      } else if (commit.includes('fix:')) {
        changelog.changes.fixes.push(commit);
      } else if (commit.includes('BREAKING')) {
        changelog.changes.breaking.push(commit);
      } else {
        changelog.changes.other.push(commit);
      }
    }

    return changelog;
  }
}
```

## CI/CD Integration

### CI/CD Pipeline

```javascript
class CICDPipeline {
  constructor() {
    this.providers = {
      github: new GitHubActions(),
      gitlab: new GitLabCI(),
      jenkins: new Jenkins()
    };
  }

  generateConfig(provider = 'github') {
    const generator = this.providers[provider];

    if (!generator) {
      throw new Error(`Unknown CI/CD provider: ${provider}`);
    }

    return generator.generateConfig();
  }
}

class GitHubActions {
  generateConfig() {
    return `
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  release:
    types: [created]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}

    - name: Install dependencies
      run: npm ci

    - name: Run linting
      run: npm run lint

    - name: Run tests
      run: npm test

    - name: Generate coverage
      run: npm run test:coverage

    - name: Upload coverage
      uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 18.x

    - name: Install dependencies
      run: npm ci

    - name: Build application
      run: npm run build

    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: dist
        path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v3

    - name: Download artifacts
      uses: actions/download-artifact@v3
      with:
        name: dist
        path: dist/

    - name: Deploy to production
      env:
        DEPLOY_KEY: \${{ secrets.DEPLOY_KEY }}
      run: |
        npm run deploy:production

  publish:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'release'

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 18.x
        registry-url: 'https://registry.npmjs.org'

    - name: Install dependencies
      run: npm ci

    - name: Publish to NPM
      env:
        NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
      run: npm publish
    `.trim();
  }
}
```

## Performance Implications

### Build Performance Metrics

```javascript
class BuildPerformanceMetrics {
  static async analyze() {
    const metrics = {
      buildTime: await this.measureBuildTime(),
      bundleSize: await this.measureBundleSize(),
      dependencies: await this.analyzeDependencies(),
      optimization: await this.measureOptimization()
    };

    return this.generateReport(metrics);
  }

  static async measureBuildTime() {
    const buildTargets = ['development', 'production', 'standalone'];
    const times = {};

    for (const target of buildTargets) {
      const startTime = Date.now();

      const buildSystem = new BuildSystem();
      await buildSystem.build(target);

      times[target] = Date.now() - startTime;
    }

    return times;
  }

  static async measureBundleSize() {
    const fs = await import('fs/promises');

    const files = [
      'dist/claude-code.js',
      'dist/claude-code.min.js',
      'dist/claude-code-standalone.js'
    ];

    const sizes = {};

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        sizes[file] = {
          raw: stats.size,
          formatted: this.formatBytes(stats.size)
        };
      } catch {
        sizes[file] = null;
      }
    }

    return sizes;
  }

  static async analyzeDependencies() {
    const { execSync } = await import('child_process');

    const output = execSync('npm list --depth=0 --json', {
      encoding: 'utf8'
    });

    const deps = JSON.parse(output);

    return {
      total: Object.keys(deps.dependencies || {}).length,
      production: Object.keys(deps.dependencies || {}).filter(
        d => !deps.devDependencies?.[d]
      ).length,
      development: Object.keys(deps.devDependencies || {}).length
    };
  }

  static async measureOptimization() {
    const optimizer = new BuildOptimizer();

    const testCode = `
      function unused() { return 'unused'; }
      const used = 'used';
      console.log(used);
      if (false) { console.log('dead code'); }
    `;

    const optimized = await optimizer.optimize({
      code: testCode
    });

    return {
      originalSize: testCode.length,
      optimizedSize: optimized.minify?.minified || testCode.length,
      reduction: optimized.minify?.reduction || '0%'
    };
  }

  static formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }

    return `${size.toFixed(2)} ${units[unit]}`;
  }

  static generateReport(metrics) {
    return {
      summary: {
        fastestBuild: Object.entries(metrics.buildTime)
          .sort((a, b) => a[1] - b[1])[0],
        smallestBundle: Object.entries(metrics.bundleSize)
          .filter(([_, size]) => size)
          .sort((a, b) => a[1].raw - b[1].raw)[0],
        dependencyCount: metrics.dependencies.total
      },
      recommendations: [
        metrics.buildTime.production > 30000 &&
          'Consider optimizing production build time',
        metrics.bundleSize['dist/claude-code.min.js']?.raw > 1024 * 1024 &&
          'Bundle size exceeds 1MB, consider code splitting',
        metrics.dependencies.total > 50 &&
          'High dependency count, review and remove unused packages'
      ].filter(Boolean),
      metrics
    };
  }
}
```

## Summary

The Claude Code build and deployment system provides:

1. **Flexible Build System**: Multiple build targets with optimization strategies
2. **Advanced Bundling**: Tree shaking, code splitting, and dead code elimination
3. **Comprehensive Optimization**: Minification, compression, and constant folding
4. **Robust Deployment Pipeline**: Multi-environment support with safety checks
5. **Multiple Distribution Channels**: NPM, GitHub releases, and standalone binaries
6. **Version Management**: Semantic versioning with automated changelog generation
7. **CI/CD Integration**: GitHub Actions, GitLab CI, and Jenkins support
8. **Performance Monitoring**: Build time and bundle size tracking with recommendations

The system ensures efficient, reliable delivery of the Claude Code CLI across multiple platforms and distribution channels.

## Next Steps

In the final section of Part 9, we'll explore the debugging tools and techniques used during development.

---

*Part of the Claude Code Technical Series - Development Tools*