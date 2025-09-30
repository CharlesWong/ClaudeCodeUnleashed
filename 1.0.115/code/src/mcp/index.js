/**
 * MCP (Model Context Protocol) System
 * Main module for MCP server management
 */

import { McpServerConnection } from './server-connection.js';
import fs from 'fs';
import path from 'path';

// Active MCP server connections
const mcpServers = new Map();

// MCP configuration
let mcpConfig = {
  servers: {},
  autoConnect: true,
  retryOnFailure: true
};

/**
 * Initialize MCP servers from configuration
 */
async function initializeMCPServers() {
  console.debug('Initializing MCP servers...');

  // Load MCP server configuration
  const config = loadMCPConfig();
  if (!config || !config.servers) {
    console.debug('No MCP servers configured');
    return;
  }

  // Connect to each configured server
  for (const [serverName, serverConfig] of Object.entries(config.servers)) {
    if (serverConfig.enabled !== false) {
      try {
        await connectToMCPServer(serverName, serverConfig);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${serverName}:`, error);
      }
    }
  }

  console.debug(`Initialized ${mcpServers.size} MCP servers`);
}

/**
 * Load MCP configuration
 */
function loadMCPConfig() {
  // Check environment variable
  if (process.env.CLAUDE_MCP_CONFIG) {
    try {
      return JSON.parse(process.env.CLAUDE_MCP_CONFIG);
    } catch (error) {
      console.error('Invalid MCP config in environment:', error);
    }
  }

  // Check for config file
  try {
    const configPath = path.join(process.cwd(), '.claude-mcp.json');

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.debug('No MCP config file found');
  }

  // Return default config
  return mcpConfig;
}

/**
 * Connect to an MCP server
 */
async function connectToMCPServer(serverName, serverConfig) {
  console.log(`Connecting to MCP server: ${serverName}`);

  const connection = new McpServerConnection(serverName, serverConfig, {
    startTime: Date.now()
  });

  try {
    await connection.connect();
    mcpServers.set(serverName, connection);

    // Register MCP tools globally
    registerMCPTools(serverName, connection);

    return connection;
  } catch (error) {
    console.error(`Failed to connect to ${serverName}:`, error);
    throw error;
  }
}

/**
 * Register MCP tools as available tools
 */
function registerMCPTools(serverName, connection) {
  const tools = connection.getTools();

  for (const tool of tools) {
    // Create a wrapper for each MCP tool
    const mcpTool = {
      name: `mcp_${serverName}_${tool.name}`,
      description: tool.description || `MCP tool from ${serverName}`,
      inputSchema: tool.inputSchema,

      async *call(input, context) {
        const result = await connection.callTool(tool.name, input);

        yield {
          type: 'result',
          data: result
        };
      },

      mapToolResultToToolResultBlockParam(data, toolUseId) {
        return {
          tool_use_id: toolUseId,
          type: 'tool_result',
          content: typeof data === 'string' ? data : JSON.stringify(data)
        };
      },

      userFacingName() {
        return `${serverName}:${tool.name}`;
      },

      isEnabled() {
        return connection.isConnected();
      },

      isConcurrencySafe() {
        return tool.concurrencySafe ?? true;
      },

      isReadOnly() {
        return tool.readOnly ?? false;
      }
    };

    // Register the wrapped tool globally (would be added to AVAILABLE_TOOLS)
    registerGlobalTool(mcpTool);
  }
}

/**
 * Register a tool globally (placeholder - would integrate with main tool system)
 */
function registerGlobalTool(tool) {
  // This would integrate with the main tool registration system
  console.debug(`Registered MCP tool: ${tool.name}`);
}

/**
 * Disconnect from an MCP server
 */
async function disconnectMCPServer(serverName) {
  const connection = mcpServers.get(serverName);

  if (connection) {
    await connection.disconnect();
    mcpServers.delete(serverName);
  }
}

/**
 * Disconnect from all MCP servers
 */
async function disconnectAllMCPServers() {
  for (const [serverName, connection] of mcpServers) {
    await connection.disconnect();
  }
  mcpServers.clear();
}

/**
 * Get all connected MCP servers
 */
function getConnectedMCPServers() {
  return Array.from(mcpServers.entries()).map(([name, connection]) => ({
    name,
    ...connection.getStats()
  }));
}

/**
 * Get MCP resources from all servers
 */
async function getAllMCPResources() {
  const resources = [];

  for (const [serverName, connection] of mcpServers) {
    if (connection.isConnected()) {
      const serverResources = connection.getResources();
      resources.push(...serverResources.map(r => ({
        ...r,
        server: serverName
      })));
    }
  }

  return resources;
}

/**
 * Get MCP prompts from all servers
 */
async function getAllMCPPrompts() {
  const prompts = [];

  for (const [serverName, connection] of mcpServers) {
    if (connection.isConnected()) {
      const serverPrompts = connection.getPrompts();
      prompts.push(...serverPrompts.map(p => ({
        ...p,
        server: serverName
      })));
    }
  }

  return prompts;
}

/**
 * Call an MCP tool
 */
async function callMCPTool(serverName, toolName, args) {
  const connection = mcpServers.get(serverName);

  if (!connection) {
    throw new Error(`MCP server ${serverName} not found`);
  }

  if (!connection.isConnected()) {
    throw new Error(`MCP server ${serverName} not connected`);
  }

  return await connection.callTool(toolName, args);
}

/**
 * Get an MCP resource
 */
async function getMCPResource(serverName, uri) {
  const connection = mcpServers.get(serverName);

  if (!connection) {
    throw new Error(`MCP server ${serverName} not found`);
  }

  if (!connection.isConnected()) {
    throw new Error(`MCP server ${serverName} not connected`);
  }

  return await connection.getResource(uri);
}

/**
 * Get an MCP prompt
 */
async function getMCPPrompt(serverName, promptName, args) {
  const connection = mcpServers.get(serverName);

  if (!connection) {
    throw new Error(`MCP server ${serverName} not found`);
  }

  if (!connection.isConnected()) {
    throw new Error(`MCP server ${serverName} not connected`);
  }

  return await connection.getPrompt(promptName, args);
}

export {
  initializeMCPServers,
  connectToMCPServer,
  disconnectMCPServer,
  disconnectAllMCPServers,
  getConnectedMCPServers,
  getAllMCPResources,
  getAllMCPPrompts,
  callMCPTool,
  getMCPResource,
  getMCPPrompt,
  mcpServers
};