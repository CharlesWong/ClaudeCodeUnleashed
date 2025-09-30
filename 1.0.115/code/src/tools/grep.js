/**
 * Grep Tool
 * Advanced file searching using ripgrep
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const MAX_RESULTS = 10000;
const DEFAULT_CONTEXT_LINES = 2;

/**
 * Grep tool definition
 */
const GrepTool = {
  name: 'Grep',
  description: 'Search for patterns in files using ripgrep',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regex pattern to search for'
      },
      path: {
        type: 'string',
        description: 'Directory or file to search in'
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.js")'
      },
      type: {
        type: 'string',
        description: 'File type to search (e.g., "js", "py", "rust")'
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output mode: content shows matching lines, files_with_matches shows only file paths, count shows match counts'
      },
      '-i': {
        type: 'boolean',
        description: 'Case insensitive search'
      },
      '-n': {
        type: 'boolean',
        description: 'Show line numbers'
      },
      '-B': {
        type: 'number',
        description: 'Lines to show before match'
      },
      '-A': {
        type: 'number',
        description: 'Lines to show after match'
      },
      '-C': {
        type: 'number',
        description: 'Lines to show before and after match'
      },
      multiline: {
        type: 'boolean',
        description: 'Enable multiline mode'
      },
      head_limit: {
        type: 'number',
        description: 'Limit output to first N results'
      }
    },
    required: ['pattern']
  },

  async validateInput({ pattern, path: searchPath }) {
    if (!pattern) {
      return {
        result: false,
        errorMessage: 'Pattern is required'
      };
    }

    // Validate path if provided
    if (searchPath) {
      const resolvedPath = path.isAbsolute(searchPath)
        ? searchPath
        : path.resolve(process.cwd(), searchPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          result: false,
          errorMessage: `Path does not exist: ${searchPath}`
        };
      }
    }

    return { result: true };
  },

  async *call(input, context) {
    const {
      pattern,
      path: searchPath,
      glob: globPattern,
      type: fileType,
      output_mode = 'files_with_matches',
      '-i': caseInsensitive,
      '-n': showLineNumbers,
      '-B': beforeContext,
      '-A': afterContext,
      '-C': surroundingContext,
      multiline,
      head_limit
    } = input;

    const resolvedPath = searchPath
      ? path.isAbsolute(searchPath)
        ? searchPath
        : path.resolve(process.cwd(), searchPath)
      : process.cwd();

    // Build ripgrep arguments
    const args = ['--hidden', '--no-ignore-vcs'];

    // Add output mode flags
    switch (output_mode) {
      case 'files_with_matches':
        args.push('-l');
        break;
      case 'count':
        args.push('-c');
        break;
      case 'content':
        // Default behavior
        break;
    }

    // Add search options
    if (caseInsensitive) args.push('-i');
    if (showLineNumbers && output_mode === 'content') args.push('-n');
    if (multiline) args.push('-U', '--multiline-dotall');

    // Add context lines
    if (output_mode === 'content') {
      if (surroundingContext !== undefined) {
        args.push('-C', surroundingContext.toString());
      } else {
        if (beforeContext !== undefined) {
          args.push('-B', beforeContext.toString());
        }
        if (afterContext !== undefined) {
          args.push('-A', afterContext.toString());
        }
      }
    }

    // Add file filters
    if (fileType) {
      args.push('--type', fileType);
    }

    if (globPattern) {
      // Parse glob pattern (support multiple patterns)
      const patterns = globPattern.split(/\s+/);
      for (const p of patterns) {
        args.push('--glob', p);
      }
    }

    // Add exclusions from context
    const excludedPaths = getExcludedPaths(context);
    for (const excluded of excludedPaths) {
      args.push('--glob', `!${excluded}`);
    }

    // Add pattern
    if (pattern.startsWith('-')) {
      args.push('-e', pattern);
    } else {
      args.push(pattern);
    }

    // Add search path
    args.push(resolvedPath);

    // Execute ripgrep
    try {
      const results = await executeRipgrep(args, context.abortController.signal);

      // Process results based on output mode
      if (output_mode === 'content') {
        const lines = results.split('\n').filter(Boolean);
        const limited = head_limit ? lines.slice(0, head_limit) : lines;

        yield {
          type: 'result',
          data: {
            mode: 'content',
            content: limited.join('\n'),
            numLines: limited.length,
            truncated: head_limit && lines.length > head_limit
          }
        };
      } else if (output_mode === 'count') {
        const lines = results.split('\n').filter(Boolean);
        const limited = head_limit ? lines.slice(0, head_limit) : lines;

        let totalMatches = 0;
        let fileCount = 0;

        for (const line of limited) {
          const colonIndex = line.lastIndexOf(':');
          if (colonIndex > 0) {
            const count = parseInt(line.substring(colonIndex + 1));
            if (!isNaN(count)) {
              totalMatches += count;
              fileCount++;
            }
          }
        }

        yield {
          type: 'result',
          data: {
            mode: 'count',
            content: limited.join('\n'),
            numMatches: totalMatches,
            numFiles: fileCount
          }
        };
      } else {
        // files_with_matches mode
        const files = results.split('\n').filter(Boolean);

        // Sort files by modification time
        const fileStats = await Promise.all(
          files.map(async (file) => {
            try {
              const stat = await fs.promises.stat(file);
              return { file, mtime: stat.mtime };
            } catch {
              return { file, mtime: new Date(0) };
            }
          })
        );

        const sorted = fileStats
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
          .map(({ file }) => file);

        const limited = head_limit ? sorted.slice(0, head_limit) : sorted;

        yield {
          type: 'result',
          data: {
            mode: 'files_with_matches',
            content: limited.join('\n'),
            numFiles: limited.length,
            truncated: head_limit && sorted.length > head_limit
          }
        };
      }
    } catch (error) {
      throw new Error(`Grep failed: ${error.message}`);
    }
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    let content = '';

    switch (data.mode) {
      case 'content':
        content = data.content || 'No matches found';
        if (data.truncated) {
          content += '\n\n[Results truncated]';
        }
        break;

      case 'count':
        content = `Found ${data.numMatches} match${data.numMatches !== 1 ? 'es' : ''} in ${data.numFiles} file${data.numFiles !== 1 ? 's' : ''}`;
        if (data.content) {
          content += '\n\n' + data.content;
        }
        break;

      case 'files_with_matches':
        content = `Found matches in ${data.numFiles} file${data.numFiles !== 1 ? 's' : ''}`;
        if (data.content) {
          content += ':\n' + data.content;
        }
        if (data.truncated) {
          content += '\n\n[Results truncated]';
        }
        break;
    }

    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content
    };
  },

  isEnabled() {
    // Check if ripgrep is available
    try {
      const result = spawn('rg', ['--version'], { stdio: 'pipe' });
      return new Promise((resolve) => {
        result.on('close', (code) => {
          resolve(code === 0);
        });
        result.on('error', () => {
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  },

  isConcurrencySafe() {
    return true;
  },

  isReadOnly() {
    return true;
  }
};

/**
 * Execute ripgrep command
 */
async function executeRipgrep(args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn('rg', args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
      signal
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 || code === 1) {
        // Code 1 means no matches found, which is OK
        resolve(stdout);
      } else {
        reject(new Error(stderr || `ripgrep exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Get excluded paths from context
 */
function getExcludedPaths(context) {
  const excluded = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    'target',
    '.next',
    '.nuxt',
    '.cache',
    'coverage',
    '.nyc_output',
    '.pytest_cache',
    '__pycache__',
    '.venv',
    'venv',
    '.env'
  ];

  // Add paths from context if available
  if (context?.toolPermissionContext?.excludedPaths) {
    excluded.push(...context.toolPermissionContext.excludedPaths);
  }

  // Add paths from .claudeignore if exists
  const claudeignorePath = path.join(process.cwd(), '.claudeignore');
  if (fs.existsSync(claudeignorePath)) {
    try {
      const content = fs.readFileSync(claudeignorePath, 'utf8');
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      excluded.push(...lines);
    } catch {}
  }

  return [...new Set(excluded)];
}

export {
  GrepTool,
  executeRipgrep,
  getExcludedPaths
};