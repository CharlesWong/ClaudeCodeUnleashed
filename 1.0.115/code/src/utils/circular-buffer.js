/**
 * Circular Buffer
 * Fixed-size buffer that overwrites old data when full
 */

export default class CircularBuffer {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.buffer = Buffer.alloc(0);
    this.totalWritten = 0;
  }

  /**
   * Write data to buffer
   */
  write(data) {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    if (this.buffer.length + dataBuffer.length <= this.maxSize) {
      // Append to buffer
      this.buffer = Buffer.concat([this.buffer, dataBuffer]);
    } else if (dataBuffer.length >= this.maxSize) {
      // New data is larger than max size, keep only the end
      this.buffer = dataBuffer.slice(-this.maxSize);
    } else {
      // Need to make room
      const keepSize = this.maxSize - dataBuffer.length;
      const keepStart = this.buffer.length - keepSize;
      this.buffer = Buffer.concat([
        this.buffer.slice(keepStart),
        dataBuffer
      ]);
    }

    this.totalWritten += dataBuffer.length;
  }

  /**
   * Get buffer as string
   */
  toString(encoding = 'utf8') {
    return this.buffer.toString(encoding);
  }

  /**
   * Get current buffer size
   */
  get size() {
    return this.buffer.length;
  }

  /**
   * Clear buffer
   */
  clear() {
    this.buffer = Buffer.alloc(0);
    this.totalWritten = 0;
  }

  /**
   * Check if buffer is full
   */
  get isFull() {
    return this.buffer.length >= this.maxSize;
  }

  /**
   * Get total bytes written (including overwritten)
   */
  get totalBytesWritten() {
    return this.totalWritten;
  }
}