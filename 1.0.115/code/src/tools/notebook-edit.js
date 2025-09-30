/**
 * Notebook Edit Tool
 * Edit Jupyter notebook cells
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Input schema for NotebookEdit
const notebookEditSchema = {
  type: 'object',
  properties: {
    notebook_path: {
      type: 'string',
      description: 'The absolute path to the Jupyter notebook file'
    },
    cell_id: {
      type: 'string',
      description: 'The ID of the cell to edit'
    },
    new_source: {
      type: 'string',
      description: 'The new source code for the cell'
    },
    cell_type: {
      type: 'string',
      enum: ['code', 'markdown'],
      description: 'The type of the cell'
    },
    edit_mode: {
      type: 'string',
      enum: ['replace', 'insert', 'delete'],
      description: 'The type of edit to make'
    }
  },
  required: ['notebook_path', 'new_source']
};

/**
 * Read notebook file
 */
function readNotebook(notebookPath) {
  try {
    return fs.readFileSync(notebookPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read notebook: ${error.message}`);
  }
}

/**
 * Write notebook file
 */
function writeNotebook(notebookPath, content) {
  try {
    fs.writeFileSync(notebookPath, content, 'utf8');
  } catch (error) {
    throw new Error(`Failed to write notebook: ${error.message}`);
  }
}

/**
 * Parse notebook JSON
 */
function parseNotebook(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse notebook: ${error.message}`);
  }
}

/**
 * Serialize notebook to JSON
 */
function serializeNotebook(notebook) {
  return JSON.stringify(notebook, null, 1);
}

/**
 * Find cell index by ID or numeric index
 */
function findCellIndex(cellId) {
  // Check if it's a numeric index
  const numIndex = parseInt(cellId, 10);
  if (!isNaN(numIndex) && numIndex >= 0) {
    return numIndex;
  }
  return undefined;
}

/**
 * Create a new notebook cell
 */
function createNotebookCell(source, cellType = 'code', language = 'python') {
  const cell = {
    cell_type: cellType,
    id: uuidv4(),
    metadata: {}
  };

  if (cellType === 'code') {
    cell.execution_count = null;
    cell.outputs = [];
    cell.source = Array.isArray(source) ? source : source.split('\n').map((line, i, arr) =>
      i === arr.length - 1 ? line : line + '\n'
    );
  } else {
    cell.source = Array.isArray(source) ? source : source.split('\n').map((line, i, arr) =>
      i === arr.length - 1 ? line : line + '\n'
    );
  }

  return cell;
}

/**
 * NotebookEdit tool definition
 */
const NotebookEditTool = {
  name: 'NotebookEdit',
  description: 'Replace the contents of a specific cell in a Jupyter notebook',
  inputSchema: notebookEditSchema,

  async validateInput({ notebook_path, cell_type, cell_id, edit_mode = 'replace' }) {
    const resolvedPath = path.isAbsolute(notebook_path) ?
      notebook_path :
      path.resolve(process.cwd(), notebook_path);

    if (path.extname(resolvedPath) !== '.ipynb') {
      return {
        result: false,
        errorCode: 2,
        errorMessage: 'File must be a Jupyter notebook (.ipynb)'
      };
    }

    if (!['replace', 'insert', 'delete'].includes(edit_mode)) {
      return {
        result: false,
        errorMessage: 'Invalid edit_mode'
      };
    }

    if (edit_mode === 'insert' && !cell_type) {
      return {
        result: false,
        errorMessage: 'cell_type required for insert mode'
      };
    }

    try {
      // Validate notebook structure
      const notebookContent = readNotebook(resolvedPath);
      const notebook = parseNotebook(notebookContent);

      if (!cell_id && edit_mode !== 'insert') {
        return {
          result: false,
          errorMessage: 'cell_id required for replace and delete modes'
        };
      }

      if (cell_id) {
        const cellIndex = findCellIndex(cell_id);
        if (cellIndex !== undefined) {
          if (!notebook.cells[cellIndex]) {
            return {
              result: false,
              errorMessage: `Cell at index ${cellIndex} not found`
            };
          }
        } else if (!notebook.cells.find(cell => cell.id === cell_id)) {
          return {
            result: false,
            errorMessage: `Cell with ID ${cell_id} not found`
          };
        }
      }
    } catch (error) {
      return {
        result: false,
        errorMessage: error.message
      };
    }

    return { result: true };
  },

  async *call({ notebook_path, new_source, cell_id, cell_type, edit_mode = 'replace' }) {
    const resolvedPath = path.isAbsolute(notebook_path) ?
      notebook_path :
      path.resolve(process.cwd(), notebook_path);

    try {
      const notebookContent = readNotebook(resolvedPath);
      const notebook = parseNotebook(notebookContent);
      let cellIndex;

      if (!cell_id) {
        cellIndex = 0;
      } else {
        const numericIndex = findCellIndex(cell_id);
        if (numericIndex !== undefined) {
          cellIndex = numericIndex;
          if (edit_mode === 'insert') cellIndex += 1;
        } else {
          cellIndex = notebook.cells.findIndex(cell => cell.id === cell_id);
          if (edit_mode === 'insert') cellIndex += 1;
        }
      }

      // Handle edge cases
      if (edit_mode === 'replace' && cellIndex === notebook.cells.length) {
        edit_mode = 'insert';
        if (!cell_type) cell_type = 'code';
      }

      const language = notebook.metadata?.language_info?.name || 'python';
      let finalCellId = undefined;

      if (edit_mode === 'delete') {
        notebook.cells.splice(cellIndex, 1);
      } else if (edit_mode === 'insert') {
        const newCell = createNotebookCell(new_source, cell_type, language);
        notebook.cells.splice(cellIndex, 0, newCell);
        finalCellId = newCell.id;
      } else {
        const cell = notebook.cells[cellIndex];
        if (cell_type && cell_type !== cell.cell_type) {
          cell.cell_type = cell_type;
        }
        cell.source = Array.isArray(new_source) ? new_source :
          new_source.split('\n').map((line, i, arr) =>
            i === arr.length - 1 ? line : line + '\n'
          );
        finalCellId = cell.id;
      }

      const updatedContent = serializeNotebook(notebook);
      writeNotebook(resolvedPath, updatedContent);

      yield {
        type: 'result',
        data: {
          new_source: new_source,
          cell_type: cell_type || 'code',
          language: language,
          edit_mode: edit_mode,
          cell_id: finalCellId || undefined,
          error: ''
        }
      };
    } catch (error) {
      yield {
        type: 'result',
        data: {
          new_source: new_source,
          cell_type: cell_type || 'code',
          language: 'python',
          edit_mode: edit_mode,
          cell_id: cell_id,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      };
    }
  },

  mapToolResultToToolResultBlockParam({ cell_id, edit_mode, new_source, error }, toolUseId) {
    if (error) {
      return {
        tool_use_id: toolUseId,
        type: 'tool_result',
        content: error,
        is_error: true
      };
    }

    const lines = new_source.split('\n');
    const preview = lines.length > 3 ?
      `${lines.slice(0, 3).join('\n')}...` :
      new_source;

    switch (edit_mode) {
      case 'replace':
        return {
          tool_use_id: toolUseId,
          type: 'tool_result',
          content: `Updated cell ${cell_id || '0'} with:\n${preview}`
        };
      case 'insert':
        return {
          tool_use_id: toolUseId,
          type: 'tool_result',
          content: `Inserted cell ${cell_id} with:\n${preview}`
        };
      case 'delete':
        return {
          tool_use_id: toolUseId,
          type: 'tool_result',
          content: `Deleted cell ${cell_id}`
        };
      default:
        return {
          tool_use_id: toolUseId,
          type: 'tool_result',
          content: 'Unknown edit mode'
        };
    }
  },

  getPath(input) {
    return input.notebook_path;
  },

  async checkPermissions(input, context) {
    // Check file write permissions
    const appState = await context.getAppState();
    const resolvedPath = path.isAbsolute(input.notebook_path) ?
      input.notebook_path :
      path.resolve(process.cwd(), input.notebook_path);

    // Check if file is in allowed directories
    if (appState.toolPermissionContext?.allowedPaths) {
      const allowed = appState.toolPermissionContext.allowedPaths.some(allowedPath =>
        resolvedPath.startsWith(allowedPath)
      );
      if (!allowed) {
        return {
          behavior: 'deny',
          decisionReason: {
            type: 'path',
            reason: 'File is outside allowed paths'
          }
        };
      }
    }

    return {
      behavior: 'allow',
      updatedInput: input
    };
  },

  userFacingName() {
    return 'Edit Notebook';
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
  NotebookEditTool,
  readNotebook,
  writeNotebook,
  parseNotebook,
  serializeNotebook,
  createNotebookCell,
  findCellIndex
};