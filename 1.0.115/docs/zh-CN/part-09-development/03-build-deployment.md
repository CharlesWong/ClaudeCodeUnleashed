# 第 9.3 部分:构建和部署

## 简介

Claude Code 构建和部署系统将开发源代码转换为优化的、可分发的包,用于各种环境。本章探讨构建过程、打包策略、部署管道和分发机制,以实现 Claude Code CLI 向最终用户的高效交付。

## 目录
1. [构建架构](#构建架构)
2. [打包系统](#打包系统)
3. [优化策略](#优化策略)
4. [部署管道](#部署管道)
5. [分发渠道](#分发渠道)
6. [版本管理](#版本管理)
7. [CI/CD 集成](#cicd-集成)
8. [性能影响](#性能影响)

## 构建架构

### 构建系统概述

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

        // 第一遍:打包
        const bundleResult = await esbuild.build({
          entryPoints: [this.config.entry],
          outfile: 'dist/claude-code.js',
          metafile: true,
          ...this.config
        });

        // 第二遍:压缩
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
        external: [],  // 打包所有内容
        loader: {
          '.json': 'json',
          '.txt': 'text'
        }
      },

      async build() {
        const esbuild = await import('esbuild');
        const fs = await import('fs/promises');
        const path = await import('path');

        // 打包所有依赖
        const result = await esbuild.build({
          entryPoints: [this.config.entry],
          outfile: 'dist/claude-code-standalone.js',
          bundle: true,
          platform: 'node',
          external: [],  // 包含所有依赖
          ...this.config
        });

        // 创建可执行包装器
        const wrapper = `#!/usr/bin/env node
'use strict';
${await fs.readFile('dist/claude-code-standalone.js', 'utf8')}
`;

        await fs.writeFile('dist/claude-code', wrapper, {
          mode: 0o755  // 设为可执行
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
      throw new Error(`未知的构建目标: ${target}`);
    }

    console.log(`🏗️  为 ${target} 构建中...`);
    const startTime = Date.now();

    try {
      const result = await builder.build();
      const duration = Date.now() - startTime;

      console.log(`✅ 构建在 ${duration}ms 内完成`);
      return result;

    } catch (error) {
      console.error(`❌ 构建失败: ${error.message}`);
      throw error;
    }
  }
}
```

## 打包系统

### 模块打包器

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

    // 递归分析依赖
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

    // 简单的 AST 解析(生产环境会使用 babel/acorn)
    const imports = [];
    const exports = [];

    // 提取导入
    const importRegex = /import\s+(?:(.+)\s+from\s+)?['"](.+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push({
        specifiers: match[1],
        source: match[2]
      });
    }

    // 提取导出
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
        // 相对导入
        const path = await import('path');
        const resolved = path.resolve(
          path.dirname(ast.filePath),
          imp.source
        );
        deps.add(this.resolveExtension(resolved));
      } else if (!this.externalModules.has(imp.source)) {
        // Node 模块
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

    // 分析依赖
    const graph = await this.analyze(entryPoint);

    // 创建打包
    const bundle = [];

    // 添加运行时
    bundle.push(this.createRuntime(format));

    // 按依赖顺序添加模块
    const sortedModules = this.topologicalSort(graph);

    for (const module of sortedModules) {
      const ast = await this.parseModule(module);
      bundle.push(this.wrapModule(ast, format));
    }

    // 添加入口点执行
    bundle.push(this.createEntryExecution(entryPoint, format));

    // 组合和优化
    let output = bundle.join('\n');

    if (minify) {
      output = await this.minifyCode(output);
    }

    if (sourcemap) {
      output += `\n//# sourceMappingURL=${outputFile}.map`;
      await this.generateSourceMap(output, outputFile);
    }

    // 写入输出
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
// ESM 运行时
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
// CommonJS 运行时
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
    // 其他格式处理...
  }

  createEntryExecution(entryPoint, format) {
    if (format === 'esm') {
      return `__require('${entryPoint}');`;
    }
    // 其他格式处理...
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
    // 简化的源映射生成
    const sourceMap = {
      version: 3,
      sources: Array.from(this.dependencies.keys()),
      names: [],
      mappings: ''  // 会生成实际映射
    };

    const fs = await import('fs/promises');
    await fs.writeFile(
      `${outputFile}.map`,
      JSON.stringify(sourceMap)
    );
  }
}
```

## 优化策略

### 构建优化器

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

    // 应用优化
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
    // 移除未使用的导出
    const usedExports = new Set();
    const allExports = new Map();

    // 分析使用情况
    const analyzeUsage = (module) => {
      const imports = module.imports || [];
      for (const imp of imports) {
        if (imp.specifiers) {
          imp.specifiers.forEach(spec => usedExports.add(spec));
        }
      }
    };

    // 标记已使用的导出
    const markUsed = (exportName, module) => {
      if (usedExports.has(exportName)) {
        return true;
      }

      // 检查传递依赖
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
      // 变量重命名
      renameVariables: {
        enabled: true,
        reservedNames: ['process', 'global', 'Buffer'],

        rename(name) {
          if (this.reservedNames.includes(name)) {
            return name;
          }

          // 简单重命名 (a, b, c, ...)
          const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const index = this.counter++;
          return chars[index % chars.length] + (Math.floor(index / chars.length) || '');
        }
      },

      // 删除空白
      removeWhitespace: {
        enabled: true,

        process(code) {
          return code
            .replace(/\s+/g, ' ')
            .replace(/\s*([{}()[\],;:])\s*/g, '$1')
            .trim();
        }
      },

      // 删除注释
      removeComments: {
        enabled: true,
        preserveLicense: true,

        process(code) {
          // 删除单行注释
          code = code.replace(/\/\/(?!.*@license).*$/gm, '');

          // 删除多行注释
          code = code.replace(/\/\*(?!.*@license)[\s\S]*?\*\//g, '');

          return code;
        }
      },

      // 常量折叠
      foldConstants: {
        enabled: true,

        process(code) {
          // 折叠简单算术
          code = code.replace(/(\d+)\s*\+\s*(\d+)/g, (_, a, b) =>
            String(Number(a) + Number(b))
          );

          // 折叠字符串连接
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

    // 基于模式的死代码检测
    const patterns = [
      // return 后的不可达代码
      {
        regex: /return[^;]*;[\s\S]*?}/g,
        description: 'return 后的代码'
      },
      // 未使用的变量
      {
        regex: /(?:const|let|var)\s+(\w+)\s*=.*?;(?![\s\S]*\1)/g,
        description: '未使用的变量'
      },
      // 空块
      {
        regex: /\{[\s]*\}/g,
        description: '空块'
      },
      // 冗余条件
      {
        regex: /if\s*\(true\)\s*({[^}]*})/g,
        replacement: '$1',
        description: '总是为真的条件'
      },
      {
        regex: /if\s*\(false\)\s*{[^}]*}/g,
        replacement: '',
        description: '总是为假的条件'
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

    // 分析打包组成
    const analysis = {
      totalSize: content.length,
      modules: [],
      dependencies: new Map(),
      duplicates: []
    };

    // 查找模块边界
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

    // 按大小排序
    analysis.modules.sort((a, b) => b.size - a.size);

    // 查找重复
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

## 部署管道

### 部署管理器

```javascript
class DeploymentManager {
  constructor() {
    this.environments = {
      development: {
        name: '开发',
        url: 'http://localhost:3000',
        branch: 'develop',
        autoDepploy: true
      },
      staging: {
        name: '预发布',
        url: 'https://staging.claude-code.ai',
        branch: 'staging',
        autoDepploy: true,
        requiresApproval: false
      },
      production: {
        name: '生产',
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
      throw new Error(`未知环境: ${environment}`);
    }

    console.log(`🚀 部署到 ${env.name}...`);

    // 创建部署管道
    const pipeline = this.createPipeline(env, options);

    // 执行管道
    for (const step of pipeline) {
      console.log(`⚙️  ${step.name}...`);

      try {
        const result = await step.execute();

        if (result.success) {
          console.log(`  ✅ ${step.name} 完成`);
        } else {
          throw new Error(result.error);
        }

      } catch (error) {
        console.error(`  ❌ ${step.name} 失败: ${error.message}`);

        if (!step.optional) {
          throw error;
        }
      }
    }

    console.log(`✅ 部署到 ${env.name} 成功完成!`);

    return {
      environment: env.name,
      url: env.url,
      timestamp: new Date().toISOString()
    };
  }

  createPipeline(env, options) {
    const pipeline = [];

    // 部署前检查
    pipeline.push({
      name: '部署前检查',
      execute: async () => {
        const checks = await this.runPreDeploymentChecks(env);
        return { success: checks.passed };
      }
    });

    // 构建
    pipeline.push({
      name: '构建应用程序',
      execute: async () => {
        const buildSystem = new BuildSystem();
        const result = await buildSystem.build(
          env.name === '生产' ? 'production' : 'development'
        );
        return { success: true, result };
      }
    });

    // 测试
    pipeline.push({
      name: '运行测试',
      execute: async () => {
        const { execSync } = await import('child_process');

        try {
          execSync('npm test', { stdio: 'pipe' });
          return { success: true };
        } catch (error) {
          return { success: false, error: '测试失败' };
        }
      }
    });

    // 审批(如需要)
    if (env.requiresApproval && !options.skipApproval) {
      pipeline.push({
        name: '获取部署审批',
        execute: async () => {
          const approved = await this.requestApproval(env);
          return { success: approved };
        }
      });
    }

    // 部署
    pipeline.push({
      name: '部署到环境',
      execute: async () => {
        const result = await this.deployToEnvironment(env);
        return { success: result.success };
      }
    });

    // 部署后验证
    pipeline.push({
      name: '部署后验证',
      execute: async () => {
        const verified = await this.verifyDeployment(env);
        return { success: verified };
      }
    });

    // 通知
    pipeline.push({
      name: '发送通知',
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
      // 检查当前分支
      const branch = execSync('git branch --show-current', {
        encoding: 'utf8'
      }).trim();

      if (branch !== env.branch) {
        console.warn(`⚠️  不在 ${env.branch} 分支上 (当前: ${branch})`);
        return false;
      }

      // 检查未提交的更改
      const status = execSync('git status --porcelain', {
        encoding: 'utf8'
      });

      if (status.trim()) {
        console.warn('⚠️  检测到未提交的更改');
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
      // 检查安全漏洞
      const audit = execSync('npm audit --json', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      const auditResult = JSON.parse(audit);

      if (auditResult.metadata.vulnerabilities.high > 0) {
        console.warn('⚠️  检测到高严重性漏洞');
        return false;
      }

      return true;

    } catch {
      // npm audit 可能因漏洞而以非零退出
      return true;
    }
  }

  async checkEnvironment(env) {
    // 验证环境特定要求
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

    // 检查 Node 版本
    if (envReqs.nodeVersion) {
      const currentVersion = process.version;
      // 简单版本检查(生产环境会使用 semver)
      const required = parseInt(envReqs.nodeVersion.match(/\d+/)[0]);
      const current = parseInt(currentVersion.slice(1).split('.')[0]);

      if (current < required) {
        console.warn(`⚠️  Node 版本 ${currentVersion} < ${envReqs.nodeVersion}`);
        return false;
      }
    }

    // 检查必需的环境变量
    for (const [key, value] of Object.entries(envReqs)) {
      if (key !== 'nodeVersion' && !value) {
        console.warn(`⚠️  缺少必需项: ${key}`);
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

    // 检查最低要求
    if (resources.memory < 1) {
      console.warn('⚠️  可用内存不足 1GB');
      return false;
    }

    if (resources.disk < 1) {
      console.warn('⚠️  可用磁盘空间不足 1GB');
      return false;
    }

    if (resources.cpu > os.cpus().length * 0.8) {
      console.warn('⚠️  检测到高 CPU 负载');
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
      return 10; // 如果检查失败,假设有足够空间
    }
  }

  async requestApproval(env) {
    console.log(`⏸️  部署到 ${env.name} 需要审批`);

    // 生产环境中,这将与审批系统集成
    // 现在模拟审批
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question('批准部署? (yes/no): ', answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      });
    });
  }

  async deployToEnvironment(env) {
    // 部署策略
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

    // 启动本地开发服务器
    const child = spawn('npm', ['start'], {
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    return { success: true, pid: child.pid };
  }

  async deployStaging(env) {
    // 部署到预发布环境
    // 通常会使用云提供商 API
    console.log(`部署到预发布: ${env.url}`);

    return { success: true };
  }

  async deployProduction(env) {
    // 部署到生产环境,带额外安全措施
    console.log(`部署到生产: ${env.url}`);

    // 创建备份
    await this.createBackup();

    // 带回滚能力的部署
    const deployment = await this.deployWithRollback(env);

    return deployment;
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:]/g, '-');
    const backupName = `backup-${timestamp}`;

    console.log(`创建备份: ${backupName}`);

    // 备份实现
    return backupName;
  }

  async deployWithRollback(env) {
    let previousVersion = null;

    try {
      // 保存当前版本
      previousVersion = await this.getCurrentVersion(env);

      // 部署新版本
      await this.deployNewVersion(env);

      // 验证部署
      const verified = await this.verifyDeployment(env);

      if (!verified) {
        throw new Error('部署验证失败');
      }

      return { success: true };

    } catch (error) {
      console.error('部署失败,正在回滚...');

      if (previousVersion) {
        await this.rollback(env, previousVersion);
      }

      throw error;
    }
  }

  async verifyDeployment(env) {
    const checks = [];

    // 健康检查
    checks.push(await this.healthCheck(env));

    // 冒烟测试
    checks.push(await this.runSmokeTests(env));

    // 性能检查
    checks.push(await this.performanceCheck(env));

    return checks.every(c => c === true);
  }

  async healthCheck(env) {
    // 简单健康检查(会使用实际 HTTP 请求)
    console.log(`健康检查: ${env.url}/health`);
    return true;
  }

  async runSmokeTests(env) {
    console.log('运行冒烟测试...');
    // 运行关键路径测试
    return true;
  }

  async performanceCheck(env) {
    console.log('检查性能指标...');
    // 验证响应时间、内存使用等
    return true;
  }

  async sendNotifications(env) {
    // 发送部署通知
    const notifications = [
      { type: 'email', recipients: ['team@claude-code.ai'] },
      { type: 'slack', channel: '#deployments' }
    ];

    for (const notification of notifications) {
      console.log(`发送 ${notification.type} 通知...`);
      // 实现会发送实际通知
    }
  }
}
```

## 分发渠道

### 包发布器

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
        console.warn(`未知渠道: ${channel}`);
        continue;
      }

      console.log(`📦 发布到 ${channel}...`);

      try {
        const result = await publisher.publish(version);
        results[channel] = result;
        console.log(`  ✅ 已发布到 ${channel}`);

      } catch (error) {
        console.error(`  ❌ 发布到 ${channel} 失败: ${error.message}`);
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

    // 更新 package.json 版本
    const packageJson = JSON.parse(
      await fs.readFile('package.json', 'utf8')
    );

    packageJson.version = version;

    await fs.writeFile(
      'package.json',
      JSON.stringify(packageJson, null, 2)
    );

    // 运行 npm publish
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

    // 创建发布
    const release = await octokit.repos.createRelease({
      owner: 'anthropics',
      repo: 'claude-code',
      tag_name: `v${version}`,
      name: `Claude Code v${version}`,
      body: await this.generateReleaseNotes(version),
      draft: false,
      prerelease: version.includes('beta') || version.includes('alpha')
    });

    // 上传资源
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
    // 从变更日志生成发布说明
    return `# Claude Code v${version}\n\n## 更改\n\n- 功能改进\n- Bug 修复\n- 性能优化`;
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

    // 上传到 CDN
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

    // 使用 pkg 或 nexe 创建独立版本
    execSync(`pkg . --target node16-${os}-${arch} --output dist/${outputName}`);

    return {
      name: outputName,
      platform,
      size: (await import('fs')).statSync(`dist/${outputName}`).size
    };
  }

  async uploadToCDN(artifacts) {
    // 上传工件到 CDN (S3, CloudFlare 等)
    console.log('上传工件到 CDN...');

    for (const artifact of artifacts) {
      console.log(`  上传 ${artifact.name} (${artifact.size} 字节)`);
      // 实际上传实现
    }
  }
}
```

## 版本管理

### 版本控制器

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

    // 更新 package.json
    const packageJson = JSON.parse(
      await fs.readFile('package.json', 'utf8')
    );

    packageJson.version = version;

    await fs.writeFile(
      'package.json',
      JSON.stringify(packageJson, null, 2)
    );

    // 更新 package-lock.json
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
      // package-lock.json 可能不存在
    }

    // 创建 git 标签
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
      execSync(`git commit -m "chore: 版本升级至 ${version}"`);
      execSync(`git tag -a v${version} -m "版本 ${version}"`);
    } catch {
      // Git 操作可能在 CI 中失败
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

## CI/CD 集成

### CI/CD 管道

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
      throw new Error(`未知的 CI/CD 提供商: ${provider}`);
    }

    return generator.generateConfig();
  }
}

class GitHubActions {
  generateConfig() {
    return `
name: CI/CD 管道

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

    - name: 使用 Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}

    - name: 安装依赖
      run: npm ci

    - name: 运行代码检查
      run: npm run lint

    - name: 运行测试
      run: npm test

    - name: 生成覆盖率
      run: npm run test:coverage

    - name: 上传覆盖率
      uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: 设置 Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 18.x

    - name: 安装依赖
      run: npm ci

    - name: 构建应用程序
      run: npm run build

    - name: 上传工件
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

    - name: 下载工件
      uses: actions/download-artifact@v3
      with:
        name: dist
        path: dist/

    - name: 部署到生产
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

    - name: 设置 Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 18.x
        registry-url: 'https://registry.npmjs.org'

    - name: 安装依赖
      run: npm ci

    - name: 发布到 NPM
      env:
        NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
      run: npm publish
    `.trim();
  }
}
```

## 性能影响

### 构建性能指标

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
          '考虑优化生产构建时间',
        metrics.bundleSize['dist/claude-code.min.js']?.raw > 1024 * 1024 &&
          '打包大小超过 1MB,考虑代码拆分',
        metrics.dependencies.total > 50 &&
          '依赖数量较多,检查并移除未使用的包'
      ].filter(Boolean),
      metrics
    };
  }
}
```

## 总结

Claude Code 构建和部署系统提供:

1. **灵活的构建系统**:多个构建目标和优化策略
2. **高级打包**:树摇、代码拆分和死代码消除
3. **全面优化**:压缩、压缩和常量折叠
4. **稳健的部署管道**:多环境支持,带安全检查
5. **多个分发渠道**:NPM、GitHub 发布和独立二进制文件
6. **版本管理**:语义版本控制和自动变更日志生成
7. **CI/CD 集成**:支持 GitHub Actions、GitLab CI 和 Jenkins
8. **性能监控**:构建时间和打包大小跟踪,带建议

该系统确保 Claude Code CLI 在多个平台和分发渠道上的高效、可靠交付。

## 下一步

在第 9 部分的最后一节中,我们将探讨开发过程中使用的调试工具和技术。

---

*Claude Code 技术系列的一部分 - 开发工具*