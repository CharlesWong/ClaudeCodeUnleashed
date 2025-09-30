/**
 * Advanced MCP (Model Context Protocol) Features for Claude Code
 * Server discovery, protocol negotiation, and transport layers
 * Extracted from MCP patterns and server management
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getLogger } from '../utils/logging.js';
import { ErrorRecoveryManager } from '../error/error-recovery.js';

/**
 * MCP scopes
 * Original: scope patterns from lines 317-387
 */
export const MCPScope = {
  PROJECT: 'project',
  USER: 'user',
  LOCAL: 'local',
  ENTERPRISE: 'enterprise',
  DYNAMIC: 'dynamic'
};

/**
 * Transport types
 */
export const TransportType = {
  STDIO: 'stdio',
  WEBSOCKET: 'websocket',
  HTTP: 'http',
  IPC: 'ipc',
  SSE: 'sse'
};

/**
 * Protocol versions
 */
export const ProtocolVersion = {
  V1: '1.0',
  V2: '2.0',
  V3: '3.0'
};

/**
 * Server states
 */
export const ServerState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error',
  TERMINATED: 'terminated'
};

/**
 * MCP configuration
 * Original: MCP config patterns from lines 261-270
 */
export class MCPConfiguration {
  constructor() {
    this.logger = getLogger('mcp-configuration');
    this.configs = new Map();
  }

  /**
   * Get MCP config path for scope
   * Original: path patterns from lines 261, 269, 393
   */
  getConfigPath(scope) {
    const home = process.env.HOME || process.env.USERPROFILE;

    switch (scope) {
      case MCPScope.PROJECT:
        return path.join(process.cwd(), '.mcp.json');

      case MCPScope.USER:
        return path.join(home, '.config', 'claude-code', 'mcp.json');

      case MCPScope.LOCAL:
        return path.join(home, '.local', 'claude-code', 'mcp.json');

      case MCPScope.ENTERPRISE:
        return path.join(home, '.config', 'claude-code', 'managed-mcp.json');

      default:
        throw new Error(`Unknown MCP scope: ${scope}`);
    }
  }

  /**
   * Load configuration
   * Original: lC1 function pattern from line 263
   */
  async loadConfiguration(scope) {
    const configPath = this.getConfigPath(scope);

    try {
      if (!fs.existsSync(configPath)) {
        return { servers: {}, errors: [] };
      }

      const content = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);

      // Process environment variables
      const processed = this.processEnvironmentVariables(config);

      this.configs.set(scope, processed);
      return { servers: processed.mcpServers || {}, errors: [] };

    } catch (error) {
      this.logger.error(`Failed to load MCP config for ${scope}`, { error });
      return { servers: {}, errors: [error.message] };
    }
  }

  /**
   * Process environment variables
   * Original: PC9 function pattern from line 271
   */
  processEnvironmentVariables(config) {
    const processValue = (value) => {
      if (typeof value === 'string') {
        return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
          const [name, defaultValue] = varName.split(':-');
          return process.env[name] || defaultValue || match;
        });
      }
      return value;
    };

    const processObject = (obj) => {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          result[key] = processObject(value);
        } else {
          result[key] = processValue(value);
        }
      }
      return result;
    };

    return processObject(config);
  }

  /**
   * Save configuration
   * Original: server add/remove patterns from lines 323-387
   */
  async saveConfiguration(scope, config) {
    const configPath = this.getConfigPath(scope);

    // Check if scope allows modifications
    if (scope === MCPScope.DYNAMIC) {
      throw new Error('Cannot add MCP server to scope: dynamic');
    }

    if (scope === MCPScope.ENTERPRISE) {
      throw new Error('Cannot add MCP server to scope: enterprise');
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      this.configs.set(scope, config);

      this.logger.info(`Saved MCP config for ${scope}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to save MCP config for ${scope}`, { error });
      throw error;
    }
  }

  /**
   * Add server to configuration
   * Original: server add patterns from lines 315-354
   */
  async addServer(scope, name, serverConfig) {
    const { servers } = await this.loadConfiguration(scope);

    if (servers[name]) {
      throw new Error(`MCP server ${name} already exists in ${scope} scope`);
    }

    servers[name] = serverConfig;

    await this.saveConfiguration(scope, {
      mcpServers: servers
    });

    this.logger.info(`Added MCP server ${name} to ${scope}`);
  }

  /**
   * Remove server from configuration
   * Original: server remove patterns from lines 356-388
   */
  async removeServer(scope, name) {
    const { servers } = await this.loadConfiguration(scope);

    if (!servers[name]) {
      throw new Error(`No MCP server found with name: ${name} in ${scope}`);
    }

    delete servers[name];

    await this.saveConfiguration(scope, {
      mcpServers: servers
    });

    this.logger.info(`Removed MCP server ${name} from ${scope}`);
  }

  /**
   * Get all servers across scopes
   * Original: server aggregation pattern from line 432
   */
  async getAllServers() {
    const allServers = {};
    const scopes = [MCPScope.ENTERPRISE, MCPScope.USER, MCPScope.LOCAL, MCPScope.PROJECT];

    for (const scope of scopes) {
      const { servers } = await this.loadConfiguration(scope);
      Object.assign(allServers, servers);
    }

    return allServers;
  }
}

/**
 * Server discovery
 */
export class ServerDiscovery extends EventEmitter {
  constructor() {
    super();
    this.logger = getLogger('server-discovery');
    this.discovered = new Map();
    this.scanning = false;
  }

  /**
   * Discover servers
   */
  async discover(options = {}) {
    if (this.scanning) {
      this.logger.warn('Discovery already in progress');
      return;
    }

    this.scanning = true;
    this.emit('discoveryStart');

    try {
      // Discover from various sources
      const discoveries = await Promise.all([
        this.discoverFromConfig(),
        this.discoverFromEnvironment(),
        this.discoverFromNetwork(options),
        this.discoverFromRegistry(options)
      ]);

      // Merge discoveries
      for (const servers of discoveries) {
        for (const [name, server] of servers) {
          this.discovered.set(name, server);
        }
      }

      this.emit('discoveryComplete', this.discovered);
      return this.discovered;

    } finally {
      this.scanning = false;
    }
  }

  /**
   * Discover from configuration files
   */
  async discoverFromConfig() {
    const config = new MCPConfiguration();
    const servers = await config.getAllServers();
    const discovered = new Map();

    for (const [name, serverConfig] of Object.entries(servers)) {
      discovered.set(name, {
        name,
        source: 'config',
        config: serverConfig
      });
    }

    this.logger.info(`Discovered ${discovered.size} servers from config`);
    return discovered;
  }

  /**
   * Discover from environment variables
   */
  async discoverFromEnvironment() {
    const discovered = new Map();
    const prefix = 'MCP_SERVER_';

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const name = key.slice(prefix.length).toLowerCase();

        try {
          const config = JSON.parse(value);
          discovered.set(name, {
            name,
            source: 'environment',
            config
          });
        } catch {
          // Not JSON, treat as command
          discovered.set(name, {
            name,
            source: 'environment',
            config: { command: value }
          });
        }
      }
    }

    this.logger.info(`Discovered ${discovered.size} servers from environment`);
    return discovered;
  }

  /**
   * Discover from network
   */
  async discoverFromNetwork(options) {
    const discovered = new Map();

    if (!options.enableNetworkDiscovery) {
      return discovered;
    }

    // Implement mDNS/Bonjour discovery
    // This would use a library like mdns or bonjour

    this.logger.info('Network discovery not yet implemented');
    return discovered;
  }

  /**
   * Discover from registry
   */
  async discoverFromRegistry(options) {
    const discovered = new Map();

    if (!options.registryUrl) {
      return discovered;
    }

    try {
      // Fetch from registry
      const response = await fetch(options.registryUrl);
      const servers = await response.json();

      for (const server of servers) {
        discovered.set(server.name, {
          name: server.name,
          source: 'registry',
          config: server
        });
      }
    } catch (error) {
      this.logger.error('Failed to fetch from registry', { error });
    }

    this.logger.info(`Discovered ${discovered.size} servers from registry`);
    return discovered;
  }
}

/**
 * Protocol negotiator
 */
export class ProtocolNegotiator {
  constructor() {
    this.logger = getLogger('protocol-negotiator');
    this.supportedVersions = [ProtocolVersion.V3, ProtocolVersion.V2, ProtocolVersion.V1];
  }

  /**
   * Negotiate protocol version
   */
  async negotiate(serverCapabilities) {
    const serverVersions = serverCapabilities.versions || [ProtocolVersion.V1];

    // Find highest common version
    for (const version of this.supportedVersions) {
      if (serverVersions.includes(version)) {
        this.logger.info(`Negotiated protocol version: ${version}`);
        return {
          version,
          features: this.getFeaturesForVersion(version)
        };
      }
    }

    throw new Error('No compatible protocol version found');
  }

  /**
   * Get features for version
   */
  getFeaturesForVersion(version) {
    const features = {
      [ProtocolVersion.V1]: {
        tools: true,
        resources: false,
        streaming: false,
        batching: false
      },
      [ProtocolVersion.V2]: {
        tools: true,
        resources: true,
        streaming: true,
        batching: false
      },
      [ProtocolVersion.V3]: {
        tools: true,
        resources: true,
        streaming: true,
        batching: true
      }
    };

    return features[version] || features[ProtocolVersion.V1];
  }

  /**
   * Check capability support
   */
  isCapabilitySupported(capability, negotiatedProtocol) {
    const features = negotiatedProtocol.features;

    switch (capability) {
      case 'tools':
        return features.tools;
      case 'resources':
        return features.resources;
      case 'streaming':
        return features.streaming;
      case 'batching':
        return features.batching;
      default:
        return false;
    }
  }
}

/**
 * Transport layer base class
 */
export class Transport extends EventEmitter {
  constructor(type) {
    super();
    this.type = type;
    this.logger = getLogger(`transport-${type}`);
    this.connected = false;
  }

  /**
   * Connect to server
   */
  async connect(config) {
    throw new Error('Connect must be implemented by subclass');
  }

  /**
   * Send message
   */
  async send(message) {
    throw new Error('Send must be implemented by subclass');
  }

  /**
   * Receive message
   */
  async receive() {
    throw new Error('Receive must be implemented by subclass');
  }

  /**
   * Disconnect
   */
  async disconnect() {
    throw new Error('Disconnect must be implemented by subclass');
  }
}

/**
 * STDIO transport
 */
export class StdioTransport extends Transport {
  constructor() {
    super(TransportType.STDIO);
    this.process = null;
    this.buffer = '';
  }

  /**
   * Connect via stdio
   */
  async connect(config) {
    const { command, args = [], env = {} } = config;

    try {
      this.process = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.process.stderr.on('data', (data) => {
        this.logger.error('Server error', { error: data.toString() });
      });

      this.process.on('close', (code) => {
        this.connected = false;
        this.emit('disconnected', { code });
      });

      this.connected = true;
      this.emit('connected');

      return true;
    } catch (error) {
      this.logger.error('Failed to connect', { error });
      throw error;
    }
  }

  /**
   * Handle incoming data
   */
  handleData(data) {
    this.buffer += data;

    // Look for message boundaries
    const messages = this.buffer.split('\n');
    this.buffer = messages.pop() || '';

    for (const message of messages) {
      if (message.trim()) {
        try {
          const parsed = JSON.parse(message);
          this.emit('message', parsed);
        } catch {
          this.logger.warn('Invalid message', { message });
        }
      }
    }
  }

  /**
   * Send message
   */
  async send(message) {
    if (!this.connected || !this.process) {
      throw new Error('Not connected');
    }

    const json = JSON.stringify(message) + '\n';
    this.process.stdin.write(json);
  }

  /**
   * Receive message
   */
  async receive() {
    return new Promise((resolve) => {
      this.once('message', resolve);
    });
  }

  /**
   * Disconnect
   */
  async disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
  }
}

/**
 * WebSocket transport
 */
export class WebSocketTransport extends Transport {
  constructor() {
    super(TransportType.WEBSOCKET);
    this.ws = null;
    this.messageQueue = [];
  }

  /**
   * Connect via WebSocket
   */
  async connect(config) {
    const { url, headers = {} } = config;

    try {
      const WebSocket = await this.getWebSocket();

      this.ws = new WebSocket(url, {
        headers
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.emit('connected');
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.messageQueue.push(message);
          this.emit('message', message);
        } catch {
          this.logger.warn('Invalid message', { data });
        }
      });

      this.ws.on('error', (error) => {
        this.logger.error('WebSocket error', { error });
        this.emit('error', error);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      // Wait for connection
      await new Promise((resolve, reject) => {
        this.once('connected', resolve);
        this.once('error', reject);
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to connect', { error });
      throw error;
    }
  }

  /**
   * Get WebSocket implementation
   */
  async getWebSocket() {
    if (typeof WebSocket !== 'undefined') {
      return WebSocket;
    }
    return (await import('ws')).default;
  }

  /**
   * Send message
   */
  async send(message) {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Receive message
   */
  async receive() {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift();
    }

    return new Promise((resolve) => {
      this.once('message', resolve);
    });
  }

  /**
   * Disconnect
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

/**
 * Transport factory
 */
export class TransportFactory {
  static create(type) {
    switch (type) {
      case TransportType.STDIO:
        return new StdioTransport();

      case TransportType.WEBSOCKET:
        return new WebSocketTransport();

      // Add other transport types as needed
      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  }
}

/**
 * Advanced MCP server connection
 */
export class AdvancedMCPServer extends EventEmitter {
  constructor(name, config) {
    super();
    this.name = name;
    this.config = config;
    this.logger = getLogger(`mcp-server-${name}`);
    this.state = ServerState.DISCONNECTED;
    this.transport = null;
    this.protocol = null;
    this.capabilities = {};
    this.errorRecovery = new ErrorRecoveryManager();
  }

  /**
   * Connect to server
   */
  async connect() {
    if (this.state !== ServerState.DISCONNECTED) {
      this.logger.warn('Already connected or connecting');
      return;
    }

    this.state = ServerState.CONNECTING;
    this.emit('connecting');

    try {
      // Determine transport type
      const transportType = this.getTransportType();
      this.transport = TransportFactory.create(transportType);

      // Connect transport
      await this.transport.connect(this.config);

      // Setup transport handlers
      this.setupTransportHandlers();

      // Perform handshake
      await this.handshake();

      this.state = ServerState.CONNECTED;
      this.emit('connected');

      return true;
    } catch (error) {
      this.state = ServerState.ERROR;
      this.logger.error('Connection failed', { error });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get transport type
   */
  getTransportType() {
    if (this.config.command) {
      return TransportType.STDIO;
    }
    if (this.config.url?.startsWith('ws://') || this.config.url?.startsWith('wss://')) {
      return TransportType.WEBSOCKET;
    }
    if (this.config.url?.startsWith('http://') || this.config.url?.startsWith('https://')) {
      return TransportType.HTTP;
    }
    return TransportType.STDIO;
  }

  /**
   * Setup transport handlers
   */
  setupTransportHandlers() {
    this.transport.on('message', this.handleMessage.bind(this));
    this.transport.on('disconnected', this.handleDisconnected.bind(this));
    this.transport.on('error', this.handleError.bind(this));
  }

  /**
   * Perform handshake
   */
  async handshake() {
    // Send initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: ProtocolVersion.V3,
        clientInfo: {
          name: 'Claude Code',
          version: '1.0.115'
        }
      }
    };

    await this.transport.send(initRequest);

    // Wait for response
    const response = await this.transport.receive();

    if (response.error) {
      throw new Error(`Handshake failed: ${response.error.message}`);
    }

    // Store capabilities
    this.capabilities = response.result.capabilities || {};

    // Negotiate protocol
    const negotiator = new ProtocolNegotiator();
    this.protocol = await negotiator.negotiate(this.capabilities);

    this.logger.info('Handshake complete', {
      capabilities: this.capabilities,
      protocol: this.protocol
    });
  }

  /**
   * Handle message
   */
  handleMessage(message) {
    this.emit('message', message);

    // Handle different message types
    if (message.method) {
      this.handleRequest(message);
    } else if (message.id) {
      this.handleResponse(message);
    } else {
      this.handleNotification(message);
    }
  }

  /**
   * Handle request
   */
  async handleRequest(request) {
    // Server is requesting something from us
    this.emit('request', request);

    // Handle known methods
    switch (request.method) {
      case 'ping':
        await this.sendResponse(request.id, { pong: true });
        break;

      default:
        await this.sendError(request.id, {
          code: -32601,
          message: 'Method not found'
        });
    }
  }

  /**
   * Handle response
   */
  handleResponse(response) {
    this.emit('response', response);
  }

  /**
   * Handle notification
   */
  handleNotification(notification) {
    this.emit('notification', notification);
  }

  /**
   * Handle disconnection
   */
  handleDisconnected() {
    this.state = ServerState.DISCONNECTED;
    this.logger.info('Disconnected from server');
    this.emit('disconnected');
  }

  /**
   * Handle error
   */
  handleError(error) {
    this.logger.error('Transport error', { error });
    this.emit('error', error);
  }

  /**
   * Send request
   */
  async sendRequest(method, params) {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };

    await this.transport.send(request);

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000);

      this.once('response', (response) => {
        clearTimeout(timeout);
        if (response.id === request.id) {
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      });
    });
  }

  /**
   * Send response
   */
  async sendResponse(id, result) {
    const response = {
      jsonrpc: '2.0',
      id,
      result
    };

    await this.transport.send(response);
  }

  /**
   * Send error
   */
  async sendError(id, error) {
    const response = {
      jsonrpc: '2.0',
      id,
      error
    };

    await this.transport.send(response);
  }

  /**
   * Disconnect
   */
  async disconnect() {
    if (this.transport) {
      await this.transport.disconnect();
    }
    this.state = ServerState.DISCONNECTED;
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      name: this.name,
      state: this.state,
      capabilities: this.capabilities,
      protocol: this.protocol,
      transport: this.transport?.type
    };
  }
}

// Export utility functions
export function createMCPConfiguration() {
  return new MCPConfiguration();
}

export function createServerDiscovery() {
  return new ServerDiscovery();
}

export function createProtocolNegotiator() {
  return new ProtocolNegotiator();
}

export function createMCPServer(name, config) {
  return new AdvancedMCPServer(name, config);
}

export default {
  MCPScope,
  TransportType,
  ProtocolVersion,
  ServerState,
  MCPConfiguration,
  ServerDiscovery,
  ProtocolNegotiator,
  Transport,
  StdioTransport,
  WebSocketTransport,
  TransportFactory,
  AdvancedMCPServer,
  createMCPConfiguration,
  createServerDiscovery,
  createProtocolNegotiator,
  createMCPServer
};