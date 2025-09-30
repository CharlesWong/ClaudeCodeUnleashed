/**
 * Miscellaneous Utilities for Claude Code
 * String helpers, date formatting, path utilities, and other common functions
 * Extracted from various utility patterns throughout the codebase
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { URL } from 'url';

/**
 * String utilities
 */
export class StringUtils {
  /**
   * Sanitize string for safe usage
   * Original: SH function pattern from line 515
   */
  static sanitize(str) {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Replace environment variables
   * Original: replace pattern from line 274
   */
  static replaceEnvVars(str) {
    return str.replace(/\$\{([^}]+)\}/g, (match, varExpr) => {
      const [varName, defaultValue] = varExpr.split(':-');
      const value = process.env[varName];
      return value !== undefined ? value : (defaultValue || match);
    });
  }

  /**
   * Truncate string
   */
  static truncate(str, maxLength, suffix = '...') {
    if (str.length <= maxLength) {
      return str;
    }
    return str.slice(0, maxLength - suffix.length) + suffix;
  }

  /**
   * Capitalize first letter
   */
  static capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Convert to camel case
   */
  static toCamelCase(str) {
    return str.replace(/[-_\s]+(.)?/g, (match, char) =>
      char ? char.toUpperCase() : ''
    );
  }

  /**
   * Convert to snake case
   */
  static toSnakeCase(str) {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  /**
   * Convert to kebab case
   */
  static toKebabCase(str) {
    return str
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
  }

  /**
   * Remove ANSI escape codes
   */
  static stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Escape regex special characters
   */
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Word wrap text
   */
  static wordWrap(str, width = 80) {
    const words = str.split(' ');
    const lines = [];
    let currentLine = [];
    let currentLength = 0;

    for (const word of words) {
      if (currentLength + word.length + 1 > width) {
        lines.push(currentLine.join(' '));
        currentLine = [word];
        currentLength = word.length;
      } else {
        currentLine.push(word);
        currentLength += word.length + 1;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '));
    }

    return lines.join('\n');
  }

  /**
   * Generate random string
   */
  static random(length = 10, charset = 'alphanumeric') {
    const charsets = {
      alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      alphabetic: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      numeric: '0123456789',
      hex: '0123456789abcdef'
    };

    const chars = charsets[charset] || charsets.alphanumeric;
    let result = '';

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }
}

/**
 * Date utilities
 */
export class DateUtils {
  /**
   * Format date
   */
  static format(date, format = 'YYYY-MM-DD HH:mm:ss') {
    const d = new Date(date);

    const replacements = {
      YYYY: d.getFullYear(),
      MM: String(d.getMonth() + 1).padStart(2, '0'),
      DD: String(d.getDate()).padStart(2, '0'),
      HH: String(d.getHours()).padStart(2, '0'),
      mm: String(d.getMinutes()).padStart(2, '0'),
      ss: String(d.getSeconds()).padStart(2, '0'),
      SSS: String(d.getMilliseconds()).padStart(3, '0')
    };

    let formatted = format;
    for (const [key, value] of Object.entries(replacements)) {
      formatted = formatted.replace(key, value);
    }

    return formatted;
  }

  /**
   * Get relative time
   */
  static relative(date) {
    const now = Date.now();
    const then = new Date(date).getTime();
    const diff = now - then;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    if (hours > 0) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }
    return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
  }

  /**
   * Parse duration string
   */
  static parseDuration(str) {
    const units = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const match = str.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid duration: ${str}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Format duration
   */
  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Get timestamp
   */
  static timestamp() {
    return new Date().toISOString();
  }
}

/**
 * Path utilities
 * Original: path normalization from lines 2837-2843
 */
export class PathUtils {
  /**
   * Normalize path
   * Original: nU9 function from line 2836
   */
  static normalize(inputPath) {
    let normalized = path.normalize(inputPath);
    normalized = normalized.replace(/\\/g, '/');

    let startsWithDoubleSlash = false;
    if (normalized.startsWith('//')) {
      startsWithDoubleSlash = true;
    }

    // Remove multiple slashes
    while (normalized.match(/\/\//)) {
      normalized = normalized.replace(/\/\//, '/');
    }

    if (startsWithDoubleSlash) {
      normalized = '/' + normalized;
    }

    return normalized;
  }

  /**
   * Get relative path
   */
  static relative(from, to) {
    return path.relative(from, to).replace(/\\/g, '/');
  }

  /**
   * Is absolute path
   */
  static isAbsolute(inputPath) {
    return path.isAbsolute(inputPath);
  }

  /**
   * Join paths
   */
  static join(...paths) {
    return path.join(...paths).replace(/\\/g, '/');
  }

  /**
   * Resolve path
   */
  static resolve(...paths) {
    return path.resolve(...paths).replace(/\\/g, '/');
  }

  /**
   * Get extension
   */
  static getExtension(filePath) {
    return path.extname(filePath);
  }

  /**
   * Get basename
   */
  static getBasename(filePath, ext) {
    return path.basename(filePath, ext);
  }

  /**
   * Get directory
   */
  static getDirectory(filePath) {
    return path.dirname(filePath);
  }

  /**
   * Expand tilde
   */
  static expandTilde(filePath) {
    if (filePath.startsWith('~/')) {
      return path.join(os.homedir(), filePath.slice(2));
    }
    return filePath;
  }

  /**
   * Check if path is safe
   */
  static isSafe(filePath) {
    const normalized = this.normalize(filePath);

    // Check for directory traversal
    if (normalized.includes('../')) {
      return false;
    }

    // Check for absolute paths outside home
    if (this.isAbsolute(normalized)) {
      const home = os.homedir();
      if (!normalized.startsWith(home)) {
        return false;
      }
    }

    return true;
  }
}

/**
 * File utilities
 */
export class FileUtils {
  /**
   * Check if file exists
   */
  static async exists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file size
   */
  static async getSize(filePath) {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  }

  /**
   * Get file stats
   */
  static async getStats(filePath) {
    return fs.promises.stat(filePath);
  }

  /**
   * Is directory
   */
  static async isDirectory(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Is file
   */
  static async isFile(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Ensure directory exists
   */
  static async ensureDirectory(dirPath) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  /**
   * Copy file
   */
  static async copy(source, destination) {
    await fs.promises.copyFile(source, destination);
  }

  /**
   * Move file
   */
  static async move(source, destination) {
    await fs.promises.rename(source, destination);
  }

  /**
   * Delete file
   */
  static async delete(filePath) {
    await fs.promises.unlink(filePath);
  }

  /**
   * Read JSON file
   */
  static async readJSON(filePath) {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Write JSON file
   */
  static async writeJSON(filePath, data, indent = 2) {
    const content = JSON.stringify(data, null, indent);
    await fs.promises.writeFile(filePath, content, 'utf8');
  }

  /**
   * Get mime type
   */
  static getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.css': 'text/css',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.zip': 'application/zip'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

/**
 * URL utilities
 */
export class URLUtils {
  /**
   * Parse URL
   */
  static parse(urlString) {
    try {
      return new URL(urlString);
    } catch {
      return null;
    }
  }

  /**
   * Is valid URL
   */
  static isValid(urlString) {
    return this.parse(urlString) !== null;
  }

  /**
   * Join URL parts
   */
  static join(base, ...parts) {
    let url = base.endsWith('/') ? base : base + '/';

    for (const part of parts) {
      if (part.startsWith('/')) {
        url += part.slice(1);
      } else {
        url += part;
      }
      if (!url.endsWith('/')) {
        url += '/';
      }
    }

    return url.slice(0, -1); // Remove trailing slash
  }

  /**
   * Get query parameters
   */
  static getQueryParams(urlString) {
    const url = this.parse(urlString);
    if (!url) return {};

    const params = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  /**
   * Add query parameters
   */
  static addQueryParams(urlString, params) {
    const url = this.parse(urlString);
    if (!url) return urlString;

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }

  /**
   * Remove query parameters
   */
  static removeQueryParams(urlString, ...keys) {
    const url = this.parse(urlString);
    if (!url) return urlString;

    for (const key of keys) {
      url.searchParams.delete(key);
    }

    return url.toString();
  }

  /**
   * Get domain
   */
  static getDomain(urlString) {
    const url = this.parse(urlString);
    return url ? url.hostname : null;
  }

  /**
   * Get protocol
   */
  static getProtocol(urlString) {
    const url = this.parse(urlString);
    return url ? url.protocol.slice(0, -1) : null;
  }
}

/**
 * Object utilities
 */
export class ObjectUtils {
  /**
   * Deep clone
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj);
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item));
    }

    if (obj instanceof Object) {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
  }

  /**
   * Deep merge
   */
  static deepMerge(target, ...sources) {
    if (!sources.length) return target;

    const source = sources.shift();

    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return this.deepMerge(target, ...sources);
  }

  /**
   * Is object
   */
  static isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Get nested value
   */
  static get(obj, path, defaultValue) {
    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
      result = result?.[key];
      if (result === undefined) {
        return defaultValue;
      }
    }

    return result;
  }

  /**
   * Set nested value
   */
  static set(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * Delete nested value
   */
  static delete(obj, path) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      current = current?.[key];
      if (!current) return;
    }

    delete current[lastKey];
  }

  /**
   * Pick properties
   */
  static pick(obj, keys) {
    const result = {};
    for (const key of keys) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }
    return result;
  }

  /**
   * Omit properties
   */
  static omit(obj, keys) {
    const result = { ...obj };
    for (const key of keys) {
      delete result[key];
    }
    return result;
  }

  /**
   * Is empty
   */
  static isEmpty(obj) {
    if (!obj) return true;
    if (Array.isArray(obj)) return obj.length === 0;
    if (typeof obj === 'object') return Object.keys(obj).length === 0;
    return false;
  }
}

/**
 * Array utilities
 */
export class ArrayUtils {
  /**
   * Unique values
   */
  static unique(arr) {
    return [...new Set(arr)];
  }

  /**
   * Chunk array
   */
  static chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Flatten array
   */
  static flatten(arr, depth = 1) {
    if (depth <= 0) return arr;
    return arr.reduce((acc, val) =>
      acc.concat(Array.isArray(val) ? this.flatten(val, depth - 1) : val), []
    );
  }

  /**
   * Group by
   */
  static groupBy(arr, key) {
    return arr.reduce((groups, item) => {
      const group = typeof key === 'function' ? key(item) : item[key];
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
      return groups;
    }, {});
  }

  /**
   * Sort by
   */
  static sortBy(arr, key) {
    return [...arr].sort((a, b) => {
      const aVal = typeof key === 'function' ? key(a) : a[key];
      const bVal = typeof key === 'function' ? key(b) : b[key];
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      return 0;
    });
  }

  /**
   * Shuffle array
   */
  static shuffle(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Sample from array
   */
  static sample(arr, n = 1) {
    const shuffled = this.shuffle(arr);
    return n === 1 ? shuffled[0] : shuffled.slice(0, n);
  }

  /**
   * Difference
   */
  static difference(arr1, arr2) {
    const set2 = new Set(arr2);
    return arr1.filter(x => !set2.has(x));
  }

  /**
   * Intersection
   */
  static intersection(arr1, arr2) {
    const set2 = new Set(arr2);
    return arr1.filter(x => set2.has(x));
  }

  /**
   * Union
   */
  static union(arr1, arr2) {
    return this.unique([...arr1, ...arr2]);
  }
}

/**
 * System utilities
 */
export class SystemUtils {
  /**
   * Get platform
   */
  static getPlatform() {
    return process.platform;
  }

  /**
   * Is Windows
   */
  static isWindows() {
    return process.platform === 'win32';
  }

  /**
   * Is Mac
   */
  static isMac() {
    return process.platform === 'darwin';
  }

  /**
   * Is Linux
   */
  static isLinux() {
    return process.platform === 'linux';
  }

  /**
   * Get home directory
   */
  static getHomeDir() {
    return os.homedir();
  }

  /**
   * Get temp directory
   */
  static getTempDir() {
    return os.tmpdir();
  }

  /**
   * Get CPU count
   */
  static getCPUCount() {
    return os.cpus().length;
  }

  /**
   * Get free memory
   */
  static getFreeMemory() {
    return os.freemem();
  }

  /**
   * Get total memory
   */
  static getTotalMemory() {
    return os.totalmem();
  }

  /**
   * Get load average
   */
  static getLoadAverage() {
    return os.loadavg();
  }

  /**
   * Get network interfaces
   */
  static getNetworkInterfaces() {
    return os.networkInterfaces();
  }

  /**
   * Get environment variable
   */
  static getEnv(name, defaultValue) {
    return process.env[name] || defaultValue;
  }

  /**
   * Set environment variable
   */
  static setEnv(name, value) {
    process.env[name] = value;
  }

  /**
   * Sleep for milliseconds
   */
  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export all utilities
export default {
  StringUtils,
  DateUtils,
  PathUtils,
  FileUtils,
  URLUtils,
  ObjectUtils,
  ArrayUtils,
  SystemUtils
};