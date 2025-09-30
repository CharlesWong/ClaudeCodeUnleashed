#!/usr/bin/env node

/**
 * Claude Code CLI Entry Point
 *
 * Main entry point for the Claude Code CLI application.
 * Handles command-line arguments, initialization, and startup.
 *
 * Extracted from claude-code-full-extract.js (lines ~48000-48400)
 * Part of the 95% → 98% extraction phase
 */

import { Command } from 'commander';
import { RuntimeInitializer } from '../runtime/runtime-initialization.js';
import { ConversationLoop } from '../conversation/conversation-loop.js';
import { UpdateManager } from '../update/update-system.js';
import { ConfigurationSystem } from '../config/configuration-system.js';
import chalk from 'chalk';
import { version } from '../../package.json';
import fs from 'fs/promises';
import path from 'path';

/**
 * Claude Code CLI
 * Main command-line interface
 */
export class ClaudeCodeCLI {
  constructor() {
    this.program = new Command();
    this.runtime = new RuntimeInitializer();
    this.setupCommands();
    this.setupOptions();
  }

  /**
   * Setup CLI commands
   */
  setupCommands() {
    this.program
      .name('claude')
      .description('Claude Code - AI-powered coding assistant')
      .version(version || '1.0.115');

    // Main conversation command (default)
    this.program
      .command('chat', { isDefault: true })
      .description('Start an interactive conversation with Claude')
      .option('-m, --model <model>', 'Model to use', 'claude-3-5-sonnet-20241022')
      .option('-t, --temperature <temp>', 'Temperature setting', parseFloat, 0)
      .option('--max-tokens <tokens>', 'Maximum tokens', parseInt, 4096)
      .option('--no-stream', 'Disable streaming responses')
      .action(async (options) => {
        await this.startConversation(options);
      });

    // Configuration command
    this.program
      .command('config')
      .description('Manage Claude Code configuration')
      .option('-l, --list', 'List all configuration')
      .option('-g, --get <key>', 'Get configuration value')
      .option('-s, --set <key=value>', 'Set configuration value')
      .option('-r, --reset', 'Reset to default configuration')
      .action(async (options) => {
        await this.manageConfig(options);
      });

    // Update command
    this.program
      .command('update')
      .description('Check for and install updates')
      .option('--check', 'Check for updates only')
      .option('--install', 'Install available updates')
      .option('--channel <channel>', 'Update channel (stable/beta/nightly)', 'stable')
      .action(async (options) => {
        await this.manageUpdates(options);
      });

    // MCP server command
    this.program
      .command('mcp')
      .description('Manage MCP servers')
      .option('-l, --list', 'List MCP servers')
      .option('-a, --add <name>', 'Add MCP server')
      .option('-r, --remove <name>', 'Remove MCP server')
      .option('-t, --test <name>', 'Test MCP server connection')
      .action(async (options) => {
        await this.manageMCP(options);
      });

    // Plugin command
    this.program
      .command('plugin')
      .description('Manage plugins')
      .option('-l, --list', 'List installed plugins')
      .option('-i, --install <name>', 'Install plugin')
      .option('-u, --uninstall <name>', 'Uninstall plugin')
      .option('-s, --search <query>', 'Search for plugins')
      .action(async (options) => {
        await this.managePlugins(options);
      });

    // Tools command
    this.program
      .command('tools')
      .description('Manage available tools')
      .option('-l, --list', 'List all tools')
      .option('-e, --enable <tool>', 'Enable a tool')
      .option('-d, --disable <tool>', 'Disable a tool')
      .option('--info <tool>', 'Show tool information')
      .action(async (options) => {
        await this.manageTools(options);
      });

    // Session command
    this.program
      .command('session')
      .description('Manage conversation sessions')
      .option('-l, --list', 'List sessions')
      .option('-r, --resume <id>', 'Resume a session')
      .option('-d, --delete <id>', 'Delete a session')
      .option('--export <id>', 'Export session history')
      .action(async (options) => {
        await this.manageSessions(options);
      });

    // Debug command
    this.program
      .command('debug')
      .description('Debug information and diagnostics')
      .option('--env', 'Show environment information')
      .option('--config', 'Show configuration')
      .option('--logs', 'Show recent logs')
      .option('--test', 'Run diagnostic tests')
      .action(async (options) => {
        await this.showDebugInfo(options);
      });

    // API command
    this.program
      .command('api')
      .description('Direct API interaction')
      .argument('<prompt>', 'Prompt to send to API')
      .option('-m, --model <model>', 'Model to use')
      .option('-j, --json', 'Output as JSON')
      .option('--no-stream', 'Disable streaming')
      .action(async (prompt, options) => {
        await this.callAPI(prompt, options);
      });

    // Init command
    this.program
      .command('init')
      .description('Initialize Claude Code in current directory')
      .option('--force', 'Force initialization')
      .action(async (options) => {
        await this.initializeProject(options);
      });
  }

  /**
   * Setup global options
   */
  setupOptions() {
    this.program
      .option('--api-key <key>', 'Anthropic API key')
      .option('--config-path <path>', 'Path to configuration file')
      .option('--no-color', 'Disable colored output')
      .option('--quiet', 'Suppress non-error output')
      .option('--verbose', 'Verbose output')
      .option('--debug', 'Debug mode')
      .option('--profile <profile>', 'Configuration profile to use');
  }

  /**
   * Start conversation
   */
  async startConversation(options) {
    console.log(chalk.cyan('🤖 Starting Claude Code...'));

    // Initialize runtime
    await this.runtime.initialize();

    // Override options from CLI
    if (options.model) {
      this.runtime.config.model = options.model;
    }
    if (options.temperature !== undefined) {
      this.runtime.config.temperature = options.temperature;
    }
    if (options.maxTokens) {
      this.runtime.config.maxTokens = options.maxTokens;
    }
    if (options.stream === false) {
      this.runtime.config.stream = false;
    }

    // Get conversation system
    const conversation = this.runtime.systems.get('conversation');
    if (!conversation) {
      throw new Error('Conversation system not initialized');
    }

    // Start conversation loop
    await conversation.start();
  }

  /**
   * Manage configuration
   */
  async manageConfig(options) {
    const configSystem = new ConfigurationSystem();

    if (options.list) {
      const config = await configSystem.load();
      console.log(JSON.stringify(config, null, 2));
    } else if (options.get) {
      const value = await configSystem.get(options.get);
      console.log(value);
    } else if (options.set) {
      const [key, value] = options.set.split('=');
      await configSystem.set(key, value);
      console.log(chalk.green(`✅ Set ${key} = ${value}`));
    } else if (options.reset) {
      await configSystem.reset();
      console.log(chalk.green('✅ Configuration reset to defaults'));
    }
  }

  /**
   * Manage updates
   */
  async manageUpdates(options) {
    const updateManager = new UpdateManager({
      channel: options.channel
    });

    if (options.check || !options.install) {
      console.log('Checking for updates...');
      const update = await updateManager.checkForUpdates();

      if (update) {
        console.log(chalk.yellow(`📦 Update available: v${update.version}`));
        console.log(`Current version: v${updateManager.config.currentVersion}`);
        console.log('\nChangelog:');
        console.log(update.changelog);
        console.log('\nRun "claude update --install" to update');
      } else {
        console.log(chalk.green('✅ Claude Code is up to date'));
      }
    }

    if (options.install) {
      console.log('Installing updates...');
      const update = await updateManager.checkForUpdates();

      if (update) {
        await updateManager.downloadAndInstall(update);
        console.log(chalk.green(`✅ Updated to v${update.version}`));
        console.log('Please restart Claude Code to use the new version');
      } else {
        console.log(chalk.green('✅ Already on latest version'));
      }
    }
  }

  /**
   * Manage MCP servers
   */
  async manageMCP(options) {
    await this.runtime.initialize();
    const mcpSystem = this.runtime.systems.get('mcp');

    if (options.list) {
      const servers = await mcpSystem.listServers();
      console.log('MCP Servers:');
      servers.forEach(server => {
        const status = server.connected ? chalk.green('●') : chalk.red('●');
        console.log(`  ${status} ${server.name} (${server.transport})`);
      });
    } else if (options.add) {
      // Implementation for adding MCP server
      console.log(`Adding MCP server: ${options.add}`);
    } else if (options.remove) {
      // Implementation for removing MCP server
      console.log(`Removing MCP server: ${options.remove}`);
    } else if (options.test) {
      // Implementation for testing MCP server
      console.log(`Testing MCP server: ${options.test}`);
    }
  }

  /**
   * Manage plugins
   */
  async managePlugins(options) {
    await this.runtime.initialize();
    const pluginSystem = this.runtime.systems.get('plugins');

    if (options.list) {
      const plugins = await pluginSystem.list();
      console.log('Installed Plugins:');
      plugins.forEach(plugin => {
        const status = plugin.enabled ? chalk.green('✓') : chalk.gray('○');
        console.log(`  ${status} ${plugin.name} v${plugin.version}`);
      });
    } else if (options.install) {
      await pluginSystem.install(options.install);
      console.log(chalk.green(`✅ Installed plugin: ${options.install}`));
    } else if (options.uninstall) {
      await pluginSystem.uninstall(options.uninstall);
      console.log(chalk.green(`✅ Uninstalled plugin: ${options.uninstall}`));
    } else if (options.search) {
      const results = await pluginSystem.search(options.search);
      console.log(`Search results for "${options.search}":`);
      results.forEach(plugin => {
        console.log(`  ${plugin.name} v${plugin.version} - ${plugin.description}`);
      });
    }
  }

  /**
   * Manage tools
   */
  async manageTools(options) {
    await this.runtime.initialize();
    const tools = this.runtime.systems.get('tools');

    if (options.list) {
      console.log('Available Tools:');
      for (const [name, tool] of tools) {
        const status = tool.enabled ? chalk.green('✓') : chalk.gray('○');
        console.log(`  ${status} ${name}`);
      }
    } else if (options.enable) {
      tools.get(options.enable).enabled = true;
      console.log(chalk.green(`✅ Enabled tool: ${options.enable}`));
    } else if (options.disable) {
      tools.get(options.disable).enabled = false;
      console.log(chalk.green(`✅ Disabled tool: ${options.disable}`));
    } else if (options.info) {
      const tool = tools.get(options.info);
      console.log(`Tool: ${options.info}`);
      console.log(`Enabled: ${tool.enabled}`);
      console.log(`Description: ${tool.description || 'N/A'}`);
    }
  }

  /**
   * Manage sessions
   */
  async manageSessions(options) {
    console.log('Session management not yet implemented');
  }

  /**
   * Show debug information
   */
  async showDebugInfo(options) {
    if (options.env) {
      await this.runtime.detectEnvironment();
      console.log('Environment Information:');
      console.log(JSON.stringify(this.runtime.environment, null, 2));
    }

    if (options.config) {
      await this.runtime.loadConfiguration();
      console.log('Configuration:');
      console.log(JSON.stringify(this.runtime.config, null, 2));
    }

    if (options.logs) {
      console.log('Recent logs not yet implemented');
    }

    if (options.test) {
      console.log('Running diagnostic tests...');
      await this.runtime.verifyRequirements();
      console.log(chalk.green('✅ All diagnostics passed'));
    }
  }

  /**
   * Call API directly
   */
  async callAPI(prompt, options) {
    await this.runtime.initialize();
    const apiClient = this.runtime.systems.get('api-client');

    const response = await apiClient.messages.create({
      model: options.model || this.runtime.config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: options.stream !== false
    });

    if (options.json) {
      console.log(JSON.stringify(response, null, 2));
    } else {
      console.log(response.content[0].text);
    }
  }

  /**
   * Initialize project
   */
  async initializeProject(options) {

    const configPath = path.join(process.cwd(), '.claude.json');

    if (!options.force) {
      try {
        await fs.access(configPath);
        console.log(chalk.yellow('⚠️  Claude configuration already exists'));
        console.log('Use --force to overwrite');
        return;
      } catch {
        // File doesn't exist, continue
      }
    }

    const defaultConfig = {
      version: '1.0.0',
      model: 'claude-3-5-sonnet-20241022',
      tools: {
        all: true
      },
      permissions: {
        filesystem: {
          read: ['**/*'],
          write: ['src/**', 'test/**']
        },
        commands: {
          allow: ['npm', 'yarn', 'git']
        }
      }
    };

    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green('✅ Created .claude.json configuration file'));
  }

  /**
   * Parse and execute
   */
  async parse(argv = process.argv) {
    try {
      // Handle global options
      const opts = this.program.opts();

      if (opts.apiKey) {
        process.env.ANTHROPIC_API_KEY = opts.apiKey;
      }

      if (opts.noColor) {
        chalk.level = 0;
      }

      if (opts.debug) {
        process.env.DEBUG = 'true';
      }

      if (opts.verbose) {
        process.env.VERBOSE = 'true';
      }

      // Parse commands
      await this.program.parseAsync(argv);

    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }
}

/**
 * Main entry point
 */
export async function main() {
  const cli = new ClaudeCodeCLI();
  await cli.parse();
}

// Run if executed directly
if (require.main === module) {
  main();
}