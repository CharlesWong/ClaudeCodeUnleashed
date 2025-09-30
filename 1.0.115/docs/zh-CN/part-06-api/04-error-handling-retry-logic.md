# 第6.4部分：Claude Code中的错误处理和重试逻辑

## 简介

Claude Code中的错误处理和重试逻辑代表了一个复杂的容错系统，确保尽管网络不稳定、速率限制和服务中断，仍能实现可靠的API通信。本综合性探索审查了多层错误层次结构、智能重试策略、断路器实现，以及使Claude Code能够优雅处理故障同时保持最佳用户体验的恢复机制。

该实现解决了分布式系统中的基本挑战：区分临时和永久故障，实现指数退避而不压倒服务，智能处理速率限制，以及向用户提供有意义的错误消息。该架构展示了企业级模式，包括错误分类、自适应重试策略和全面的遥测监控系统健康状态。

## 错误层次结构和分类

### 基础错误架构

错误系统构建在一个全面的类层次结构上，为调试和恢复提供丰富的上下文：

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

    // 维护适当的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ClaudeCodeError);
    }

    // 在遥测中跟踪错误
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
    // 为遥测发射错误事件
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
    // 生成用户友好的错误消息
    return {
      error: this.message,
      suggestion: this.getSuggestion(),
      documentation: this.getDocumentationLink()
    };
  }

  getSuggestion() {
    // 在子类中重写以获得特定建议
    return 'Please try again or contact support if the issue persists.';
  }

  getDocumentationLink() {
    return `https://docs.claude.ai/errors/${this.code.toLowerCase()}`;
  }
}
```

### 专门的错误类

系统为不同的故障场景实现专门的错误类：

```javascript
class APIError extends ClaudeCodeError {
  constructor(message, statusCode, response = {}) {
    super(message, 'API_ERROR', { statusCode, response });
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.response = response;

    // 根据状态码确定是否可重试
    this.retryable = this.isRetryableStatus(statusCode);
    this.severity = this.determineSeverity(statusCode);
  }

  isRetryableStatus(status) {
    const retryableStatuses = [
      408, // 请求超时
      429, // 请求过多
      500, // 内部服务器错误
      502, // 错误网关
      503, // 服务不可用
      504  // 网关超时
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

    // 计算等待时间
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

    // 分类网络错误
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

## 重试策略实现

### 自适应重试管理器

重试管理器使用指数退避实现复杂的重试策略：

```javascript
class RetryManager {
  constructor(options = {}) {
    this.strategies = new Map();
    this.defaultStrategy = new ExponentialBackoffStrategy(options);
    this.metrics = new RetryMetrics();

    // 注册默认策略
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
        // 记录尝试
        this.metrics.recordAttempt(attempt);

        // 执行函数
        const result = await fn(attempt);

        // 记录成功
        this.metrics.recordSuccess(attempt);

        return result;

      } catch (error) {
        lastError = error;
        this.metrics.recordFailure(attempt, error);

        // 检查错误是否可重试
        if (!this.isRetryable(error)) {
          throw error;
        }

        // 检查是否超过最大重试次数
        if (attempt >= config.maxRetries) {
          throw new MaxRetriesExceededError(
            `Failed after ${attempt} retries`,
            lastError
          );
        }

        // 计算延迟
        const delay = strategy.calculateDelay(attempt, config);

        // 发射重试事件
        this.emit('retry', {
          attempt: attempt + 1,
          delay,
          error,
          maxRetries: config.maxRetries
        });

        // 重试前等待
        await this.delay(delay);

        attempt++;
      }
    }

    throw lastError;
  }

  isRetryable(error) {
    // 检查错误的可重试标志
    if (error.retryable !== undefined) {
      return error.retryable;
    }

    // 检查特定错误类型
    if (error instanceof NetworkError) return true;
    if (error instanceof RateLimitError) return true;

    if (error instanceof APIError) {
      return error.retryable;
    }

    // 默认为不可重试
    return false;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class ExponentialBackoffStrategy {
  calculateDelay(attempt, config) {
    // 基础指数退避
    let delay = config.initialDelay * Math.pow(config.factor, attempt);

    // 应用最大延迟上限
    delay = Math.min(delay, config.maxDelay);

    // 如果启用则添加抖动
    if (config.jitter) {
      delay = this.addJitter(delay);
    }

    return Math.floor(delay);
  }

  addJitter(delay) {
    // 添加随机抖动（延迟的0-25%）
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
    // 生成斐波那契序列直到尝试次数
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

    // 去相关抖动
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    this.lastDelay = delay;

    return Math.floor(delay);
  }
}
```

## 断路器模式

### 断路器实现

断路器防止级联故障：

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
    // 检查断路器状态
    if (!this.canExecute()) {
      throw new CircuitOpenError(
        'Circuit breaker is open',
        this.getTimeUntilNextAttempt()
      );
    }

    try {
      // 执行函数
      const result = await fn();

      // 记录成功
      this.onSuccess();

      return result;

    } catch (error) {
      // 记录失败
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
        // 不应该发生
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
        // 已经打开
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

    // 计算错误类型
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

## 错误恢复机制

### 错误恢复处理器

具有后备策略的复杂错误恢复：

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
    // 网络错误恢复
    this.registerStrategy('NetworkError', async (error, context) => {
      // 尝试替代端点
      if (context.alternativeEndpoints) {
        for (const endpoint of context.alternativeEndpoints) {
          try {
            return await context.retry({ baseURL: endpoint });
          } catch (e) {
            continue;
          }
        }
      }

      // 尝试减少负载
      if (context.canReducePayload) {
        return await context.retry({
          maxTokens: Math.floor(context.maxTokens * 0.5)
        });
      }

      throw error;
    });

    // 速率限制恢复
    this.registerStrategy('RateLimitError', async (error, context) => {
      const waitTime = error.calculateWaitTime();

      if (waitTime > 0 && waitTime < 300000) { // 最多5分钟
        await this.delay(waitTime);
        return await context.retry();
      }

      // 如果可用尝试不同的API密钥
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

    // API错误恢复
    this.registerStrategy('APIError', async (error, context) => {
      // 过载错误的模型后备
      if (error.statusCode === 529 && context.fallbackModel) {
        return await context.retry({
          model: context.fallbackModel
        });
      }

      // 对5xx错误使用指数退避重试
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

    // 检查恢复尝试
    const attempts = this.recoveryAttempts.get(recoveryKey) || 0;
    if (attempts >= this.maxRecoveryAttempts) {
      throw new MaxRecoveryAttemptsExceededError(
        `Max recovery attempts exceeded for ${errorType}`,
        error
      );
    }

    this.recoveryAttempts.set(recoveryKey, attempts + 1);

    try {
      // 尝试特定恢复策略
      const strategy = this.strategies.get(errorType);
      if (strategy) {
        return await strategy(error, context);
      }

      // 尝试后备策略
      for (const fallback of this.fallbacks) {
        try {
          return await fallback(error, context);
        } catch (e) {
          continue;
        }
      }

      // 无法恢复
      throw error;

    } finally {
      // 成功后清理恢复尝试
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

## 错误聚合和报告

### 错误聚合器

收集和分析错误模式：

```javascript
class ErrorAggregator {
  constructor(options = {}) {
    this.errors = [];
    this.maxErrors = options.maxErrors || 1000;
    this.aggregationWindow = options.aggregationWindow || 300000; // 5分钟
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

    // 维护最大大小
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // 分析模式
    this.analyzePatterns(errorRecord);

    // 检查警报条件
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

    // 高错误率
    if (recentErrors.length > 10) {
      this.alerts.trigger('high_error_rate', {
        count: recentErrors.length,
        window: this.aggregationWindow
      });
    }

    // 重复错误
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

    // 关键错误
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
      // 按类型计数
      const typeCount = errorsByType.get(error.type) || 0;
      errorsByType.set(error.type, typeCount + 1);

      // 按代码计数
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
    // 按时间桶分组错误
    const bucketSize = 60000; // 1分钟
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

    // 高速率限制错误
    if (stats.errorsByType['RateLimitError'] > 5) {
      recommendations.push({
        type: 'rate_limiting',
        severity: 'high',
        message: 'Consider implementing request throttling or upgrading API limits'
      });
    }

    // 网络问题
    if (stats.errorsByType['NetworkError'] > 10) {
      recommendations.push({
        type: 'network',
        severity: 'medium',
        message: 'Network connectivity issues detected. Check connection stability'
      });
    }

    // API错误
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

## 结论

Claude Code中的错误处理和重试逻辑代表了一个全面的容错系统，确保尽管分布式系统固有的不确定性，仍能实现可靠的操作。通过复杂的错误分类、自适应重试策略、断路器和全面的恢复机制，系统在保持最佳性能的同时达到了卓越的弹性。

关键架构成就包括：

1. **丰富的错误层次结构**：带上下文保存的详细错误分类
2. **自适应重试策略**：具有抖动的多种退避算法
3. **断路器模式**：通过状态管理防止级联故障
4. **智能恢复**：针对不同错误类型的上下文感知恢复策略
5. **全面监控**：错误聚合、模式检测和警报

该实现展示了错误处理的最佳实践，包括在适当时快速失败原则、可能时优雅降级，以及全面的遥测监控系统健康状态。多层方法——从低级网络错误到高级API故障——确保Claude Code能够处理任何故障场景，同时向用户提供有意义的反馈。

这结束了API客户端系统文档，揭示了一个强大、生产就绪的实现，平衡了可靠性与性能、用户体验与系统保护、简单性与复杂性。