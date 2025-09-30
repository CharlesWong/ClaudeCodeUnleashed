/**
 * Network Utilities for Claude Code
 * HTTP client configuration, proxy handling, and connection management
 * Extracted from patterns around lines 14270-14350 and other network-related sections
 */

import { EventEmitter } from 'events';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { URL } from 'url';
import { getLogger } from '../utils/logging.js';

/**
 * Network configuration
 */
export class NetworkConfig {
  constructor(options = {}) {
    this.proxy = options.proxy || this.getProxyConfig();
    this.keepAlive = options.keepAlive ?? true;
    this.keepAliveMsecs = options.keepAliveMsecs || 60000;
    this.maxSockets = options.maxSockets || 50;
    this.maxFreeSockets = options.maxFreeSockets || 10;
    this.timeout = options.timeout || 300000; // 5 minutes
    this.cert = options.cert;
    this.key = options.key;
    this.passphrase = options.passphrase;
    this.rejectUnauthorized = options.rejectUnauthorized ?? true;
    this.noProxy = options.noProxy || this.getNoProxyList();
    this.pipelining = options.pipelining || 1;
  }

  /**
   * Get proxy configuration from environment
   * Original: G31 function pattern
   */
  getProxyConfig() {
    const httpsProxy = process.env.https_proxy || process.env.HTTPS_PROXY;
    const httpProxy = process.env.http_proxy || process.env.HTTP_PROXY;
    const allProxy = process.env.all_proxy || process.env.ALL_PROXY;

    return httpsProxy || httpProxy || allProxy || null;
  }

  /**
   * Get no-proxy list
   * Original: qk4 function
   */
  getNoProxyList() {
    const noProxy = process.env.no_proxy || process.env.NO_PROXY;
    return noProxy || null;
  }
}

/**
 * Connection pool manager
 */
export class ConnectionPool {
  constructor(config = new NetworkConfig()) {
    this.config = config;
    this.logger = getLogger('network-pool');
    this.httpAgent = null;
    this.httpsAgent = null;
    this.connections = new Map();
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      reusedConnections: 0
    };
  }

  /**
   * Get HTTP agent
   * Original: Qm function pattern
   */
  getHttpAgent() {
    if (!this.httpAgent) {
      this.httpAgent = new HttpAgent({
        keepAlive: this.config.keepAlive,
        keepAliveMsecs: this.config.keepAliveMsecs,
        maxSockets: this.config.maxSockets,
        maxFreeSockets: this.config.maxFreeSockets,
        timeout: this.config.timeout
      });
    }
    return this.httpAgent;
  }

  /**
   * Get HTTPS agent with certificate support
   * Original: lines 14278-14290
   */
  getHttpsAgent() {
    if (!this.httpsAgent) {
      const options = {
        keepAlive: this.config.keepAlive,
        keepAliveMsecs: this.config.keepAliveMsecs,
        maxSockets: this.config.maxSockets,
        maxFreeSockets: this.config.maxFreeSockets,
        timeout: this.config.timeout,
        rejectUnauthorized: this.config.rejectUnauthorized
      };

      // Add certificate options if provided
      if (this.config.cert) {
        options.cert = this.config.cert;
      }
      if (this.config.key) {
        options.key = this.config.key;
      }
      if (this.config.passphrase) {
        options.passphrase = this.config.passphrase;
      }

      this.httpsAgent = new HttpsAgent(options);
    }
    return this.httpsAgent;
  }

  /**
   * Get agent for URL
   */
  getAgent(url) {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:'
      ? this.getHttpsAgent()
      : this.getHttpAgent();
  }

  /**
   * Check if URL should bypass proxy
   * Original: Ek4 function from line 14300
   */
  shouldBypassProxy(url) {
    const noProxy = this.config.noProxy;
    if (!noProxy) return false;
    if (noProxy === '*') return true;

    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const hostPort = `${hostname}:${parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80)}`;

      return noProxy
        .split(/[,\s]+/)
        .filter(Boolean)
        .some(pattern => {
          pattern = pattern.toLowerCase().trim();

          // Check host:port pattern
          if (pattern.includes(':')) {
            return hostPort === pattern;
          }

          // Check domain suffix pattern
          if (pattern.startsWith('.')) {
            return hostname.endsWith(pattern) || hostname === pattern.slice(1);
          }

          // Exact hostname match
          return hostname === pattern;
        });
    } catch {
      return false;
    }
  }

  /**
   * Track connection metrics
   */
  trackConnection(url, reused = false) {
    this.metrics.totalConnections++;
    if (reused) {
      this.metrics.reusedConnections++;
    }
    this.metrics.activeConnections++;

    const hostname = new URL(url).hostname;
    if (!this.connections.has(hostname)) {
      this.connections.set(hostname, 0);
    }
    this.connections.set(hostname, this.connections.get(hostname) + 1);
  }

  /**
   * Release connection
   */
  releaseConnection(url) {
    this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);

    const hostname = new URL(url).hostname;
    if (this.connections.has(hostname)) {
      const count = this.connections.get(hostname) - 1;
      if (count <= 0) {
        this.connections.delete(hostname);
      } else {
        this.connections.set(hostname, count);
      }
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.metrics,
      connectionsByHost: Object.fromEntries(this.connections),
      reuseRate: this.metrics.totalConnections > 0
        ? (this.metrics.reusedConnections / this.metrics.totalConnections) * 100
        : 0
    };
  }

  /**
   * Destroy all agents
   */
  destroy() {
    if (this.httpAgent) {
      this.httpAgent.destroy();
      this.httpAgent = null;
    }
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
      this.httpsAgent = null;
    }
    this.connections.clear();
  }
}

/**
 * Request interceptor system
 * Original: interceptors.request.use pattern from line 14339
 */
export class RequestInterceptor {
  constructor() {
    this.interceptors = [];
    this.logger = getLogger('request-interceptor');
  }

  /**
   * Add interceptor
   */
  use(interceptor) {
    this.interceptors.push(interceptor);
    return () => {
      const index = this.interceptors.indexOf(interceptor);
      if (index > -1) {
        this.interceptors.splice(index, 1);
      }
    };
  }

  /**
   * Process request through interceptors
   */
  async processRequest(config) {
    let processedConfig = { ...config };

    for (const interceptor of this.interceptors) {
      try {
        processedConfig = await interceptor(processedConfig);

        // If interceptor returns null/undefined, stop processing
        if (!processedConfig) {
          throw new Error('Request interceptor returned null');
        }
      } catch (error) {
        this.logger.error('Interceptor error', { error: error.message });
        throw error;
      }
    }

    return processedConfig;
  }
}

/**
 * WebSocket connection manager
 * Original: WebSocket patterns from lines 29115, 29268, 29603
 */
export class WebSocketManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.connections = new Map();
    this.reconnectAttempts = options.reconnectAttempts || 3;
    this.reconnectDelay = options.reconnectDelay || 1000;
    this.heartbeatInterval = options.heartbeatInterval || 30000;
    this.logger = getLogger('websocket');
  }

  /**
   * Create WebSocket connection
   */
  connect(url, options = {}) {
    const id = this.generateConnectionId();

    // Convert HTTP URL to WebSocket URL if needed
    if (url.startsWith('http://')) {
      url = url.replace('http://', 'ws://');
    } else if (url.startsWith('https://')) {
      url = url.replace('https://', 'wss://');
    }

    const connection = {
      id,
      url,
      ws: null,
      state: 'connecting',
      attempts: 0,
      heartbeatTimer: null,
      options
    };

    this.connections.set(id, connection);
    this.createWebSocket(connection);

    return id;
  }

  /**
   * Create WebSocket instance
   */
  createWebSocket(connection) {
    try {
      // Use appropriate WebSocket implementation
      const WebSocket = this.getWebSocketImplementation();
      connection.ws = new WebSocket(connection.url, connection.options);

      connection.ws.on('open', () => {
        connection.state = 'open';
        connection.attempts = 0;
        this.startHeartbeat(connection);
        this.emit('open', connection.id);
        this.logger.info(`WebSocket connected: ${connection.id}`);
      });

      connection.ws.on('message', (data) => {
        this.emit('message', { id: connection.id, data });
      });

      connection.ws.on('error', (error) => {
        this.logger.error(`WebSocket error: ${connection.id}`, { error });
        this.emit('error', { id: connection.id, error });
      });

      connection.ws.on('close', (code, reason) => {
        connection.state = 'closed';
        this.stopHeartbeat(connection);
        this.emit('close', { id: connection.id, code, reason });
        this.handleReconnection(connection);
      });

    } catch (error) {
      this.logger.error('Failed to create WebSocket', { error });
      throw error;
    }
  }

  /**
   * Get WebSocket implementation
   */
  getWebSocketImplementation() {
    // Use browser WebSocket if available, otherwise use Node.js ws
    if (typeof WebSocket !== 'undefined') {
      return WebSocket;
    }

    // For Node.js environment
    try {
      return (await import('ws')).default;
    } catch {
      throw new Error('WebSocket is not available');
    }
  }

  /**
   * Send message
   */
  send(id, data) {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`Connection ${id} not found`);
    }

    if (connection.state !== 'open') {
      throw new Error('WebSocket is not open. Cannot send message.');
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    connection.ws.send(message);
  }

  /**
   * Start heartbeat
   */
  startHeartbeat(connection) {
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
    }

    connection.heartbeatTimer = setInterval(() => {
      if (connection.state === 'open' && connection.ws) {
        try {
          connection.ws.ping();
        } catch (error) {
          this.logger.warn('Heartbeat failed', { id: connection.id, error });
        }
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(connection) {
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
      connection.heartbeatTimer = null;
    }
  }

  /**
   * Handle reconnection
   */
  async handleReconnection(connection) {
    if (connection.attempts >= this.reconnectAttempts) {
      this.logger.warn(`Max reconnection attempts reached for ${connection.id}`);
      this.connections.delete(connection.id);
      return;
    }

    connection.attempts++;
    const delay = this.reconnectDelay * Math.pow(2, connection.attempts - 1);

    this.logger.info(`Reconnecting WebSocket ${connection.id} in ${delay}ms (attempt ${connection.attempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (this.connections.has(connection.id)) {
      connection.state = 'connecting';
      this.createWebSocket(connection);
    }
  }

  /**
   * Close connection
   */
  close(id) {
    const connection = this.connections.get(id);
    if (!connection) return;

    this.stopHeartbeat(connection);

    if (connection.ws) {
      connection.ws.close();
    }

    this.connections.delete(id);
  }

  /**
   * Close all connections
   */
  closeAll() {
    for (const id of this.connections.keys()) {
      this.close(id);
    }
  }

  /**
   * Generate connection ID
   */
  generateConnectionId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection state
   */
  getState(id) {
    const connection = this.connections.get(id);
    return connection ? connection.state : null;
  }

  /**
   * Get all connections
   */
  getConnections() {
    return Array.from(this.connections.entries()).map(([id, conn]) => ({
      id,
      url: conn.url,
      state: conn.state,
      attempts: conn.attempts
    }));
  }
}

/**
 * HTTP client with enhanced features
 */
export class EnhancedHttpClient {
  constructor(config = {}) {
    this.config = new NetworkConfig(config);
    this.pool = new ConnectionPool(this.config);
    this.interceptor = new RequestInterceptor();
    this.logger = getLogger('http-client');
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0
    };
  }

  /**
   * Make HTTP request
   */
  async request(url, options = {}) {
    this.metrics.totalRequests++;

    try {
      // Process through interceptors
      const config = await this.interceptor.processRequest({
        url,
        ...options
      });

      // Check if should bypass proxy
      if (this.config.proxy && !this.pool.shouldBypassProxy(url)) {
        config.proxy = this.config.proxy;
      }

      // Get appropriate agent
      config.agent = this.pool.getAgent(url);

      // Track connection
      this.pool.trackConnection(url);

      // Make request
      const response = await fetch(url, config);

      if (response.ok) {
        this.metrics.successfulRequests++;
      } else {
        this.metrics.failedRequests++;
      }

      return response;

    } catch (error) {
      this.metrics.failedRequests++;
      throw error;

    } finally {
      this.pool.releaseConnection(url);
    }
  }

  /**
   * GET request
   */
  get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  post(url, body, options = {}) {
    return this.request(url, {
      ...options,
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      pool: this.pool.getStats(),
      successRate: this.metrics.totalRequests > 0
        ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100
        : 0
    };
  }

  /**
   * Destroy client
   */
  destroy() {
    this.pool.destroy();
  }
}

// Export utility functions
export function createHttpClient(config) {
  return new EnhancedHttpClient(config);
}

export function createWebSocketManager(options) {
  return new WebSocketManager(options);
}

export default {
  NetworkConfig,
  ConnectionPool,
  RequestInterceptor,
  WebSocketManager,
  EnhancedHttpClient,
  createHttpClient,
  createWebSocketManager
};