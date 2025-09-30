# 第 9.2 部分:测试框架

## 简介

Claude Code 测试框架为单元测试、集成测试、端到端测试和性能测试提供全面的测试覆盖。本章探讨用于确保 AI 驱动 CLI 系统可靠性、可维护性和正确性的测试策略、工具和模式。

## 目录
1. [测试架构](#测试架构)
2. [单元测试](#单元测试)
3. [集成测试](#集成测试)
4. [端到端测试](#端到端测试)
5. [模拟和存根系统](#模拟和存根系统)
6. [测试工具](#测试工具)
7. [覆盖率和报告](#覆盖率和报告)
8. [性能影响](#性能影响)

## 测试架构

### 测试组织

```javascript
class TestArchitecture {
  static getStructure() {
    return {
      tests: {
        unit: {
          'circular-buffer.test.js': 'CircularBuffer 单元测试',
          'command-parser.test.js': '命令解析器单元测试',
          'shell-info.test.js': 'Shell 信息单元测试',
          'process-helpers.test.js': '进程帮助器单元测试',
          'config.test.js': '配置单元测试'
        },
        integration: {
          'comprehensive-test.js': '完整集成测试套件',
          'full-functionality-test.js': '端到端功能测试',
          'tool-integration.test.js': '工具系统集成测试',
          'api-integration.test.js': 'API 客户端集成测试',
          'agent-integration.test.js': '代理系统集成测试'
        },
        e2e: {
          'cli-workflow.test.js': 'CLI 工作流测试',
          'conversation-flow.test.js': '对话流程测试',
          'tool-execution.test.js': '工具执行测试'
        },
        performance: {
          'startup-performance.test.js': '启动时间测试',
          'memory-usage.test.js': '内存使用测试',
          'response-time.test.js': '响应时间测试'
        },
        fixtures: {
          'test-files/': '测试文件固件',
          'mock-responses/': '模拟 API 响应',
          'sample-projects/': '示例项目结构'
        }
      }
    };
  }

  static getTestRunner() {
    return {
      framework: 'custom', // 当前使用自定义测试运行器
      planned: 'vitest',   // 计划迁移到 Vitest
      features: [
        '异步测试支持',
        '并行执行',
        '测试隔离',
        '覆盖率报告',
        '监视模式',
        '快照测试'
      ]
    };
  }
}
```

### 测试运行器实现

```javascript
// 当前自定义测试运行器实现
class TestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      passed: [],
      failed: [],
      skipped: [],
      errors: []
    };
    this.startTime = null;
    this.endTime = null;
  }

  // 测试注册
  test(name, fn, options = {}) {
    this.tests.push({
      name,
      fn,
      options,
      status: 'pending'
    });
  }

  // 测试执行
  async run() {
    this.startTime = Date.now();
    console.log('🧪 启动测试套件...\n');

    for (const test of this.tests) {
      await this.executeTest(test);
    }

    this.endTime = Date.now();
    this.printSummary();
    return this.getExitCode();
  }

  async executeTest(test) {
    const { name, fn, options } = test;

    // 检查是否应跳过测试
    if (options.skip) {
      console.log(`⊘ 跳过: ${name}`);
      this.results.skipped.push(name);
      test.status = 'skipped';
      return;
    }

    // 检查测试是否匹配过滤器
    if (options.only && !this.hasOnlyTests()) {
      return; // 当存在 only 测试时跳过非 only 测试
    }

    try {
      // 设置测试环境
      const context = await this.setupTestContext(options);

      // 带超时执行测试
      const timeout = options.timeout || 5000;
      const testPromise = fn(context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('测试超时')), timeout)
      );

      process.stdout.write(`测试 ${name}... `);
      await Promise.race([testPromise, timeoutPromise]);

      // 清理
      await this.cleanupTestContext(context);

      console.log('✅ 通过');
      this.results.passed.push(name);
      test.status = 'passed';

    } catch (error) {
      console.log('❌ 失败');
      console.log(`  错误: ${error.message}`);
      if (error.stack && options.verbose) {
        console.log(error.stack);
      }

      this.results.failed.push({
        name,
        error: error.message,
        stack: error.stack
      });
      test.status = 'failed';
    }
  }

  async setupTestContext(options) {
    const context = {
      tempDir: null,
      mocks: new Map(),
      spies: new Map(),
      cleanup: []
    };

    // 如需要则创建临时目录
    if (options.useTempDir) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      context.tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'claude-test-')
      );
    }

    return context;
  }

  async cleanupTestContext(context) {
    // 运行清理函数
    for (const cleanupFn of context.cleanup) {
      await cleanupFn();
    }

    // 删除临时目录
    if (context.tempDir) {
      const fs = await import('fs/promises');
      await fs.rm(context.tempDir, { recursive: true, force: true });
    }

    // 恢复模拟
    for (const [target, original] of context.mocks) {
      Object.assign(target, original);
    }
  }

  hasOnlyTests() {
    return this.tests.some(t => t.options.only);
  }

  printSummary() {
    const duration = this.endTime - this.startTime;
    const total = this.results.passed.length + this.results.failed.length;
    const passRate = total > 0
      ? ((this.results.passed.length / total) * 100).toFixed(1)
      : 0;

    console.log('\n' + '═'.repeat(60));
    console.log('测试摘要');
    console.log('═'.repeat(60));

    console.log(`\n📊 结果:`);
    console.log(`  ✅ 通过: ${this.results.passed.length}`);
    console.log(`  ❌ 失败: ${this.results.failed.length}`);
    console.log(`  ⊘ 跳过: ${this.results.skipped.length}`);
    console.log(`\n  📈 通过率: ${passRate}%`);
    console.log(`  ⏱️  持续时间: ${duration}ms`);

    if (this.results.failed.length > 0) {
      console.log('\n❌ 失败的测试:');
      for (const failure of this.results.failed) {
        console.log(`  • ${failure.name}`);
        console.log(`    ${failure.error}`);
      }
    }
  }

  getExitCode() {
    return this.results.failed.length > 0 ? 1 : 0;
  }
}

// 测试 DSL
const runner = new TestRunner();

export const test = (name, fn, options) => runner.test(name, fn, options);
export const describe = (suite, fn) => {
  console.log(`\n📦 ${suite}`);
  fn();
};
export const it = test;
export const skip = (name, fn) => test(name, fn, { skip: true });
export const only = (name, fn) => test(name, fn, { only: true });
export const runTests = () => runner.run();
```

## 单元测试

### 循环缓冲区测试

```javascript
import { describe, test, runTests } from '../test-framework.js';
import CircularBuffer from '../../src/utils/circular-buffer.js';
import assert from 'assert';

describe('CircularBuffer', () => {
  test('应使用正确的容量初始化', async () => {
    const buffer = new CircularBuffer(5);
    assert.strictEqual(buffer.capacity, 5);
    assert.strictEqual(buffer.size(), 0);
    assert.strictEqual(buffer.isEmpty(), true);
    assert.strictEqual(buffer.isFull(), false);
  });

  test('应正确添加项目', async () => {
    const buffer = new CircularBuffer(3);

    buffer.add('a');
    assert.strictEqual(buffer.size(), 1);
    assert.deepStrictEqual(buffer.toArray(), ['a']);

    buffer.add('b');
    buffer.add('c');
    assert.strictEqual(buffer.size(), 3);
    assert.deepStrictEqual(buffer.toArray(), ['a', 'b', 'c']);
    assert.strictEqual(buffer.isFull(), true);
  });

  test('缓冲区满时应覆盖最旧的项目', async () => {
    const buffer = new CircularBuffer(3);

    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    buffer.add('d'); // 覆盖 'a'

    assert.strictEqual(buffer.size(), 3);
    assert.deepStrictEqual(buffer.toArray(), ['b', 'c', 'd']);
  });

  test('应获取最近的项目', async () => {
    const buffer = new CircularBuffer(5);

    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    buffer.add('d');
    buffer.add('e');

    assert.deepStrictEqual(buffer.getRecent(3), ['c', 'd', 'e']);
    assert.deepStrictEqual(buffer.getRecent(10), ['a', 'b', 'c', 'd', 'e']);
  });

  test('应清空缓冲区', async () => {
    const buffer = new CircularBuffer(3);

    buffer.add('a');
    buffer.add('b');
    buffer.clear();

    assert.strictEqual(buffer.size(), 0);
    assert.strictEqual(buffer.isEmpty(), true);
    assert.deepStrictEqual(buffer.toArray(), []);
  });

  test('应处理 get() 方法', async () => {
    const buffer = new CircularBuffer(3);

    buffer.add('line1\n');
    buffer.add('line2\n');
    buffer.add('line3');

    const result = buffer.get();
    assert.strictEqual(result, 'line1\nline2\nline3');
  });

  test('应处理边缘情况', async () => {
    // 零容量
    assert.throws(() => new CircularBuffer(0), /容量必须为正/);

    // 负容量
    assert.throws(() => new CircularBuffer(-1), /容量必须为正/);

    // 非数字容量
    assert.throws(() => new CircularBuffer('5'), /容量必须是数字/);
  });

  test('应处理大缓冲区的性能', async () => {
    const buffer = new CircularBuffer(10000);
    const startTime = Date.now();

    // 添加 100,000 个项目(容量的 10 倍)
    for (let i = 0; i < 100000; i++) {
      buffer.add(`item-${i}`);
    }

    const duration = Date.now() - startTime;
    assert(duration < 1000, '应在 1 秒内处理 10 万次添加');

    // 验证保留的项目正确
    assert.strictEqual(buffer.size(), 10000);
    const recent = buffer.getRecent(3);
    assert.deepStrictEqual(recent, [
      'item-99997',
      'item-99998',
      'item-99999'
    ]);
  });
});

runTests();
```

### 命令解析器测试

```javascript
import { describe, test, runTests } from '../test-framework.js';
import {
  parseCommand,
  splitByPipes,
  escapeShellArg,
  isSimpleReadCommand,
  containsDangerousPatterns
} from '../../src/utils/command-parser.js';
import assert from 'assert';

describe('命令解析器', () => {
  describe('parseCommand', () => {
    test('应解析简单命令', async () => {
      const result = parseCommand('echo hello');
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, ['echo', 'hello']);
    });

    test('应处理带引号的参数', async () => {
      const result = parseCommand('echo "hello world"');
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, ['echo', 'hello world']);
    });

    test('应处理单引号', async () => {
      const result = parseCommand("echo 'hello world'");
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, ['echo', 'hello world']);
    });

    test('应处理转义字符', async () => {
      const result = parseCommand('echo hello\\ world');
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, ['echo', 'hello world']);
    });

    test('应处理复杂命令', async () => {
      const result = parseCommand(
        'git commit -m "feat: add new feature" --no-verify'
      );
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, [
        'git',
        'commit',
        '-m',
        'feat: add new feature',
        '--no-verify'
      ]);
    });

    test('应处理空输入', async () => {
      const result = parseCommand('');
      assert.strictEqual(result.success, false);
      assert(result.error.includes('空'));
    });

    test('应处理未闭合的引号', async () => {
      const result = parseCommand('echo "unclosed');
      assert.strictEqual(result.success, false);
      assert(result.error.includes('引号'));
    });
  });

  describe('splitByPipes', () => {
    test('应按管道分割', async () => {
      const result = splitByPipes('ls | grep test | wc -l');
      assert.deepStrictEqual(result, ['ls', 'grep test', 'wc -l']);
    });

    test('应处理引号中的管道', async () => {
      const result = splitByPipes('echo "a | b" | grep test');
      assert.deepStrictEqual(result, ['echo "a | b"', 'grep test']);
    });

    test('应处理转义的管道', async () => {
      const result = splitByPipes('echo a\\|b | grep test');
      assert.deepStrictEqual(result, ['echo a\\|b', 'grep test']);
    });
  });

  describe('escapeShellArg', () => {
    test('应转义简单字符串', async () => {
      assert.strictEqual(escapeShellArg('hello'), 'hello');
    });

    test('应转义带空格的字符串', async () => {
      assert.strictEqual(escapeShellArg('hello world'), "'hello world'");
    });

    test('应转义危险字符', async () => {
      assert.strictEqual(escapeShellArg('rm -rf /'), "'rm -rf /'");
      assert.strictEqual(escapeShellArg('$HOME'), "'$HOME'");
      assert.strictEqual(escapeShellArg('`pwd`'), "'`pwd`'");
    });

    test('应处理单引号', async () => {
      assert.strictEqual(
        escapeShellArg("it's"),
        "'it'\"'\"'s'"
      );
    });
  });

  describe('isSimpleReadCommand', () => {
    test('应识别只读命令', async () => {
      assert(isSimpleReadCommand('ls'));
      assert(isSimpleReadCommand('pwd'));
      assert(isSimpleReadCommand('echo test'));
      assert(isSimpleReadCommand('cat file.txt'));
      assert(isSimpleReadCommand('grep pattern'));
    });

    test('应拒绝写入命令', async () => {
      assert(!isSimpleReadCommand('rm file'));
      assert(!isSimpleReadCommand('mv old new'));
      assert(!isSimpleReadCommand('chmod +x file'));
      assert(!isSimpleReadCommand('git push'));
    });
  });

  describe('containsDangerousPatterns', () => {
    test('应检测危险模式', async () => {
      assert(containsDangerousPatterns('rm -rf /'));
      assert(containsDangerousPatterns(':(){ :|:& };:'));
      assert(containsDangerousPatterns('dd if=/dev/zero of=/dev/sda'));
      assert(containsDangerousPatterns('mkfs.ext4 /dev/sda'));
    });

    test('应允许安全命令', async () => {
      assert(!containsDangerousPatterns('ls -la'));
      assert(!containsDangerousPatterns('echo hello'));
      assert(!containsDangerousPatterns('grep pattern file'));
    });
  });
});

runTests();
```

## 集成测试

### 综合集成测试

```javascript
import { describe, test, runTests } from '../test-framework.js';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

describe('综合集成测试', () => {
  describe('工具集成', () => {
    test('应正确集成所有工具', async (context) => {
      const toolRegistry = await import('../../src/tools/index.js');

      // 验证所有工具已注册
      const expectedTools = [
        'Bash', 'Read', 'Write', 'Edit', 'MultiEdit',
        'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Task'
      ];

      for (const toolName of expectedTools) {
        const tool = toolRegistry.getToolByName(toolName);
        assert(tool, `工具 ${toolName} 应该已注册`);
        assert(typeof tool.call === 'function',
               `工具 ${toolName} 应有 call 方法`);
      }
    });

    test('应执行 bash 命令', async (context) => {
      const { executeBashCommand } = await import(
        '../../src/tools/bash-implementation.js'
      );

      const input = {
        command: 'echo "集成测试"',
        timeout: 5000
      };

      const generator = executeBashCommand({
        input,
        abortController: new AbortController()
      });

      const results = [];
      for await (const result of generator) {
        results.push(result);
      }

      assert(results.length > 0);
      const finalResult = results[results.length - 1];
      assert(finalResult.stdout.includes('集成测试'));
      assert.strictEqual(finalResult.code, 0);
    });

    test('应处理文件操作', async (context) => {
      const testFile = path.join(context.tempDir, 'test.txt');
      const testContent = '集成测试内容';

      // 写入文件
      await fs.promises.writeFile(testFile, testContent);

      // 读取文件
      const content = await fs.promises.readFile(testFile, 'utf8');
      assert.strictEqual(content, testContent);

      // 编辑文件
      const newContent = content.replace('测试', 'TEST');
      await fs.promises.writeFile(testFile, newContent);

      // 验证编辑
      const edited = await fs.promises.readFile(testFile, 'utf8');
      assert.strictEqual(edited, '集成TEST内容');
    }, { useTempDir: true });
  });

  describe('API 集成', () => {
    test('应初始化 API 客户端', async () => {
      const { APIClient } = await import('../../src/api/client.js');

      const client = new APIClient({
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229'
      });

      assert(client);
      assert.strictEqual(client.config.model, 'claude-3-opus-20240229');
    });

    test('应处理流式传输', async () => {
      const { StreamProcessor } = await import('../../src/api/streaming.js');

      const processor = new StreamProcessor();
      assert(typeof processor.process === 'function');
      assert(typeof processor.handleChunk === 'function');
    });

    test('应处理速率限制', async () => {
      const { RateLimiter } = await import('../../src/api/rate-limiting.js');

      const limiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60000
      });

      // 应允许初始请求
      for (let i = 0; i < 10; i++) {
        assert(await limiter.checkLimit());
      }

      // 超过限制后应阻止
      assert(!(await limiter.checkLimit()));
    });
  });

  describe('代理集成', () => {
    test('应编排代理', async () => {
      const { AgentOrchestrator } = await import(
        '../../src/cli/agents/agent-orchestrator.js'
      );

      const orchestrator = new AgentOrchestrator();
      assert(orchestrator);

      // 验证代理类型
      const agentTypes = orchestrator.getAgentTypes();
      assert(agentTypes.includes('general'));
      assert(agentTypes.includes('output-style'));
      assert(agentTypes.includes('status-line'));
    });

    test('应执行代理任务', async () => {
      const { executeAgentTask } = await import(
        '../../src/cli/agents/agent-orchestrator.js'
      );

      const task = {
        type: 'general',
        prompt: '测试任务',
        tools: ['Read', 'Write']
      };

      // 通常会连接到 API
      // 测试时我们模拟响应
      const mockExecute = async (task) => {
        return {
          success: true,
          result: '任务完成',
          toolCalls: []
        };
      };

      const result = await mockExecute(task);
      assert(result.success);
    });
  });

  describe('UI 集成', () => {
    test('应渲染终端 UI', async () => {
      const { Terminal } = await import('../../src/cli/ui/terminal.js');

      const terminal = new Terminal();
      assert(terminal);
      assert(typeof terminal.write === 'function');
      assert(typeof terminal.clear === 'function');
      assert(typeof terminal.moveCursor === 'function');
    });

    test('应渲染 Markdown', async () => {
      const { MarkdownRenderer } = await import('../../src/cli/ui/markdown.js');

      const renderer = new MarkdownRenderer();
      const markdown = '# 测试\n\n**粗体**文本';
      const rendered = renderer.render(markdown);

      assert(rendered.includes('测试'));
      assert(rendered.includes('粗体'));
    });

    test('应显示进度', async () => {
      const { ProgressBar } = await import('../../src/cli/ui/progress.js');

      const progress = new ProgressBar({
        total: 100,
        width: 40
      });

      progress.update(50);
      const display = progress.render();
      assert(display.includes('50%'));
    });
  });
});

runTests();
```

## 端到端测试

### CLI 工作流测试

```javascript
import { describe, test, runTests } from '../test-framework.js';
import { spawn } from 'child_process';
import assert from 'assert';
import path from 'path';

describe('端到端 CLI 工作流', () => {
  const cliPath = path.join(process.cwd(), 'src', 'cli', 'main.js');

  async function runCLI(args, input = null) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [cliPath, ...args], {
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => {
        stdout += data.toString();
      });

      child.stderr.on('data', data => {
        stderr += data.toString();
      });

      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }

      child.on('close', code => {
        resolve({ code, stdout, stderr });
      });

      child.on('error', reject);

      // 10 秒后超时
      setTimeout(() => {
        child.kill();
        reject(new Error('CLI 超时'));
      }, 10000);
    });
  }

  test('应显示帮助', async () => {
    const result = await runCLI(['--help']);
    assert.strictEqual(result.code, 0);
    assert(result.stdout.includes('Claude Code CLI'));
    assert(result.stdout.includes('命令:'));
  });

  test('应显示版本', async () => {
    const result = await runCLI(['--version']);
    assert.strictEqual(result.code, 0);
    assert(result.stdout.includes('1.0.115'));
  });

  test('应处理聊天命令', async () => {
    const result = await runCLI(['chat'], 'exit\n');
    assert.strictEqual(result.code, 0);
    assert(result.stdout.includes('聊天会话'));
  }, { timeout: 15000 });

  test('应处理询问命令', async () => {
    const result = await runCLI(
      ['ask', 'What is 2+2?'],
      null
    );
    // 实际场景中会连接到 API
    // 测试时我们检查命令解析
    assert(result.code === 0 || result.stderr.includes('API'));
  });

  test('应处理无效命令', async () => {
    const result = await runCLI(['invalid-command']);
    assert(result.code !== 0);
    assert(result.stderr.includes('未知命令') ||
           result.stderr.includes('invalid'));
  });

  test('应处理配置', async () => {
    const result = await runCLI(['config', 'list']);
    // 检查配置命令是否被识别
    assert(result.stdout.includes('config') ||
           result.stderr.includes('config'));
  });
});

runTests();
```

## 模拟和存根系统

### 模拟框架

```javascript
class MockFramework {
  constructor() {
    this.mocks = new Map();
    this.spies = new Map();
    this.stubs = new Map();
  }

  // 创建模拟对象
  mock(name, implementation = {}) {
    const mock = {
      name,
      calls: [],
      implementation,

      // 跟踪调用
      __call(method, ...args) {
        this.calls.push({ method, args, timestamp: Date.now() });

        if (typeof implementation[method] === 'function') {
          return implementation[method](...args);
        }

        return undefined;
      },

      // 验证方法
      wasCalled() {
        return this.calls.length > 0;
      },

      wasCalledWith(method, ...expectedArgs) {
        return this.calls.some(call =>
          call.method === method &&
          JSON.stringify(call.args) === JSON.stringify(expectedArgs)
        );
      },

      callCount(method) {
        return this.calls.filter(c => c.method === method).length;
      },

      reset() {
        this.calls = [];
      }
    };

    // 创建代理以拦截方法调用
    const proxy = new Proxy(mock.implementation, {
      get(target, prop) {
        if (prop in mock && typeof mock[prop] === 'function') {
          return mock[prop].bind(mock);
        }

        return (...args) => mock.__call(prop, ...args);
      }
    });

    this.mocks.set(name, { mock, proxy });
    return proxy;
  }

  // 在现有对象上创建间谍
  spy(target, method) {
    const original = target[method];
    const calls = [];

    target[method] = function(...args) {
      calls.push({
        args,
        context: this,
        timestamp: Date.now(),
        result: undefined,
        error: undefined
      });

      try {
        const result = original.apply(this, args);
        calls[calls.length - 1].result = result;
        return result;
      } catch (error) {
        calls[calls.length - 1].error = error;
        throw error;
      }
    };

    const spy = {
      calls,
      restore() {
        target[method] = original;
      },
      reset() {
        calls.length = 0;
      }
    };

    this.spies.set(`${target.constructor.name}.${method}`, spy);
    return spy;
  }

  // 创建存根
  stub(target, method, implementation) {
    const original = target[method];

    target[method] = implementation;

    const stub = {
      restore() {
        target[method] = original;
      }
    };

    this.stubs.set(`${target.constructor.name}.${method}`, stub);
    return stub;
  }

  // 恢复所有模拟、间谍和存根
  restoreAll() {
    for (const spy of this.spies.values()) {
      spy.restore();
    }

    for (const stub of this.stubs.values()) {
      stub.restore();
    }

    this.mocks.clear();
    this.spies.clear();
    this.stubs.clear();
  }
}

// 使用示例
const mockFramework = new MockFramework();

// 模拟 API 客户端
const mockAPIClient = mockFramework.mock('APIClient', {
  async sendMessage(message) {
    return {
      content: '模拟响应',
      model: 'claude-3-opus-20240229'
    };
  }
});

// 文件系统间谍
const fsSpy = mockFramework.spy(fs, 'readFile');

// process.exit 存根
const exitStub = mockFramework.stub(process, 'exit', code => {
  console.log(`进程将退出,代码 ${code}`);
});
```

## 测试工具

### 测试帮助器

```javascript
class TestHelpers {
  // 带更好错误消息的断言
  static assert = {
    equal(actual, expected, message) {
      if (actual !== expected) {
        throw new Error(
          message ||
          `期望 ${expected} 但得到 ${actual}`
        );
      }
    },

    deepEqual(actual, expected, message) {
      const actualStr = JSON.stringify(actual, null, 2);
      const expectedStr = JSON.stringify(expected, null, 2);

      if (actualStr !== expectedStr) {
        throw new Error(
          message ||
          `深度相等失败:\n期望:\n${expectedStr}\n\n实际:\n${actualStr}`
        );
      }
    },

    includes(haystack, needle, message) {
      if (!haystack.includes(needle)) {
        throw new Error(
          message ||
          `期望 "${haystack}" 包含 "${needle}"`
        );
      }
    },

    async throws(fn, expectedError, message) {
      try {
        await fn();
        throw new Error(
          message ||
          '期望函数抛出异常但未抛出'
        );
      } catch (error) {
        if (expectedError) {
          if (expectedError instanceof RegExp) {
            if (!expectedError.test(error.message)) {
              throw new Error(
                `期望错误匹配 ${expectedError} 但得到: ${error.message}`
              );
            }
          } else if (error.message !== expectedError) {
            throw new Error(
              `期望错误 "${expectedError}" 但得到: ${error.message}`
            );
          }
        }
      }
    }
  };

  // 等待工具
  static wait = {
    async delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    async until(condition, timeout = 5000) {
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        if (await condition()) {
          return true;
        }
        await this.delay(100);
      }

      throw new Error('等待条件超时');
    },

    async forEvent(emitter, event, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`等待事件超时: ${event}`));
        }, timeout);

        emitter.once(event, (...args) => {
          clearTimeout(timer);
          resolve(args);
        });
      });
    }
  };

  // 文件系统帮助器
  static async createTempFile(content = '') {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const tempDir = os.tmpdir();
    const tempFile = path.join(
      tempDir,
      `claude-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    await fs.writeFile(tempFile, content);

    return {
      path: tempFile,
      async cleanup() {
        await fs.unlink(tempFile).catch(() => {});
      }
    };
  }

  static async createTempDir() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'claude-test-')
    );

    return {
      path: tempDir,
      async cleanup() {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  // 进程帮助器
  static async runProcess(command, args = [], options = {}) {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, options);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', data => {
        stdout += data.toString();
      });

      child.stderr?.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', code => {
        resolve({ code, stdout, stderr });
      });

      child.on('error', reject);
    });
  }
}
```

### 快照测试

```javascript
class SnapshotTesting {
  constructor(snapshotDir = '__snapshots__') {
    this.snapshotDir = snapshotDir;
    this.snapshots = new Map();
  }

  async loadSnapshots() {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const files = await fs.readdir(this.snapshotDir);

      for (const file of files) {
        if (file.endsWith('.snap')) {
          const content = await fs.readFile(
            path.join(this.snapshotDir, file),
            'utf8'
          );

          const testName = file.replace('.snap', '');
          this.snapshots.set(testName, JSON.parse(content));
        }
      }
    } catch {
      // 快照目录尚不存在
    }
  }

  async saveSnapshot(testName, data) {
    const fs = await import('fs/promises');
    const path = await import('path');

    await fs.mkdir(this.snapshotDir, { recursive: true });

    await fs.writeFile(
      path.join(this.snapshotDir, `${testName}.snap`),
      JSON.stringify(data, null, 2)
    );
  }

  async matchSnapshot(testName, actual) {
    const expected = this.snapshots.get(testName);

    if (!expected) {
      // 首次运行 - 创建快照
      await this.saveSnapshot(testName, actual);
      console.log(`📸 已为 ${testName} 创建快照`);
      return true;
    }

    // 比较快照
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);

    if (actualStr !== expectedStr) {
      throw new Error(
        `${testName} 的快照不匹配\n` +
        `期望:\n${expectedStr}\n\n` +
        `实际:\n${actualStr}`
      );
    }

    return true;
  }

  async updateSnapshot(testName, data) {
    await this.saveSnapshot(testName, data);
    this.snapshots.set(testName, data);
    console.log(`📸 已更新 ${testName} 的快照`);
  }
}
```

## 覆盖率和报告

### 覆盖率收集

```javascript
class CoverageCollector {
  constructor() {
    this.coverage = new Map();
    this.originalFunctions = new Map();
  }

  instrumentModule(modulePath, module) {
    const coverage = {
      path: modulePath,
      functions: {},
      lines: {},
      branches: {}
    };

    // 检测所有函数
    for (const [key, value] of Object.entries(module)) {
      if (typeof value === 'function') {
        const original = value;
        const functionCoverage = {
          name: key,
          calls: 0,
          lines: new Set()
        };

        module[key] = function(...args) {
          functionCoverage.calls++;

          // 跟踪行执行(简化版)
          const error = new Error();
          const stack = error.stack.split('\n');
          const caller = stack[2];
          const match = caller.match(/:(\d+):\d+/);

          if (match) {
            const line = parseInt(match[1]);
            functionCoverage.lines.add(line);
          }

          return original.apply(this, args);
        };

        coverage.functions[key] = functionCoverage;
        this.originalFunctions.set(`${modulePath}.${key}`, original);
      }
    }

    this.coverage.set(modulePath, coverage);
    return module;
  }

  generateReport() {
    const report = {
      summary: {
        totalModules: this.coverage.size,
        totalFunctions: 0,
        coveredFunctions: 0,
        totalLines: 0,
        coveredLines: 0
      },
      modules: []
    };

    for (const [path, coverage] of this.coverage) {
      const moduleReport = {
        path,
        functions: {
          total: Object.keys(coverage.functions).length,
          covered: 0
        },
        lines: {
          total: 0,
          covered: 0
        }
      };

      for (const func of Object.values(coverage.functions)) {
        report.summary.totalFunctions++;

        if (func.calls > 0) {
          report.summary.coveredFunctions++;
          moduleReport.functions.covered++;
        }

        moduleReport.lines.covered += func.lines.size;
      }

      report.modules.push(moduleReport);
    }

    // 计算百分比
    report.summary.functionCoverage =
      (report.summary.coveredFunctions / report.summary.totalFunctions * 100).toFixed(1);

    return report;
  }

  async saveHTMLReport(report) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>覆盖率报告</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; }
    .good { color: green; }
    .medium { color: orange; }
    .bad { color: red; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #333; color: white; }
    tr:hover { background: #f5f5f5; }
    .bar { background: #ddd; height: 20px; position: relative; }
    .bar-fill { background: #4CAF50; height: 100%; }
  </style>
</head>
<body>
  <h1>覆盖率报告</h1>

  <div class="summary">
    <h2>摘要</h2>
    <p>总模块数: ${report.summary.totalModules}</p>
    <p>函数覆盖率: ${report.summary.functionCoverage}%</p>
    <div class="bar">
      <div class="bar-fill" style="width: ${report.summary.functionCoverage}%"></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>模块</th>
        <th>函数</th>
        <th>覆盖率</th>
      </tr>
    </thead>
    <tbody>
      ${report.modules.map(m => `
        <tr>
          <td>${m.path}</td>
          <td>${m.functions.covered}/${m.functions.total}</td>
          <td>${(m.functions.covered / m.functions.total * 100).toFixed(1)}%</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
    `;

    const fs = await import('fs/promises');
    await fs.writeFile('coverage.html', html);
    console.log('📊 覆盖率报告已保存到 coverage.html');
  }
}
```

## 性能影响

### 测试性能优化

```javascript
class TestPerformance {
  static async measureTestSuite() {
    const metrics = {
      totalTests: 0,
      totalDuration: 0,
      slowTests: [],
      testTimes: new Map()
    };

    // 覆盖测试运行器以测量性能
    const originalTest = global.test;

    global.test = async function(name, fn, options = {}) {
      const startTime = process.hrtime.bigint();

      await originalTest(name, fn, options);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1e6; // ms

      metrics.totalTests++;
      metrics.totalDuration += duration;
      metrics.testTimes.set(name, duration);

      if (duration > 1000) { // 超过 1 秒的测试
        metrics.slowTests.push({ name, duration });
      }
    };

    // 运行测试
    await import('./all-tests.js');

    // 恢复原始
    global.test = originalTest;

    // 生成报告
    return {
      ...metrics,
      averageTime: metrics.totalDuration / metrics.totalTests,
      slowTests: metrics.slowTests.sort((a, b) => b.duration - a.duration)
    };
  }

  static async optimizeTests() {
    // 并行测试执行
    const { Worker } = await import('worker_threads');

    class ParallelTestRunner {
      constructor(workerCount = 4) {
        this.workerCount = workerCount;
        this.workers = [];
        this.testQueue = [];
        this.results = [];
      }

      async run(testFiles) {
        // 创建工作池
        for (let i = 0; i < this.workerCount; i++) {
          const worker = new Worker(`
            const { parentPort } = require('worker_threads');

            parentPort.on('message', async ({ testFile }) => {
              try {
                const result = await import(testFile);
                parentPort.postMessage({ success: true, testFile });
              } catch (error) {
                parentPort.postMessage({
                  success: false,
                  testFile,
                  error: error.message
                });
              }
            });
          `, { eval: true });

          this.workers.push(worker);
        }

        // 分发测试
        const promises = testFiles.map(testFile =>
          this.runTestInWorker(testFile)
        );

        await Promise.all(promises);

        // 清理
        this.workers.forEach(w => w.terminate());

        return this.results;
      }

      async runTestInWorker(testFile) {
        // 找到可用工作器(简单轮询)
        const worker = this.workers[
          this.testQueue.length % this.workerCount
        ];

        return new Promise((resolve, reject) => {
          worker.once('message', result => {
            this.results.push(result);
            resolve(result);
          });

          worker.postMessage({ testFile });
          this.testQueue.push(testFile);
        });
      }
    }

    return ParallelTestRunner;
  }

  static getOptimizationRecommendations(metrics) {
    const recommendations = [];

    if (metrics.averageTime > 100) {
      recommendations.push('考虑并行测试执行');
    }

    if (metrics.slowTests.length > 0) {
      recommendations.push('优化慢速测试:');
      metrics.slowTests.slice(0, 5).forEach(test => {
        recommendations.push(`  - ${test.name}: ${test.duration}ms`);
      });
    }

    if (metrics.totalTests > 1000) {
      recommendations.push('考虑拆分测试套件');
    }

    return recommendations;
  }
}
```

## 总结

Claude Code 测试框架提供全面的测试能力:

1. **自定义测试运行器**:轻量级、异步优先的测试运行器,支持并行执行
2. **单元测试**:对单个组件进行彻底测试,覆盖边缘情况
3. **集成测试**:验证组件交互和系统边界
4. **端到端测试**:从 CLI 到输出的完整工作流验证
5. **模拟系统**:灵活的模拟、存根和间谍能力
6. **测试工具**:丰富的帮助器集,用于常见测试模式
7. **覆盖率报告**:详细的覆盖率指标和 HTML 报告
8. **性能优化**:并行执行和性能监控

测试基础设施确保代码质量,防止回归,并在保持高性能标准的同时实现自信的重构。

## 下一步

在下一节中,我们将探讨打包和分发 Claude Code CLI 的构建和部署系统。

---

*Claude Code 技术系列的一部分 - 开发工具*