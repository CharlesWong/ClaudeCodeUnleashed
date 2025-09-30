/**
 * Token Management Module
 * Handle token counting, limits, and usage tracking
 */

// Token limits per model
const TOKEN_LIMITS = {
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-haiku-20240307': 200000,
  'claude-2.1': 200000,
  'claude-2.0': 100000,
  'claude-instant-1.2': 100000
};

// Pricing per million tokens (in USD)
const TOKEN_PRICING = {
  'claude-3-opus-20240229': {
    input: 15.00,
    output: 75.00,
    cacheWrite: 3.75,
    cacheRead: 1.88
  },
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00,
    cacheWrite: 3.75,
    cacheRead: 0.30
  },
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
    cacheWrite: 0.30,
    cacheRead: 0.03
  }
};

class TokenManager {
  constructor(model = 'claude-3-5-sonnet-20241022') {
    this.model = model;
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0
    };
    this.sessionUsage = [];
    this.maxTokens = TOKEN_LIMITS[model] || 200000;
  }

  /**
   * Update token usage from API response
   */
  updateUsage(usage) {
    if (!usage) return;

    this.usage.inputTokens += usage.input_tokens || 0;
    this.usage.outputTokens += usage.output_tokens || 0;
    this.usage.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
    this.usage.cacheReadTokens += usage.cache_read_input_tokens || 0;

    this.usage.totalTokens =
      this.usage.inputTokens +
      this.usage.outputTokens;

    // Track session usage
    this.sessionUsage.push({
      timestamp: Date.now(),
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cacheCreation: usage.cache_creation_input_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0
    });

    return this.usage;
  }

  /**
   * Estimate token count for text
   * Rough estimation: ~4 characters per token
   */
  estimateTokenCount(text) {
    if (!text) return 0;

    // More accurate estimation based on content type
    const words = text.split(/\s+/).length;
    const chars = text.length;

    // Average: 1.3 tokens per word or 4 chars per token
    const wordBasedEstimate = Math.ceil(words * 1.3);
    const charBasedEstimate = Math.ceil(chars / 4);

    // Use the more conservative estimate
    return Math.max(wordBasedEstimate, charBasedEstimate);
  }

  /**
   * Estimate tokens for messages array
   */
  estimateMessagesTokenCount(messages) {
    let total = 0;

    for (const message of messages) {
      // Add message wrapper overhead (~4 tokens)
      total += 4;

      if (typeof message.content === 'string') {
        total += this.estimateTokenCount(message.content);
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            total += this.estimateTokenCount(block.text);
          } else if (block.type === 'tool_use') {
            // Tool use overhead
            total += 50;
            total += this.estimateTokenCount(JSON.stringify(block.input));
          } else if (block.type === 'tool_result') {
            total += this.estimateTokenCount(block.content);
          } else if (block.type === 'image') {
            // Images have high token cost
            total += 1500;
          }
        }
      }
    }

    return total;
  }

  /**
   * Check if approaching token limit
   */
  isApproachingLimit(messages, threshold = 0.75) {
    const estimated = this.estimateMessagesTokenCount(messages);
    return estimated > (this.maxTokens * threshold);
  }

  /**
   * Calculate cost for current usage
   */
  calculateCost() {
    const pricing = TOKEN_PRICING[this.model];
    if (!pricing) return null;

    const cost = {
      input: (this.usage.inputTokens / 1000000) * pricing.input,
      output: (this.usage.outputTokens / 1000000) * pricing.output,
      cacheWrite: (this.usage.cacheCreationTokens / 1000000) * pricing.cacheWrite,
      cacheRead: (this.usage.cacheReadTokens / 1000000) * pricing.cacheRead
    };

    cost.total = cost.input + cost.output + cost.cacheWrite + cost.cacheRead;

    return cost;
  }

  /**
   * Get formatted usage summary
   */
  getUsageSummary() {
    const cost = this.calculateCost();
    const percentage = ((this.usage.totalTokens / this.maxTokens) * 100).toFixed(1);

    return {
      tokens: {
        used: this.usage.totalTokens,
        limit: this.maxTokens,
        percentage: `${percentage}%`,
        remaining: this.maxTokens - this.usage.totalTokens
      },
      breakdown: {
        input: this.usage.inputTokens,
        output: this.usage.outputTokens,
        cache: this.usage.cacheCreationTokens + this.usage.cacheReadTokens
      },
      cost: cost ? {
        total: `$${cost.total.toFixed(4)}`,
        input: `$${cost.input.toFixed(4)}`,
        output: `$${cost.output.toFixed(4)}`,
        cache: `$${(cost.cacheWrite + cost.cacheRead).toFixed(4)}`
      } : null
    };
  }

  /**
   * Reset usage counters
   */
  reset() {
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0
    };
    this.sessionUsage = [];
  }

  /**
   * Get token limit for model
   */
  static getModelLimit(model) {
    return TOKEN_LIMITS[model] || 200000;
  }

  /**
   * Check if model supports caching
   */
  static supportsCaching(model) {
    return model.includes('claude-3') || model.includes('claude-3-5');
  }

  /**
   * Format token count for display
   */
  static formatTokenCount(count) {
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
    return `${(count / 1000000).toFixed(2)}M`;
  }
}

/**
 * Calculate token usage for a response
 */
export function calculateTokenUsage(messages, response) {
  const manager = new TokenManager();

  // Estimate input tokens
  const inputTokens = manager.estimateMessagesTokenCount(messages);

  // Use actual usage if available
  if (response.usage) {
    return {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
      cacheCreation: response.usage.cache_creation_input_tokens || 0,
      cacheRead: response.usage.cache_read_input_tokens || 0
    };
  }

  // Otherwise estimate
  const outputTokens = manager.estimateTokenCount(
    JSON.stringify(response.content || response)
  );

  return {
    input: inputTokens,
    output: outputTokens,
    total: inputTokens + outputTokens,
    cacheCreation: 0,
    cacheRead: 0
  };
}

/**
 * Check if token limit exceeded
 */
export function isTokenLimitExceeded(messages, model = 'claude-3-5-sonnet-20241022') {
  const manager = new TokenManager(model);
  const estimated = manager.estimateMessagesTokenCount(messages);
  return estimated >= manager.maxTokens;
}

/**
 * Get recommended model based on token count
 */
export function getRecommendedModel(tokenCount) {
  if (tokenCount < 50000) return 'claude-3-haiku-20240307';
  if (tokenCount < 150000) return 'claude-3-5-sonnet-20241022';
  return 'claude-3-opus-20240229';
}

export {
  TokenManager,
  TOKEN_LIMITS,
  TOKEN_PRICING
};