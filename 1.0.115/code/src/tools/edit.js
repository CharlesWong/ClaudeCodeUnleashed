/**
 * Edit Tool
 * Replace text in files with exact string matching
 */

import fs from 'fs';
import path from 'path';
import { diffLines, createPatch } from 'diff';

class FileEditor {
  constructor() {
    this.editHistory = new Map();
  }

  /**
   * Find and replace text in file
   */
  async editFile(filePath, oldString, newString, options = {}) {
    const { replaceAll = false } = options;

    // Resolve absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file content
    const originalContent = fs.readFileSync(absolutePath, 'utf8');

    // Check if old string exists
    if (!originalContent.includes(oldString)) {
      throw new Error(
        `The specified text was not found in the file. ` +
        `Make sure the old_string matches exactly, including whitespace.`
      );
    }

    // Check if old and new strings are different
    if (oldString === newString) {
      throw new Error('old_string and new_string must be different');
    }

    // Check uniqueness if not replacing all
    if (!replaceAll) {
      const occurrences = this.countOccurrences(originalContent, oldString);
      if (occurrences > 1) {
        throw new Error(
          `The old_string appears ${occurrences} times in the file. ` +
          `Either make it unique by including more context, or use replace_all: true`
        );
      }
    }

    // Perform replacement
    let newContent;
    if (replaceAll) {
      newContent = originalContent.split(oldString).join(newString);
    } else {
      const index = originalContent.indexOf(oldString);
      newContent =
        originalContent.slice(0, index) +
        newString +
        originalContent.slice(index + oldString.length);
    }

    // Write the file
    fs.writeFileSync(absolutePath, newContent, 'utf8');

    // Store edit history
    this.editHistory.set(absolutePath, {
      timestamp: Date.now(),
      originalContent,
      newContent,
      oldString,
      newString,
      replaceAll
    });

    // Calculate changes
    const replacementCount = this.countOccurrences(originalContent, oldString);
    const diff = createPatch(filePath, originalContent, newContent);

    return {
      path: absolutePath,
      replacementCount,
      diff,
      oldSize: Buffer.byteLength(originalContent, 'utf8'),
      newSize: Buffer.byteLength(newContent, 'utf8')
    };
  }

  /**
   * Count occurrences of string
   */
  countOccurrences(text, searchString) {
    let count = 0;
    let position = 0;

    while ((position = text.indexOf(searchString, position)) !== -1) {
      count++;
      position += searchString.length;
    }

    return count;
  }

  /**
   * Get edit history for file
   */
  getEditHistory(filePath) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    return this.editHistory.get(absolutePath);
  }

  /**
   * Undo last edit
   */
  async undoLastEdit(filePath) {
    const history = this.getEditHistory(filePath);
    if (!history) {
      throw new Error('No edit history found for this file');
    }

    fs.writeFileSync(filePath, history.originalContent, 'utf8');
    this.editHistory.delete(filePath);

    return {
      restored: true,
      path: filePath
    };
  }
}

// Singleton instance
const fileEditor = new FileEditor();

/**
 * Edit tool definition
 */
const EditTool = {
  name: 'Edit',
  description: 'Replace text in a file',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to edit'
      },
      old_string: {
        type: 'string',
        description: 'The exact text to replace'
      },
      new_string: {
        type: 'string',
        description: 'The text to replace it with'
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences (default: false)'
      }
    },
    required: ['file_path', 'old_string', 'new_string']
  },

  async validateInput({ file_path, old_string, new_string }) {
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

    if (!old_string || typeof old_string !== 'string') {
      return {
        result: false,
        errorMessage: 'old_string is required and must be a string'
      };
    }

    if (!new_string || typeof new_string !== 'string') {
      return {
        result: false,
        errorMessage: 'new_string is required and must be a string'
      };
    }

    if (old_string === new_string) {
      return {
        result: false,
        errorMessage: 'old_string and new_string must be different'
      };
    }

    return { result: true };
  },

  async *call({ file_path, old_string, new_string, replace_all }, context) {
    try {
      const result = await fileEditor.editFile(
        file_path,
        old_string,
        new_string,
        { replaceAll: replace_all }
      );

      yield {
        type: 'result',
        data: {
          path: result.path,
          replacementCount: result.replacementCount,
          diff: result.diff,
          oldSize: result.oldSize,
          newSize: result.newSize
        }
      };
    } catch (error) {
      throw new Error(`Failed to edit file: ${error.message}`);
    }
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    const message = `Edited ${data.path} - Replaced ${data.replacementCount} occurrence${
      data.replacementCount !== 1 ? 's' : ''
    }`;

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

/**
 * MultiEdit tool for multiple edits in one operation
 */
const MultiEditTool = {
  name: 'MultiEdit',
  description: 'Make multiple edits to a single file',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to edit'
      },
      edits: {
        type: 'array',
        description: 'Array of edit operations to perform sequentially',
        items: {
          type: 'object',
          properties: {
            old_string: {
              type: 'string',
              description: 'The text to replace'
            },
            new_string: {
              type: 'string',
              description: 'The text to replace it with'
            },
            replace_all: {
              type: 'boolean',
              description: 'Replace all occurrences'
            }
          },
          required: ['old_string', 'new_string']
        }
      }
    },
    required: ['file_path', 'edits']
  },

  async validateInput({ file_path, edits }) {
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

    if (!Array.isArray(edits) || edits.length === 0) {
      return {
        result: false,
        errorMessage: 'edits must be a non-empty array'
      };
    }

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!edit.old_string || !edit.new_string) {
        return {
          result: false,
          errorMessage: `Edit at index ${i} missing old_string or new_string`
        };
      }

      if (edit.old_string === edit.new_string) {
        return {
          result: false,
          errorMessage: `Edit at index ${i} has identical old_string and new_string`
        };
      }
    }

    return { result: true };
  },

  async *call({ file_path, edits }, context) {
    const results = [];

    try {
      // Read original content
      const absolutePath = path.isAbsolute(file_path)
        ? file_path
        : path.resolve(process.cwd(), file_path);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${file_path}`);
      }

      const originalContent = fs.readFileSync(absolutePath, 'utf8');
      let currentContent = originalContent;

      // Apply edits sequentially
      for (const edit of edits) {
        const oldString = edit.old_string;
        const newString = edit.new_string;
        const replaceAll = edit.replace_all || false;

        if (!currentContent.includes(oldString)) {
          throw new Error(
            `Edit failed: "${oldString.substring(0, 50)}..." not found in current content`
          );
        }

        if (replaceAll) {
          currentContent = currentContent.split(oldString).join(newString);
        } else {
          const index = currentContent.indexOf(oldString);
          currentContent =
            currentContent.slice(0, index) +
            newString +
            currentContent.slice(index + oldString.length);
        }

        results.push({
          oldString: oldString.substring(0, 50),
          newString: newString.substring(0, 50),
          applied: true
        });
      }

      // Write final content
      fs.writeFileSync(absolutePath, currentContent, 'utf8');

      // Calculate diff
      const diff = createPatch(file_path, originalContent, currentContent);

      yield {
        type: 'result',
        data: {
          path: absolutePath,
          editsApplied: results.length,
          diff: diff,
          oldSize: Buffer.byteLength(originalContent, 'utf8'),
          newSize: Buffer.byteLength(currentContent, 'utf8')
        }
      };
    } catch (error) {
      throw new Error(`MultiEdit failed: ${error.message}`);
    }
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    const message = `Applied ${data.editsApplied} edit${
      data.editsApplied !== 1 ? 's' : ''
    } to ${data.path}`;

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
  EditTool,
  MultiEditTool,
  fileEditor,
  FileEditor
};