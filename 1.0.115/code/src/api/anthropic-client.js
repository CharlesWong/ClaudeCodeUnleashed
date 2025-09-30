/**
 * Anthropic API Client for Claude Code
 * Handles API communication with Claude models
 * Extracted from lines 13500-13750, 15890-16100, and other sections
 */

import { EventEmitter } from 'events';
import { ErrorRecoveryManager } from '../error/error-recovery.js';
import { getLogger } from '../utils/logging.js';

/**
 * Model configurations
 * Original: lines 14150-14180
 */
export const ModelConfig = {
  CLAUDE_3_7_SONNET: {
    firstParty: 'claude-3-7-sonnet-20250219',
    bedrock: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    vertex: 'claude-3-7-sonnet@20250219',
    maxTokens: 200000,
    outputLimit: 8192
  },
  CLAUDE_3_5_SONNET: {
    firstParty: 'claude-3-5-sonnet-20241022',
    bedrock: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    vertex: 'claude-3-5-sonnet-v2@20241022',
    maxTokens: 200000,
    outputLimit: 8192
  },
  CLAUDE_3_5_HAIKU: {
    firstParty: 'claude-3-5-haiku-20241022',
    bedrock: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    vertex: 'claude-3-5-haiku@20241022',
    maxTokens: 200000,
    outputLimit: 8192
  },
  CLAUDE_SONNET_4: {
    firstParty: 'claude-sonnet-4-20250514',
    bedrock: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    vertex: 'claude-sonnet-4@20250514',
    maxTokens: 200000,
    outputLimit: 8192
  },
  CLAUDE_OPUS_4: {
    firstParty: 'claude-opus-4-20250514',
    bedrock: 'us.anthropic.claude-opus-4-20250514-v1:0',
    vertex: 'claude-opus-4@20250514',
    maxTokens: 200000,
    outputLimit: 8192
  },
  CLAUDE_OPUS_4_1: {
    firstParty: 'claude-opus-4-1-20250805',
    bedrock: 'us.anthropic.claude-opus-4-1-20250805-v1:0',
    vertex: 'claude-opus-4-1@20250805',
    maxTokens: 200000,
    outputLimit: 8192
  }
};

/**
 * Model availability dates
 * Original: lines 12978-12983, 13460-13465
 */
export const ModelAvailability = {
  'claude-3-sonnet-20240229': 'July 21st, 2025',
  'claude-3-opus-20240229': 'January 5th, 2026',
  'claude-3-5-sonnet-20241022': 'October 22, 2025',
  'claude-3-5-sonnet-20240620': 'October 22, 2025'
};

/**
 * Get friendly model name
 * Original: cPA function - lines 14184-14189
 */
export function getModelDisplayName(model) {
  const modelLower = model.toLowerCase();

  if (modelLower.includes('claude-sonnet-4') && modelLower.includes('[1m]')) {
    return 'Sonnet 4 (with 1M token context)';
  }
  if (modelLower.includes('claude-sonnet-4')) return 'Sonnet 4';
  if (modelLower.includes('claude-opus-4-1')) return 'Opus 4.1';
  if (modelLower.includes('claude-opus-4')) return 'Opus 4';
  if (modelLower.includes('claude-3-7-sonnet')) return 'Claude 3.7 Sonnet';
  if (modelLower.includes('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet';
  if (modelLower.includes('claude-3-5-haiku')) return 'Claude 3.5 Haiku';

  return model;
}

/**
 * Client configuration
 */
export class ClientConfig {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.authToken = options.authToken;
    this.baseURL = options.baseURL || 'https://api.anthropic.com';
    this.timeout = options.timeout || 600000; // 10 minutes
    this.maxRetries = options.maxRetries ?? 2;
    this.dangerouslyAllowBrowser = options.dangerouslyAllowBrowser || true;
    this.defaultHeaders = options.defaultHeaders || {};
    this.logLevel = options.logLevel || 'info';
    this.useBedrock = options.useBedrock || process.env.CLAUDE_CODE_USE_BEDROCK === 'true';
    this.useVertex = options.useVertex || process.env.CLAUDE_CODE_USE_VERTEX === 'true';
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.isNonInteractiveSession = options.isNonInteractiveSession || false;
    this.isSmallFastModel = options.isSmallFastModel || false;
  }
}

/**
 * Anthropic API Client
 * Original: createAnthropicClient pattern from line 15899
 */
export class AnthropicClient extends EventEmitter {
  constructor(config = new ClientConfig()) {
    super();
    this.config = config;
    this.logger = getLogger('anthropic-client');
    this.errorRecovery = new ErrorRecoveryManager({
      maxRetries: config.maxRetries,
      timeout: config.timeout
    });
    this.abortControllers = new Map();
  }

  /**
   * Build request headers
   * Original: buildHeaders pattern from line 13764
   */
  async buildHeaders(options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...this.config.defaultHeaders
    };

    // Add authentication
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    } else if (this.config.apiKey) {
      headers['X-Api-Key'] = this.config.apiKey;
    }

    // Add custom headers from environment
    const customHeaders = this.getCustomHeaders();
    Object.assign(headers, customHeaders);

    // Add retry count if applicable
    if (options.retryCount > 0) {
      headers['X-Retry-Count'] = options.retryCount.toString();
    }

    return headers;
  }

  /**
   * Get custom headers from environment
   * Original: dk6 function pattern
   */
  getCustomHeaders() {
    const headers = {};
    const customHeadersEnv = process.env.ANTHROPIC_CUSTOM_HEADERS;

    if (!customHeadersEnv) return headers;

    const lines = customHeadersEnv.split(/\n|\r\n/);
    for (const line of lines) {
      if (!line.trim()) continue;

      const match = line.match(/^\s*(.*?)\s*:\s*(.*?)\s*$/);
      if (match) {
        const [, key, value] = match;
        if (key && value !== undefined) {
          headers[key] = value;
        }
      }
    }

    return headers;
  }

  /**
   * Select appropriate model based on context
   * Original: model selection patterns
   */
  selectModel(options = {}) {
    // Check for small/fast model requirement
    if (options.isSmallFastModel || this.config.isSmallFastModel) {
      return this.getModelIdentifier(ModelConfig.CLAUDE_3_5_HAIKU);
    }

    // Check for specific model override
    if (options.model) {
      return options.model;
    }

    // Use configured model
    return this.config.model;
  }

  /**
   * Get model identifier based on platform
   */
  getModelIdentifier(modelConfig) {
    if (this.config.useBedrock) {
      return modelConfig.bedrock;
    }
    if (this.config.useVertex) {
      return modelConfig.vertex;
    }
    return modelConfig.firstParty;
  }

  /**
   * Create message request
   * Original: makeRequest pattern from line 13606
   */
  async createMessage(options) {
    const model = this.selectModel(options);
    const headers = await this.buildHeaders();

    const request = {
      model,
      messages: options.messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0,
      stream: options.stream ?? false,
      system: options.system,
      metadata: options.metadata,
      stop_sequences: options.stopSequences,
      tools: options.tools,
      tool_choice: options.toolChoice
    };

    // Clean undefined values
    Object.keys(request).forEach(key => {
      if (request[key] === undefined) {
        delete request[key];
      }
    });

    return this.executeRequest('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      stream: options.stream
    });
  }

  /**
   * Execute HTTP request with retry logic
   * Original: makeRequest implementation from lines 13606-13650
   */
  async executeRequest(path, options) {
    const url = `${this.config.baseURL}${path}`;
    const requestId = this.generateRequestId();

    this.logger.debug(`[${requestId}] Sending request`, {
      method: options.method,
      url,
      headers: this.filterSensitiveHeaders(options.headers)
    });

    try {
      const response = await this.errorRecovery.executeWithRetry(
        async (attempt) => {
          const controller = new AbortController();
          this.abortControllers.set(requestId, controller);

          const fetchOptions = {
            method: options.method,
            headers: options.headers,
            body: options.body,
            signal: controller.signal
          };

          // Add timeout
          const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

          try {
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
              const error = await this.parseErrorResponse(response);
              throw error;
            }

            if (options.stream) {
              return this.handleStreamResponse(response, controller);
            }

            return await response.json();

          } finally {
            clearTimeout(timeoutId);
            this.abortControllers.delete(requestId);
          }
        },
        {
          maxRetries: options.maxRetries ?? this.config.maxRetries,
          onRetry: (attempt, error) => {
            this.logger.warn(`[${requestId}] Retrying request`, {
              attempt,
              error: error.message
            });
          }
        }
      );

      this.logger.debug(`[${requestId}] Request succeeded`);
      return response;

    } catch (error) {
      this.logger.error(`[${requestId}] Request failed`, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle streaming response
   * Original: SSEResponse pattern from lines 11862-12050
   */
  async *handleStreamResponse(response, controller) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const event = JSON.parse(data);
              yield event;
            } catch (error) {
              this.logger.warn('Failed to parse SSE event', { line });
            }
          }
        }
      }
    } finally {
      controller.abort();
    }
  }

  /**
   * Parse error response
   */
  async parseErrorResponse(response) {
    let errorBody;

    try {
      errorBody = await response.json();
    } catch {
      errorBody = { message: await response.text() };
    }

    const error = new Error(errorBody.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.headers = response.headers;
    error.body = errorBody;

    // Check for rate limit
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      error.retryAfter = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
    }

    return error;
  }

  /**
   * Filter sensitive headers for logging
   */
  filterSensitiveHeaders(headers) {
    const filtered = { ...headers };
    const sensitive = ['x-api-key', 'authorization', 'cookie', 'set-cookie'];

    for (const key of Object.keys(filtered)) {
      if (sensitive.includes(key.toLowerCase())) {
        filtered[key] = '***';
      }
    }

    return filtered;
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Abort a request
   */
  abortRequest(requestId) {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }

  /**
   * Abort all requests
   */
  abortAll() {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
  }
}

/**
 * Create Anthropic client instance
 * Original: createAnthropicClient function from line 15899
 */
export async function createAnthropicClient(options = {}) {
  const config = new ClientConfig(options);

  // Platform-specific configuration
  if (config.useBedrock) {
    return createBedrockClient(config);
  }

  if (config.useVertex) {
    return createVertexClient(config);
  }

  // Standard Anthropic client
  return new AnthropicClient(config);
}

/**
 * Create Bedrock client (AWS)
 */
function createBedrockClient(config) {
  // This would integrate with AWS Bedrock
  config.baseURL = 'https://bedrock-runtime.amazonaws.com';
  return new AnthropicClient(config);
}

/**
 * Create Vertex client (Google Cloud)
 */
function createVertexClient(config) {
  // This would integrate with Vertex AI
  config.baseURL = 'https://vertex.googleapis.com';
  return new AnthropicClient(config);
}

/**
 * Stream processor for handling SSE events
 */
export class StreamProcessor {
  constructor() {
    this.event = null;
    this.data = [];
    this.chunks = [];
  }

  decode(line) {
    if (!line) {
      if (!this.event && !this.data.length) return null;

      const result = {
        event: this.event,
        data: this.data.join('\n'),
        raw: this.chunks
      };

      this.event = null;
      this.data = [];
      this.chunks = [];

      return result;
    }

    this.chunks.push(line);

    if (line.startsWith(':')) return null;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return null;

    const field = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (field === 'event') {
      this.event = value;
    } else if (field === 'data') {
      this.data.push(value);
    }

    return null;
  }
}

export default {
  ModelConfig,
  ModelAvailability,
  getModelDisplayName,
  ClientConfig,
  AnthropicClient,
  createAnthropicClient,
  StreamProcessor
};