/**
 * Conversation Loop
 * Main conversation processing and message handling
 */

import { EventEmitter } from 'events';
import { performToolUse } from './tool-execution.js';
import { calculateTokenUsage } from './token-management.js';
import { applyMicrocompaction } from './microcompaction.js';

const MAX_CONVERSATION_TOKENS = 200000;
const AUTO_COMPACT_THRESHOLD = 150000;

class ConversationLoop extends EventEmitter {
  constructor(options = {}) {
    super();
    this.messages = [];
    this.context = {
      toolPermissionContext: {
        mode: 'ask',
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        additionalWorkingDirectories: new Map()
      },
      inProgressToolUseIDs: new Set(),
      erroredToolUseIDs: new Set(),
      resolvedToolUseIDs: new Set()
    };
    this.options = {
      maxThinkingTokens: 100000,
      mainLoopModel: 'claude-3-5-sonnet-20241022',
      ...options
    };
    this.abortController = new AbortController();
    this.tokenUsage = {
      input: 0,
      output: 0,
      cacheCreation: 0,
      total: 0
    };
  }

  /**
   * Process user input
   */
  async processUserInput(input, precedingBlocks = []) {
    this.emit('input:start', { input });

    // Create user message
    const userMessage = this.createUserMessage(input, precedingBlocks);
    this.messages.push(userMessage);

    // Check token limits
    const tokenCount = await this.estimateTokenCount();
    if (tokenCount > AUTO_COMPACT_THRESHOLD) {
      await this.performAutoCompaction();
    }

    // Start conversation
    try {
      const response = await this.queryAssistant();
      this.emit('input:complete', { response });
      return response;
    } catch (error) {
      this.emit('input:error', { error });
      throw error;
    }
  }

  /**
   * Query the assistant
   */
  async queryAssistant() {
    const systemPrompt = await this.buildSystemPrompt();
    const stream = await this.streamCompletion(systemPrompt);

    const assistantMessage = {
      type: 'assistant',
      content: [],
      usage: null,
      thinking: null
    };

    let currentToolUse = null;
    let thinking = '';
    let inThinkingBlock = false;

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          if (event.content_block.type === 'thinking') {
            inThinkingBlock = true;
          } else if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: ''
            };
          }
          break;

        case 'content_block_delta':
          if (inThinkingBlock) {
            thinking += event.delta.text || '';
          } else if (currentToolUse && event.delta.partial_json) {
            currentToolUse.input += event.delta.partial_json;
          } else if (event.delta.text) {
            if (!assistantMessage.content.length ||
                assistantMessage.content[assistantMessage.content.length - 1].type !== 'text') {
              assistantMessage.content.push({ type: 'text', text: '' });
            }
            assistantMessage.content[assistantMessage.content.length - 1].text += event.delta.text;
            this.emit('stream:delta', { text: event.delta.text });
          }
          break;

        case 'content_block_stop':
          if (inThinkingBlock) {
            assistantMessage.thinking = thinking;
            inThinkingBlock = false;
          } else if (currentToolUse) {
            try {
              currentToolUse.input = JSON.parse(currentToolUse.input);
            } catch {}

            assistantMessage.content.push({
              type: 'tool_use',
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: currentToolUse.input
            });

            // Execute tool
            await this.executeToolUse(currentToolUse);
            currentToolUse = null;
          }
          break;

        case 'message_delta':
          if (event.delta.usage) {
            assistantMessage.usage = event.delta.usage;
            this.updateTokenUsage(event.delta.usage);
          }
          break;

        case 'message_stop':
          this.messages.push(assistantMessage);
          this.emit('message:complete', { message: assistantMessage });
          break;

        case 'error':
          throw new Error(event.error.message);
      }
    }

    return assistantMessage;
  }

  /**
   * Execute tool use
   */
  async executeToolUse(toolUse) {
    this.context.inProgressToolUseIDs.add(toolUse.id);
    this.emit('tool:start', { toolUse });

    try {
      const result = await performToolUse(toolUse, this.context);

      const toolResultMessage = {
        type: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.is_error || false
        }]
      };

      this.messages.push(toolResultMessage);
      this.context.resolvedToolUseIDs.add(toolUse.id);
      this.emit('tool:complete', { toolUse, result });

      // Continue conversation if needed
      if (!result.is_error) {
        await this.queryAssistant();
      }
    } catch (error) {
      this.context.erroredToolUseIDs.add(toolUse.id);
      this.emit('tool:error', { toolUse, error });

      const errorMessage = {
        type: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: ${error.message}`,
          is_error: true
        }]
      };

      this.messages.push(errorMessage);
    } finally {
      this.context.inProgressToolUseIDs.delete(toolUse.id);
    }
  }

  /**
   * Stream completion from API
   */
  async streamCompletion(systemPrompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.options.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31,computer-use-2024-10-22,token-counting-2024-11-01'
      },
      body: JSON.stringify({
        model: this.options.mainLoopModel,
        max_tokens: 8192,
        system: systemPrompt,
        messages: this.messages,
        stream: true,
        tools: this.options.tools || [],
        metadata: {
          user_id: this.options.userId
        }
      }),
      signal: this.abortController.signal
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return this.parseSSEStream(response.body);
  }

  /**
   * Parse SSE stream
   */
  async *parseSSEStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const event = JSON.parse(data);
            yield event;
          } catch (error) {
            console.error('Failed to parse SSE event:', error);
          }
        }
      }
    }
  }

  /**
   * Build system prompt
   */
  async buildSystemPrompt() {
    return `You are Claude, an AI assistant created by Anthropic.
You are viewing a terminal session.

Current working directory: ${process.cwd()}
Platform: ${process.platform}
Node version: ${process.version}

You have access to various tools to help the user with their tasks.
Be concise and helpful. Focus on completing the user's request efficiently.`;
  }

  /**
   * Create user message
   */
  createUserMessage(content, precedingBlocks = []) {
    const blocks = [];

    for (const block of precedingBlocks) {
      if (block.type === 'image') {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.media_type,
            data: block.data
          }
        });
      } else if (block.type === 'document') {
        blocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: block.media_type,
            data: block.data
          }
        });
      }
    }

    blocks.push({
      type: 'text',
      text: content
    });

    return {
      type: 'user',
      content: blocks
    };
  }

  /**
   * Estimate token count
   */
  async estimateTokenCount() {
    // Simplified estimation - actual implementation would use tokenizer
    let totalChars = 0;

    for (const message of this.messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.text) totalChars += block.text.length;
          if (block.content) totalChars += block.content.length;
        }
      }
    }

    // Rough estimation: 4 chars per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Perform auto-compaction
   */
  async performAutoCompaction() {
    this.emit('compaction:start');

    const compactionResult = await applyMicrocompaction(this.messages);

    if (compactionResult) {
      this.messages = compactionResult.messages;
      this.emit('compaction:complete', {
        originalCount: compactionResult.originalCount,
        newCount: compactionResult.messages.length
      });
    }
  }

  /**
   * Update token usage
   */
  updateTokenUsage(usage) {
    if (!usage) return;

    this.tokenUsage.input += usage.input_tokens || 0;
    this.tokenUsage.output += usage.output_tokens || 0;
    this.tokenUsage.cacheCreation += usage.cache_creation_input_tokens || 0;
    this.tokenUsage.total = this.tokenUsage.input + this.tokenUsage.output;

    this.emit('tokens:update', this.tokenUsage);
  }

  /**
   * Clear conversation
   */
  clear() {
    this.messages = [];
    this.context.inProgressToolUseIDs.clear();
    this.context.erroredToolUseIDs.clear();
    this.context.resolvedToolUseIDs.clear();
    this.tokenUsage = {
      input: 0,
      output: 0,
      cacheCreation: 0,
      total: 0
    };
    this.emit('conversation:clear');
  }

  /**
   * Abort current operation
   */
  abort() {
    this.abortController.abort();
    this.abortController = new AbortController();
    this.emit('conversation:abort');
  }
}

export {
  ConversationLoop,
  MAX_CONVERSATION_TOKENS,
  AUTO_COMPACT_THRESHOLD
};