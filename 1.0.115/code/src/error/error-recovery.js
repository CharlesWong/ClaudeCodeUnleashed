/**
 * Error Recovery System for Claude Code
 * Retry strategies, fallback mechanisms, and error handling
 * Extracted from lines 13500-13750 and other sections
 */

/**
 * Error types and classifications
 */
export const ErrorTypes = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  AUTHENTICATION: 'authentication',
  VALIDATION: 'validation',
  SERVER: 'server',
  CLIENT: 'client',
  UNKNOWN: 'unknown'
};

/**
 * Custom error classes
 */
export class ClaudeError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'ClaudeError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }
}

export class NetworkError extends ClaudeError {
  constructor(message, cause) {
    super(message, 'NETWORK_ERROR', { cause });
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends ClaudeError {
  constructor(message = 'Request timed out', timeout) {
    super(message, 'TIMEOUT_ERROR', { timeout });
    this.name = 'TimeoutError';
  }
}

export class RateLimitError extends ClaudeError {
  constructor(message, retryAfter) {
    super(message, 'RATE_LIMIT_ERROR', { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class AuthenticationError extends ClaudeError {
  constructor(message = 'Unauthorized') {
    super(message, 'AUTH_ERROR', {});
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends ClaudeError {
  constructor(message, errors = []) {
    super(message, 'VALIDATION_ERROR', { errors });
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Retry configuration
 * Original: lines 13511-13521
 */
export class RetryConfig {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.timeout = options.timeout ?? 60000;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.maxBackoffMs = options.maxBackoffMs ?? 8000;
    this.jitterFactor = options.jitterFactor ?? 0.25;
    this.retryableErrors = options.retryableErrors ?? [408, 409, 429, 500, 502, 503, 504];
    this.showErrors = options.showErrors ?? false;
  }

  /**
   * Check if error is retryable
   * Original: async shouldRetry() - lines 13700-13710
   */
  shouldRetry(error, response) {
    // Check response header hint
    const shouldRetryHeader = response?.headers?.get('x-should-retry');
    if (shouldRetryHeader === 'true') return true;
    if (shouldRetryHeader === 'false') return false;

    // Check status code
    if (response?.status) {
      if (this.retryableErrors.includes(response.status)) {
        return true;
      }
    }

    // Check error type
    if (error instanceof TimeoutError) return true;
    if (error instanceof NetworkError) return true;
    if (error instanceof RateLimitError) return true;

    // Check error message patterns
    if (error && /timed? ?out/i.test(String(error))) return true;
    if (error && /network|connection/i.test(String(error))) return true;

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   * Original: calculateDefaultRetryTimeoutMillis - lines 13740-13750
   */
  calculateRetryDelay(attemptNumber, maxRetries, retryAfterMs) {
    // Use retry-after header if provided
    if (retryAfterMs && retryAfterMs > 0 && retryAfterMs < 60000) {
      return retryAfterMs;
    }

    // Calculate exponential backoff
    const retriesLeft = maxRetries - attemptNumber;
    const baseDelay = Math.min(0.5 * Math.pow(this.backoffMultiplier, retriesLeft), 8);

    // Add jitter to prevent thundering herd
    const jitter = 1 - Math.random() * this.jitterFactor;

    return Math.min(baseDelay * jitter * 1000, this.maxBackoffMs);
  }

  /**
   * Parse retry-after header
   */
  parseRetryAfter(headers) {
    // Check retry-after-ms header first
    const retryAfterMs = headers?.get('retry-after-ms');
    if (retryAfterMs) {
      const ms = parseInt(retryAfterMs, 10);
      if (!Number.isNaN(ms)) return ms;
    }

    // Check retry-after header (in seconds)
    const retryAfter = headers?.get('retry-after');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!Number.isNaN(seconds)) return seconds * 1000;
    }

    return null;
  }
}

/**
 * Error recovery manager
 * Handles retry logic and fallback strategies
 */
export class ErrorRecoveryManager {
  constructor(config = {}) {
    this.config = new RetryConfig(config);
    this.errorHandlers = new Map();
    this.fallbackStrategies = new Map();
    this.metrics = {
      attempts: 0,
      successes: 0,
      failures: 0,
      retries: 0
    };
  }

  /**
   * Execute with retry logic
   * Original pattern from makeRequest - lines 13607-13650
   */
  async executeWithRetry(fn, options = {}) {
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    const onRetry = options.onRetry;
    const signal = options.signal;

    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
      this.metrics.attempts++;

      try {
        // Check if aborted
        if (signal?.aborted) {
          throw new Error('Operation aborted');
        }

        // Execute the function
        const result = await fn(attempt);

        this.metrics.successes++;
        return result;

      } catch (error) {
        lastError = error;
        const retriesLeft = maxRetries - attempt;

        // Check if should retry
        if (retriesLeft > 0 && this.config.shouldRetry(error, error.response)) {
          this.metrics.retries++;

          // Calculate delay
          const retryAfterMs = this.config.parseRetryAfter(error.response?.headers);
          const delay = this.config.calculateRetryDelay(attempt, maxRetries, retryAfterMs);

          // Log retry attempt
          if (this.config.showErrors) {
            console.info(`Retrying, ${retriesLeft} attempts remaining. Waiting ${delay}ms...`);
          }

          // Call retry callback if provided
          if (onRetry) {
            onRetry(attempt, error, delay);
          }

          // Wait before retry
          await this.sleep(delay);

          attempt++;
          continue;
        }

        // No more retries
        break;
      }
    }

    // All retries exhausted
    this.metrics.failures++;
    throw this.enhanceError(lastError, { attempts: attempt + 1, maxRetries });
  }

  /**
   * Register error handler
   */
  registerErrorHandler(errorType, handler) {
    this.errorHandlers.set(errorType, handler);
  }

  /**
   * Register fallback strategy
   */
  registerFallback(operation, strategy) {
    this.fallbackStrategies.set(operation, strategy);
  }

  /**
   * Execute with fallback
   */
  async executeWithFallback(operation, primaryFn, fallbackFn) {
    try {
      return await this.executeWithRetry(primaryFn);
    } catch (error) {
      // Try custom fallback strategy if registered
      const strategy = this.fallbackStrategies.get(operation);
      if (strategy) {
        return await strategy(error);
      }

      // Use provided fallback function
      if (fallbackFn) {
        console.warn(`Primary operation failed, using fallback for ${operation}`);
        return await fallbackFn(error);
      }

      throw error;
    }
  }

  /**
   * Handle error with appropriate strategy
   */
  async handleError(error, context = {}) {
    const errorType = this.classifyError(error);
    const handler = this.errorHandlers.get(errorType);

    if (handler) {
      return await handler(error, context);
    }

    // Default handling
    switch (errorType) {
      case ErrorTypes.RATE_LIMIT:
        return this.handleRateLimit(error);

      case ErrorTypes.TIMEOUT:
        return this.handleTimeout(error);

      case ErrorTypes.AUTHENTICATION:
        return this.handleAuthError(error);

      case ErrorTypes.NETWORK:
        return this.handleNetworkError(error);

      default:
        throw error;
    }
  }

  /**
   * Classify error type
   */
  classifyError(error) {
    if (error instanceof RateLimitError || error.status === 429) {
      return ErrorTypes.RATE_LIMIT;
    }
    if (error instanceof TimeoutError || /timeout/i.test(error.message)) {
      return ErrorTypes.TIMEOUT;
    }
    if (error instanceof AuthenticationError || error.status === 401 || error.status === 403) {
      return ErrorTypes.AUTHENTICATION;
    }
    if (error instanceof NetworkError || /network|connection/i.test(error.message)) {
      return ErrorTypes.NETWORK;
    }
    if (error instanceof ValidationError || error.status === 400) {
      return ErrorTypes.VALIDATION;
    }
    if (error.status >= 500) {
      return ErrorTypes.SERVER;
    }
    if (error.status >= 400) {
      return ErrorTypes.CLIENT;
    }
    return ErrorTypes.UNKNOWN;
  }

  /**
   * Handle rate limit errors
   */
  async handleRateLimit(error) {
    const retryAfter = error.retryAfter || 60000;
    console.warn(`Rate limited. Waiting ${retryAfter}ms before retry...`);
    await this.sleep(retryAfter);
    throw error; // Re-throw for retry logic
  }

  /**
   * Handle timeout errors
   */
  async handleTimeout(error) {
    console.warn('Request timed out. Consider increasing timeout or reducing payload size.');
    throw error;
  }

  /**
   * Handle authentication errors
   */
  async handleAuthError(error) {
    console.error('Authentication failed. Please check your API key or token.');
    throw error;
  }

  /**
   * Handle network errors
   */
  async handleNetworkError(error) {
    console.warn('Network error occurred. Check your connection.');
    throw error;
  }

  /**
   * Enhance error with additional context
   */
  enhanceError(error, context) {
    if (error instanceof ClaudeError) {
      error.details = { ...error.details, ...context };
    } else {
      const enhanced = new ClaudeError(
        error.message || 'Unknown error',
        'ENHANCED_ERROR',
        { originalError: error, ...context }
      );
      enhanced.stack = error.stack;
      return enhanced;
    }
    return error;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get recovery metrics
   */
  getMetrics() {
    const successRate = this.metrics.attempts > 0
      ? (this.metrics.successes / this.metrics.attempts) * 100
      : 0;

    return {
      ...this.metrics,
      successRate: successRate.toFixed(2) + '%',
      averageRetries: this.metrics.attempts > 0
        ? (this.metrics.retries / this.metrics.attempts).toFixed(2)
        : '0'
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      attempts: 0,
      successes: 0,
      failures: 0,
      retries: 0
    };
  }
}

/**
 * Circuit breaker for protecting resources
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold ?? 5;
    this.timeout = options.timeout ?? 60000;
    this.resetTimeout = options.resetTimeout ?? 30000;

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.nextAttempt = Date.now();
    this.successCount = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  onFailure() {
    this.failures++;
    this.successCount = 0;

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.threshold
    };
  }
}

/**
 * Create default error recovery manager
 */
export function createErrorRecovery(options) {
  return new ErrorRecoveryManager(options);
}

export default {
  ErrorTypes,
  ClaudeError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
  ValidationError,
  RetryConfig,
  ErrorRecoveryManager,
  CircuitBreaker,
  createErrorRecovery
};