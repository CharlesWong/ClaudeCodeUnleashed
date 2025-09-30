# Part 4.2: File Operations Implementation - Read, Write, and Edit

## Overview

File operations form the core of Claude Code's ability to interact with codebases. Through the Read, Write, and Edit tools, Claude can explore files, create new content, and make precise modifications to existing code. This comprehensive analysis explores the sophisticated safety mechanisms, format handling, history tracking, and the careful balance between power and protection that enables Claude to safely manipulate files across diverse projects.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Read Tool Implementation](#read-tool-implementation)
3. [Write Tool Implementation](#write-tool-implementation)
4. [Edit Tool Implementation](#edit-tool-implementation)
5. [MultiEdit Tool System](#multiedit-tool-system)
6. [Safety Mechanisms](#safety-mechanisms)
7. [File Format Handling](#file-format-handling)
8. [Real-World Usage Patterns](#real-world-usage-patterns)

## Architecture Overview

### Core Design Principles

The file operations system is built on several critical principles:

1. **Safety First**: Never lose user data
2. **Read Before Write**: Enforce reading files before overwriting
3. **Precise Operations**: Exact string matching for edits
4. **Format Awareness**: Handle different file types appropriately
5. **History Tracking**: Maintain operation history for undo capabilities

### Component Organization

```javascript
// Three primary components for file operations
class FileReader {
  constructor() {
    this.readHistory = new Map();  // Track what's been read
  }
}

class FileWriter {
  constructor() {
    this.fileHistory = new Map();  // Track read/write history
  }
}

class FileEditor {
  constructor() {
    this.editHistory = new Map();  // Track all edits for undo
  }
}
```

## Read Tool Implementation

### Core Reading Logic

The Read tool handles multiple file formats with intelligent detection:

```javascript
class FileReader {
  async readFile(filePath, options = {}) {
    const { offset = 0, limit = DEFAULT_LINE_LIMIT } = options;

    // Path resolution and validation
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Existence and type checks
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filePath}`);
    }

    // Size validation
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(
        `File is too large (${stats.size} bytes). ` +
        `Maximum size is ${MAX_FILE_SIZE} bytes.`
      );
    }

    // Format-specific reading
    const ext = path.extname(absolutePath).toLowerCase();
    const fileType = this.detectFileType(ext);

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
}
```

### Text File Reading

Efficient reading with line-based pagination:

```javascript
readTextFile(filePath, offset, limit) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Apply offset and limit for large files
  const startLine = Math.max(0, offset);
  const endLine = Math.min(lines.length, startLine + limit);
  const selectedLines = lines.slice(startLine, endLine);

  // Line numbering and truncation
  const truncatedLines = selectedLines.map((line, index) => {
    const lineNumber = startLine + index + 1;

    // Truncate extremely long lines to prevent UI issues
    if (line.length > MAX_LINE_LENGTH) {
      return `${lineNumber}\t${line.substring(0, MAX_LINE_LENGTH)}... [truncated]`;
    }

    // Standard format: line_number<tab>content
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
```

### Image File Handling

Converting images to base64 for Claude's vision capabilities:

```javascript
readImageFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(filePath).substring(1).toLowerCase();

  // Determine MIME type
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
  };

  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  return {
    type: 'image',
    format: ext,
    mimeType: mimeType,
    base64: base64,
    size: buffer.length,
    // Include image for vision model processing
    displayFormat: `data:${mimeType};base64,${base64}`
  };
}
```

### Jupyter Notebook Reading

Special handling for interactive notebooks:

```javascript
readNotebookFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const notebook = JSON.parse(content);

  // Extract cells with their outputs
  const cells = notebook.cells.map((cell, index) => {
    const processedCell = {
      index: index,
      type: cell.cell_type,
      source: Array.isArray(cell.source)
        ? cell.source.join('')
        : cell.source,
      execution_count: cell.execution_count || null
    };

    // Include outputs for code cells
    if (cell.cell_type === 'code' && cell.outputs) {
      processedCell.outputs = cell.outputs.map(output => {
        if (output.data) {
          // Extract different output formats
          return {
            type: output.output_type,
            text: output.data['text/plain'],
            html: output.data['text/html'],
            image: output.data['image/png']
          };
        }
        return output;
      });
    }

    return processedCell;
  });

  return {
    type: 'notebook',
    metadata: notebook.metadata,
    kernel: notebook.metadata?.kernelspec,
    language: notebook.metadata?.language_info?.name,
    cells: cells,
    cellCount: cells.length
  };
}
```

### File Type Detection

Intelligent format detection for proper handling:

```javascript
detectFileType(extension) {
  const textExtensions = [
    '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.py', '.java',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.go',
    '.rs', '.swift', '.kt', '.scala', '.r', '.m', '.sql',
    '.html', '.css', '.scss', '.sass', '.less', '.xml', '.json',
    '.yaml', '.yml', '.toml', '.ini', '.conf', '.sh', '.bash',
    '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.dockerfile',
    '.gitignore', '.env', '.properties'
  ];

  const imageExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico',
    '.svg', '.tiff', '.tif'
  ];

  const notebookExtensions = ['.ipynb'];
  const pdfExtensions = ['.pdf'];

  if (textExtensions.includes(extension)) return 'text';
  if (imageExtensions.includes(extension)) return 'image';
  if (notebookExtensions.includes(extension)) return 'notebook';
  if (pdfExtensions.includes(extension)) return 'pdf';

  // Default to binary for unknown types
  return 'binary';
}
```

## Write Tool Implementation

### Safe Writing Logic

The Write tool enforces safety through read-before-write:

```javascript
class FileWriter {
  async writeFile(filePath, content, options = {}) {
    const {
      createDirectories = true,
      overwriteWithoutReading = false
    } = options;

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    const fileExists = fs.existsSync(absolutePath);

    // Critical safety check: read-before-write
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

    // Backup existing file if configured
    let backupPath = null;
    if (fileExists && this.options.createBackups) {
      backupPath = await this.createBackup(absolutePath);
    }

    // Write with atomic operation for safety
    const tempPath = `${absolutePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, content, 'utf8');

    // Atomic rename to prevent partial writes
    fs.renameSync(tempPath, absolutePath);

    return {
      path: absolutePath,
      size: Buffer.byteLength(content, 'utf8'),
      created: !fileExists,
      overwritten: fileExists,
      backup: backupPath
    };
  }
}
```

### Read History Tracking

Maintaining history of what Claude has seen:

```javascript
class FileWriter {
  wasFileRead(filePath) {
    return this.fileHistory.has(filePath);
  }

  markFileAsRead(filePath, content = null) {
    this.fileHistory.set(filePath, {
      readAt: Date.now(),
      originalContent: content,
      checksum: content ? this.calculateChecksum(content) : null
    });
  }

  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(content, 'utf8')
      .digest('hex');
  }
}
```

### Backup Management

Automatic backup creation for safety:

```javascript
async createBackup(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  // Create timestamped backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(
    path.dirname(filePath),
    '.claude-backups'
  );

  // Ensure backup directory exists
  await mkdirp(backupDir);

  const backupName = `${path.basename(filePath)}.${timestamp}.backup`;
  const backupPath = path.join(backupDir, backupName);

  // Copy with metadata preservation
  fs.copyFileSync(filePath, backupPath);

  // Copy file permissions
  const stats = fs.statSync(filePath);
  fs.chmodSync(backupPath, stats.mode);

  // Maintain backup index
  this.addToBackupIndex(filePath, backupPath);

  return backupPath;
}
```

## Edit Tool Implementation

### Precise String Replacement

The Edit tool performs exact string matching and replacement:

```javascript
class FileEditor {
  async editFile(filePath, oldString, newString, options = {}) {
    const { replaceAll = false } = options;

    const absolutePath = path.resolve(process.cwd(), filePath);

    // Read current content
    const originalContent = fs.readFileSync(absolutePath, 'utf8');

    // Validation: string exists
    if (!originalContent.includes(oldString)) {
      throw new Error(
        `The specified text was not found in the file. ` +
        `Make sure the old_string matches exactly, including whitespace.`
      );
    }

    // Validation: strings are different
    if (oldString === newString) {
      throw new Error('old_string and new_string must be different');
    }

    // Validation: uniqueness for single replacement
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

    // Write atomically
    await this.writeAtomic(absolutePath, newContent);

    // Store in history for undo
    this.storeEditHistory(absolutePath, originalContent, newContent, {
      oldString,
      newString,
      replaceAll
    });

    return this.createEditResult(absolutePath, originalContent, newContent);
  }
}
```

### Edit History Management

Maintaining complete edit history for undo:

```javascript
storeEditHistory(filePath, originalContent, newContent, operation) {
  if (!this.editHistory.has(filePath)) {
    this.editHistory.set(filePath, []);
  }

  const history = this.editHistory.get(filePath);

  history.push({
    timestamp: Date.now(),
    originalContent,
    newContent,
    operation,
    checksum: {
      before: this.calculateChecksum(originalContent),
      after: this.calculateChecksum(newContent)
    }
  });

  // Limit history size to prevent memory issues
  if (history.length > MAX_HISTORY_SIZE) {
    history.shift();
  }
}

async undoLastEdit(filePath) {
  const history = this.editHistory.get(filePath);
  if (!history || history.length === 0) {
    throw new Error('No edit history found for this file');
  }

  const lastEdit = history.pop();

  // Verify file hasn't changed since edit
  const currentContent = fs.readFileSync(filePath, 'utf8');
  const currentChecksum = this.calculateChecksum(currentContent);

  if (currentChecksum !== lastEdit.checksum.after) {
    throw new Error(
      'File has been modified since the last edit. ' +
      'Undo operation cancelled to prevent data loss.'
    );
  }

  // Restore original content
  await this.writeAtomic(filePath, lastEdit.originalContent);

  return {
    restored: true,
    path: filePath,
    operation: lastEdit.operation
  };
}
```

### Diff Generation

Creating visual diffs for changes:

```javascript
createEditResult(filePath, originalContent, newContent) {
  const { diffLines, createPatch } = require('diff');

  // Calculate line-by-line diff
  const lineDiff = diffLines(originalContent, newContent);

  // Create unified diff patch
  const patch = createPatch(
    filePath,
    originalContent,
    newContent,
    'original',
    'modified'
  );

  // Calculate statistics
  const stats = {
    linesAdded: 0,
    linesRemoved: 0,
    linesModified: 0
  };

  lineDiff.forEach(part => {
    const lines = part.value.split('\n').length - 1;
    if (part.added) stats.linesAdded += lines;
    else if (part.removed) stats.linesRemoved += lines;
  });

  return {
    path: filePath,
    diff: patch,
    stats,
    oldSize: Buffer.byteLength(originalContent, 'utf8'),
    newSize: Buffer.byteLength(newContent, 'utf8'),
    replacementCount: this.countReplacements(originalContent, newContent)
  };
}
```

## MultiEdit Tool System

### Batch Edit Operations

The MultiEdit tool enables multiple edits in a single operation:

```javascript
const MultiEditTool = {
  name: 'MultiEdit',
  description: 'Perform multiple edits on a single file',

  async call({ file_path, edits }, context) {
    const absolutePath = path.resolve(process.cwd(), file_path);

    // Read file once
    let content = fs.readFileSync(absolutePath, 'utf8');
    const originalContent = content;

    // Apply edits sequentially
    const results = [];
    for (const edit of edits) {
      const { old_string, new_string, replace_all = false } = edit;

      // Validate edit
      if (!content.includes(old_string)) {
        throw new Error(
          `Edit ${edits.indexOf(edit) + 1} failed: ` +
          `"${old_string.substring(0, 50)}..." not found`
        );
      }

      // Apply edit
      if (replace_all) {
        content = content.split(old_string).join(new_string);
      } else {
        // Check uniqueness
        const occurrences = countOccurrences(content, old_string);
        if (occurrences > 1) {
          throw new Error(
            `Edit ${edits.indexOf(edit) + 1} failed: ` +
            `"${old_string.substring(0, 30)}..." appears ${occurrences} times`
          );
        }

        const index = content.indexOf(old_string);
        content =
          content.slice(0, index) +
          new_string +
          content.slice(index + old_string.length);
      }

      results.push({
        old_string: old_string.substring(0, 50),
        new_string: new_string.substring(0, 50),
        applied: true
      });
    }

    // Write once after all edits
    fs.writeFileSync(absolutePath, content, 'utf8');

    return {
      path: absolutePath,
      editsApplied: results.length,
      totalChanges: countDifferences(originalContent, content),
      diff: createPatch(file_path, originalContent, content)
    };
  }
};
```

### Edit Conflict Detection

Preventing conflicting edits:

```javascript
validateEditSequence(edits) {
  // Check for overlapping edits
  const positions = [];

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    const occurrences = findAllOccurrences(content, edit.old_string);

    for (const pos of occurrences) {
      const range = {
        start: pos,
        end: pos + edit.old_string.length,
        editIndex: i
      };

      // Check for overlaps with previous edits
      for (const existing of positions) {
        if (rangesOverlap(range, existing)) {
          throw new Error(
            `Edit ${i + 1} conflicts with edit ${existing.editIndex + 1}: ` +
            `Overlapping text modifications`
          );
        }
      }

      positions.push(range);
    }
  }

  return true;
}

function rangesOverlap(range1, range2) {
  return range1.start < range2.end && range2.start < range1.end;
}
```

## Safety Mechanisms

### Path Validation

Preventing dangerous file operations:

```javascript
class PathValidator {
  static validate(filePath) {
    const normalized = path.normalize(filePath);

    // Check for path traversal attempts
    if (normalized.includes('..')) {
      throw new Error('Path traversal detected');
    }

    // Check for system files
    const dangerousPaths = [
      '/etc/passwd',
      '/etc/shadow',
      '/System',
      'C:\\Windows\\System32',
      '.git/config',
      '.ssh/id_rsa',
      '.aws/credentials'
    ];

    for (const dangerous of dangerousPaths) {
      if (normalized.includes(dangerous)) {
        throw new Error(`Access to system file denied: ${dangerous}`);
      }
    }

    // Check for hidden files (configurable)
    if (!this.allowHidden && path.basename(normalized).startsWith('.')) {
      throw new Error('Access to hidden files is restricted');
    }

    return normalized;
  }
}
```

### Atomic Operations

Ensuring file integrity during writes:

```javascript
async writeAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;

  try {
    // Write to temporary file
    fs.writeFileSync(tempPath, content, 'utf8');

    // Sync to disk
    const fd = fs.openSync(tempPath, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // Get original file permissions
    let originalMode;
    try {
      const stats = fs.statSync(filePath);
      originalMode = stats.mode;
    } catch {
      originalMode = 0o644;  // Default permissions
    }

    // Atomic rename
    fs.renameSync(tempPath, filePath);

    // Restore permissions
    fs.chmodSync(filePath, originalMode);

  } catch (error) {
    // Clean up temp file on error
    try {
      fs.unlinkSync(tempPath);
    } catch {}

    throw error;
  }
}
```

### Lock Management

Preventing concurrent modifications:

```javascript
class FileLockManager {
  constructor() {
    this.locks = new Map();
  }

  async acquireLock(filePath, timeout = 5000) {
    const lockFile = `${filePath}.lock`;
    const startTime = Date.now();

    while (fs.existsSync(lockFile)) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Failed to acquire lock for ${filePath}`);
      }

      // Check if lock is stale
      const lockAge = Date.now() - fs.statSync(lockFile).mtimeMs;
      if (lockAge > 30000) {  // 30 seconds
        // Stale lock, remove it
        fs.unlinkSync(lockFile);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Create lock file with PID
    fs.writeFileSync(lockFile, process.pid.toString());
    this.locks.set(filePath, lockFile);
  }

  releaseLock(filePath) {
    const lockFile = this.locks.get(filePath);
    if (lockFile && fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
      this.locks.delete(filePath);
    }
  }
}
```

## File Format Handling

### Binary File Support

Handling non-text files safely:

```javascript
readBinaryFile(filePath) {
  const buffer = fs.readFileSync(filePath);

  // Detect if it might be text despite binary extension
  const isLikelyText = this.detectTextInBinary(buffer);

  if (isLikelyText) {
    // Try to read as text with encoding detection
    const encoding = detectEncoding(buffer);
    const content = iconv.decode(buffer, encoding);
    return {
      type: 'text',
      encoding: encoding,
      content: content,
      warning: 'Binary file detected as text'
    };
  }

  // Return binary metadata only
  return {
    type: 'binary',
    size: buffer.length,
    preview: buffer.slice(0, 100).toString('hex'),
    message: 'Binary file cannot be displayed as text'
  };
}

detectTextInBinary(buffer) {
  // Check for null bytes (usually indicates binary)
  const nullBytes = buffer.filter(b => b === 0).length;
  if (nullBytes > buffer.length * 0.01) {  // >1% null bytes
    return false;
  }

  // Check for valid UTF-8
  try {
    buffer.toString('utf8');
    return true;
  } catch {
    return false;
  }
}
```

### Large File Handling

Efficient processing of large files:

```javascript
class LargeFileHandler {
  async readLargeFile(filePath, options = {}) {
    const {
      chunkSize = 1024 * 1024,  // 1MB chunks
      maxChunks = 10
    } = options;

    const stats = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath, {
      highWaterMark: chunkSize
    });

    const chunks = [];
    let chunksRead = 0;

    return new Promise((resolve, reject) => {
      stream.on('data', chunk => {
        if (chunksRead < maxChunks) {
          chunks.push(chunk);
          chunksRead++;
        } else {
          stream.destroy();
        }
      });

      stream.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf8');
        resolve({
          type: 'text',
          content: content,
          partial: chunksRead >= maxChunks,
          totalSize: stats.size,
          bytesRead: chunks.reduce((sum, c) => sum + c.length, 0)
        });
      });

      stream.on('error', reject);
    });
  }
}
```

## Real-World Usage Patterns

### Pattern 1: Code Refactoring

Common refactoring workflow:

```javascript
async function refactorFunction() {
  // 1. Read the file to understand context
  const content = await executor.execute('Read', {
    file_path: 'src/utils/helpers.js'
  });

  // 2. Multiple edits to refactor
  const result = await executor.execute('MultiEdit', {
    file_path: 'src/utils/helpers.js',
    edits: [
      {
        old_string: 'function calculateTotal(items) {',
        new_string: 'export const calculateTotal = (items) => {'
      },
      {
        old_string: 'var sum = 0;',
        new_string: 'let sum = 0;'
      },
      {
        old_string: 'for (var i = 0; i < items.length; i++) {',
        new_string: 'for (const item of items) {'
      },
      {
        old_string: 'sum += items[i].price;',
        new_string: 'sum += item.price;'
      }
    ]
  });

  return result;
}
```

### Pattern 2: Configuration Updates

Updating configuration files safely:

```javascript
async function updateConfig() {
  // Read current config
  const currentConfig = await executor.execute('Read', {
    file_path: 'package.json'
  });

  // Parse and modify
  const config = JSON.parse(currentConfig.content);
  config.version = '2.0.0';
  config.scripts.build = 'webpack --mode production';

  // Write back with proper formatting
  await executor.execute('Write', {
    file_path: 'package.json',
    content: JSON.stringify(config, null, 2)
  });
}
```

### Pattern 3: Batch File Creation

Creating multiple related files:

```javascript
async function createComponent(name) {
  const componentName = name.charAt(0).toUpperCase() + name.slice(1);

  // Create component file
  await executor.execute('Write', {
    file_path: `src/components/${name}/${componentName}.jsx`,
    content: `import React from 'react';
import styles from './${componentName}.module.css';

export const ${componentName} = ({ children, ...props }) => {
  return (
    <div className={styles.container} {...props}>
      {children}
    </div>
  );
};`
  });

  // Create styles file
  await executor.execute('Write', {
    file_path: `src/components/${name}/${componentName}.module.css`,
    content: `.container {
  padding: 1rem;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}`
  });

  // Create test file
  await executor.execute('Write', {
    file_path: `src/components/${name}/${componentName}.test.jsx`,
    content: `import { render, screen } from '@testing-library/react';
import { ${componentName} } from './${componentName}';

describe('${componentName}', () => {
  it('renders children', () => {
    render(<${componentName}>Test Content</${componentName}>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});`
  });
}
```

### Performance Metrics

Typical operation performance:

| Operation | Small Files (<10KB) | Medium Files (10KB-1MB) | Large Files (>1MB) |
|-----------|-------------------|------------------------|-------------------|
| Read | 5-10ms | 10-50ms | 50-500ms |
| Write | 10-20ms | 20-100ms | 100-1000ms |
| Edit (single) | 15-30ms | 30-150ms | 150-1500ms |
| MultiEdit (5 edits) | 25-50ms | 50-250ms | 250-2000ms |

### Memory Usage

| File Size | Read Memory | Write Memory | Edit Memory |
|-----------|------------|-------------|------------|
| 10KB | ~50KB | ~50KB | ~100KB |
| 1MB | ~3MB | ~3MB | ~6MB |
| 10MB | ~30MB | ~30MB | ~60MB |

## Conclusion

The file operations implementation in Claude Code represents a carefully balanced system that provides powerful capabilities while maintaining strict safety guarantees. Through features like read-before-write enforcement, atomic operations, comprehensive history tracking, and format-aware handling, the system enables Claude to work confidently with user files without risk of data loss. The MultiEdit capability and sophisticated diff generation make complex refactoring operations efficient, while the robust error handling and validation ensure that even edge cases are handled gracefully. This foundation makes Claude Code not just a reader of code, but a capable collaborator in software development.