# Part 6.4: Error Handling and Retry Logic in Claude Code

## Introduction

The error handling and retry logic in Claude Code represents a sophisticated fault-tolerance system that ensures reliable API communication despite network instabilities, rate limits, and service disruptions. This comprehensive exploration examines the multi-layered error hierarchy, intelligent retry strategies, circuit breaker implementations, and recovery mechanisms that enable Claude Code to gracefully handle failures while maintaining optimal user experience.

The implementation addresses fundamental challenges in distributed systems: distinguishing between transient and permanent failures, implementing exponential backoff without overwhelming the service, handling rate limits intelligently, and providing meaningful error messages to users. The architecture demonstrates enterprise-grade patterns including error classification, adaptive retry strategies, and comprehensive telemetry for monitoring system health.

## Error Hierarchy and Classification

### Base Error Architecture

The error system is built on a comprehensive class hierarchy that provides rich context for debugging and recovery:

```javascript
class ClaudeCodeError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ClaudeCodeError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.id = this.generateErrorId();
    this.context = this.captureContext();
    this.retryable = false;
    this.severity = 'error';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ClaudeCodeError);
    }

    // Track error in telemetry
    this.trackError();
  }

  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  captureContext() {
    return {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'production'
    };
  }

  trackError() {
    // Emit error event for telemetry
    if (global.errorTracker) {
      global.errorTracker.track(this);
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      context: this.context,
      retryable: this.retryable,
      severity: this.severity,
      stack: this.stack
    };
  }

  toUserMessage() {
    // Generate user-friendly error message
    return {
      error: this.message,
      suggestion: this.getSuggestion(),
      documentation: this.getDocumentationLink()
    };
  }

  getSuggestion() {
    // Override in subclasses for specific suggestions
    return 'Please try again or contact support if the issue persists.';
  }

  getDocumentationLink() {
    return `https://docs.claude.ai/errors/${this.code.toLowerCase()}`;
  }
}
```

### Specialized Error Classes

The system implements specialized error classes for different failure scenarios:

```javascript
class APIError extends ClaudeCodeError {
  constructor(message, statusCode, response = {}) {
    super(message, 'API_ERROR', { statusCode, response });
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.response = response;

    // Determine if retryable based on status code
    this.retryable = this.isRetryableStatus(statusCode);
    this.severity = this.determineSeverity(statusCode);
  }

  isRetryableStatus(status) {
    const retryableStatuses = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504  // Gateway Timeout
    ];
    return retryableStatuses.includes(status);
  }

  determineSeverity(status) {
    if (status >= 500) return 'critical';
    if (status >= 400) return 'error';
    return 'warning';
  }

  static fromAxiosError(axiosError) {
    const response = axiosError.response;

    if (!response) {
      return new NetworkError('Network request failed', axiosError.code);
    }

    const message = response.data?.error?.message ||
                   axiosError.message ||
                   'API request failed';

    return new APIError(message, response.status, response.data);
  }

  getSuggestion() {
    switch (this.statusCode) {
      case 400:
        return 'Check your request parameters and try again.';
      case 401:
        return 'Verify your API key is correct and active.';
      case 403:
        return 'You do not have permission to access this resource.';
      case 404:
        return 'The requested resource was not found.';
      case 429:
        return 'You have exceeded the rate limit. Please wait and try again.';
      case 500:
      case 502:
      case 503:
        return 'The service is temporarily unavailable. Please try again later.';
      default:
        return super.getSuggestion();
    }
  }
}

class RateLimitError extends APIError {
  constructor(message, rateLimitType, resetsAt, details = {}) {
    super(message, 429, details);
    this.name = 'RateLimitError';
    this.rateLimitType = rateLimitType;
    this.resetsAt = resetsAt;
    this.retryable = true;

    // Calculate wait time
    this.waitTime = this.calculateWaitTime();
  }

  calculateWaitTime() {
    if (!this.resetsAt) return 0;

    const now = Date.now();
    const resetTime = typeof this.resetsAt === 'string'
      ? new Date(this.resetsAt).getTime()
      : this.resetsAt;

    return Math.max(0, resetTime - now);
  }

  getSuggestion() {
    const waitSeconds = Math.ceil(this.waitTime / 1000);

    if (waitSeconds > 0) {
      if (waitSeconds < 60) {
        return `Rate limit exceeded. Please wait ${waitSeconds} seconds.`;
      } else if (waitSeconds < 3600) {
        const minutes = Math.ceil(waitSeconds / 60);
        return `Rate limit exceeded. Please wait ${minutes} minutes.`;
      } else {
        const hours = Math.ceil(waitSeconds / 3600);
        return `Rate limit exceeded. Please wait ${hours} hours.`;
      }
    }

    return 'Rate limit exceeded. Please try again later.';
  }

  static fromRateLimitHeaders(headers) {
    const type = headers['x-ratelimit-type'] || 'unknown';
    const resetsAt = headers['x-ratelimit-reset'];
    const remaining = headers['x-ratelimit-remaining'];

    const message = remaining === '0'
      ? 'Rate limit exceeded'
      : `Rate limit warning: ${remaining} requests remaining`;

    return new RateLimitError(message, type, resetsAt, {
      remaining,
      limit: headers['x-ratelimit-limit']
    });
  }
}

class NetworkError extends ClaudeCodeError {
  constructor(message, code, details = {}) {
    super(message, code || 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
    this.retryable = true;

    // Classify network error
    this.errorType = this.classifyNetworkError(code);
  }

  classifyNetworkError(code) {
    const classifications = {
      'ECONNREFUSED': 'connection_refused',
      'ENOTFOUND': 'dns_lookup_failed',
      'ETIMEDOUT': 'connection_timeout',
      'ECONNRESET': 'connection_reset',
      'EPIPE': 'broken_pipe',
      'EHOSTUNREACH': 'host_unreachable',
      'ENETUNREACH': 'network_unreachable',
      'EADDRINUSE': 'address_in_use',
      'ECONNABORTED': 'connection_aborted',
      'ENETDOWN': 'network_down'
    };

    return classifications[code] || 'unknown';
  }

  getSuggestion() {
    switch (this.errorType) {
      case 'connection_refused':
        return 'Unable to connect to the API. Check your internet connection.';
      case 'dns_lookup_failed':
        return 'Unable to resolve API hostname. Check your DNS settings.';
      case 'connection_timeout':
        return 'Connection timed out. The API may be slow or unreachable.';
      case 'connection_reset':
        return 'Connection was reset. This is usually temporary.';
      case 'host_unreachable':
      case 'network_unreachable':
        return 'Network is unreachable. Check your internet connection.';
      default:
        return 'Network error occurred. Please check your connection.';
    }
  }
}

class ValidationError extends ClaudeCodeError {
  constructor(message, field, value, constraints = {}) {
    super(message, 'VALIDATION_ERROR', { field, value, constraints });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.constraints = constraints;
    this.retryable = false;
    this.severity = 'warning';
  }

  getSuggestion() {
    const suggestions = [];

    if (this.constraints.min !== undefined) {
      suggestions.push(`Must be at least ${this.constraints.min}`);
    }
    if (this.constraints.max !== undefined) {
      suggestions.push(`Must be at most ${this.constraints.max}`);
    }
    if (this.constraints.pattern) {
      suggestions.push(`Must match pattern: ${this.constraints.pattern}`);
    }
    if (this.constraints.enum) {
      suggestions.push(`Must be one of: ${this.constraints.enum.join(', ')}`);
    }

    return suggestions.length > 0
      ? suggestions.join('. ')
      : 'Please check the input and try again.';
  }
}
```

## Retry Strategy Implementation

### Adaptive Retry Manager

The retry manager implements sophisticated retry strategies with exponential backoff:

```javascript
class RetryManager {
  constructor(options = {}) {
    this.strategies = new Map();
    this.defaultStrategy = new ExponentialBackoffStrategy(options);
    this.metrics = new RetryMetrics();

    // Register default strategies
    this.registerStrategy('exponential', new ExponentialBackoffStrategy());
    this.registerStrategy('linear', new LinearBackoffStrategy());
    this.registerStrategy('fibonacci', new FibonacciBackoffStrategy());
    this.registerStrategy('decorrelated', new DecorrelatedJitterStrategy());
  }

  registerStrategy(name, strategy) {
    this.strategies.set(name, strategy);
  }

  async executeWithRetry(fn, options = {}) {
    const strategy = options.strategy
      ? this.strategies.get(options.strategy) || this.defaultStrategy
      : this.defaultStrategy;

    const config = {
      maxRetries: options.maxRetries || 3,
      maxDelay: options.maxDelay || 60000,
      initialDelay: options.initialDelay || 1000,
      factor: options.factor || 2,
      jitter: options.jitter !== false,
      ...options
    };

    let lastError;
    let attempt = 0;

    while (attempt <= config.maxRetries) {
      try {
        // Record attempt
        this.metrics.recordAttempt(attempt);

        // Execute function
        const result = await fn(attempt);

        // Record success
        this.metrics.recordSuccess(attempt);

        return result;

      } catch (error) {
        lastError = error;
        this.metrics.recordFailure(attempt, error);

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error;
        }

        // Check if we've exceeded max retries
        if (attempt >= config.maxRetries) {
          throw new MaxRetriesExceededError(
            `Failed after ${attempt} retries`,
            lastError
          );
        }

        // Calculate delay
        const delay = strategy.calculateDelay(attempt, config);

        // Emit retry event
        this.emit('retry', {
          attempt: attempt + 1,
          delay,
          error,
          maxRetries: config.maxRetries
        });

        // Wait before retry
        await this.delay(delay);

        attempt++;
      }
    }

    throw lastError;
  }

  isRetryable(error) {
    // Check error's retryable flag
    if (error.retryable !== undefined) {
      return error.retryable;
    }

    // Check specific error types
    if (error instanceof NetworkError) return true;
    if (error instanceof RateLimitError) return true;

    if (error instanceof APIError) {
      return error.retryable;
    }

    // Default to not retryable
    return false;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class ExponentialBackoffStrategy {
  calculateDelay(attempt, config) {
    // Base exponential backoff
    let delay = config.initialDelay * Math.pow(config.factor, attempt);

    // Apply max delay cap
    delay = Math.min(delay, config.maxDelay);

    // Add jitter if enabled
    if (config.jitter) {
      delay = this.addJitter(delay);
    }

    return Math.floor(delay);
  }

  addJitter(delay) {
    // Add random jitter (0-25% of delay)
    const jitter = Math.random() * delay * 0.25;
    return delay + jitter;
  }
}

class LinearBackoffStrategy {
  calculateDelay(attempt, config) {
    let delay = config.initialDelay * (attempt + 1);
    delay = Math.min(delay, config.maxDelay);

    if (config.jitter) {
      const jitter = Math.random() * delay * 0.1;
      delay += jitter;
    }

    return Math.floor(delay);
  }
}

class FibonacciBackoffStrategy {
  constructor() {
    this.sequence = [1, 1];
  }

  calculateDelay(attempt, config) {
    // Generate Fibonacci sequence up to attempt
    while (this.sequence.length <= attempt) {
      const next = this.sequence[this.sequence.length - 1] +
                  this.sequence[this.sequence.length - 2];
      this.sequence.push(next);
    }

    let delay = config.initialDelay * this.sequence[attempt];
    delay = Math.min(delay, config.maxDelay);

    if (config.jitter) {
      const jitter = Math.random() * delay * 0.15;
      delay += jitter;
    }

    return Math.floor(delay);
  }
}

class DecorrelatedJitterStrategy {
  constructor() {
    this.lastDelay = 0;
  }

  calculateDelay(attempt, config) {
    const minDelay = config.initialDelay;
    const maxDelay = Math.min(
      this.lastDelay * 3,
      config.maxDelay
    );

    // Decorrelated jitter
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    this.lastDelay = delay;

    return Math.floor(delay);
  }
}
```

## Circuit Breaker Pattern

### Circuit Breaker Implementation

The circuit breaker prevents cascading failures:

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000,
      halfOpenRequests: options.halfOpenRequests || 1,
      ...options
    };

    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.halfOpenAttempts = 0;
    this.stats = new CircuitBreakerStats();
  }

  async execute(fn) {
    // Check circuit state
    if (!this.canExecute()) {
      throw new CircuitOpenError(
        'Circuit breaker is open',
        this.getTimeUntilNextAttempt()
      );
    }

    try {
      // Execute function
      const result = await fn();

      // Record success
      this.onSuccess();

      return result;

    } catch (error) {
      // Record failure
      this.onFailure(error);

      throw error;
    }
  }

  canExecute() {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        if (Date.now() >= this.nextAttempt) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;

      case 'half-open':
        return this.halfOpenAttempts < this.options.halfOpenRequests;

      default:
        return false;
    }
  }

  onSuccess() {
    this.stats.recordSuccess();

    switch (this.state) {
      case 'closed':
        this.failures = 0;
        break;

      case 'half-open':
        this.successes++;
        if (this.successes >= this.options.successThreshold) {
          this.transitionToClosed();
        }
        break;

      case 'open':
        // Should not happen
        break;
    }
  }

  onFailure(error) {
    this.stats.recordFailure(error);
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case 'closed':
        this.failures++;
        if (this.failures >= this.options.failureThreshold) {
          this.transitionToOpen();
        }
        break;

      case 'half-open':
        this.transitionToOpen();
        break;

      case 'open':
        // Already open
        break;
    }
  }

  transitionToOpen() {
    this.state = 'open';
    this.nextAttempt = Date.now() + this.options.timeout;
    this.emit('state-change', {
      from: this.getPreviousState(),
      to: 'open',
      failures: this.failures
    });
  }

  transitionToHalfOpen() {
    this.state = 'half-open';
    this.successes = 0;
    this.failures = 0;
    this.halfOpenAttempts = 0;
    this.emit('state-change', {
      from: 'open',
      to: 'half-open'
    });
  }

  transitionToClosed() {
    const previousState = this.state;
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    this.emit('state-change', {
      from: previousState,
      to: 'closed'
    });
  }

  getTimeUntilNextAttempt() {
    if (this.state !== 'open') return 0;
    return Math.max(0, this.nextAttempt - Date.now());
  }

  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      stats: this.stats.getSnapshot()
    };
  }

  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.halfOpenAttempts = 0;
    this.stats.reset();
  }
}

class CircuitBreakerStats {
  constructor() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.openCount = 0;
    this.lastOpenTime = null;
    this.errorCounts = new Map();
  }

  recordSuccess() {
    this.totalRequests++;
    this.successfulRequests++;
  }

  recordFailure(error) {
    this.totalRequests++;
    this.failedRequests++;

    // Count error types
    const errorType = error.constructor.name;
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);
  }

  getSnapshot() {
    const successRate = this.totalRequests > 0
      ? this.successfulRequests / this.totalRequests
      : 0;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      successRate,
      openCount: this.openCount,
      lastOpenTime: this.lastOpenTime,
      errorBreakdown: Object.fromEntries(this.errorCounts)
    };
  }
}
```

## Error Recovery Mechanisms

### Error Recovery Handler

Sophisticated error recovery with fallback strategies:

```javascript
class ErrorRecoveryHandler {
  constructor(options = {}) {
    this.strategies = new Map();
    this.fallbacks = [];
    this.recoveryAttempts = new Map();
    this.maxRecoveryAttempts = options.maxRecoveryAttempts || 3;

    this.registerDefaultStrategies();
  }

  registerDefaultStrategies() {
    // Network error recovery
    this.registerStrategy('NetworkError', async (error, context) => {
      // Try alternative endpoints
      if (context.alternativeEndpoints) {
        for (const endpoint of context.alternativeEndpoints) {
          try {
            return await context.retry({ baseURL: endpoint });
          } catch (e) {
            continue;
          }
        }
      }

      // Try with reduced payload
      if (context.canReducePayload) {
        return await context.retry({
          maxTokens: Math.floor(context.maxTokens * 0.5)
        });
      }

      throw error;
    });

    // Rate limit recovery
    this.registerStrategy('RateLimitError', async (error, context) => {
      const waitTime = error.calculateWaitTime();

      if (waitTime > 0 && waitTime < 300000) { // Max 5 minutes
        await this.delay(waitTime);
        return await context.retry();
      }

      // Try with different API key if available
      if (context.alternativeApiKeys) {
        for (const apiKey of context.alternativeApiKeys) {
          try {
            return await context.retry({ apiKey });
          } catch (e) {
            if (!(e instanceof RateLimitError)) {
              throw e;
            }
          }
        }
      }

      throw error;
    });

    // API error recovery
    this.registerStrategy('APIError', async (error, context) => {
      // Model fallback for overload errors
      if (error.statusCode === 529 && context.fallbackModel) {
        return await context.retry({
          model: context.fallbackModel
        });
      }

      // Retry with exponential backoff for 5xx errors
      if (error.statusCode >= 500) {
        const delay = Math.min(
          1000 * Math.pow(2, context.attempt || 0),
          30000
        );
        await this.delay(delay);
        return await context.retry();
      }

      throw error;
    });
  }

  registerStrategy(errorType, handler) {
    this.strategies.set(errorType, handler);
  }

  registerFallback(handler) {
    this.fallbacks.push(handler);
  }

  async recover(error, context = {}) {
    const errorType = error.constructor.name;
    const recoveryKey = `${errorType}_${context.requestId || 'unknown'}`;

    // Check recovery attempts
    const attempts = this.recoveryAttempts.get(recoveryKey) || 0;
    if (attempts >= this.maxRecoveryAttempts) {
      throw new MaxRecoveryAttemptsExceededError(
        `Max recovery attempts exceeded for ${errorType}`,
        error
      );
    }

    this.recoveryAttempts.set(recoveryKey, attempts + 1);

    try {
      // Try specific recovery strategy
      const strategy = this.strategies.get(errorType);
      if (strategy) {
        return await strategy(error, context);
      }

      // Try fallback strategies
      for (const fallback of this.fallbacks) {
        try {
          return await fallback(error, context);
        } catch (e) {
          continue;
        }
      }

      // No recovery possible
      throw error;

    } finally {
      // Clean up recovery attempts after success
      setTimeout(() => {
        this.recoveryAttempts.delete(recoveryKey);
      }, 60000);
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Error Aggregation and Reporting

### Error Aggregator

Collects and analyzes errors for patterns:

```javascript
class ErrorAggregator {
  constructor(options = {}) {
    this.errors = [];
    this.maxErrors = options.maxErrors || 1000;
    this.aggregationWindow = options.aggregationWindow || 300000; // 5 minutes
    this.patterns = new Map();
    this.alerts = new AlertManager();
  }

  record(error) {
    const errorRecord = {
      error,
      timestamp: Date.now(),
      id: error.id || this.generateId(),
      type: error.constructor.name,
      code: error.code,
      message: error.message,
      stack: error.stack
    };

    this.errors.push(errorRecord);

    // Maintain max size
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Analyze for patterns
    this.analyzePatterns(errorRecord);

    // Check for alert conditions
    this.checkAlerts();
  }

  analyzePatterns(errorRecord) {
    const pattern = `${errorRecord.type}_${errorRecord.code}`;
    const patternData = this.patterns.get(pattern) || {
      count: 0,
      firstSeen: errorRecord.timestamp,
      lastSeen: errorRecord.timestamp,
      examples: []
    };

    patternData.count++;
    patternData.lastSeen = errorRecord.timestamp;

    if (patternData.examples.length < 5) {
      patternData.examples.push(errorRecord);
    }

    this.patterns.set(pattern, patternData);
  }

  checkAlerts() {
    const recentErrors = this.getRecentErrors();

    // High error rate
    if (recentErrors.length > 10) {
      this.alerts.trigger('high_error_rate', {
        count: recentErrors.length,
        window: this.aggregationWindow
      });
    }

    // Repeated errors
    for (const [pattern, data] of this.patterns) {
      if (data.count > 5 &&
          data.lastSeen - data.firstSeen < 60000) {
        this.alerts.trigger('repeated_error', {
          pattern,
          count: data.count,
          duration: data.lastSeen - data.firstSeen
        });
      }
    }

    // Critical errors
    const criticalErrors = recentErrors.filter(e =>
      e.error.severity === 'critical'
    );

    if (criticalErrors.length > 0) {
      this.alerts.trigger('critical_errors', {
        errors: criticalErrors
      });
    }
  }

  getRecentErrors(window = this.aggregationWindow) {
    const cutoff = Date.now() - window;
    return this.errors.filter(e => e.timestamp > cutoff);
  }

  getStatistics() {
    const recentErrors = this.getRecentErrors();
    const errorsByType = new Map();
    const errorsByCode = new Map();

    for (const error of recentErrors) {
      // Count by type
      const typeCount = errorsByType.get(error.type) || 0;
      errorsByType.set(error.type, typeCount + 1);

      // Count by code
      const codeCount = errorsByCode.get(error.code) || 0;
      errorsByCode.set(error.code, codeCount + 1);
    }

    return {
      totalErrors: this.errors.length,
      recentErrors: recentErrors.length,
      errorsByType: Object.fromEntries(errorsByType),
      errorsByCode: Object.fromEntries(errorsByCode),
      patterns: Array.from(this.patterns.entries()).map(([pattern, data]) => ({
        pattern,
        ...data
      })),
      oldestError: this.errors[0]?.timestamp,
      newestError: this.errors[this.errors.length - 1]?.timestamp
    };
  }

  generateReport() {
    const stats = this.getStatistics();

    return {
      summary: {
        totalErrors: stats.totalErrors,
        uniquePatterns: this.patterns.size,
        timeRange: {
          start: new Date(stats.oldestError),
          end: new Date(stats.newestError)
        }
      },
      topErrors: this.getTopErrors(),
      errorTrend: this.calculateErrorTrend(),
      recommendations: this.generateRecommendations()
    };
  }

  getTopErrors(limit = 5) {
    return Array.from(this.patterns.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        percentage: (data.count / this.errors.length) * 100,
        examples: data.examples
      }));
  }

  calculateErrorTrend() {
    // Group errors by time buckets
    const bucketSize = 60000; // 1 minute
    const buckets = new Map();

    for (const error of this.errors) {
      const bucket = Math.floor(error.timestamp / bucketSize) * bucketSize;
      const count = buckets.get(bucket) || 0;
      buckets.set(bucket, count + 1);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, count]) => ({
        timestamp: new Date(timestamp),
        count
      }));
  }

  generateRecommendations() {
    const recommendations = [];
    const stats = this.getStatistics();

    // High rate limit errors
    if (stats.errorsByType['RateLimitError'] > 5) {
      recommendations.push({
        type: 'rate_limiting',
        severity: 'high',
        message: 'Consider implementing request throttling or upgrading API limits'
      });
    }

    // Network issues
    if (stats.errorsByType['NetworkError'] > 10) {
      recommendations.push({
        type: 'network',
        severity: 'medium',
        message: 'Network connectivity issues detected. Check connection stability'
      });
    }

    // API errors
    const apiErrors = stats.errorsByType['APIError'] || 0;
    if (apiErrors > 0) {
      const serverErrors = this.errors.filter(e =>
        e.error.statusCode >= 500
      ).length;

      if (serverErrors / apiErrors > 0.5) {
        recommendations.push({
          type: 'api_health',
          severity: 'high',
          message: 'High rate of server errors. API may be experiencing issues'
        });
      }
    }

    return recommendations;
  }
}
```

## Conclusion

The error handling and retry logic in Claude Code represents a comprehensive fault-tolerance system that ensures reliable operation despite the inherent uncertainties of distributed systems. Through sophisticated error classification, adaptive retry strategies, circuit breakers, and comprehensive recovery mechanisms, the system achieves remarkable resilience while maintaining optimal performance.

Key architectural achievements include:

1. **Rich Error Hierarchy**: Detailed error classification with context preservation
2. **Adaptive Retry Strategies**: Multiple backoff algorithms with jitter
3. **Circuit Breaker Pattern**: Prevents cascading failures with state management
4. **Intelligent Recovery**: Context-aware recovery strategies for different error types
5. **Comprehensive Monitoring**: Error aggregation, pattern detection, and alerting

The implementation demonstrates best practices in error handling, including fail-fast principles where appropriate, graceful degradation when possible, and comprehensive telemetry for monitoring system health. The multi-layered approach—from low-level network errors to high-level API failures—ensures that Claude Code can handle any failure scenario while providing meaningful feedback to users.

This concludes the API Client System documentation, revealing a robust, production-ready implementation that balances reliability with performance, user experience with system protection, and simplicity with sophistication.