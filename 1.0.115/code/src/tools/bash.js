/**
 * Bash Tool
 * Execute bash commands with optional background execution
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import CircularBuffer from '../utils/circular-buffer.js';
import { parseCommand } from '../utils/command-parser.js';

const DEFAULT_TIMEOUT = 120000; // 2 minutes
const MAX_TIMEOUT = 600000; // 10 minutes
const MAX_OUTPUT_SIZE = 4 * 1024 * 1024; // 4MB

class BashExecutor {
  constructor() {
    this.processes = new Map();
    this.backgroundTasks = new Map();
  }

  /**
   * Execute bash command
   */
  async execute(command, options = {}) {
    const {
      timeout = DEFAULT_TIMEOUT,
      runInBackground = false,
      cwd = process.cwd(),
      signal
    } = options;

    if (runInBackground) {
      return this.executeInBackground(command, options);
    }

    return this.executeForeground(command, { ...options, timeout });
  }

  /**
   * Execute command in foreground
   */
  async executeForeground(command, options) {
    const { timeout, cwd, signal } = options;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const childProcess = spawn('bash', ['-c', command], {
        cwd,
        env: { ...process.env },
        shell: false
      });

      const stdout = new CircularBuffer(MAX_OUTPUT_SIZE);
      const stderr = new CircularBuffer(MAX_OUTPUT_SIZE);

      let timeoutId;
      let killed = false;

      // Set timeout
      if (timeout && timeout > 0) {
        timeoutId = setTimeout(() => {
          killed = true;
          childProcess.kill('SIGTERM');
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }, timeout);
      }

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          killed = true;
          childProcess.kill('SIGTERM');
        });
      }

      // Collect output
      childProcess.stdout.on('data', (data) => {
        stdout.write(data);
      });

      childProcess.stderr.on('data', (data) => {
        stderr.write(data);
      });

      // Handle completion
      childProcess.on('close', (code, signal) => {
        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;
        const result = {
          code,
          signal,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          duration,
          killed,
          timedOut: killed && duration >= timeout
        };

        resolve(result);
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      this.processes.set(childProcess.pid, childProcess);
    });
  }

  /**
   * Execute command in background
   */
  executeInBackground(command, options = {}) {
    const taskId = randomUUID();
    const { cwd = process.cwd() } = options;

    const childProcess = spawn('bash', ['-c', command], {
      cwd,
      env: { ...process.env },
      shell: false,
      detached: false
    });

    const task = {
      id: taskId,
      command,
      status: 'running',
      process: childProcess,
      stdout: new CircularBuffer(MAX_OUTPUT_SIZE),
      stderr: new CircularBuffer(MAX_OUTPUT_SIZE),
      startTime: Date.now(),
      result: null
    };

    // Collect output
    childProcess.stdout.on('data', (data) => {
      task.stdout.write(data);
    });

    childProcess.stderr.on('data', (data) => {
      task.stderr.write(data);
    });

    // Handle completion
    childProcess.on('close', (code, signal) => {
      task.status = 'completed';
      task.result = {
        code,
        signal,
        duration: Date.now() - task.startTime
      };
      task.process = null;
    });

    childProcess.on('error', (error) => {
      task.status = 'failed';
      task.result = {
        error: error.message
      };
      task.process = null;
    });

    this.backgroundTasks.set(taskId, task);
    this.processes.set(childProcess.pid, childProcess);

    return {
      taskId,
      message: `Started background task: ${taskId}`
    };
  }

  /**
   * Get background task status
   */
  getBackgroundTask(taskId) {
    const task = this.backgroundTasks.get(taskId);
    if (!task) return null;

    return {
      id: task.id,
      command: task.command,
      status: task.status,
      stdout: task.stdout.toString(),
      stderr: task.stderr.toString(),
      result: task.result,
      duration: task.result?.duration || (Date.now() - task.startTime)
    };
  }

  /**
   * Kill background task
   */
  killBackgroundTask(taskId) {
    const task = this.backgroundTasks.get(taskId);
    if (!task || task.status !== 'running') {
      return false;
    }

    if (task.process) {
      task.process.kill('SIGTERM');
      setTimeout(() => {
        if (task.process && !task.process.killed) {
          task.process.kill('SIGKILL');
        }
      }, 5000);

      task.status = 'killed';
      task.result = {
        killed: true,
        duration: Date.now() - task.startTime
      };
      task.process = null;
    }

    return true;
  }

  /**
   * List background tasks
   */
  listBackgroundTasks() {
    const tasks = [];
    for (const [id, task] of this.backgroundTasks) {
      tasks.push({
        id: task.id,
        command: task.command.substring(0, 50) + (task.command.length > 50 ? '...' : ''),
        status: task.status,
        duration: task.result?.duration || (Date.now() - task.startTime)
      });
    }
    return tasks;
  }

  /**
   * Cleanup completed tasks
   */
  cleanupCompletedTasks(maxAge = 3600000) { // 1 hour
    const now = Date.now();
    const toDelete = [];

    for (const [id, task] of this.backgroundTasks) {
      if (task.status !== 'running') {
        const age = now - (task.startTime + (task.result?.duration || 0));
        if (age > maxAge) {
          toDelete.push(id);
        }
      }
    }

    for (const id of toDelete) {
      this.backgroundTasks.delete(id);
    }

    return toDelete.length;
  }
}

// Singleton instance
const bashExecutor = new BashExecutor();

/**
 * Bash tool definition
 */
const BashTool = {
  name: 'Bash',
  description: 'Execute bash commands',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (max 600000)'
      },
      run_in_background: {
        type: 'boolean',
        description: 'Run command in background'
      }
    },
    required: ['command']
  },

  async validateInput({ command, timeout }) {
    if (!command || typeof command !== 'string') {
      return {
        result: false,
        errorMessage: 'Command is required and must be a string'
      };
    }

    if (timeout !== undefined) {
      if (typeof timeout !== 'number' || timeout < 0 || timeout > MAX_TIMEOUT) {
        return {
          result: false,
          errorMessage: `Timeout must be between 0 and ${MAX_TIMEOUT} milliseconds`
        };
      }
    }

    // Check for dangerous commands
    const dangerous = [
      'rm -rf /',
      'dd if=/dev/zero of=',
      'fork bomb',
      ':(){ :|:& };:'
    ];

    const lowerCommand = command.toLowerCase();
    for (const pattern of dangerous) {
      if (lowerCommand.includes(pattern)) {
        return {
          result: false,
          errorMessage: 'This command appears to be dangerous and has been blocked'
        };
      }
    }

    return { result: true };
  },

  async *call({ command, timeout, run_in_background }, context) {
    const { abortController } = context;

    try {
      const result = await bashExecutor.execute(command, {
        timeout,
        runInBackground: run_in_background,
        signal: abortController.signal
      });

      if (run_in_background) {
        yield {
          type: 'result',
          data: {
            taskId: result.taskId,
            message: result.message,
            command
          }
        };
      } else {
        yield {
          type: 'result',
          data: {
            code: result.code,
            stdout: result.stdout,
            stderr: result.stderr,
            duration: result.duration,
            timedOut: result.timedOut,
            command
          }
        };
      }
    } catch (error) {
      throw new Error(`Bash command failed: ${error.message}`);
    }
  },

  isEnabled() {
    return true;
  },

  isConcurrencySafe() {
    return true;
  },

  isReadOnly() {
    return false;
  }
};

export {
  BashTool,
  bashExecutor,
  BashExecutor
};