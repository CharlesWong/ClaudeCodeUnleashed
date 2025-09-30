/**
 * Write Tool
 * Write content to files with safety checks
 */

import fs from 'fs';
import path from 'path';
import { mkdirp } from 'mkdirp';

class FileWriter {
  constructor() {
    this.fileHistory = new Map();
  }

  /**
   * Check if file was previously read
   */
  wasFileRead(filePath) {
    return this.fileHistory.has(filePath);
  }

  /**
   * Mark file as read
   */
  markFileAsRead(filePath) {
    this.fileHistory.set(filePath, {
      readAt: Date.now(),
      originalContent: null
    });
  }

  /**
   * Write content to file
   */
  async writeFile(filePath, content, options = {}) {
    const {
      createDirectories = true,
      overwriteWithoutReading = false
    } = options;

    // Resolve absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Check if file exists
    const fileExists = fs.existsSync(absolutePath);

    // Check if file was read before overwriting
    if (fileExists && !overwriteWithoutReading && !this.wasFileRead(absolutePath)) {
      throw new Error(
        `File "${filePath}" exists but was not read first. ` +
        `Please read the file before overwriting or use force option.`
      );
    }

    // Create parent directories if needed
    if (createDirectories) {
      const dir = path.dirname(absolutePath);
      await mkdirp(dir);
    }

    // Write the file
    fs.writeFileSync(absolutePath, content, 'utf8');

    return {
      path: absolutePath,
      size: Buffer.byteLength(content, 'utf8'),
      created: !fileExists,
      overwritten: fileExists
    };
  }

  /**
   * Create backup of file before writing
   */
  async createBackup(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const backupPath = `${filePath}.backup.${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  }
}

// Singleton instance
const fileWriter = new FileWriter();

/**
 * Write tool definition
 */
const WriteTool = {
  name: 'Write',
  description: 'Write content to a file',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to write'
      },
      content: {
        type: 'string',
        description: 'The content to write to the file'
      }
    },
    required: ['file_path', 'content']
  },

  async validateInput({ file_path, content }) {
    if (!file_path || typeof file_path !== 'string') {
      return {
        result: false,
        errorMessage: 'file_path is required and must be a string'
      };
    }

    if (!path.isAbsolute(file_path)) {
      return {
        result: false,
        errorMessage: 'file_path must be an absolute path'
      };
    }

    if (content === undefined || content === null) {
      return {
        result: false,
        errorMessage: 'content is required'
      };
    }

    // Check for dangerous paths
    const normalizedPath = path.normalize(file_path);
    const dangerousPaths = [
      '/etc/passwd',
      '/etc/shadow',
      '/etc/sudoers',
      '/.ssh/authorized_keys',
      '/root'
    ];

    for (const dangerous of dangerousPaths) {
      if (normalizedPath.startsWith(dangerous)) {
        return {
          result: false,
          errorMessage: `Writing to ${dangerous} is not allowed for security reasons`
        };
      }
    }

    return { result: true };
  },

  async *call({ file_path, content }, context) {
    try {
      const result = await fileWriter.writeFile(file_path, content);

      yield {
        type: 'result',
        data: {
          path: result.path,
          size: result.size,
          created: result.created,
          overwritten: result.overwritten,
          lines: content.split('\n').length
        }
      };
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    let message = data.created
      ? `Created file at ${data.path}`
      : `Updated file at ${data.path}`;

    message += ` (${data.lines} lines, ${data.size} bytes)`;

    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: message
    };
  },

  isEnabled() {
    return true;
  },

  isConcurrencySafe() {
    return false;
  },

  isReadOnly() {
    return false;
  }
};

export {
  WriteTool,
  fileWriter,
  FileWriter
};