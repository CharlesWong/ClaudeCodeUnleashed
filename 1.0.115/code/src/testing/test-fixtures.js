/**
 * Claude Code Test Fixtures and Mocks
 *
 * Test data, mock objects, and fixtures for testing Claude Code components.
 * Provides realistic test scenarios and mock implementations.
 *
 * Reconstructed based on testing patterns (lines ~47000-47300)
 * Part of the 90% → 95% extraction phase
 */

import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

/**
 * Test Fixtures
 * Common test data and scenarios
 */
export class TestFixtures {
  /**
   * API Response fixtures
   */
  static apiResponses = {
    success: {
      id: 'msg_test_001',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'This is a test response from Claude.'
        }
      ],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50
      }
    },

    streamChunks: [
      { type: 'message_start', message: { id: 'msg_test_002' } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' }
    ],

    error: {
      error: {
        type: 'invalid_request_error',
        message: 'Invalid API key provided'
      }
    },

    rateLimited: {
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit exceeded'
      }
    }
  };

  /**
   * Tool call fixtures
   */
  static toolCalls = {
    bash: {
      tool: 'Bash',
      parameters: {
        command: 'ls -la',
        description: 'List files in current directory'
      }
    },

    edit: {
      tool: 'Edit',
      parameters: {
        file_path: '/test/file.js',
        old_string: 'const old = true;',
        new_string: 'const new = false;'
      }
    },

    read: {
      tool: 'Read',
      parameters: {
        file_path: '/test/file.js'
      }
    },

    write: {
      tool: 'Write',
      parameters: {
        file_path: '/test/new-file.js',
        content: 'export const test = true;'
      }
    },

    multiEdit: {
      tool: 'MultiEdit',
      parameters: {
        file_path: '/test/file.js',
        edits: [
          { old_string: 'old1', new_string: 'new1' },
          { old_string: 'old2', new_string: 'new2' }
        ]
      }
    }
  };

  /**
   * File system fixtures
   */
  static fileSystem = {
    '/test/file.js': 'const test = true;\nexport default test;',
    '/test/dir/nested.js': 'export const nested = "value";',
    '/test/config.json': '{"key": "value", "nested": {"prop": 123}}',
    '/test/data.txt': 'Sample text data\nLine 2\nLine 3',
    '/test/.env': 'API_KEY=test_key_123\nDEBUG=true'
  };

  /**
   * Configuration fixtures
   */
  static configs = {
    minimal: {
      apiKey: 'test-api-key',
      model: 'claude-3-5-sonnet-20241022'
    },

    full: {
      apiKey: 'test-api-key',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 4096,
      tools: {
        bash: { enabled: true },
        edit: { enabled: true },
        read: { enabled: true }
      },
      permissions: {
        version: '2',
        rules: {
          filesystem: {
            read: ['**/*'],
            write: ['/test/**']
          }
        }
      },
      cache: {
        enabled: true,
        strategy: 'lru',
        maxSize: 1000
      },
      telemetry: {
        enabled: false,
        privacy: 'strict'
      }
    },

    legacy: {
      anthropic_api_key: 'old-key',
      model_name: 'claude-2',
      tools: {
        str_replace: true,
        search: true
      }
    }
  };

  /**
   * Message fixtures
   */
  static messages = {
    user: {
      role: 'user',
      content: 'What is the capital of France?'
    },

    assistant: {
      role: 'assistant',
      content: 'The capital of France is Paris.'
    },

    system: {
      role: 'system',
      content: 'You are a helpful assistant.'
    },

    conversation: [
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hello! How can I help you today?' },
      { role: 'user', content: 'What is 2 + 2?' },
      { role: 'assistant', content: '2 + 2 equals 4.' }
    ]
  };

  /**
   * Error fixtures
   */
  static errors = {
    apiError: new Error('API request failed'),
    networkError: new Error('ECONNREFUSED'),
    fileNotFound: new Error('ENOENT: no such file or directory'),
    permissionDenied: new Error('Permission denied'),
    validationError: new Error('Validation failed: missing required field')
  };
}

/**
 * Mock Implementations
 */
export class Mocks {
  /**
   * Mock API Client
   */
  static createMockApiClient() {
    return {
      messages: {
        create: jest.fn().mockResolvedValue(TestFixtures.apiResponses.success),
        stream: jest.fn().mockImplementation(function* () {
          for (const chunk of TestFixtures.apiResponses.streamChunks) {
            yield chunk;
          }
        })
      },
      models: {
        list: jest.fn().mockResolvedValue([
          'claude-3-5-sonnet-20241022',
          'claude-3-opus-20240229'
        ])
      }
    };
  }

  /**
   * Mock File System
   */
  static createMockFileSystem() {
    const files = { ...TestFixtures.fileSystem };

    return {
      readFile: jest.fn().mockImplementation((path) => {
        if (files[path]) {
          return Promise.resolve(files[path]);
        }
        return Promise.reject(new Error('ENOENT'));
      }),

      writeFile: jest.fn().mockImplementation((path, content) => {
        files[path] = content;
        return Promise.resolve();
      }),

      unlink: jest.fn().mockImplementation((path) => {
        if (files[path]) {
          delete files[path];
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      }),

      exists: jest.fn().mockImplementation((path) => {
        return Promise.resolve(!!files[path]);
      }),

      mkdir: jest.fn().mockResolvedValue(),
      rmdir: jest.fn().mockResolvedValue(),
      readdir: jest.fn().mockImplementation((dir) => {
        const entries = Object.keys(files)
          .filter(path => path.startsWith(dir))
          .map(path => path.slice(dir.length + 1).split('/')[0])
          .filter(Boolean);
        return Promise.resolve([...new Set(entries)]);
      }),

      stat: jest.fn().mockImplementation((path) => {
        if (files[path]) {
          return Promise.resolve({
            isFile: () => true,
            isDirectory: () => false,
            size: files[path].length,
            mtime: new Date()
          });
        }
        return Promise.reject(new Error('ENOENT'));
      })
    };
  }

  /**
   * Mock Process
   */
  static createMockProcess() {
    return {
      stdout: new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      }),
      stderr: new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      }),
      stdin: new Readable({
        read() {}
      }),
      exit: jest.fn(),
      env: { ...process.env },
      platform: 'darwin',
      arch: 'x64',
      version: 'v20.0.0',
      pid: 12345,
      cwd: jest.fn().mockReturnValue('/test'),
      chdir: jest.fn()
    };
  }

  /**
   * Mock Event Emitter
   */
  static createMockEventEmitter() {
    const emitter = new EventEmitter();
    emitter.emit = jest.fn(emitter.emit.bind(emitter));
    emitter.on = jest.fn(emitter.on.bind(emitter));
    emitter.once = jest.fn(emitter.once.bind(emitter));
    emitter.off = jest.fn(emitter.off.bind(emitter));
    return emitter;
  }

  /**
   * Mock Stream
   */
  static createMockStream() {
    return {
      readable: new Readable({
        read() {
          this.push('test data\n');
          this.push(null);
        }
      }),
      writable: new Writable({
        write: jest.fn((chunk, encoding, callback) => callback())
      })
    };
  }

  /**
   * Mock HTTP Response
   */
  static createMockResponse(statusCode = 200, data = {}) {
    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      statusText: statusCode === 200 ? 'OK' : 'Error',
      headers: new Map([
        ['content-type', 'application/json'],
        ['x-request-id', 'test-request-123']
      ]),
      json: jest.fn().mockResolvedValue(data),
      text: jest.fn().mockResolvedValue(JSON.stringify(data)),
      body: new Readable({
        read() {
          this.push(JSON.stringify(data));
          this.push(null);
        }
      })
    };
  }

  /**
   * Mock Cache
   */
  static createMockCache() {
    const store = new Map();

    return {
      get: jest.fn((key) => Promise.resolve(store.get(key))),
      set: jest.fn((key, value) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      delete: jest.fn((key) => {
        store.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store.clear();
        return Promise.resolve();
      }),
      has: jest.fn((key) => Promise.resolve(store.has(key))),
      size: jest.fn(() => store.size)
    };
  }

  /**
   * Mock Logger
   */
  static createMockLogger() {
    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn()
    };
  }
}

/**
 * Test Helpers
 */
export class TestHelpers {
  /**
   * Wait for condition
   */
  static async waitFor(condition, timeout = 5000, interval = 100) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Timeout waiting for condition');
  }

  /**
   * Create test context
   */
  static createTestContext() {
    return {
      apiClient: Mocks.createMockApiClient(),
      fileSystem: Mocks.createMockFileSystem(),
      process: Mocks.createMockProcess(),
      logger: Mocks.createMockLogger(),
      cache: Mocks.createMockCache(),
      config: TestFixtures.configs.full
    };
  }

  /**
   * Setup test environment
   */
  static setupTestEnv() {
    // Mock environment variables
    process.env.NODE_ENV = 'test';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.DEBUG = 'false';

    // Mock global functions
    global.fetch = jest.fn();
    global.setTimeout = jest.fn((fn, delay) => {
      fn();
      return 123;
    });
    global.clearTimeout = jest.fn();
    global.setInterval = jest.fn();
    global.clearInterval = jest.fn();
  }

  /**
   * Cleanup test environment
   */
  static cleanupTestEnv() {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEBUG;
  }

  /**
   * Assert async error
   */
  static async assertAsyncError(fn, expectedError) {
    try {
      await fn();
      throw new Error('Expected function to throw');
    } catch (error) {
      if (expectedError instanceof RegExp) {
        expect(error.message).toMatch(expectedError);
      } else if (typeof expectedError === 'string') {
        expect(error.message).toBe(expectedError);
      } else {
        expect(error).toBeInstanceOf(expectedError);
      }
    }
  }

  /**
   * Create spy
   */
  static createSpy(obj, method) {
    const original = obj[method];
    const calls = [];

    obj[method] = function(...args) {
      calls.push({ args, this: this });
      return original.apply(this, args);
    };

    obj[method].calls = calls;
    obj[method].restore = () => {
      obj[method] = original;
    };

    return obj[method];
  }
}

/**
 * Test Data Generators
 */
export class TestDataGenerators {
  /**
   * Generate random string
   */
  static randomString(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * Generate UUID
   */
  static uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Generate test file
   */
  static generateFile(type = 'js') {
    const templates = {
      js: `// Test file
export const test = ${Math.random() > 0.5};
export function testFn() {
  return "${this.randomString()}";
}`,
      json: JSON.stringify({
        id: this.uuid(),
        value: this.randomString(),
        timestamp: Date.now()
      }, null, 2),
      md: `# Test Document
## Section ${Math.floor(Math.random() * 10)}
Test content: ${this.randomString(50)}`
    };

    return templates[type] || this.randomString(100);
  }

  /**
   * Generate API response
   */
  static generateApiResponse(options = {}) {
    return {
      id: `msg_${this.uuid()}`,
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: options.text || this.randomString(100)
      }],
      model: options.model || 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: options.inputTokens || Math.floor(Math.random() * 1000),
        output_tokens: options.outputTokens || Math.floor(Math.random() * 500)
      }
    };
  }
}

// Export test utilities
export const fixtures = TestFixtures;
export const mocks = Mocks;
export const helpers = TestHelpers;
export const generators = TestDataGenerators;