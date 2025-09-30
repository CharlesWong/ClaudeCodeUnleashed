/**
 * MCP Server Connection
 * Model Context Protocol server management
 *
 * Extracted from lines 1324-1530 of CLAUDE-CODE-COMPLETE-DEOBFUSCATION.js
 */

import { WebSocket } from 'ws';
import { spawn } from 'child_process';

/**
 * MCP Server Connection Class
 * Manages connections to Model Context Protocol servers
 */
class McpServerConnection {
  constructor(serverName, serverConfig, stats) {
    this.serverName = serverName;
    this.serverConfig = serverConfig;
    this.stats = stats || {};
    this.transport = null;
    this.client = null;
    this.tools = [];
    this.resources = [];
    this.prompts = [];
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  /**
   * Connect to MCP server
   */
  async connect() {
    try {
      // Create transport based on server type
      this.transport = await this.createTransport();

      // Initialize MCP client
      const { Client } = await import('@modelcontextprotocol/sdk');
      this.client = new Client({
        name: 'claude-code',
        version: '1.0.115'
      });

      // Connect client to transport
      await this.client.connect(this.transport);

      // Discover server capabilities
      await this.discoverCapabilities();

      this.connected = true;
      this.reconnectAttempts = 0;

      console.log(`Connected to MCP server: ${this.serverName}`);
    } catch (error) {
      console.error(`Failed to connect to MCP server ${this.serverName}:`, error);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Retrying connection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.connect();
      }

      throw error;
    }
  }

  /**
   * Discover server capabilities
   */
  async discoverCapabilities() {
    if (!this.client) return;

    try {
      // Get available tools
      const toolsResponse = await this.client.request('tools/list', {});
      this.tools = toolsResponse.tools || [];

      // Get available resources
      const resourcesResponse = await this.client.request('resources/list', {});
      this.resources = resourcesResponse.resources || [];

      // Get available prompts
      const promptsResponse = await this.client.request('prompts/list', {});
      this.prompts = promptsResponse.prompts || [];

      // Update stats
      this.stats.toolCount = this.tools.length;
      this.stats.resourceCount = this.resources.length;
      this.stats.promptCount = this.prompts.length;

    } catch (error) {
      console.error('Error discovering server capabilities:', error);
    }
  }

  /**
   * Create transport for server connection
   */
  async createTransport() {
    const { type } = this.serverConfig;

    switch (type) {
      case 'stdio':
        return this.createStdioTransport();
      case 'websocket':
        return this.createWebSocketTransport();
      case 'ide':
        return this.createIdeTransport();
      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  }

  /**
   * Create stdio transport for subprocess servers
   */
  async createStdioTransport() {
    const { command, args = [], env = {} } = this.serverConfig;

    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...env
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle process errors
    child.on('error', (error) => {
      console.error(`MCP server process error: ${error.message}`);
      this.connected = false;
    });

    child.on('exit', (code) => {
      console.log(`MCP server process exited with code ${code}`);
      this.connected = false;
    });

    return {
      type: 'stdio',
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      process: child
    };
  }

  /**
   * Create WebSocket transport
   */
  async createWebSocketTransport() {
    const { url } = this.serverConfig;

    const ws = new WebSocket(url);

    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);

      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });

    return {
      type: 'websocket',
      socket: ws,
      send: (data) => ws.send(data),
      onMessage: (handler) => ws.on('message', handler),
      onClose: (handler) => ws.on('close', handler)
    };
  }

  /**
   * Create IDE transport for VS Code integration
   */
  async createIdeTransport() {
    const idePort = process.env.CLAUDE_CODE_IDE_PORT;

    if (!idePort) {
      throw new Error('IDE port not configured');
    }

    const ws = new WebSocket(`ws://localhost:${idePort}/mcp`);

    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);

      setTimeout(() => reject(new Error('IDE connection timeout')), 3000);
    });

    return {
      type: 'ide',
      socket: ws,
      send: (data) => ws.send(data),
      onMessage: (handler) => ws.on('message', handler),
      onClose: (handler) => ws.on('close', handler)
    };
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName, args) {
    if (!this.connected) {
      throw new Error('MCP server not connected');
    }

    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const response = await this.client.request('tools/call', {
      name: toolName,
      arguments: args
    });

    return response.content;
  }

  /**
   * Get a resource from the MCP server
   */
  async getResource(uri) {
    if (!this.connected) {
      throw new Error('MCP server not connected');
    }

    const response = await this.client.request('resources/read', {
      uri
    });

    return response.contents;
  }

  /**
   * Get a prompt template from the MCP server
   */
  async getPrompt(name, args) {
    if (!this.connected) {
      throw new Error('MCP server not connected');
    }

    const response = await this.client.request('prompts/get', {
      name,
      arguments: args
    });

    return response.messages;
  }

  /**
   * List available tools
   */
  getTools() {
    return this.tools;
  }

  /**
   * List available resources
   */
  getResources() {
    return this.resources;
  }

  /**
   * List available prompts
   */
  getPrompts() {
    return this.prompts;
  }

  /**
   * Disconnect from server
   */
  async disconnect() {
    if (!this.connected) return;

    try {
      if (this.client) {
        await this.client.close();
      }

      if (this.transport) {
        switch (this.transport.type) {
          case 'stdio':
            if (this.transport.process) {
              this.transport.process.kill();
            }
            break;
          case 'websocket':
          case 'ide':
            if (this.transport.socket) {
              this.transport.socket.close();
            }
            break;
        }
      }

      this.connected = false;
      console.log(`Disconnected from MCP server: ${this.serverName}`);
    } catch (error) {
      console.error('Error disconnecting from MCP server:', error);
    }
  }

  /**
   * Check if server is connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      serverName: this.serverName,
      connected: this.connected,
      toolCount: this.tools.length,
      resourceCount: this.resources.length,
      promptCount: this.prompts.length,
      ...this.stats
    };
  }
}

export {
  McpServerConnection
};