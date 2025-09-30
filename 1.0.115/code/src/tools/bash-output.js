/**
 * Bash Output Tool
 * Retrieve output from running background bash shells
 */

// Input schema for BashOutput
const bashOutputSchema = {
  type: 'object',
  properties: {
    bash_id: {
      type: 'string',
      description: 'The ID of the background shell to retrieve output from'
    },
    filter: {
      type: 'string',
      description: 'Optional regex to filter output lines'
    }
  },
  required: ['bash_id']
};

/**
 * Get shell output
 */
function getShellOutput(shell) {
  if (!shell || !shell.output) {
    return {
      stdout: '',
      stderr: ''
    };
  }

  return {
    stdout: shell.output.stdout || '',
    stderr: shell.output.stderr || ''
  };
}

/**
 * Apply output filter
 */
function applyOutputFilter(output, filter) {
  if (!filter) return output;

  try {
    const regex = new RegExp(filter, 'gm');
    const lines = output.split('\n');
    const filtered = lines.filter(line => regex.test(line));
    return filtered.join('\n');
  } catch {
    return output;
  }
}

/**
 * Format output for display
 */
function formatOutput(output) {
  if (!output) return '';

  // Ensure proper line endings
  return output.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Truncate output if too long
 */
function truncateOutput(output, maxLength = 30000) {
  if (output.length <= maxLength) {
    return {
      truncatedContent: output,
      wasTruncated: false
    };
  }

  const truncated = output.substring(0, maxLength);
  return {
    truncatedContent: truncated + '\n\n[Output truncated]',
    wasTruncated: true
  };
}

/**
 * BashOutput tool definition
 */
const BashOutputTool = {
  name: 'BashOutput',
  description: 'Retrieves output from a running or completed background bash shell',
  inputSchema: bashOutputSchema,

  async validateInput({ bash_id }, context) {
    if (!bash_id) {
      return {
        result: false,
        errorMessage: 'bash_id is required'
      };
    }

    // Check if shell exists
    const appState = await context?.getAppState?.();
    if (appState?.backgroundTasks && !appState.backgroundTasks[bash_id]) {
      return {
        result: false,
        errorMessage: `Shell ${bash_id} not found`
      };
    }

    return { result: true };
  },

  async *call({ bash_id, filter }, context) {
    const appState = await context.getAppState();
    const shell = appState.backgroundTasks?.[bash_id];

    if (!shell) {
      throw new Error(`Shell ${bash_id} not found`);
    }

    const output = getShellOutput(shell);
    const filteredStdout = applyOutputFilter(output.stdout, filter);
    const filteredStderr = applyOutputFilter(output.stderr, filter);

    const { truncatedContent: truncatedStdout } = truncateOutput(formatOutput(filteredStdout));
    const { truncatedContent: truncatedStderr } = truncateOutput(formatOutput(filteredStderr));

    const stdoutLines = output.stdout.split('\n').length;
    const stderrLines = output.stderr.split('\n').length;

    yield {
      type: 'result',
      data: {
        command: shell.command,
        status: shell.status || 'unknown',
        exitCode: shell.result?.code ?? null,
        stdout: truncatedStdout,
        stderr: truncatedStderr,
        stdoutLines: stdoutLines,
        stderrLines: stderrLines,
        timestamp: new Date().toISOString(),
        ...(filter && { filterPattern: filter })
      }
    };
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    const resultLines = [];

    resultLines.push(`<status>${data.status}</status>`);

    if (data.exitCode !== null && data.exitCode !== undefined) {
      resultLines.push(`<exit_code>${data.exitCode}</exit_code>`);
    }

    if (data.stdout?.trim()) {
      resultLines.push(`<stdout>\n${data.stdout.trimEnd()}\n</stdout>`);
    }

    if (data.stderr?.trim()) {
      resultLines.push(`<stderr>\n${data.stderr.trimEnd()}\n</stderr>`);
    }

    resultLines.push(`<timestamp>${data.timestamp}</timestamp>`);

    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: resultLines.join('\n\n')
    };
  },

  userFacingName() {
    return 'Bash Output';
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
  BashOutputTool,
  getShellOutput,
  applyOutputFilter,
  formatOutput,
  truncateOutput
};