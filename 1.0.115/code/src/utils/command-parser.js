/**
 * Command Parser Utilities
 * Parse and validate shell commands for Claude Code
 * Reconstructed from usage patterns
 */

/**
 * Parse a shell command into components
 * @param {string} command - The command to parse
 * @returns {Object} Parsed command object
 */
export function parseCommand(command) {
  if (!command || typeof command !== 'string') {
    return {
      executable: '',
      args: [],
      raw: command || ''
    };
  }

  // Trim and normalize whitespace
  const normalized = command.trim().replace(/\s+/g, ' ');

  // Handle quoted strings properly
  const parts = parseCommandWithQuotes(normalized);

  return {
    executable: parts[0] || '',
    args: parts.slice(1),
    raw: command
  };
}

/**
 * Parse command respecting quoted strings
 * @param {string} command - Command string
 * @returns {string[]} Array of command parts
 */
function parseCommandWithQuotes(command) {
  const parts = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Parse command arguments into options and values
 * @param {string[]} args - Array of arguments
 * @returns {Object} Parsed arguments with flags and values
 */
export function parseArguments(args) {
  const result = {
    flags: [],
    options: {},
    positional: [],
    raw: args
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Long option: --name=value or --name value
    if (arg.startsWith('--')) {
      const equalIndex = arg.indexOf('=');

      if (equalIndex > -1) {
        // --name=value format
        const key = arg.slice(2, equalIndex);
        const value = arg.slice(equalIndex + 1);
        result.options[key] = value;
      } else {
        // --name value format or boolean flag
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          result.options[key] = args[i + 1];
          i++;
        } else {
          result.flags.push(key);
        }
      }
    }
    // Short option: -n value or -abc
    else if (arg.startsWith('-') && arg.length > 1) {
      if (arg.length === 2) {
        // Single short option
        const key = arg[1];
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          result.options[key] = args[i + 1];
          i++;
        } else {
          result.flags.push(key);
        }
      } else {
        // Multiple short options: -abc
        for (let j = 1; j < arg.length; j++) {
          result.flags.push(arg[j]);
        }
      }
    }
    // Positional argument
    else {
      result.positional.push(arg);
    }

    i++;
  }

  return result;
}

/**
 * Split command by pipes, redirections, etc
 * @param {string} command - Full command string
 * @returns {Object} Command parts
 */
export function splitCommand(command) {
  const result = {
    commands: [],
    redirections: [],
    background: false
  };

  // Check for background execution
  if (command.endsWith('&')) {
    result.background = true;
    command = command.slice(0, -1).trim();
  }

  // Split by pipes
  const pipeParts = command.split('|').map(p => p.trim());

  for (const part of pipeParts) {
    // Check for redirections
    const redirectMatch = part.match(/(.*?)([<>]+)(.+)/);

    if (redirectMatch) {
      const [_, cmd, operator, target] = redirectMatch;
      result.commands.push(cmd.trim());
      result.redirections.push({
        operator,
        target: target.trim()
      });
    } else {
      result.commands.push(part);
    }
  }

  return result;
}

/**
 * Validate command for safety
 * @param {string} command - Command to validate
 * @returns {Object} Validation result
 */
export function validateCommand(command) {
  const dangerous = [
    'rm -rf /',
    'dd if=/dev/zero',
    'mkfs',
    'format',
    ':(){ :|:& };:',  // Fork bomb
    'chmod -R 777 /',
    'chown -R'
  ];

  const normalizedCmd = command.toLowerCase().replace(/\s+/g, ' ');

  for (const pattern of dangerous) {
    if (normalizedCmd.includes(pattern.toLowerCase())) {
      return {
        valid: false,
        reason: `Command contains potentially dangerous pattern: ${pattern}`
      };
    }
  }

  // Check for command injection attempts
  if (/[;&].*rm\s+-rf/.test(command)) {
    return {
      valid: false,
      reason: 'Command contains potentially dangerous rm -rf pattern'
    };
  }

  return {
    valid: true
  };
}

/**
 * Extract environment variables from command
 * @param {string} command - Command string
 * @returns {Object} Environment variables and clean command
 */
export function extractEnvVars(command) {
  const envVars = {};
  let cleanCommand = command;

  // Match VAR=value patterns at the beginning
  const envPattern = /^([A-Z_][A-Z0-9_]*)=([^\s]+)\s*/;
  let match;

  while ((match = envPattern.exec(cleanCommand))) {
    const [fullMatch, varName, value] = match;
    envVars[varName] = value.replace(/^["']|["']$/g, ''); // Remove quotes
    cleanCommand = cleanCommand.slice(fullMatch.length);
  }

  return {
    envVars,
    command: cleanCommand.trim()
  };
}

/**
 * Build command string from components
 * @param {string} executable - Command executable
 * @param {string[]} args - Command arguments
 * @param {Object} options - Additional options
 * @returns {string} Built command string
 */
export function buildCommand(executable, args = [], options = {}) {
  const parts = [executable];

  // Add options
  for (const [key, value] of Object.entries(options)) {
    if (key.length === 1) {
      // Short option
      if (value === true) {
        parts.push(`-${key}`);
      } else {
        parts.push(`-${key}`, String(value));
      }
    } else {
      // Long option
      if (value === true) {
        parts.push(`--${key}`);
      } else {
        parts.push(`--${key}=${value}`);
      }
    }
  }

  // Add positional arguments
  parts.push(...args.map(arg => {
    // Quote if contains spaces
    if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
      return `"${arg}"`;
    }
    return arg;
  }));

  return parts.join(' ');
}

/**
 * Parse shell-style arguments (like process.argv)
 * @param {string[]} argv - Array of arguments
 * @returns {Object} Parsed configuration
 */
export function parseShellArgs(argv) {
  const config = {
    command: null,
    flags: new Set(),
    options: new Map(),
    positional: []
  };

  // Skip first two args (node and script)
  const args = argv.slice(2);

  if (args.length > 0 && !args[0].startsWith('-')) {
    config.command = args[0];
    args.shift();
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--') {
      // Everything after -- is positional
      config.positional.push(...args.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        config.options.set(key, args[i + 1]);
        i++;
      } else {
        config.flags.add(key);
      }
    } else if (arg.startsWith('-')) {
      const flags = arg.slice(1).split('');
      flags.forEach(f => config.flags.add(f));
    } else {
      config.positional.push(arg);
    }
  }

  return config;
}

export default {
  parseCommand,
  parseArguments,
  splitCommand,
  validateCommand,
  extractEnvVars,
  buildCommand,
  parseShellArgs
};