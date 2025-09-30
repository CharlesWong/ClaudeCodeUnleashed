/**
 * Stream Processing Utilities for Claude Code
 * Handles SSE streams, message parsing, and data transformation
 * Extracted from lines 11860-12050 and related sections
 */

import { EventEmitter } from 'events';
import { Transform, Readable } from 'stream';

/**
 * SSE (Server-Sent Events) decoder
 * Original: DPA class pattern from lines 12030-12050
 */
export class SSEDecoder {
  constructor() {
    this.event = null;
    this.data = [];
    this.chunks = [];
    this.id = null;
    this.retry = null;
  }

  /**
   * Decode SSE line
   */
  decode(line) {
    if (!line) {
      // Empty line signals end of event
      if (!this.event && !this.data.length) return null;

      const event = {
        event: this.event,
        data: this.data.join('\n'),
        id: this.id,
        retry: this.retry,
        raw: this.chunks
      };

      // Reset for next event
      this.event = null;
      this.data = [];
      this.chunks = [];
      this.id = null;
      this.retry = null;

      return event;
    }

    this.chunks.push(line);

    // Comment line
    if (line.startsWith(':')) return null;

    // Parse field and value
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      // Line is field name only
      return null;
    }

    const field = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    switch (field) {
      case 'event':
        this.event = value;
        break;
      case 'data':
        this.data.push(value);
        break;
      case 'id':
        this.id = value;
        break;
      case 'retry':
        const retryTime = parseInt(value, 10);
        if (!isNaN(retryTime)) {
          this.retry = retryTime;
        }
        break;
    }

    return null;
  }

  /**
   * Reset decoder state
   */
  reset() {
    this.event = null;
    this.data = [];
    this.chunks = [];
    this.id = null;
    this.retry = null;
  }
}

/**
 * Stream iterator for SSE responses
 * Original: lj9 and pj9 functions pattern
 */
export async function* iterateSSEStream(response, controller) {
  if (!response.body) {
    throw new Error('Response has no body');
  }

  const decoder = new SSEDecoder();
  const textDecoder = new TextDecoder();
  const reader = response.body.getReader();

  let buffer = new Uint8Array();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      // Append to buffer
      if (value) {
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;
      }

      // Process lines
      let lineEnd;
      while ((lineEnd = findLineEnd(buffer)) !== -1) {
        const line = textDecoder.decode(buffer.slice(0, lineEnd));
        buffer = buffer.slice(lineEnd + 1);

        const event = decoder.decode(line);
        if (event) {
          yield event;
        }
      }
    }

    // Process remaining buffer
    if (buffer.length > 0) {
      const line = textDecoder.decode(buffer);
      const event = decoder.decode(line);
      if (event) {
        yield event;
      }
    }

    // Flush any pending event
    const finalEvent = decoder.decode(null);
    if (finalEvent) {
      yield finalEvent;
    }

  } finally {
    reader.releaseLock();
    if (controller) {
      controller.abort();
    }
  }
}

/**
 * Find line ending in buffer
 */
function findLineEnd(buffer) {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 10) { // \n
      return i;
    }
  }
  return -1;
}

/**
 * Message stream handler
 * Processes Claude API message streams
 */
export class MessageStreamHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.controller = options.controller;
    this.onProgress = options.onProgress;
    this.contentBlocks = [];
    this.currentBlock = null;
    this.usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    };
  }

  /**
   * Process stream event
   */
  processEvent(event) {
    try {
      const data = typeof event.data === 'string'
        ? JSON.parse(event.data)
        : event.data;

      switch (event.event || data.type) {
        case 'message_start':
          this.handleMessageStart(data);
          break;

        case 'content_block_start':
          this.handleContentBlockStart(data);
          break;

        case 'content_block_delta':
          this.handleContentBlockDelta(data);
          break;

        case 'content_block_stop':
          this.handleContentBlockStop(data);
          break;

        case 'message_delta':
          this.handleMessageDelta(data);
          break;

        case 'message_stop':
          this.handleMessageStop(data);
          break;

        case 'error':
          this.handleError(data);
          break;

        case 'ping':
          // Heartbeat, ignore
          break;

        default:
          this.emit('unknown_event', event);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle message start event
   */
  handleMessageStart(data) {
    if (data.message) {
      this.usage = data.message.usage || this.usage;
      this.emit('message_start', data.message);
    }
  }

  /**
   * Handle content block start
   */
  handleContentBlockStart(data) {
    const block = data.content_block || {};
    this.currentBlock = {
      index: data.index,
      type: block.type,
      content: block.type === 'text' ? '' : block
    };
    this.contentBlocks[data.index] = this.currentBlock;
    this.emit('content_block_start', this.currentBlock);
  }

  /**
   * Handle content block delta
   */
  handleContentBlockDelta(data) {
    const delta = data.delta;
    if (!this.currentBlock || !delta) return;

    switch (delta.type) {
      case 'text_delta':
        this.currentBlock.content += delta.text || '';
        this.emit('text_delta', delta.text);
        break;

      case 'input_json_delta':
        this.currentBlock.partial_json =
          (this.currentBlock.partial_json || '') + delta.partial_json;
        this.emit('json_delta', delta.partial_json);
        break;
    }

    if (this.onProgress) {
      this.onProgress(this.getCurrentContent());
    }
  }

  /**
   * Handle content block stop
   */
  handleContentBlockStop(data) {
    if (this.currentBlock) {
      this.emit('content_block_stop', this.currentBlock);
      this.currentBlock = null;
    }
  }

  /**
   * Handle message delta (usage updates)
   */
  handleMessageDelta(data) {
    if (data.delta?.usage) {
      Object.assign(this.usage, data.delta.usage);
      this.emit('usage_update', this.usage);
    }
  }

  /**
   * Handle message stop
   */
  handleMessageStop(data) {
    this.emit('message_stop', {
      content: this.getCurrentContent(),
      usage: this.usage
    });
  }

  /**
   * Handle error event
   */
  handleError(data) {
    const error = new Error(data.error?.message || 'Stream error');
    error.type = data.error?.type;
    error.code = data.error?.code;
    this.emit('error', error);
  }

  /**
   * Get current accumulated content
   */
  getCurrentContent() {
    return this.contentBlocks
      .filter(block => block && block.type === 'text')
      .map(block => block.content)
      .join('');
  }

  /**
   * Get all content blocks
   */
  getContentBlocks() {
    return [...this.contentBlocks];
  }
}

/**
 * Transform stream for processing Claude responses
 */
export class ClaudeResponseTransform extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.decoder = new SSEDecoder();
    this.handler = new MessageStreamHandler(options);
    this.buffer = '';

    // Forward events
    this.handler.on('text_delta', text => {
      this.push({ type: 'text', content: text });
    });

    this.handler.on('message_stop', data => {
      this.push({ type: 'complete', ...data });
    });

    this.handler.on('error', error => {
      this.emit('error', error);
    });
  }

  _transform(chunk, encoding, callback) {
    const text = chunk.toString();
    this.buffer += text;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const event = this.decoder.decode(line);
      if (event) {
        this.handler.processEvent(event);
      }
    }

    callback();
  }

  _flush(callback) {
    if (this.buffer) {
      const event = this.decoder.decode(this.buffer);
      if (event) {
        this.handler.processEvent(event);
      }
    }

    // Final decode to flush any pending event
    const finalEvent = this.decoder.decode(null);
    if (finalEvent) {
      this.handler.processEvent(finalEvent);
    }

    callback();
  }
}

/**
 * Tee a stream into multiple consumers
 * Original: tee method pattern
 */
export function teeStream(source) {
  const consumers = [];
  const buffers = [];

  const createConsumer = (bufferIndex) => {
    return new Readable({
      async read() {
        if (buffers[bufferIndex].length > 0) {
          this.push(buffers[bufferIndex].shift());
        } else {
          // Wait for data
          const { value, done } = await source.next();
          if (done) {
            this.push(null);
          } else {
            // Push to all buffers
            for (let i = 0; i < buffers.length; i++) {
              if (i === bufferIndex) {
                this.push(value);
              } else {
                buffers[i].push(value);
              }
            }
          }
        }
      }
    });
  };

  // Create two consumers by default
  buffers.push([], []);
  consumers.push(createConsumer(0), createConsumer(1));

  return consumers;
}

/**
 * Stream throttle to control data flow rate
 */
export class StreamThrottle extends Transform {
  constructor(bytesPerSecond) {
    super();
    this.bytesPerSecond = bytesPerSecond;
    this.lastTime = Date.now();
    this.bytesSent = 0;
  }

  _transform(chunk, encoding, callback) {
    const now = Date.now();
    const elapsed = now - this.lastTime;
    const expectedBytes = (elapsed / 1000) * this.bytesPerSecond;

    if (this.bytesSent >= expectedBytes) {
      // Need to wait
      const waitTime = ((this.bytesSent - expectedBytes) / this.bytesPerSecond) * 1000;
      setTimeout(() => {
        this.push(chunk);
        this.bytesSent += chunk.length;
        callback();
      }, waitTime);
    } else {
      // Can send immediately
      this.push(chunk);
      this.bytesSent += chunk.length;
      callback();
    }

    // Reset counter periodically
    if (elapsed > 1000) {
      this.lastTime = now;
      this.bytesSent = 0;
    }
  }
}

/**
 * Utility to create a readable stream from an async generator
 */
export function streamFromAsyncGenerator(generator) {
  return new Readable({
    async read() {
      try {
        const { value, done } = await generator.next();
        if (done) {
          this.push(null);
        } else {
          this.push(value);
        }
      } catch (error) {
        this.destroy(error);
      }
    }
  });
}

/**
 * Parse JSON stream with partial updates
 */
export class JSONStreamParser {
  constructor() {
    this.buffer = '';
    this.depth = 0;
    this.inString = false;
    this.escape = false;
  }

  /**
   * Add chunk and extract complete JSON objects
   */
  parse(chunk) {
    this.buffer += chunk;
    const results = [];
    let start = 0;

    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];

      if (this.escape) {
        this.escape = false;
        continue;
      }

      if (char === '\\') {
        this.escape = true;
        continue;
      }

      if (char === '"' && !this.escape) {
        this.inString = !this.inString;
        continue;
      }

      if (this.inString) continue;

      if (char === '{' || char === '[') {
        if (this.depth === 0) {
          start = i;
        }
        this.depth++;
      } else if (char === '}' || char === ']') {
        this.depth--;
        if (this.depth === 0) {
          // Complete JSON object
          const json = this.buffer.slice(start, i + 1);
          try {
            const obj = JSON.parse(json);
            results.push(obj);
          } catch {
            // Invalid JSON, skip
          }
        }
      }
    }

    // Remove processed JSON from buffer
    if (results.length > 0 && this.depth === 0) {
      this.buffer = '';
    }

    return results;
  }

  /**
   * Reset parser state
   */
  reset() {
    this.buffer = '';
    this.depth = 0;
    this.inString = false;
    this.escape = false;
  }
}

export default {
  SSEDecoder,
  iterateSSEStream,
  MessageStreamHandler,
  ClaudeResponseTransform,
  teeStream,
  StreamThrottle,
  streamFromAsyncGenerator,
  JSONStreamParser
};