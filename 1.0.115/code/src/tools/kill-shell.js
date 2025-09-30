/**
 * Kill Shell Tool
 * Terminate running background bash shells
 */

// Input schema for KillShell
const killShellSchema = {
  type: 'object',
  properties: {
    shell_id: {
      type: 'string',
      description: 'The ID of the shell to kill'
    }
  },
  required: ['shell_id']
};

/**
 * Kill a background task
 */
function killBackgroundTask(shell) {
  if (!shell) return null;

  // Mark shell as killed
  const killedShell = {
    ...shell,
    status: 'killed',
    endTime: Date.now(),
    result: {
      code: -1,
      signal: 'SIGKILL'
    }
  };

  // Terminate the actual process if it exists
  if (shell.process) {
    try {
      if (typeof shell.process.kill === 'function') {
        shell.process.kill('SIGKILL');
      } else if (shell.process.pid) {
        process.kill(shell.process.pid, 'SIGKILL');
      }
    } catch (error) {
      console.error(`Error killing process ${shell.id}:`, error);
    }
  }

  return killedShell;
}

/**
 * Kill shell prompt
 */
const killShellPrompt = `Use this tool to kill a running background bash shell.
You can find running shells by checking the background tasks.`;

/**
 * KillShell tool definition
 */
const KillShellTool = {
  name: 'KillShell',
  description: 'Kill a running background bash shell',
  inputSchema: killShellSchema,

  async validateInput({ shell_id }) {
    if (!shell_id) {
      return {
        result: false,
        errorMessage: 'shell_id is required'
      };
    }

    // Shell existence will be checked in the call method
    return { result: true };
  },

  async checkPermissions(input) {
    return {
      behavior: 'allow',
      updatedInput: input
    };
  },

  async *call({ shell_id }, context) {
    const appState = await context.getAppState();
    const shell = appState.backgroundTasks?.[shell_id];

    if (!shell) {
      throw new Error(`Shell ${shell_id} not found`);
    }

    if (shell.status !== 'running') {
      throw new Error(`Shell ${shell_id} is not running (status: ${shell.status})`);
    }

    const killedShell = killBackgroundTask(shell);

    // Update app state with killed shell
    await context.setAppState((state) => ({
      ...state,
      backgroundTasks: {
        ...state.backgroundTasks,
        [shell_id]: killedShell
      }
    }));

    // Track event if tracking is available
    if (global.trackEvent) {
      global.trackEvent('shell_killed', { shell_id });
    }

    yield {
      type: 'result',
      data: {
        success: true,
        shell_id: shell_id,
        command: shell.command,
        duration: killedShell.endTime - shell.startTime
      }
    };
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    const lines = [
      `Successfully killed shell ${data.shell_id}`,
      `Command: ${data.command}`,
      `Duration: ${Math.round(data.duration / 1000)}s`
    ];

    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: lines.join('\n')
    };
  },

  async prompt() {
    return killShellPrompt;
  },

  userFacingName() {
    return 'Kill Shell';
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
  KillShellTool,
  killBackgroundTask,
  killShellPrompt
};