/**
 * Microcompaction Module
 * Automatically compress long conversations to stay within token limits
 */

import { TokenManager } from './token-management.js';

const COMPACTION_THRESHOLD = 150000;
const TARGET_SIZE_RATIO = 0.5;
const MIN_MESSAGES_TO_COMPACT = 10;

class MicrocompactionManager {
  constructor(options = {}) {
    this.threshold = options.threshold || COMPACTION_THRESHOLD;
    this.targetRatio = options.targetRatio || TARGET_SIZE_RATIO;
    this.preserveToolCalls = options.preserveToolCalls !== false;
    this.tokenManager = new TokenManager(options.model);
  }

  /**
   * Apply microcompaction to messages
   */
  async applyMicrocompaction(messages) {
    // Check if compaction is needed
    const tokenCount = this.tokenManager.estimateMessagesTokenCount(messages);
    if (tokenCount < this.threshold) {
      return null;
    }

    // Don't compact if too few messages
    if (messages.length < MIN_MESSAGES_TO_COMPACT) {
      return null;
    }

    // Find compaction boundary
    const boundary = this.findCompactionBoundary(messages);
    if (!boundary) {
      return null;
    }

    // Create summary of compacted messages
    const summary = await this.createSummary(
      messages.slice(0, boundary.index),
      boundary
    );

    // Build new message list
    const compactedMessages = [
      this.createBoundaryMarker(boundary),
      ...summary.messages,
      ...messages.slice(boundary.index)
    ];

    // Calculate token savings
    const newTokenCount = this.tokenManager.estimateMessagesTokenCount(compactedMessages);
    const savings = tokenCount - newTokenCount;

    return {
      messages: compactedMessages,
      originalCount: messages.length,
      compactedCount: compactedMessages.length,
      boundary: boundary,
      tokenSavings: savings,
      preCompactTokenCount: tokenCount,
      postCompactTokenCount: newTokenCount
    };
  }

  /**
   * Find optimal boundary for compaction
   */
  findCompactionBoundary(messages) {
    const targetIndex = Math.floor(messages.length * this.targetRatio);
    let bestBoundary = null;
    let bestScore = -1;

    // Search for best boundary point
    for (let i = Math.max(MIN_MESSAGES_TO_COMPACT, targetIndex - 5);
         i <= Math.min(messages.length - 5, targetIndex + 5);
         i++) {

      const score = this.scoreBoundary(messages, i);
      if (score > bestScore) {
        bestScore = score;
        bestBoundary = {
          index: i,
          score: score,
          timestamp: Date.now()
        };
      }
    }

    return bestBoundary;
  }

  /**
   * Score a potential boundary point
   */
  scoreBoundary(messages, index) {
    let score = 100;

    // Prefer boundaries after tool results
    if (messages[index - 1]?.type === 'user' &&
        messages[index - 1]?.content?.[0]?.type === 'tool_result') {
      score += 50;
    }

    // Prefer boundaries after assistant messages
    if (messages[index - 1]?.type === 'assistant') {
      score += 30;
    }

    // Avoid boundaries in the middle of tool use sequences
    if (this.isInToolSequence(messages, index)) {
      score -= 100;
    }

    // Prefer natural conversation breaks
    if (this.isConversationBreak(messages, index)) {
      score += 20;
    }

    return score;
  }

  /**
   * Check if index is in middle of tool sequence
   */
  isInToolSequence(messages, index) {
    if (index === 0 || index >= messages.length) return false;

    const prev = messages[index - 1];
    const next = messages[index];

    // Check for tool use -> tool result pattern
    if (prev?.type === 'assistant' && prev?.content?.some(c => c.type === 'tool_use')) {
      if (next?.type === 'user' && next?.content?.some(c => c.type === 'tool_result')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if this is a natural conversation break
   */
  isConversationBreak(messages, index) {
    if (index === 0 || index >= messages.length) return false;

    const prev = messages[index - 1];
    const next = messages[index];

    // User -> User indicates a new question
    if (prev?.type === 'user' && next?.type === 'user') {
      return true;
    }

    // Long gap between messages (if timestamps available)
    if (prev?.timestamp && next?.timestamp) {
      const gap = next.timestamp - prev.timestamp;
      if (gap > 300000) { // 5 minutes
        return true;
      }
    }

    return false;
  }

  /**
   * Create summary of messages to be compacted
   */
  async createSummary(messages, boundary) {
    const summaryMessages = [];

    // Group messages by type
    const groups = this.groupMessages(messages);

    // Create system message with summary
    summaryMessages.push({
      type: 'system',
      content: this.createSystemSummary(groups, boundary)
    });

    // Preserve important tool calls if needed
    if (this.preserveToolCalls) {
      const toolSummary = this.createToolSummary(groups.toolCalls);
      if (toolSummary) {
        summaryMessages.push(toolSummary);
      }
    }

    // Add conversation summary
    summaryMessages.push({
      type: 'assistant',
      content: [{
        type: 'text',
        text: this.createConversationSummary(groups)
      }]
    });

    return {
      messages: summaryMessages,
      attachments: [],
      hookResults: []
    };
  }

  /**
   * Group messages by type for summary
   */
  groupMessages(messages) {
    const groups = {
      userInputs: [],
      assistantResponses: [],
      toolCalls: [],
      errors: []
    };

    for (const message of messages) {
      if (message.type === 'user') {
        // Extract user text inputs
        for (const content of message.content || []) {
          if (content.type === 'text') {
            groups.userInputs.push(content.text);
          } else if (content.type === 'tool_result' && content.is_error) {
            groups.errors.push(content.content);
          }
        }
      } else if (message.type === 'assistant') {
        // Extract assistant responses and tool calls
        for (const content of message.content || []) {
          if (content.type === 'text') {
            groups.assistantResponses.push(content.text);
          } else if (content.type === 'tool_use') {
            groups.toolCalls.push({
              name: content.name,
              input: content.input
            });
          }
        }
      }
    }

    return groups;
  }

  /**
   * Create system summary message
   */
  createSystemSummary(groups, boundary) {
    const lines = [
      '# Previous Conversation Summary',
      `Compacted ${boundary.index} messages at ${new Date(boundary.timestamp).toISOString()}`,
      '',
      `User inputs: ${groups.userInputs.length}`,
      `Assistant responses: ${groups.assistantResponses.length}`,
      `Tool calls: ${groups.toolCalls.length}`,
      `Errors: ${groups.errors.length}`
    ];

    return lines.join('\n');
  }

  /**
   * Create tool usage summary
   */
  createToolSummary(toolCalls) {
    if (toolCalls.length === 0) return null;

    // Count tool usage
    const toolCounts = {};
    for (const call of toolCalls) {
      toolCounts[call.name] = (toolCounts[call.name] || 0) + 1;
    }

    // Create summary
    const summary = [
      '## Tools Used',
      ...Object.entries(toolCounts).map(([name, count]) =>
        `- ${name}: ${count} time${count !== 1 ? 's' : ''}`
      )
    ];

    return {
      type: 'system',
      content: summary.join('\n')
    };
  }

  /**
   * Create conversation summary
   */
  createConversationSummary(groups) {
    const summary = [];

    summary.push('## Summary of Previous Conversation\n');

    // Summarize user requests
    if (groups.userInputs.length > 0) {
      summary.push('### User Requests');
      const uniqueRequests = [...new Set(groups.userInputs)].slice(0, 5);
      for (const request of uniqueRequests) {
        if (request.length > 200) {
          summary.push(`- ${request.substring(0, 200)}...`);
        } else {
          summary.push(`- ${request}`);
        }
      }
      if (groups.userInputs.length > 5) {
        summary.push(`- ... and ${groups.userInputs.length - 5} more requests`);
      }
      summary.push('');
    }

    // Summarize actions taken
    if (groups.toolCalls.length > 0) {
      summary.push('### Actions Taken');
      const toolTypes = {};
      for (const call of groups.toolCalls) {
        const type = this.categorizeToolCall(call);
        toolTypes[type] = (toolTypes[type] || 0) + 1;
      }
      for (const [type, count] of Object.entries(toolTypes)) {
        summary.push(`- ${type}: ${count} operation${count !== 1 ? 's' : ''}`);
      }
      summary.push('');
    }

    // Note any errors
    if (groups.errors.length > 0) {
      summary.push('### Issues Encountered');
      summary.push(`- ${groups.errors.length} error${groups.errors.length !== 1 ? 's' : ''} occurred and were handled`);
      summary.push('');
    }

    return summary.join('\n');
  }

  /**
   * Categorize tool call for summary
   */
  categorizeToolCall(toolCall) {
    const name = toolCall.name.toLowerCase();

    if (name.includes('bash') || name.includes('shell')) {
      return 'Command execution';
    }
    if (name.includes('write') || name.includes('create')) {
      return 'File creation';
    }
    if (name.includes('edit') || name.includes('modify')) {
      return 'File modification';
    }
    if (name.includes('read') || name.includes('view')) {
      return 'File reading';
    }
    if (name.includes('search') || name.includes('grep')) {
      return 'Searching';
    }
    if (name.includes('web') || name.includes('fetch')) {
      return 'Web access';
    }

    return 'Other operations';
  }

  /**
   * Create boundary marker message
   */
  createBoundaryMarker(boundary) {
    return {
      type: 'system',
      content: '--- Conversation Compacted ---',
      metadata: {
        compactionBoundary: true,
        timestamp: boundary.timestamp,
        index: boundary.index
      }
    };
  }

  /**
   * Check if messages need compaction
   */
  needsCompaction(messages) {
    const tokenCount = this.tokenManager.estimateMessagesTokenCount(messages);
    return tokenCount >= this.threshold && messages.length >= MIN_MESSAGES_TO_COMPACT;
  }

  /**
   * Get compaction stats
   */
  getCompactionStats(messages) {
    const tokenCount = this.tokenManager.estimateMessagesTokenCount(messages);
    const needsCompaction = this.needsCompaction(messages);
    const percentageFull = ((tokenCount / this.threshold) * 100).toFixed(1);

    return {
      tokenCount,
      threshold: this.threshold,
      percentageFull: `${percentageFull}%`,
      needsCompaction,
      messageCount: messages.length,
      estimatedSavings: needsCompaction
        ? Math.floor(tokenCount * (1 - this.targetRatio))
        : 0
    };
  }
}

/**
 * Create microcompaction manager
 */
export function createMicrocompactionManager(options) {
  return new MicrocompactionManager(options);
}

/**
 * Apply microcompaction to messages
 */
export async function applyMicrocompaction(messages, options = {}) {
  const manager = new MicrocompactionManager(options);
  return await manager.applyMicrocompaction(messages);
}

/**
 * Check if messages need compaction
 */
export function needsCompaction(messages, threshold = COMPACTION_THRESHOLD) {
  const manager = new MicrocompactionManager({ threshold });
  return manager.needsCompaction(messages);
}

export {
  MicrocompactionManager,
  COMPACTION_THRESHOLD,
  TARGET_SIZE_RATIO,
  MIN_MESSAGES_TO_COMPACT
};