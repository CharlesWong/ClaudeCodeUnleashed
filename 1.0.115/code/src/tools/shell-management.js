/**
 * Shell Management Tools for Claude Code
 * Background shell execution and output handling
 * Extracted from lines 43500-43613 and other sections
 */

import { EventEmitter } from 'events';
import { execSync, spawn } from 'child_process';

/**
 * KillShell Tool
 * Terminates a running background bash shell
 * Original: Referenced in tool list
 */
export const KillShellTool = {
  type: 'tool',
  name: 'KillShell',
  description: 'Kills a running background bash shell by its ID',

  inputSchema: {
    type: 'object',
    properties: {
      shell_id: {
        type: 'string',
        description: 'The ID of the background shell to kill'
      }
    },
    required: ['shell_id']
  },

  async call({ shell_id }, context) {
    const shell = getShellById(shell_id);

    if (!shell) {
      return {
        type: 'error',
        error: `Shell with ID ${shell_id} not found`
      };
    }

    try {
      await killShell(shell);

      return {
        type: 'text',
        text: `Successfully killed shell ${shell_id}`
      };
    } catch (error) {
      return {
        type: 'error',
        error: `Failed to kill shell: ${error.message}`
      };
    }
  },

  userFacingName() {
    return 'KillShell';
  }
};

/**
 * BashOutput Tool (CheckShellOutput)
 * Retrieves output from a running or completed background bash shell
 * Original: Referenced in tool list
 */
export const BashOutputTool = {
  type: 'tool',
  name: 'BashOutput',
  description: 'Retrieves output from a running or completed background bash shell',

  inputSchema: {
    type: 'object',
    properties: {
      bash_id: {
        type: 'string',
        description: 'The ID of the background shell to retrieve output from'
      },
      filter: {
        type: 'string',
        description: 'Optional regular expression to filter the output lines'
      }
    },
    required: ['bash_id']
  },

  async call({ bash_id, filter }, context) {
    const shell = getShellById(bash_id);

    if (!shell) {
      return {
        type: 'error',
        error: `Shell with ID ${bash_id} not found`
      };
    }

    try {
      const output = await getShellOutput(shell, filter);

      return {
        type: 'text',
        text: formatShellOutput(output)
      };
    } catch (error) {
      return {
        type: 'error',
        error: `Failed to get output: ${error.message}`
      };
    }
  },

  userFacingName() {
    return 'BashOutput';
  }
};

/**
 * Shell Session Display Component
 * Shows running shell session information
 * Original: lines 43484-43613
 */
export function ShellSessionDisplay({ shell, onKill, onCancel }) {
  const [updateCount, setUpdateCount] = useState(0);
  const [output, setOutput] = useState({
    stdout: '',
    stderr: '',
    stdoutLines: 0,
    stderrLines: 0
  });

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape || key.return || input === ' ') {
      onCancel();
    } else if (input === 'k' && shell.status === 'running' && onKill) {
      onKill();
    }
  });

  // Update output periodically
  useEffect(() => {
    const combineOutput = (existing, newOutput, maxLines = 10) => {
      if (!newOutput) return existing;

      const existingLines = existing.split('\n');
      const newLines = newOutput.split('\n');

      return [...existingLines, ...newLines]
        .slice(-maxLines)
        .join('\n');
    };

    const stdout = combineOutput(output.stdout, shell.stdout);
    const stderr = combineOutput(output.stderr, shell.stderr);

    const { totalLines: stdoutLines, truncatedContent: stdoutDisplay } = truncateOutput(stdout);
    const { totalLines: stderrLines, truncatedContent: stderrDisplay } = truncateOutput(stderr);

    setOutput({
      stdout: stdoutDisplay,
      stderr: stderrDisplay,
      stdoutLines,
      stderrLines
    });

    // Update timer for running shells
    if (shell.status === 'running') {
      const timer = setTimeout(() => {
        setUpdateCount(count => count + 1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [shell.id, shell.status, updateCount, output.stdout, output.stderr, shell]);

  const elapsedTime = () => {
    const elapsed = Math.floor((Date.now() - shell.startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed - hours * 3600) / 60);
    const seconds = elapsed - hours * 3600 - minutes * 60;

    return `${hours > 0 ? `${hours}h ` : ''}${minutes > 0 || hours > 0 ? `${minutes}m ` : ''}${seconds}s`;
  };

  return (
    <Box width="100%" flexDirection="column">
      <Box width="100%">
        <Box
          borderStyle="round"
          borderColor="background"
          flexDirection="column"
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
          width="100%"
        >
          <Box>
            <Text bold>Shell Session {shell.id}</Text>
          </Box>

          <Box flexDirection="column" marginTop={1}>
            <Text>
              Status:{' '}
              {shell.status === 'running' ? (
                <>
                  <Spinner type="dots" /> running ({elapsedTime()})
                </>
              ) : shell.status === 'completed' ? (
                <Text color="success">
                  {shell.status}
                  {shell.result?.code !== undefined && ` (exit code: ${shell.result.code})`}
                </Text>
              ) : (
                <Text color="error">
                  {shell.status}
                  {shell.result?.code !== undefined && ` (exit code: ${shell.result.code})`}
                </Text>
              )}
            </Text>

            <Text wrap="truncate-end">
              Command: {shell.command}
            </Text>
          </Box>

          {output.stdout && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Output:</Text>
              <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column" height={12}>
                {output.stdout.split('\n').slice(-10).map((line, i) => (
                  <Text key={i}>{line}</Text>
                ))}
              </Box>
              <Text dimColor italic>
                {output.stdoutLines > 10
                  ? `Showing last 10 lines of ${output.stdoutLines} total lines`
                  : `Showing ${output.stdoutLines} lines`}
              </Text>
            </Box>
          )}

          {output.stderr && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="error">Errors:</Text>
              <Box borderStyle="round" borderColor="error" paddingX={1} flexDirection="column" height={3}>
                {output.stderr.split('\n').slice(-1).map((line, i) => (
                  <Text key={i} color="error">{line}</Text>
                ))}
              </Box>
              <Text dimColor italic color="error">
                {output.stderrLines > 1
                  ? `Showing last line of ${output.stderrLines} total lines`
                  : `Showing ${output.stderrLines} line`}
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box marginLeft={2}>
        <Text dimColor>
          {shell.status === 'running'
            ? 'Press k to kill • Press Esc/Enter/Space to close'
            : 'Press Esc/Enter/Space to close'}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Shell Manager Class
 * Manages background shell sessions
 */
export class ShellManager {
  constructor() {
    this.shells = new Map();
    this.nextId = 1;
  }

  /**
   * Create a new shell session
   */
  createShell(command, options = {}) {
    const id = `shell_${this.nextId++}`;

    const shell = {
      id,
      command,
      status: 'running',
      startTime: Date.now(),
      stdout: '',
      stderr: '',
      process: null,
      result: null
    };

    // Spawn the process
    const proc = spawn('bash', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      detached: true
    });

    // Capture stdout
    proc.stdout.on('data', (data) => {
      shell.stdout += data.toString();
    });

    // Capture stderr
    proc.stderr.on('data', (data) => {
      shell.stderr += data.toString();
    });

    // Handle exit
    proc.on('exit', (code, signal) => {
      shell.status = code === 0 ? 'completed' : 'failed';
      shell.result = { code, signal };
    });

    // Handle error
    proc.on('error', (error) => {
      shell.status = 'failed';
      shell.stderr += `\nProcess error: ${error.message}`;
      shell.result = { error: error.message };
    });

    shell.process = proc;
    this.shells.set(id, shell);

    return shell;
  }

  /**
   * Get shell by ID
   */
  getShell(id) {
    return this.shells.get(id);
  }

  /**
   * Kill a shell
   */
  killShell(id) {
    const shell = this.shells.get(id);

    if (!shell) {
      throw new Error(`Shell ${id} not found`);
    }

    if (shell.process && shell.status === 'running') {
      // Try graceful shutdown first
      shell.process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (shell.status === 'running') {
          shell.process.kill('SIGKILL');
        }
      }, 5000);

      shell.status = 'killed';
      shell.result = { killed: true };
    }

    return shell;
  }

  /**
   * Get output from a shell
   */
  getOutput(id, filter) {
    const shell = this.shells.get(id);

    if (!shell) {
      throw new Error(`Shell ${id} not found`);
    }

    let stdout = shell.stdout;
    let stderr = shell.stderr;

    // Apply filter if provided
    if (filter) {
      const regex = new RegExp(filter);

      stdout = stdout
        .split('\n')
        .filter(line => regex.test(line))
        .join('\n');

      stderr = stderr
        .split('\n')
        .filter(line => regex.test(line))
        .join('\n');
    }

    return {
      stdout,
      stderr,
      status: shell.status,
      exitCode: shell.result?.code
    };
  }

  /**
   * List all shells
   */
  listShells() {
    return Array.from(this.shells.values()).map(shell => ({
      id: shell.id,
      command: shell.command,
      status: shell.status,
      startTime: shell.startTime,
      hasOutput: shell.stdout.length > 0 || shell.stderr.length > 0
    }));
  }

  /**
   * Clean up completed shells
   */
  cleanup(maxAge = 3600000) { // 1 hour default
    const now = Date.now();

    for (const [id, shell] of this.shells.entries()) {
      if (shell.status !== 'running' && now - shell.startTime > maxAge) {
        this.shells.delete(id);
      }
    }
  }
}

// Singleton instance
let shellManager = null;

export function getShellManager() {
  if (!shellManager) {
    shellManager = new ShellManager();
  }
  return shellManager;
}

// Helper functions
function getShellById(id) {
  return getShellManager().getShell(id);
}

async function killShell(shell) {
  return getShellManager().killShell(shell.id);
}

async function getShellOutput(shell, filter) {
  return getShellManager().getOutput(shell.id, filter);
}

function formatShellOutput(output) {
  let result = '';

  if (output.stdout) {
    result += `=== STDOUT ===\n${output.stdout}\n\n`;
  }

  if (output.stderr) {
    result += `=== STDERR ===\n${output.stderr}\n\n`;
  }

  result += `Status: ${output.status}`;

  if (output.exitCode !== undefined) {
    result += ` (exit code: ${output.exitCode})`;
  }

  return result;
}

function truncateOutput(content, maxLines = 100) {
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (totalLines > maxLines) {
    const truncatedContent = lines.slice(-maxLines).join('\n');
    return { totalLines, truncatedContent };
  }

  return { totalLines, truncatedContent: content };
}