# Part 6.2: Stream Processing Architecture in Claude Code

## Introduction

The stream processing architecture in Claude Code represents a sophisticated implementation of real-time data handling that enables seamless interaction with Claude's streaming API responses. This comprehensive exploration examines the multi-layered streaming system, event-driven processing patterns, buffer management strategies, and the elegant abstractions that transform raw byte streams into meaningful conversation events.

Streaming is crucial for Claude Code's user experience, enabling character-by-character response rendering, real-time tool execution feedback, and progressive content generation. The architecture solves fundamental challenges: handling partial JSON parsing, managing backpressure in high-throughput scenarios, supporting both browser and Node.js environments, and maintaining message integrity across network interruptions.

## Core Streaming Architecture

### Stream Decoder Implementation

The `StreamDecoder` class serves as the foundation for parsing incoming byte streams into structured messages:

```javascript
class StreamDecoder {
  constructor(maxMessageSize = 1024 * 1024) {
    this.maxMessageSize = maxMessageSize;
    this.buffer = Buffer.alloc(0);
    this.isEndOfStream = false;
    this.partialMessage = '';
    this.messageQueue = [];
  }

  decode(chunk) {
    if (this.isEndOfStream) {
      throw new Error('Stream has already ended');
    }

    // Append to buffer
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Check for buffer overflow
    if (this.buffer.length > this.maxMessageSize) {
      throw new Error(`Buffer overflow: ${this.buffer.length} bytes exceeds maximum ${this.maxMessageSize}`);
    }

    // Try to parse messages from buffer
    const messages = [];
    let offset = 0;

    while (offset < this.buffer.length) {
      // Look for message boundary
      const boundary = this.findMessageBoundary(offset);
      if (boundary === -1) break;

      // Extract message
      const messageData = this.buffer.slice(offset, boundary);
      const message = this.parseMessage(messageData);

      if (message) {
        // Check for partial message assembly
        if (this.partialMessage) {
          message.content = this.partialMessage + message.content;
          this.partialMessage = '';
        }

        messages.push(message);
      }

      offset = boundary;
    }

    // Keep unparsed data in buffer
    this.buffer = this.buffer.slice(offset);

    // Process message queue for ordering
    return this.processMessageQueue(messages);
  }

  findMessageBoundary(offset) {
    // SSE format: data lines end with double newline
    const doubleNewline = this.buffer.indexOf('\n\n', offset);

    // Alternative format: JSON lines separated by newline
    const singleNewline = this.buffer.indexOf('\n', offset);

    // Binary format: null byte separator
    const nullByte = this.buffer.indexOf(0, offset);

    // Choose the nearest boundary
    const boundaries = [doubleNewline, singleNewline, nullByte]
      .filter(b => b !== -1);

    if (boundaries.length === 0) {
      return -1;
    }

    const nearestBoundary = Math.min(...boundaries);

    // Determine boundary type and adjust offset
    if (nearestBoundary === doubleNewline) {
      return doubleNewline + 2;
    } else if (nearestBoundary === singleNewline) {
      return singleNewline + 1;
    } else {
      return nullByte + 1;
    }
  }

  parseMessage(data) {
    try {
      const text = data.toString('utf8').trim();

      // Handle Server-Sent Events format
      if (text.startsWith('data: ')) {
        const jsonStr = text.slice(6);

        // Handle special SSE signals
        if (jsonStr === '[DONE]') {
          return { type: 'stream_end', timestamp: Date.now() };
        }

        return this.parseJSON(jsonStr);
      }

      // Handle event field
      if (text.startsWith('event: ')) {
        const eventType = text.slice(7);
        return { type: 'event', eventType, timestamp: Date.now() };
      }

      // Handle raw JSON
      if (text.startsWith('{')) {
        return this.parseJSON(text);
      }

      // Handle partial content
      if (text.length > 0) {
        this.partialMessage += text;
        return null;
      }

    } catch (error) {
      // Store as raw data for error recovery
      return {
        type: 'raw',
        data: data.toString('utf8'),
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  parseJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);

      // Add metadata
      return {
        ...parsed,
        timestamp: Date.now(),
        _raw: jsonStr
      };
    } catch (error) {
      // Attempt partial JSON recovery
      return this.recoverPartialJSON(jsonStr, error);
    }
  }

  recoverPartialJSON(jsonStr, error) {
    // Common streaming JSON issues
    if (jsonStr.endsWith(',')) {
      // Remove trailing comma
      return this.parseJSON(jsonStr.slice(0, -1));
    }

    if (!jsonStr.endsWith('}')) {
      // Incomplete object, store as partial
      this.partialMessage = jsonStr;
      return null;
    }

    // Attempt to fix common malformations
    const fixed = jsonStr
      .replace(/,\s*}/, '}')  // Remove trailing commas
      .replace(/,\s*]/, ']'); // Remove trailing commas in arrays

    try {
      return JSON.parse(fixed);
    } catch {
      throw error; // Re-throw original error
    }
  }

  processMessageQueue(messages) {
    // Add new messages to queue
    this.messageQueue.push(...messages);

    // Sort by sequence number if present
    if (this.messageQueue.some(m => m.sequence !== undefined)) {
      this.messageQueue.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    }

    // Detect and handle out-of-order messages
    const processed = [];
    const expectedSequence = this.getExpectedSequence();

    for (const message of this.messageQueue) {
      if (message.sequence === undefined ||
          message.sequence === expectedSequence) {
        processed.push(message);
        this.updateExpectedSequence(message);
      }
    }

    // Keep unprocessed messages in queue
    this.messageQueue = this.messageQueue.filter(
      m => !processed.includes(m)
    );

    return processed;
  }

  getExpectedSequence() {
    // Implementation would track sequence numbers
    return this.lastSequence ? this.lastSequence + 1 : 0;
  }

  updateExpectedSequence(message) {
    if (message.sequence !== undefined) {
      this.lastSequence = message.sequence;
    }
  }
}
```

### Event Stream Codec

The `EventStreamCodec` handles encoding and decoding of event stream messages:

```javascript
class EventStreamCodec {
  constructor(utf8Encoder = new TextEncoder(), utf8Decoder = new TextDecoder()) {
    this.utf8Encoder = utf8Encoder;
    this.utf8Decoder = utf8Decoder;
    this.messageBuffer = [];
    this.headerBuffer = [];
  }

  encode(message) {
    const headers = this.encodeHeaders(message.headers || {});
    const body = this.encodeBody(message);

    // Calculate total length
    const totalLength = headers.length + body.length;

    // Create prelude
    const prelude = Buffer.alloc(8);
    prelude.writeUInt32BE(totalLength, 0);
    prelude.writeUInt32BE(headers.length, 4);

    // Combine all parts
    return {
      prelude,
      headers,
      body,
      total: Buffer.concat([prelude, headers, body])
    };
  }

  encodeHeaders(headers) {
    const entries = Object.entries(headers);
    const buffers = [];

    for (const [name, value] of entries) {
      // Encode header name
      const nameBytes = this.utf8Encoder.encode(name);
      const nameLengthBuf = Buffer.alloc(1);
      nameLengthBuf.writeUInt8(nameBytes.length, 0);

      // Encode header value based on type
      let valueBytes;
      let valueType;

      if (typeof value === 'string') {
        valueType = 7; // String type
        valueBytes = this.utf8Encoder.encode(value);
      } else if (typeof value === 'number') {
        valueType = value % 1 === 0 ? 3 : 4; // Integer or float
        valueBytes = Buffer.alloc(8);
        if (valueType === 3) {
          valueBytes.writeBigInt64BE(BigInt(value), 0);
        } else {
          valueBytes.writeDoubleB E(value, 0);
        }
      } else if (Buffer.isBuffer(value)) {
        valueType = 9; // Binary type
        valueBytes = value;
      } else {
        valueType = 7; // Default to string
        valueBytes = this.utf8Encoder.encode(JSON.stringify(value));
      }

      // Create value length buffer
      const valueLengthBuf = Buffer.alloc(2);
      valueLengthBuf.writeUInt16BE(valueBytes.length, 0);

      // Combine header parts
      buffers.push(
        nameLengthBuf,
        Buffer.from(nameBytes),
        Buffer.from([valueType]),
        valueLengthBuf,
        Buffer.from(valueBytes)
      );
    }

    return Buffer.concat(buffers);
  }

  encodeBody(message) {
    if (message.body === undefined) {
      return Buffer.alloc(0);
    }

    if (typeof message.body === 'string') {
      return Buffer.from(this.utf8Encoder.encode(message.body));
    }

    if (Buffer.isBuffer(message.body)) {
      return message.body;
    }

    // JSON encode objects
    return Buffer.from(
      this.utf8Encoder.encode(JSON.stringify(message.body))
    );
  }

  decode(buffer) {
    // Read prelude
    if (buffer.length < 8) {
      throw new Error('Buffer too small for prelude');
    }

    const totalLength = buffer.readUInt32BE(0);
    const headerLength = buffer.readUInt32BE(4);

    if (buffer.length < totalLength + 8) {
      throw new Error('Incomplete message');
    }

    // Extract headers
    const headers = this.decodeHeaders(
      buffer.slice(8, 8 + headerLength)
    );

    // Extract body
    const body = buffer.slice(8 + headerLength, 8 + totalLength);

    return {
      headers,
      body: this.decodeBody(body, headers)
    };
  }

  decodeHeaders(buffer) {
    const headers = {};
    let offset = 0;

    while (offset < buffer.length) {
      // Read name length
      const nameLength = buffer.readUInt8(offset);
      offset += 1;

      // Read name
      const name = this.utf8Decoder.decode(
        buffer.slice(offset, offset + nameLength)
      );
      offset += nameLength;

      // Read value type
      const valueType = buffer.readUInt8(offset);
      offset += 1;

      // Read value length
      const valueLength = buffer.readUInt16BE(offset);
      offset += 2;

      // Read value based on type
      let value;
      const valueBuffer = buffer.slice(offset, offset + valueLength);

      switch (valueType) {
        case 3: // Integer
          value = valueBuffer.readBigInt64BE(0);
          break;
        case 4: // Float
          value = valueBuffer.readDoubleBE(0);
          break;
        case 7: // String
          value = this.utf8Decoder.decode(valueBuffer);
          break;
        case 9: // Binary
          value = valueBuffer;
          break;
        default:
          value = valueBuffer;
      }

      headers[name] = value;
      offset += valueLength;
    }

    return headers;
  }

  decodeBody(buffer, headers) {
    const contentType = headers['content-type'] || 'application/json';

    if (contentType.includes('json')) {
      const text = this.utf8Decoder.decode(buffer);
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }

    if (contentType.includes('text')) {
      return this.utf8Decoder.decode(buffer);
    }

    return buffer;
  }
}
```

## Stream Handler Architecture

### Unified Stream Handler

The `StreamHandler` class provides a unified interface for handling both browser and Node.js streams:

```javascript
class StreamHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxBufferSize: options.maxBufferSize || 1024 * 1024,
      flushInterval: options.flushInterval || 100,
      encoding: options.encoding || 'utf8',
      ...options
    };

    this.streamDecoder = new StreamDecoder(this.options.maxBufferSize);
    this.chunks = [];
    this.buffer = '';
    this.metrics = {
      bytesReceived: 0,
      messagesReceived: 0,
      errors: 0,
      startTime: Date.now()
    };

    this.setupFlushTimer();
  }

  setupFlushTimer() {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flushBuffer();
      }
    }, this.options.flushInterval);
  }

  async handleStream(stream) {
    this.isStreaming = true;
    this.metrics.startTime = Date.now();

    try {
      // Detect stream type
      if (this.isReadableStream(stream)) {
        return await this.handleReadableStream(stream);
      } else if (this.isNodeStream(stream)) {
        return await this.handleNodeStream(stream);
      } else if (this.isAsyncIterator(stream)) {
        return await this.handleAsyncIterator(stream);
      } else {
        throw new Error(`Unsupported stream type: ${typeof stream}`);
      }
    } finally {
      this.cleanup();
    }
  }

  isReadableStream(stream) {
    return typeof stream.getReader === 'function';
  }

  isNodeStream(stream) {
    return stream && typeof stream.pipe === 'function';
  }

  isAsyncIterator(stream) {
    return stream && typeof stream[Symbol.asyncIterator] === 'function';
  }

  async handleReadableStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.handleStreamEnd();
          break;
        }

        // Decode and process chunk
        const text = decoder.decode(value, { stream: true });
        this.processChunk(text);
        this.metrics.bytesReceived += value.byteLength;
      }
    } catch (error) {
      this.handleError(error);
      throw error;
    } finally {
      reader.releaseLock();
    }

    return this.getResults();
  }

  handleNodeStream(stream) {
    return new Promise((resolve, reject) => {
      // Set encoding if text stream
      if (this.options.encoding) {
        stream.setEncoding(this.options.encoding);
      }

      stream.on('data', (chunk) => {
        this.processChunk(chunk);
        this.metrics.bytesReceived += Buffer.byteLength(chunk);
      });

      stream.on('end', () => {
        this.handleStreamEnd();
        resolve(this.getResults());
      });

      stream.on('error', (error) => {
        this.handleError(error);
        reject(error);
      });

      // Handle backpressure
      stream.on('pause', () => {
        this.emit('backpressure', { paused: true });
      });

      stream.on('resume', () => {
        this.emit('backpressure', { paused: false });
      });
    });
  }

  async handleAsyncIterator(stream) {
    try {
      for await (const chunk of stream) {
        this.processChunk(chunk);
        this.metrics.bytesReceived += Buffer.byteLength(chunk);
      }
      this.handleStreamEnd();
    } catch (error) {
      this.handleError(error);
      throw error;
    }

    return this.getResults();
  }

  processChunk(chunk) {
    try {
      // Add to buffer
      this.buffer += chunk;

      // Try to extract complete messages
      const messages = this.extractMessages();

      for (const message of messages) {
        this.processMessage(message);
      }

    } catch (error) {
      this.handleError(error);
    }
  }

  extractMessages() {
    const messages = [];
    const lines = this.buffer.split('\n');

    // Keep last line if incomplete
    this.buffer = lines[lines.length - 1];

    // Process complete lines
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;

      // Handle SSE format
      if (line.startsWith('data: ')) {
        const data = line.slice(6);

        if (data === '[DONE]') {
          messages.push({ type: 'done' });
        } else {
          try {
            const message = JSON.parse(data);
            messages.push(message);
          } catch (error) {
            this.emit('parse-error', { line, error });
          }
        }
      } else if (line.startsWith('event: ')) {
        const eventType = line.slice(7);
        messages.push({ type: 'event', event: eventType });
      }
    }

    return messages;
  }

  processMessage(message) {
    this.chunks.push(message);
    this.metrics.messagesReceived++;

    // Emit specific events based on message type
    this.emit('message', message);

    switch (message.type) {
      case 'content_block_start':
        this.handleContentBlockStart(message);
        break;

      case 'content_block_delta':
        this.handleContentBlockDelta(message);
        break;

      case 'content_block_stop':
        this.handleContentBlockStop(message);
        break;

      case 'message_start':
        this.handleMessageStart(message);
        break;

      case 'message_delta':
        this.handleMessageDelta(message);
        break;

      case 'message_stop':
        this.handleMessageStop(message);
        break;

      case 'error':
        this.handleStreamError(message);
        break;

      default:
        this.emit('unknown-message', message);
    }
  }

  handleContentBlockDelta(message) {
    const text = message.delta?.text || '';

    // Emit incremental content
    this.emit('content', text);

    // Update content accumulator
    if (!this.contentAccumulator) {
      this.contentAccumulator = '';
    }
    this.contentAccumulator += text;
  }

  handleStreamEnd() {
    this.streamEnded = true;

    // Flush any remaining buffer
    this.flushBuffer();

    // Calculate metrics
    const duration = Date.now() - this.metrics.startTime;
    const throughput = this.metrics.bytesReceived / (duration / 1000);

    this.emit('end', {
      chunks: this.chunks,
      content: this.contentAccumulator,
      metrics: {
        ...this.metrics,
        duration,
        throughput
      }
    });
  }

  handleError(error) {
    this.metrics.errors++;
    this.emit('error', error);

    // Attempt recovery based on error type
    if (this.canRecover(error)) {
      this.emit('recovery-attempt', error);
      this.attemptRecovery(error);
    }
  }

  canRecover(error) {
    const recoverableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'EPIPE'
    ];

    return recoverableErrors.includes(error.code);
  }

  attemptRecovery(error) {
    // Implementation would attempt to resume stream
    this.emit('recovery-started', error);
  }

  flushBuffer() {
    if (this.buffer.length === 0) return;

    // Attempt to parse incomplete buffer
    try {
      const message = JSON.parse(this.buffer);
      this.processMessage(message);
    } catch {
      // Store as raw content
      this.emit('raw-content', this.buffer);
    }

    this.buffer = '';
  }

  getResults() {
    return {
      messages: this.chunks,
      content: this.contentAccumulator,
      metrics: this.metrics
    };
  }

  cleanup() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.isStreaming = false;
  }
}
```

## Transform Streams

### Message Decoder Stream

Transform stream for decoding incoming messages:

```javascript
class MessageDecoderStream extends Transform {
  constructor(options = {}) {
    super({
      objectMode: true,
      highWaterMark: options.highWaterMark || 16
    });

    this.decoder = new StreamDecoder(options);
    this.stats = {
      messagesDecoded: 0,
      bytesProcessed: 0,
      errors: 0
    };
  }

  _transform(chunk, encoding, callback) {
    try {
      this.stats.bytesProcessed += chunk.length;

      const messages = this.decoder.decode(chunk);

      for (const message of messages) {
        this.stats.messagesDecoded++;

        // Add metadata
        message._metadata = {
          timestamp: Date.now(),
          size: chunk.length,
          encoding
        };

        this.push(message);
      }

      callback();
    } catch (error) {
      this.stats.errors++;
      callback(error);
    }
  }

  _flush(callback) {
    try {
      // Process any remaining buffered data
      const finalMessage = this.decoder.endOfStream();

      if (finalMessage) {
        this.stats.messagesDecoded++;
        this.push(finalMessage);
      }

      // Push statistics
      this.push({
        type: 'statistics',
        stats: this.stats
      });

      callback();
    } catch (error) {
      callback(error);
    }
  }
}
```

### Message Encoder Stream

Transform stream for encoding outgoing messages:

```javascript
class MessageEncoderStream extends Transform {
  constructor(options = {}) {
    super({
      objectMode: true,
      highWaterMark: options.highWaterMark || 16
    });

    this.encoder = new EventStreamCodec();
    this.format = options.format || 'sse'; // sse, json-lines, binary
    this.stats = {
      messagesEncoded: 0,
      bytesProduced: 0
    };
  }

  _transform(message, encoding, callback) {
    try {
      let encoded;

      switch (this.format) {
        case 'sse':
          encoded = this.encodeSSE(message);
          break;

        case 'json-lines':
          encoded = this.encodeJSONLines(message);
          break;

        case 'binary':
          encoded = this.encodeBinary(message);
          break;

        default:
          throw new Error(`Unknown format: ${this.format}`);
      }

      this.stats.messagesEncoded++;
      this.stats.bytesProduced += encoded.length;

      this.push(encoded);
      callback();

    } catch (error) {
      callback(error);
    }
  }

  encodeSSE(message) {
    const lines = [];

    // Add event type if present
    if (message.event) {
      lines.push(`event: ${message.event}`);
    }

    // Add retry if present
    if (message.retry) {
      lines.push(`retry: ${message.retry}`);
    }

    // Add ID if present
    if (message.id) {
      lines.push(`id: ${message.id}`);
    }

    // Add data
    const data = typeof message.data === 'string'
      ? message.data
      : JSON.stringify(message.data);

    // Split data into multiple lines if needed
    data.split('\n').forEach(line => {
      lines.push(`data: ${line}`);
    });

    // SSE messages end with double newline
    return Buffer.from(lines.join('\n') + '\n\n');
  }

  encodeJSONLines(message) {
    const json = JSON.stringify(message);
    return Buffer.from(json + '\n');
  }

  encodeBinary(message) {
    const encoded = this.encoder.encode(message);
    return encoded.total;
  }

  _flush(callback) {
    // Send end-of-stream marker
    if (this.format === 'sse') {
      this.push(Buffer.from('data: [DONE]\n\n'));
    }

    callback();
  }
}
```

## Stream Orchestration

### Event Stream Marshaller

The marshaller orchestrates complex stream transformations:

```javascript
class EventStreamMarshaller {
  constructor(options = {}) {
    this.eventStreamCodec = new EventStreamCodec(
      options.utf8Encoder,
      options.utf8Decoder
    );
    this.transforms = [];
  }

  addTransform(transform) {
    this.transforms.push(transform);
    return this;
  }

  serialize(inputStream, serializer) {
    let stream = inputStream;

    // Apply transforms
    for (const transform of this.transforms) {
      stream = stream.pipe(transform);
    }

    // Apply serializer if provided
    if (serializer) {
      stream = stream.pipe(new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          try {
            const serialized = serializer(chunk);
            callback(null, serialized);
          } catch (error) {
            callback(error);
          }
        }
      }));
    }

    // Final encoding
    const encoder = new MessageEncoderStream({
      encoder: this.eventStreamCodec
    });

    return stream.pipe(encoder);
  }

  async deserialize(stream, deserializer) {
    const decoder = new MessageDecoderStream({
      decoder: this.eventStreamCodec
    });

    let processedStream = stream.pipe(decoder);

    // Apply transforms
    for (const transform of this.transforms) {
      processedStream = processedStream.pipe(transform);
    }

    // Collect results
    return new Promise((resolve, reject) => {
      const results = [];

      processedStream
        .on('data', async (message) => {
          try {
            const processed = deserializer
              ? await deserializer(message)
              : message;
            results.push(processed);
          } catch (error) {
            reject(error);
          }
        })
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  createDuplexStream() {
    return new Duplex({
      objectMode: true,

      write(chunk, encoding, callback) {
        // Encode and write
        try {
          const encoded = this.eventStreamCodec.encode(chunk);
          this.push(encoded.total);
          callback();
        } catch (error) {
          callback(error);
        }
      },

      read() {
        // Reading handled by push in write
      }
    });
  }
}
```

## Performance Optimization

### Stream Buffering Strategy

Intelligent buffering for optimal performance:

```javascript
class StreamBufferingStrategy {
  constructor(options = {}) {
    this.minBufferSize = options.minBufferSize || 1024;
    this.maxBufferSize = options.maxBufferSize || 65536;
    this.adaptiveBuffering = options.adaptiveBuffering !== false;
    this.currentBufferSize = this.minBufferSize;
    this.metrics = {
      totalBytes: 0,
      totalTime: 0,
      bufferResizes: 0
    };
  }

  determineBufferSize(throughput) {
    if (!this.adaptiveBuffering) {
      return this.currentBufferSize;
    }

    // Calculate optimal buffer size based on throughput
    const targetLatency = 50; // ms
    const optimalSize = Math.floor(throughput * targetLatency / 1000);

    // Clamp to bounds
    const newSize = Math.max(
      this.minBufferSize,
      Math.min(this.maxBufferSize, optimalSize)
    );

    if (newSize !== this.currentBufferSize) {
      this.metrics.bufferResizes++;
      this.currentBufferSize = newSize;
    }

    return this.currentBufferSize;
  }

  createAdaptiveBuffer() {
    const buffer = [];
    let lastFlush = Date.now();

    return {
      add: (chunk) => {
        buffer.push(chunk);
        this.metrics.totalBytes += chunk.length;

        const now = Date.now();
        const elapsed = now - lastFlush;

        // Calculate current throughput
        const throughput = buffer.reduce((sum, c) => sum + c.length, 0) / (elapsed / 1000);

        // Determine if we should flush
        const bufferSize = this.determineBufferSize(throughput);
        const currentSize = buffer.reduce((sum, c) => sum + c.length, 0);

        if (currentSize >= bufferSize) {
          const flushed = this.flush(buffer);
          lastFlush = now;
          this.metrics.totalTime += elapsed;
          return flushed;
        }

        return null;
      },

      flush: () => {
        if (buffer.length === 0) return null;
        return this.flush(buffer);
      }
    };
  }

  flush(buffer) {
    const combined = Buffer.concat(buffer);
    buffer.length = 0;
    return combined;
  }
}
```

## Conclusion

The stream processing architecture in Claude Code represents a masterful implementation of real-time data handling that seamlessly bridges browser and Node.js environments. Through sophisticated decoder implementations, transform streams, and adaptive buffering strategies, the system achieves remarkable performance while maintaining data integrity.

Key architectural achievements:

1. **Universal Stream Handling**: Seamless support for ReadableStream, Node.js streams, and async iterators
2. **Robust Parsing**: Multi-format support with partial JSON recovery
3. **Performance Optimization**: Adaptive buffering and throughput-based optimization
4. **Error Resilience**: Comprehensive error recovery and partial content preservation
5. **Event-Driven Architecture**: Rich event emission for real-time UI updates

The streaming system's elegance lies in its layered approach—from low-level byte handling in the StreamDecoder to high-level orchestration in the EventStreamMarshaller. This architecture enables Claude Code to deliver responsive, real-time AI interactions while handling network interruptions, partial responses, and varying data formats gracefully.

The deobfuscation and modernization to ES6 modules has revealed a well-architected system that balances complexity with maintainability, performance with reliability, and flexibility with type safety.