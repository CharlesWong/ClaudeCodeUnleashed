/**
 * Claude Code Final Helper Utilities
 *
 * Remaining utility functions, validators, formatters, and edge case handlers.
 * Completes the extraction with miscellaneous but essential helpers.
 *
 * Extracted from claude-code-full-extract.js (lines ~47300-47600)
 * Part of the 90% → 95% extraction phase
 */

import { createHash, randomBytes } from 'crypto';
import { promisify } from 'util';
import { performance } from 'perf_hooks';
import { execSync } from 'child_process';

/**
 * Validation Utilities
 */
export class Validators {
  /**
   * Validate email address
   */
  static isEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  /**
   * Validate URL
   */
  static isURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate JSON
   */
  static isJSON(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate UUID
   */
  static isUUID(uuid) {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
  }

  /**
   * Validate semantic version
   */
  static isSemVer(version) {
    const regex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    return regex.test(version);
  }

  /**
   * Validate file path
   */
  static isValidPath(path) {
    // Check for path traversal attempts
    if (path.includes('..')) return false;

    // Check for invalid characters
    const invalidChars = /[\x00-\x1f\x7f<>:"|?*]/;
    if (invalidChars.test(path)) return false;

    return true;
  }

  /**
   * Validate API key format
   */
  static isValidApiKey(key) {
    // Anthropic API keys start with 'sk-ant-'
    return typeof key === 'string' &&
           key.length > 20 &&
           (key.startsWith('sk-ant-') || key.startsWith('test-'));
  }

  /**
   * Validate model name
   */
  static isValidModel(model) {
    const validModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2'
    ];
    return validModels.includes(model);
  }
}

/**
 * Formatting Utilities
 */
export class Formatters {
  /**
   * Format bytes to human readable
   */
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Format duration
   */
  static formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  /**
   * Format number with commas
   */
  static formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Format percentage
   */
  static formatPercentage(value, total, decimals = 1) {
    if (total === 0) return '0%';
    const percentage = (value / total) * 100;
    return `${percentage.toFixed(decimals)}%`;
  }

  /**
   * Format code snippet
   */
  static formatCodeSnippet(code, lineNumbers = true, startLine = 1) {
    const lines = code.split('\n');
    const maxLineNumWidth = String(startLine + lines.length - 1).length;

    return lines.map((line, i) => {
      if (lineNumbers) {
        const lineNum = String(startLine + i).padStart(maxLineNumWidth, ' ');
        return `${lineNum} │ ${line}`;
      }
      return line;
    }).join('\n');
  }

  /**
   * Format error message
   */
  static formatError(error) {
    if (error.stack) {
      const lines = error.stack.split('\n');
      const message = lines[0];
      const stack = lines.slice(1).map(line =>
        line.replace(/^\s+at\s+/, '  → ')
      ).join('\n');
      return `${message}\n${stack}`;
    }
    return error.message || String(error);
  }

  /**
   * Format table
   */
  static formatTable(headers, rows) {
    const columnWidths = headers.map((header, i) => {
      const headerWidth = header.length;
      const maxRowWidth = Math.max(...rows.map(row => String(row[i] || '').length));
      return Math.max(headerWidth, maxRowWidth);
    });

    const separator = '─';
    const junction = '┼';
    const leftEdge = '├';
    const rightEdge = '┤';

    let table = '';

    // Headers
    table += headers.map((header, i) =>
      header.padEnd(columnWidths[i])
    ).join(' │ ') + '\n';

    // Separator
    table += leftEdge + columnWidths.map(width =>
      separator.repeat(width + 2)
    ).join(junction) + rightEdge + '\n';

    // Rows
    rows.forEach(row => {
      table += row.map((cell, i) =>
        String(cell || '').padEnd(columnWidths[i])
      ).join(' │ ') + '\n';
    });

    return table;
  }
}

/**
 * Crypto Utilities
 */
export class CryptoUtils {
  /**
   * Generate hash
   */
  static hash(data, algorithm = 'sha256') {
    return createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Generate random ID
   */
  static randomId(length = 16) {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate UUID v4
   */
  static uuid() {
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = bytes.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-');
  }

  /**
   * Generate secure token
   */
  static async generateToken(length = 32) {
    const generateRandomBytes = promisify(randomBytes);
    const buffer = await generateRandomBytes(length);
    return buffer.toString('base64url');
  }

  /**
   * Simple encryption (for non-sensitive data)
   */
  static simpleEncrypt(text, key) {
    const keyHash = this.hash(key).slice(0, 32);
    let encrypted = '';

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ keyHash.charCodeAt(i % keyHash.length);
      encrypted += String.fromCharCode(charCode);
    }

    return Buffer.from(encrypted).toString('base64');
  }

  /**
   * Simple decryption (for non-sensitive data)
   */
  static simpleDecrypt(encrypted, key) {
    const keyHash = this.hash(key).slice(0, 32);
    const text = Buffer.from(encrypted, 'base64').toString();
    let decrypted = '';

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ keyHash.charCodeAt(i % keyHash.length);
      decrypted += String.fromCharCode(charCode);
    }

    return decrypted;
  }
}

/**
 * Performance Utilities
 */
export class PerformanceUtils {
  static markers = new Map();

  /**
   * Start timing
   */
  static startTiming(label) {
    this.markers.set(label, performance.now());
  }

  /**
   * End timing
   */
  static endTiming(label) {
    const start = this.markers.get(label);
    if (!start) return null;

    const duration = performance.now() - start;
    this.markers.delete(label);
    return duration;
  }

  /**
   * Measure function execution time
   */
  static async measureAsync(fn, label) {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      console.log(`${label}: ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.log(`${label} (failed): ${duration.toFixed(2)}ms`);
      throw error;
    }
  }

  /**
   * Debounce function
   */
  static debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Throttle function
   */
  static throttle(fn, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Retry with exponential backoff
   */
  static async retryWithBackoff(fn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelay = options.baseDelay || 1000;
    const maxDelay = options.maxDelay || 10000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;

        const delay = Math.min(baseDelay * Math.pow(2, i), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

/**
 * Collection Utilities
 */
export class CollectionUtils {
  /**
   * Chunk array into smaller arrays
   */
  static chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Flatten nested array
   */
  static flatten(array, depth = Infinity) {
    if (depth <= 0) return array;
    return array.reduce((acc, val) => {
      if (Array.isArray(val)) {
        return acc.concat(this.flatten(val, depth - 1));
      }
      return acc.concat(val);
    }, []);
  }

  /**
   * Group by key
   */
  static groupBy(array, key) {
    return array.reduce((groups, item) => {
      const groupKey = typeof key === 'function' ? key(item) : item[key];
      (groups[groupKey] = groups[groupKey] || []).push(item);
      return groups;
    }, {});
  }

  /**
   * Unique values
   */
  static unique(array, key) {
    if (!key) {
      return [...new Set(array)];
    }

    const seen = new Set();
    return array.filter(item => {
      const value = typeof key === 'function' ? key(item) : item[key];
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  /**
   * Difference between arrays
   */
  static difference(arr1, arr2) {
    const set = new Set(arr2);
    return arr1.filter(x => !set.has(x));
  }

  /**
   * Intersection of arrays
   */
  static intersection(arr1, arr2) {
    const set = new Set(arr2);
    return arr1.filter(x => set.has(x));
  }

  /**
   * Shuffle array
   */
  static shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

/**
 * Type Checking Utilities
 */
export class TypeUtils {
  static isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  static isPlainObject(value) {
    return this.isObject(value) && value.constructor === Object;
  }

  static isFunction(value) {
    return typeof value === 'function';
  }

  static isAsyncFunction(value) {
    return value && value.constructor === AsyncFunction;
  }

  static isPromise(value) {
    return value instanceof Promise ||
           (value && typeof value.then === 'function');
  }

  static isRegExp(value) {
    return value instanceof RegExp;
  }

  static isDate(value) {
    return value instanceof Date && !isNaN(value);
  }

  static isBuffer(value) {
    return Buffer.isBuffer(value);
  }

  static isEmpty(value) {
    if (value == null) return true;
    if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;
    if (this.isObject(value)) return Object.keys(value).length === 0;
    return false;
  }
}

/**
 * Platform Utilities
 */
export class PlatformUtils {
  static getPlatform() {
    return process.platform;
  }

  static isWindows() {
    return process.platform === 'win32';
  }

  static isMac() {
    return process.platform === 'darwin';
  }

  static isLinux() {
    return process.platform === 'linux';
  }

  static getHomeDirectory() {
    return process.env.HOME || process.env.USERPROFILE;
  }

  static getTempDirectory() {
    return process.env.TMPDIR || process.env.TEMP || '/tmp';
  }

  static getShell() {
    return process.env.SHELL || (this.isWindows() ? 'cmd.exe' : '/bin/bash');
  }

  static hasCommand(command) {
    try {
      const checkCommand = this.isWindows() ? `where ${command}` : `which ${command}`;
      execSync(checkCommand, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

// Export all utilities
export const validators = Validators;
export const formatters = Formatters;
export const crypto = CryptoUtils;
export const performance = PerformanceUtils;
export const collections = CollectionUtils;
export const types = TypeUtils;
export const platform = PlatformUtils;