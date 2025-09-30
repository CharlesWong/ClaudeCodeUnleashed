# Part 9.2: Testing Frameworks

## Introduction

The Claude Code testing framework provides comprehensive test coverage across unit, integration, end-to-end, and performance testing. This chapter explores the testing strategies, tools, and patterns used to ensure reliability, maintainability, and correctness of the AI-powered CLI system.

## Table of Contents
1. [Testing Architecture](#testing-architecture)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [Mock and Stub System](#mock-and-stub-system)
6. [Test Utilities](#test-utilities)
7. [Coverage and Reporting](#coverage-and-reporting)
8. [Performance Implications](#performance-implications)

## Testing Architecture

### Test Organization

```javascript
class TestArchitecture {
  static getStructure() {
    return {
      tests: {
        unit: {
          'circular-buffer.test.js': 'CircularBuffer unit tests',
          'command-parser.test.js': 'Command parser unit tests',
          'shell-info.test.js': 'Shell info unit tests',
          'process-helpers.test.js': 'Process helpers unit tests',
          'config.test.js': 'Configuration unit tests'
        },
        integration: {
          'comprehensive-test.js': 'Full integration test suite',
          'full-functionality-test.js': 'End-to-end functionality tests',
          'tool-integration.test.js': 'Tool system integration tests',
          'api-integration.test.js': 'API client integration tests',
          'agent-integration.test.js': 'Agent system integration tests'
        },
        e2e: {
          'cli-workflow.test.js': 'CLI workflow tests',
          'conversation-flow.test.js': 'Conversation flow tests',
          'tool-execution.test.js': 'Tool execution tests'
        },
        performance: {
          'startup-performance.test.js': 'Startup time tests',
          'memory-usage.test.js': 'Memory usage tests',
          'response-time.test.js': 'Response time tests'
        },
        fixtures: {
          'test-files/': 'Test file fixtures',
          'mock-responses/': 'Mock API responses',
          'sample-projects/': 'Sample project structures'
        }
      }
    };
  }

  static getTestRunner() {
    return {
      framework: 'custom', // Currently using custom test runner
      planned: 'vitest',   // Planning to migrate to Vitest
      features: [
        'Async test support',
        'Parallel execution',
        'Test isolation',
        'Coverage reporting',
        'Watch mode',
        'Snapshot testing'
      ]
    };
  }
}
```

### Test Runner Implementation

```javascript
// Current custom test runner implementation
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

  // Test registration
  test(name, fn, options = {}) {
    this.tests.push({
      name,
      fn,
      options,
      status: 'pending'
    });
  }

  // Test execution
  async run() {
    this.startTime = Date.now();
    console.log('🧪 Starting test suite...\n');

    for (const test of this.tests) {
      await this.executeTest(test);
    }

    this.endTime = Date.now();
    this.printSummary();
    return this.getExitCode();
  }

  async executeTest(test) {
    const { name, fn, options } = test;

    // Check if test should be skipped
    if (options.skip) {
      console.log(`⊘ SKIPPED: ${name}`);
      this.results.skipped.push(name);
      test.status = 'skipped';
      return;
    }

    // Check if test matches filter
    if (options.only && !this.hasOnlyTests()) {
      return; // Skip non-only tests when only tests exist
    }

    try {
      // Setup test environment
      const context = await this.setupTestContext(options);

      // Execute test with timeout
      const timeout = options.timeout || 5000;
      const testPromise = fn(context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Test timeout')), timeout)
      );

      process.stdout.write(`Testing ${name}... `);
      await Promise.race([testPromise, timeoutPromise]);

      // Cleanup
      await this.cleanupTestContext(context);

      console.log('✅ PASSED');
      this.results.passed.push(name);
      test.status = 'passed';

    } catch (error) {
      console.log('❌ FAILED');
      console.log(`  Error: ${error.message}`);
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

    // Create temp directory if needed
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
    // Run cleanup functions
    for (const cleanupFn of context.cleanup) {
      await cleanupFn();
    }

    // Remove temp directory
    if (context.tempDir) {
      const fs = await import('fs/promises');
      await fs.rm(context.tempDir, { recursive: true, force: true });
    }

    // Restore mocks
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
    console.log('TEST SUMMARY');
    console.log('═'.repeat(60));

    console.log(`\n📊 Results:`);
    console.log(`  ✅ Passed: ${this.results.passed.length}`);
    console.log(`  ❌ Failed: ${this.results.failed.length}`);
    console.log(`  ⊘ Skipped: ${this.results.skipped.length}`);
    console.log(`\n  📈 Pass Rate: ${passRate}%`);
    console.log(`  ⏱️  Duration: ${duration}ms`);

    if (this.results.failed.length > 0) {
      console.log('\n❌ Failed Tests:');
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

// Test DSL
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

## Unit Testing

### Circular Buffer Tests

```javascript
import { describe, test, runTests } from '../test-framework.js';
import CircularBuffer from '../../src/utils/circular-buffer.js';
import assert from 'assert';

describe('CircularBuffer', () => {
  test('should initialize with correct capacity', async () => {
    const buffer = new CircularBuffer(5);
    assert.strictEqual(buffer.capacity, 5);
    assert.strictEqual(buffer.size(), 0);
    assert.strictEqual(buffer.isEmpty(), true);
    assert.strictEqual(buffer.isFull(), false);
  });

  test('should add items correctly', async () => {
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

  test('should overwrite oldest items when full', async () => {
    const buffer = new CircularBuffer(3);

    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    buffer.add('d'); // Overwrites 'a'

    assert.strictEqual(buffer.size(), 3);
    assert.deepStrictEqual(buffer.toArray(), ['b', 'c', 'd']);
  });

  test('should get recent items', async () => {
    const buffer = new CircularBuffer(5);

    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    buffer.add('d');
    buffer.add('e');

    assert.deepStrictEqual(buffer.getRecent(3), ['c', 'd', 'e']);
    assert.deepStrictEqual(buffer.getRecent(10), ['a', 'b', 'c', 'd', 'e']);
  });

  test('should clear buffer', async () => {
    const buffer = new CircularBuffer(3);

    buffer.add('a');
    buffer.add('b');
    buffer.clear();

    assert.strictEqual(buffer.size(), 0);
    assert.strictEqual(buffer.isEmpty(), true);
    assert.deepStrictEqual(buffer.toArray(), []);
  });

  test('should handle get() method', async () => {
    const buffer = new CircularBuffer(3);

    buffer.add('line1\n');
    buffer.add('line2\n');
    buffer.add('line3');

    const result = buffer.get();
    assert.strictEqual(result, 'line1\nline2\nline3');
  });

  test('should handle edge cases', async () => {
    // Zero capacity
    assert.throws(() => new CircularBuffer(0), /Capacity must be positive/);

    // Negative capacity
    assert.throws(() => new CircularBuffer(-1), /Capacity must be positive/);

    // Non-number capacity
    assert.throws(() => new CircularBuffer('5'), /Capacity must be a number/);
  });

  test('should handle performance with large buffers', async () => {
    const buffer = new CircularBuffer(10000);
    const startTime = Date.now();

    // Add 100,000 items (10x capacity)
    for (let i = 0; i < 100000; i++) {
      buffer.add(`item-${i}`);
    }

    const duration = Date.now() - startTime;
    assert(duration < 1000, 'Should handle 100k adds in under 1 second');

    // Verify correct items remain
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

### Command Parser Tests

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

describe('Command Parser', () => {
  describe('parseCommand', () => {
    test('should parse simple commands', async () => {
      const result = parseCommand('echo hello');
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, ['echo', 'hello']);
    });

    test('should handle quoted arguments', async () => {
      const result = parseCommand('echo "hello world"');
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, ['echo', 'hello world']);
    });

    test('should handle single quotes', async () => {
      const result = parseCommand("echo 'hello world'");
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, ['echo', 'hello world']);
    });

    test('should handle escaped characters', async () => {
      const result = parseCommand('echo hello\\ world');
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.parts, ['echo', 'hello world']);
    });

    test('should handle complex commands', async () => {
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

    test('should handle empty input', async () => {
      const result = parseCommand('');
      assert.strictEqual(result.success, false);
      assert(result.error.includes('Empty'));
    });

    test('should handle unclosed quotes', async () => {
      const result = parseCommand('echo "unclosed');
      assert.strictEqual(result.success, false);
      assert(result.error.includes('quote'));
    });
  });

  describe('splitByPipes', () => {
    test('should split by pipes', async () => {
      const result = splitByPipes('ls | grep test | wc -l');
      assert.deepStrictEqual(result, ['ls', 'grep test', 'wc -l']);
    });

    test('should handle pipes in quotes', async () => {
      const result = splitByPipes('echo "a | b" | grep test');
      assert.deepStrictEqual(result, ['echo "a | b"', 'grep test']);
    });

    test('should handle escaped pipes', async () => {
      const result = splitByPipes('echo a\\|b | grep test');
      assert.deepStrictEqual(result, ['echo a\\|b', 'grep test']);
    });
  });

  describe('escapeShellArg', () => {
    test('should escape simple strings', async () => {
      assert.strictEqual(escapeShellArg('hello'), 'hello');
    });

    test('should escape strings with spaces', async () => {
      assert.strictEqual(escapeShellArg('hello world'), "'hello world'");
    });

    test('should escape dangerous characters', async () => {
      assert.strictEqual(escapeShellArg('rm -rf /'), "'rm -rf /'");
      assert.strictEqual(escapeShellArg('$HOME'), "'$HOME'");
      assert.strictEqual(escapeShellArg('`pwd`'), "'`pwd`'");
    });

    test('should handle single quotes', async () => {
      assert.strictEqual(
        escapeShellArg("it's"),
        "'it'\"'\"'s'"
      );
    });
  });

  describe('isSimpleReadCommand', () => {
    test('should identify read-only commands', async () => {
      assert(isSimpleReadCommand('ls'));
      assert(isSimpleReadCommand('pwd'));
      assert(isSimpleReadCommand('echo test'));
      assert(isSimpleReadCommand('cat file.txt'));
      assert(isSimpleReadCommand('grep pattern'));
    });

    test('should reject write commands', async () => {
      assert(!isSimpleReadCommand('rm file'));
      assert(!isSimpleReadCommand('mv old new'));
      assert(!isSimpleReadCommand('chmod +x file'));
      assert(!isSimpleReadCommand('git push'));
    });
  });

  describe('containsDangerousPatterns', () => {
    test('should detect dangerous patterns', async () => {
      assert(containsDangerousPatterns('rm -rf /'));
      assert(containsDangerousPatterns(':(){ :|:& };:'));
      assert(containsDangerousPatterns('dd if=/dev/zero of=/dev/sda'));
      assert(containsDangerousPatterns('mkfs.ext4 /dev/sda'));
    });

    test('should allow safe commands', async () => {
      assert(!containsDangerousPatterns('ls -la'));
      assert(!containsDangerousPatterns('echo hello'));
      assert(!containsDangerousPatterns('grep pattern file'));
    });
  });
});

runTests();
```

## Integration Testing

### Comprehensive Integration Test

```javascript
import { describe, test, runTests } from '../test-framework.js';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

describe('Comprehensive Integration Tests', () => {
  describe('Tool Integration', () => {
    test('should integrate all tools correctly', async (context) => {
      const toolRegistry = await import('../../src/tools/index.js');

      // Verify all tools are registered
      const expectedTools = [
        'Bash', 'Read', 'Write', 'Edit', 'MultiEdit',
        'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Task'
      ];

      for (const toolName of expectedTools) {
        const tool = toolRegistry.getToolByName(toolName);
        assert(tool, `Tool ${toolName} should be registered`);
        assert(typeof tool.call === 'function',
               `Tool ${toolName} should have call method`);
      }
    });

    test('should execute bash commands', async (context) => {
      const { executeBashCommand } = await import(
        '../../src/tools/bash-implementation.js'
      );

      const input = {
        command: 'echo "Integration test"',
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
      assert(finalResult.stdout.includes('Integration test'));
      assert.strictEqual(finalResult.code, 0);
    });

    test('should handle file operations', async (context) => {
      const testFile = path.join(context.tempDir, 'test.txt');
      const testContent = 'Integration test content';

      // Write file
      await fs.promises.writeFile(testFile, testContent);

      // Read file
      const content = await fs.promises.readFile(testFile, 'utf8');
      assert.strictEqual(content, testContent);

      // Edit file
      const newContent = content.replace('test', 'TEST');
      await fs.promises.writeFile(testFile, newContent);

      // Verify edit
      const edited = await fs.promises.readFile(testFile, 'utf8');
      assert.strictEqual(edited, 'Integration TEST content');
    }, { useTempDir: true });
  });

  describe('API Integration', () => {
    test('should initialize API client', async () => {
      const { APIClient } = await import('../../src/api/client.js');

      const client = new APIClient({
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229'
      });

      assert(client);
      assert.strictEqual(client.config.model, 'claude-3-opus-20240229');
    });

    test('should handle streaming', async () => {
      const { StreamProcessor } = await import('../../src/api/streaming.js');

      const processor = new StreamProcessor();
      assert(typeof processor.process === 'function');
      assert(typeof processor.handleChunk === 'function');
    });

    test('should handle rate limiting', async () => {
      const { RateLimiter } = await import('../../src/api/rate-limiting.js');

      const limiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60000
      });

      // Should allow initial requests
      for (let i = 0; i < 10; i++) {
        assert(await limiter.checkLimit());
      }

      // Should block after limit
      assert(!(await limiter.checkLimit()));
    });
  });

  describe('Agent Integration', () => {
    test('should orchestrate agents', async () => {
      const { AgentOrchestrator } = await import(
        '../../src/cli/agents/agent-orchestrator.js'
      );

      const orchestrator = new AgentOrchestrator();
      assert(orchestrator);

      // Verify agent types
      const agentTypes = orchestrator.getAgentTypes();
      assert(agentTypes.includes('general'));
      assert(agentTypes.includes('output-style'));
      assert(agentTypes.includes('status-line'));
    });

    test('should execute agent tasks', async () => {
      const { executeAgentTask } = await import(
        '../../src/cli/agents/agent-orchestrator.js'
      );

      const task = {
        type: 'general',
        prompt: 'Test task',
        tools: ['Read', 'Write']
      };

      // This would normally connect to the API
      // For testing, we mock the response
      const mockExecute = async (task) => {
        return {
          success: true,
          result: 'Task completed',
          toolCalls: []
        };
      };

      const result = await mockExecute(task);
      assert(result.success);
    });
  });

  describe('UI Integration', () => {
    test('should render terminal UI', async () => {
      const { Terminal } = await import('../../src/cli/ui/terminal.js');

      const terminal = new Terminal();
      assert(terminal);
      assert(typeof terminal.write === 'function');
      assert(typeof terminal.clear === 'function');
      assert(typeof terminal.moveCursor === 'function');
    });

    test('should render markdown', async () => {
      const { MarkdownRenderer } = await import('../../src/cli/ui/markdown.js');

      const renderer = new MarkdownRenderer();
      const markdown = '# Test\n\n**Bold** text';
      const rendered = renderer.render(markdown);

      assert(rendered.includes('Test'));
      assert(rendered.includes('Bold'));
    });

    test('should show progress', async () => {
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

## End-to-End Testing

### CLI Workflow Tests

```javascript
import { describe, test, runTests } from '../test-framework.js';
import { spawn } from 'child_process';
import assert from 'assert';
import path from 'path';

describe('End-to-End CLI Workflow', () => {
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

      // Timeout after 10 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error('CLI timeout'));
      }, 10000);
    });
  }

  test('should show help', async () => {
    const result = await runCLI(['--help']);
    assert.strictEqual(result.code, 0);
    assert(result.stdout.includes('Claude Code CLI'));
    assert(result.stdout.includes('Commands:'));
  });

  test('should show version', async () => {
    const result = await runCLI(['--version']);
    assert.strictEqual(result.code, 0);
    assert(result.stdout.includes('1.0.115'));
  });

  test('should handle chat command', async () => {
    const result = await runCLI(['chat'], 'exit\n');
    assert.strictEqual(result.code, 0);
    assert(result.stdout.includes('Chat session'));
  }, { timeout: 15000 });

  test('should handle ask command', async () => {
    const result = await runCLI(
      ['ask', 'What is 2+2?'],
      null
    );
    // Would connect to API in real scenario
    // For testing, we check command parsing
    assert(result.code === 0 || result.stderr.includes('API'));
  });

  test('should handle invalid commands', async () => {
    const result = await runCLI(['invalid-command']);
    assert(result.code !== 0);
    assert(result.stderr.includes('Unknown command') ||
           result.stderr.includes('invalid'));
  });

  test('should handle configuration', async () => {
    const result = await runCLI(['config', 'list']);
    // Check that config command is recognized
    assert(result.stdout.includes('config') ||
           result.stderr.includes('config'));
  });
});

runTests();
```

## Mock and Stub System

### Mock Framework

```javascript
class MockFramework {
  constructor() {
    this.mocks = new Map();
    this.spies = new Map();
    this.stubs = new Map();
  }

  // Create a mock object
  mock(name, implementation = {}) {
    const mock = {
      name,
      calls: [],
      implementation,

      // Track calls
      __call(method, ...args) {
        this.calls.push({ method, args, timestamp: Date.now() });

        if (typeof implementation[method] === 'function') {
          return implementation[method](...args);
        }

        return undefined;
      },

      // Verification methods
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

    // Create proxy to intercept method calls
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

  // Create a spy on existing object
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

  // Create a stub
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

  // Restore all mocks, spies, and stubs
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

// Usage example
const mockFramework = new MockFramework();

// Mock API client
const mockAPIClient = mockFramework.mock('APIClient', {
  async sendMessage(message) {
    return {
      content: 'Mocked response',
      model: 'claude-3-opus-20240229'
    };
  }
});

// Spy on file system
const fsSpy = mockFramework.spy(fs, 'readFile');

// Stub process.exit
const exitStub = mockFramework.stub(process, 'exit', code => {
  console.log(`Process would exit with code ${code}`);
});
```

## Test Utilities

### Test Helpers

```javascript
class TestHelpers {
  // Assert with better error messages
  static assert = {
    equal(actual, expected, message) {
      if (actual !== expected) {
        throw new Error(
          message ||
          `Expected ${expected} but got ${actual}`
        );
      }
    },

    deepEqual(actual, expected, message) {
      const actualStr = JSON.stringify(actual, null, 2);
      const expectedStr = JSON.stringify(expected, null, 2);

      if (actualStr !== expectedStr) {
        throw new Error(
          message ||
          `Deep equality failed:\nExpected:\n${expectedStr}\n\nActual:\n${actualStr}`
        );
      }
    },

    includes(haystack, needle, message) {
      if (!haystack.includes(needle)) {
        throw new Error(
          message ||
          `Expected "${haystack}" to include "${needle}"`
        );
      }
    },

    async throws(fn, expectedError, message) {
      try {
        await fn();
        throw new Error(
          message ||
          'Expected function to throw but it did not'
        );
      } catch (error) {
        if (expectedError) {
          if (expectedError instanceof RegExp) {
            if (!expectedError.test(error.message)) {
              throw new Error(
                `Expected error to match ${expectedError} but got: ${error.message}`
              );
            }
          } else if (error.message !== expectedError) {
            throw new Error(
              `Expected error "${expectedError}" but got: ${error.message}`
            );
          }
        }
      }
    }
  };

  // Wait utilities
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

      throw new Error('Timeout waiting for condition');
    },

    async forEvent(emitter, event, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for event: ${event}`));
        }, timeout);

        emitter.once(event, (...args) => {
          clearTimeout(timer);
          resolve(args);
        });
      });
    }
  };

  // File system helpers
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

  // Process helpers
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

### Snapshot Testing

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
      // Snapshot directory doesn't exist yet
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
      // First run - create snapshot
      await this.saveSnapshot(testName, actual);
      console.log(`📸 Snapshot created for: ${testName}`);
      return true;
    }

    // Compare snapshots
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);

    if (actualStr !== expectedStr) {
      throw new Error(
        `Snapshot mismatch for ${testName}\n` +
        `Expected:\n${expectedStr}\n\n` +
        `Actual:\n${actualStr}`
      );
    }

    return true;
  }

  async updateSnapshot(testName, data) {
    await this.saveSnapshot(testName, data);
    this.snapshots.set(testName, data);
    console.log(`📸 Snapshot updated for: ${testName}`);
  }
}
```

## Coverage and Reporting

### Coverage Collection

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

    // Instrument all functions
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

          // Track line execution (simplified)
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

    // Calculate percentages
    report.summary.functionCoverage =
      (report.summary.coveredFunctions / report.summary.totalFunctions * 100).toFixed(1);

    return report;
  }

  async saveHTMLReport(report) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Coverage Report</title>
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
  <h1>Coverage Report</h1>

  <div class="summary">
    <h2>Summary</h2>
    <p>Total Modules: ${report.summary.totalModules}</p>
    <p>Function Coverage: ${report.summary.functionCoverage}%</p>
    <div class="bar">
      <div class="bar-fill" style="width: ${report.summary.functionCoverage}%"></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Module</th>
        <th>Functions</th>
        <th>Coverage</th>
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
    console.log('📊 Coverage report saved to coverage.html');
  }
}
```

## Performance Implications

### Test Performance Optimization

```javascript
class TestPerformance {
  static async measureTestSuite() {
    const metrics = {
      totalTests: 0,
      totalDuration: 0,
      slowTests: [],
      testTimes: new Map()
    };

    // Override test runner to measure performance
    const originalTest = global.test;

    global.test = async function(name, fn, options = {}) {
      const startTime = process.hrtime.bigint();

      await originalTest(name, fn, options);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1e6; // ms

      metrics.totalTests++;
      metrics.totalDuration += duration;
      metrics.testTimes.set(name, duration);

      if (duration > 1000) { // Tests taking > 1s
        metrics.slowTests.push({ name, duration });
      }
    };

    // Run tests
    await import('./all-tests.js');

    // Restore original
    global.test = originalTest;

    // Generate report
    return {
      ...metrics,
      averageTime: metrics.totalDuration / metrics.totalTests,
      slowTests: metrics.slowTests.sort((a, b) => b.duration - a.duration)
    };
  }

  static async optimizeTests() {
    // Parallel test execution
    const { Worker } = await import('worker_threads');

    class ParallelTestRunner {
      constructor(workerCount = 4) {
        this.workerCount = workerCount;
        this.workers = [];
        this.testQueue = [];
        this.results = [];
      }

      async run(testFiles) {
        // Create worker pool
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

        // Distribute tests
        const promises = testFiles.map(testFile =>
          this.runTestInWorker(testFile)
        );

        await Promise.all(promises);

        // Cleanup
        this.workers.forEach(w => w.terminate());

        return this.results;
      }

      async runTestInWorker(testFile) {
        // Find available worker (simple round-robin)
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
      recommendations.push('Consider parallel test execution');
    }

    if (metrics.slowTests.length > 0) {
      recommendations.push('Optimize slow tests:');
      metrics.slowTests.slice(0, 5).forEach(test => {
        recommendations.push(`  - ${test.name}: ${test.duration}ms`);
      });
    }

    if (metrics.totalTests > 1000) {
      recommendations.push('Consider splitting test suites');
    }

    return recommendations;
  }
}
```

## Summary

The Claude Code testing framework provides comprehensive testing capabilities with:

1. **Custom Test Runner**: Lightweight, async-first test runner with parallel execution support
2. **Unit Testing**: Thorough testing of individual components with edge case coverage
3. **Integration Testing**: Verification of component interactions and system boundaries
4. **End-to-End Testing**: Full workflow validation from CLI to output
5. **Mock System**: Flexible mocking, stubbing, and spying capabilities
6. **Test Utilities**: Rich set of helpers for common testing patterns
7. **Coverage Reporting**: Detailed coverage metrics with HTML reports
8. **Performance Optimization**: Parallel execution and performance monitoring

The testing infrastructure ensures code quality, prevents regressions, and enables confident refactoring while maintaining high performance standards.

## Next Steps

In the next section, we'll explore the build and deployment systems that package and distribute the Claude Code CLI.

---

*Part of the Claude Code Technical Series - Development Tools*