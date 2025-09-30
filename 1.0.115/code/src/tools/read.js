/**
 * Read Tool
 * Read files with support for various formats including text, images, PDFs, and notebooks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_LINE_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

class FileReader {
  constructor() {
    this.readHistory = new Map();
  }

  /**
   * Read file content
   */
  async readFile(filePath, options = {}) {
    const { offset = 0, limit = DEFAULT_LINE_LIMIT } = options;

    // Resolve absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Check if it's a directory
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filePath}`);
    }

    // Check file size
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(
        `File is too large (${stats.size} bytes). ` +
        `Maximum size is ${MAX_FILE_SIZE} bytes.`
      );
    }

    // Detect file type
    const ext = path.extname(absolutePath).toLowerCase();
    const fileType = this.detectFileType(ext);

    // Mark file as read in history
    this.markFileAsRead(absolutePath);

    // Read based on file type
    switch (fileType) {
      case 'text':
        return this.readTextFile(absolutePath, offset, limit);
      case 'image':
        return this.readImageFile(absolutePath);
      case 'pdf':
        return this.readPDFFile(absolutePath);
      case 'notebook':
        return this.readNotebookFile(absolutePath);
      default:
        return this.readBinaryFile(absolutePath);
    }
  }

  /**
   * Read text file with line limits
   */
  readTextFile(filePath, offset, limit) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Apply offset and limit
    const startLine = Math.max(0, offset);
    const endLine = Math.min(lines.length, startLine + limit);
    const selectedLines = lines.slice(startLine, endLine);

    // Truncate long lines
    const truncatedLines = selectedLines.map((line, index) => {
      const lineNumber = startLine + index + 1;
      if (line.length > MAX_LINE_LENGTH) {
        return `${lineNumber}\t${line.substring(0, MAX_LINE_LENGTH)}... [truncated]`;
      }
      return `${lineNumber}\t${line}`;
    });

    return {
      type: 'text',
      content: truncatedLines.join('\n'),
      totalLines: lines.length,
      linesRead: selectedLines.length,
      offset: startLine,
      truncated: endLine < lines.length
    };
  }

  /**
   * Read image file
   */
  readImageFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filePath).substring(1).toLowerCase();

    return {
      type: 'image',
      format: ext,
      base64: base64,
      size: buffer.length
    };
  }

  /**
   * Read PDF file
   */
  async readPDFFile(filePath) {
    // In real implementation, would use pdf-parse or similar
    // For now, return placeholder
    const buffer = fs.readFileSync(filePath);

    return {
      type: 'pdf',
      size: buffer.length,
      message: 'PDF reading requires additional libraries'
    };
  }

  /**
   * Read Jupyter notebook file
   */
  readNotebookFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const notebook = JSON.parse(content);

    const cells = notebook.cells.map((cell, index) => {
      return {
        index: index,
        type: cell.cell_type,
        source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
        outputs: cell.outputs || []
      };
    });

    return {
      type: 'notebook',
      cells: cells,
      metadata: notebook.metadata,
      totalCells: cells.length
    };
  }

  /**
   * Read binary file
   */
  readBinaryFile(filePath) {
    const stats = fs.statSync(filePath);

    return {
      type: 'binary',
      size: stats.size,
      message: 'Binary file - content not displayed'
    };
  }

  /**
   * Detect file type from extension
   */
  detectFileType(ext) {
    const textExtensions = [
      '.txt', '.md', '.js', '.ts', '.jsx', '.tsx',
      '.py', '.java', '.cpp', '.c', '.h', '.cs',
      '.go', '.rs', '.rb', '.php', '.swift', '.kt',
      '.html', '.css', '.scss', '.sass', '.less',
      '.json', '.xml', '.yaml', '.yml', '.toml',
      '.sh', '.bash', '.zsh', '.fish', '.ps1',
      '.sql', '.graphql', '.proto', '.env',
      '.gitignore', '.dockerignore', '.editorconfig'
    ];

    const imageExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.bmp',
      '.svg', '.webp', '.ico', '.tiff'
    ];

    const notebookExtensions = ['.ipynb'];
    const pdfExtensions = ['.pdf'];

    if (textExtensions.includes(ext)) return 'text';
    if (imageExtensions.includes(ext)) return 'image';
    if (notebookExtensions.includes(ext)) return 'notebook';
    if (pdfExtensions.includes(ext)) return 'pdf';

    return 'binary';
  }

  /**
   * Mark file as read
   */
  markFileAsRead(filePath) {
    this.readHistory.set(filePath, {
      timestamp: Date.now()
    });
  }

  /**
   * Check if file was read
   */
  wasFileRead(filePath) {
    return this.readHistory.has(filePath);
  }
}

// Singleton instance
const fileReader = new FileReader();

/**
 * Read tool definition
 */
const ReadTool = {
  name: 'Read',
  description: 'Read a file from the filesystem',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to read'
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (for text files)'
      },
      limit: {
        type: 'number',
        description: 'Number of lines to read (for text files)'
      }
    },
    required: ['file_path']
  },

  async validateInput({ file_path, offset, limit }) {
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

    if (offset !== undefined && (typeof offset !== 'number' || offset < 0)) {
      return {
        result: false,
        errorMessage: 'offset must be a non-negative number'
      };
    }

    if (limit !== undefined && (typeof limit !== 'number' || limit <= 0)) {
      return {
        result: false,
        errorMessage: 'limit must be a positive number'
      };
    }

    return { result: true };
  },

  async *call({ file_path, offset, limit }, context) {
    try {
      const result = await fileReader.readFile(file_path, { offset, limit });

      yield {
        type: 'result',
        data: result
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    let content;

    switch (data.type) {
      case 'text':
        content = data.content;
        if (data.truncated) {
          content += `\n\n[File truncated - ${data.totalLines} total lines]`;
        }
        break;
      case 'image':
        content = `[Image: ${data.format}, ${data.size} bytes]`;
        break;
      case 'notebook':
        content = `[Jupyter Notebook: ${data.totalCells} cells]`;
        break;
      case 'pdf':
        content = `[PDF document: ${data.size} bytes]`;
        break;
      case 'binary':
        content = data.message;
        break;
      default:
        content = 'Unknown file type';
    }

    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: content
    };
  },

  isEnabled() {
    return true;
  },

  isConcurrencySafe() {
    return true;
  },

  isReadOnly() {
    return true;
  }
};

export {
  ReadTool,
  fileReader,
  FileReader
};