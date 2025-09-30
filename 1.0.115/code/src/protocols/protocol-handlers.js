/**
 * Claude Code Protocol Handlers
 *
 * Handles custom URI schemes, deep linking, and IPC protocols for Claude Code.
 * Enables integration with external applications and services.
 *
 * Reconstructed based on architectural patterns (lines ~44000-44400)
 * Part of the 85% → 87% extraction phase
 */

import { EventEmitter } from 'events';
import * as url from 'url';
import * as path from 'path';
import * as net from 'net';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs/promises';

/**
 * Protocol Registry
 * Manages custom protocol handlers
 */
export class ProtocolRegistry {
  constructor() {
    this.handlers = new Map();
    this.defaultHandler = null;

    // Register built-in protocols
    this.registerBuiltinProtocols();
  }

  /**
   * Register built-in protocol handlers
   */
  registerBuiltinProtocols() {
    // Claude protocol for internal commands
    this.register('claude', new ClaudeProtocolHandler());

    // File protocol for opening files
    this.register('file', new FileProtocolHandler());

    // HTTP/HTTPS for web resources
    this.register('http', new HttpProtocolHandler());
    this.register('https', new HttpProtocolHandler());

    // VSCode protocol for IDE integration
    this.register('vscode', new VSCodeProtocolHandler());

    // IPC protocol for inter-process communication
    this.register('ipc', new IPCProtocolHandler());
  }

  /**
   * Register protocol handler
   */
  register(protocol, handler) {
    if (typeof protocol !== 'string') {
      throw new TypeError('Protocol must be a string');
    }

    if (!handler || typeof handler.handle !== 'function') {
      throw new TypeError('Handler must have a handle method');
    }

    this.handlers.set(protocol.toLowerCase(), handler);
  }

  /**
   * Unregister protocol handler
   */
  unregister(protocol) {
    return this.handlers.delete(protocol.toLowerCase());
  }

  /**
   * Handle URI
   */
  async handle(uri) {
    const parsed = url.parse(uri);
    const protocol = (parsed.protocol || '').replace(':', '').toLowerCase();

    const handler = this.handlers.get(protocol) || this.defaultHandler;

    if (!handler) {
      throw new Error(`No handler registered for protocol: ${protocol}`);
    }

    return await handler.handle(uri, parsed);
  }

  /**
   * Check if protocol is registered
   */
  isRegistered(protocol) {
    return this.handlers.has(protocol.toLowerCase());
  }

  /**
   * Set default handler
   */
  setDefaultHandler(handler) {
    this.defaultHandler = handler;
  }
}

/**
 * Base Protocol Handler
 */
export class ProtocolHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
  }

  /**
   * Handle URI (must be implemented by subclasses)
   */
  async handle(uri, parsed) {
    throw new Error('handle method must be implemented');
  }

  /**
   * Validate URI
   */
  validate(uri, parsed) {
    return true;
  }

  /**
   * Parse parameters from URI
   */
  parseParameters(parsed) {
    const params = new URLSearchParams(parsed.query || '');
    const result = {};

    for (const [key, value] of params) {
      result[key] = value;
    }

    return result;
  }
}

/**
 * Claude Protocol Handler
 * Handles claude:// URIs for internal commands
 */
export class ClaudeProtocolHandler extends ProtocolHandler {
  async handle(uri, parsed) {
    const command = parsed.hostname;
    const params = this.parseParameters(parsed);

    switch (command) {
      case 'open':
        return this.handleOpen(params);
      case 'execute':
        return this.handleExecute(params);
      case 'settings':
        return this.handleSettings(params);
      case 'help':
        return this.handleHelp(params);
      case 'update':
        return this.handleUpdate(params);
      default:
        throw new Error(`Unknown claude command: ${command}`);
    }
  }

  async handleOpen(params) {
    const { file, line, column } = params;
    if (!file) throw new Error('File parameter required');

    this.emit('open:file', { file, line, column });
    return { success: true, action: 'open', file };
  }

  async handleExecute(params) {
    const { command, args } = params;
    if (!command) throw new Error('Command parameter required');

    this.emit('execute:command', { command, args });
    return { success: true, action: 'execute', command };
  }

  async handleSettings(params) {
    const { section, key, value } = params;

    if (value !== undefined) {
      this.emit('settings:set', { section, key, value });
      return { success: true, action: 'set', key, value };
    } else {
      this.emit('settings:open', { section });
      return { success: true, action: 'open-settings', section };
    }
  }

  async handleHelp(params) {
    const { topic } = params;

    this.emit('help:show', { topic });
    return { success: true, action: 'help', topic };
  }

  async handleUpdate(params) {
    const { check, install } = params;

    if (check) {
      this.emit('update:check');
      return { success: true, action: 'check-update' };
    } else if (install) {
      this.emit('update:install');
      return { success: true, action: 'install-update' };
    }

    return { success: false, error: 'No update action specified' };
  }
}

/**
 * File Protocol Handler
 * Handles file:// URIs
 */
export class FileProtocolHandler extends ProtocolHandler {
  async handle(uri, parsed) {
    const filePath = decodeURIComponent(parsed.pathname || '');
    const params = this.parseParameters(parsed);

    if (!filePath) {
      throw new Error('File path required');
    }

    // Normalize path for the platform
    const normalizedPath = process.platform === 'win32'
      ? filePath.replace(/^\//, '').replace(/\//g, '\\')
      : filePath;

    this.emit('file:open', {
      path: normalizedPath,
      line: params.line,
      column: params.column
    });

    return {
      success: true,
      action: 'open-file',
      path: normalizedPath
    };
  }
}

/**
 * HTTP/HTTPS Protocol Handler
 * Handles web URLs
 */
export class HttpProtocolHandler extends ProtocolHandler {
  async handle(uri, parsed) {
    this.emit('http:open', { url: uri });

    // Open in default browser
    const opener = process.platform === 'win32' ? 'start' :
                   process.platform === 'darwin' ? 'open' : 'xdg-open';

    spawn(opener, [uri], { detached: true, stdio: 'ignore' }).unref();

    return {
      success: true,
      action: 'open-url',
      url: uri
    };
  }
}

/**
 * VSCode Protocol Handler
 * Handles vscode:// URIs for VSCode integration
 */
export class VSCodeProtocolHandler extends ProtocolHandler {
  async handle(uri, parsed) {
    const command = parsed.hostname;
    const params = this.parseParameters(parsed);

    switch (command) {
      case 'file':
        return this.openFile(params);
      case 'folder':
        return this.openFolder(params);
      case 'command':
        return this.runCommand(params);
      default:
        // Pass through to VSCode
        spawn('code', ['--open-url', uri], {
          detached: true,
          stdio: 'ignore'
        }).unref();

        return {
          success: true,
          action: 'vscode-passthrough',
          uri
        };
    }
  }

  async openFile(params) {
    const { path: filePath, line, column } = params;
    if (!filePath) throw new Error('Path parameter required');

    const args = ['--goto', `${filePath}:${line || 1}:${column || 1}`];

    spawn('code', args, {
      detached: true,
      stdio: 'ignore'
    }).unref();

    return {
      success: true,
      action: 'vscode-open-file',
      path: filePath
    };
  }

  async openFolder(params) {
    const { path: folderPath } = params;
    if (!folderPath) throw new Error('Path parameter required');

    spawn('code', [folderPath], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    return {
      success: true,
      action: 'vscode-open-folder',
      path: folderPath
    };
  }

  async runCommand(params) {
    const { command } = params;
    if (!command) throw new Error('Command parameter required');

    spawn('code', ['--command', command], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    return {
      success: true,
      action: 'vscode-command',
      command
    };
  }
}

/**
 * IPC Protocol Handler
 * Handles inter-process communication
 */
export class IPCProtocolHandler extends ProtocolHandler {
  constructor(options = {}) {
    super(options);
    this.connections = new Map();
    this.server = null;
  }

  async handle(uri, parsed) {
    const action = parsed.hostname;
    const params = this.parseParameters(parsed);

    switch (action) {
      case 'connect':
        return this.connect(params);
      case 'send':
        return this.send(params);
      case 'listen':
        return this.listen(params);
      case 'close':
        return this.close(params);
      default:
        throw new Error(`Unknown IPC action: ${action}`);
    }
  }

  async connect(params) {
    const { socket, port, host } = params;

    if (socket) {
      // Unix socket or Windows named pipe
      const client = net.createConnection(socket);
      this.connections.set(socket, client);

      return {
        success: true,
        action: 'ipc-connect',
        socket
      };
    } else if (port) {
      // TCP connection
      const client = net.createConnection(port, host || 'localhost');
      const id = `${host || 'localhost'}:${port}`;
      this.connections.set(id, client);

      return {
        success: true,
        action: 'ipc-connect',
        port,
        host: host || 'localhost'
      };
    }

    throw new Error('Socket or port required for connection');
  }

  async send(params) {
    const { to, message } = params;
    if (!to || !message) {
      throw new Error('Recipient and message required');
    }

    const connection = this.connections.get(to);
    if (!connection) {
      throw new Error(`No connection to ${to}`);
    }

    connection.write(JSON.stringify({ message, timestamp: Date.now() }));

    return {
      success: true,
      action: 'ipc-send',
      to,
      message
    };
  }

  async listen(params) {
    const { socket, port } = params;

    if (this.server) {
      throw new Error('Server already listening');
    }

    this.server = net.createServer((connection) => {
      this.emit('ipc:connection', connection);

      connection.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.emit('ipc:message', message);
        } catch (error) {
          this.emit('ipc:error', error);
        }
      });
    });

    if (socket) {
      await new Promise((resolve, reject) => {
        this.server.listen(socket, (err) => err ? reject(err) : resolve());
      });

      return {
        success: true,
        action: 'ipc-listen',
        socket
      };
    } else if (port) {
      await new Promise((resolve, reject) => {
        this.server.listen(port, (err) => err ? reject(err) : resolve());
      });

      return {
        success: true,
        action: 'ipc-listen',
        port
      };
    }

    throw new Error('Socket or port required for listening');
  }

  async close(params) {
    const { connection } = params;

    if (connection) {
      const conn = this.connections.get(connection);
      if (conn) {
        conn.end();
        this.connections.delete(connection);
      }
    } else {
      // Close all connections
      for (const conn of this.connections.values()) {
        conn.end();
      }
      this.connections.clear();

      if (this.server) {
        this.server.close();
        this.server = null;
      }
    }

    return {
      success: true,
      action: 'ipc-close'
    };
  }
}

/**
 * Deep Link Manager
 * Manages deep linking for the application
 */
export class DeepLinkManager extends EventEmitter {
  constructor() {
    super();
    this.registry = new ProtocolRegistry();
    this.registered = false;
  }

  /**
   * Register application for deep linking
   */
  async register() {
    if (this.registered) return;

    const platform = process.platform;

    if (platform === 'win32') {
      await this.registerWindows();
    } else if (platform === 'darwin') {
      await this.registerMacOS();
    } else {
      await this.registerLinux();
    }

    this.registered = true;
    this.emit('registered');
  }

  /**
   * Register on Windows
   */
  async registerWindows() {
    // Register custom protocol in Windows Registry
    const protocol = 'claude';
    const appPath = process.execPath;

    const commands = [
      `reg add HKCU\\Software\\Classes\\${protocol} /ve /d "URL:Claude Protocol" /f`,
      `reg add HKCU\\Software\\Classes\\${protocol} /v "URL Protocol" /d "" /f`,
      `reg add HKCU\\Software\\Classes\\${protocol}\\shell\\open\\command /ve /d "\\"${appPath}\\" \\"%1\\"" /f`
    ];

    for (const cmd of commands) {
      execSync(cmd);
    }
  }

  /**
   * Register on macOS
   */
  async registerMacOS() {
    // macOS registration handled via Info.plist
    // This would be done during app packaging
    this.emit('macos:register', {
      protocol: 'claude',
      bundleId: 'com.anthropic.claude-code'
    });
  }

  /**
   * Register on Linux
   */
  async registerLinux() {
    // Register via .desktop file
    const desktopEntry = `
[Desktop Entry]
Name=Claude Code
Exec=${process.execPath} %u
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/claude;
`;

    const desktopPath = path.join(
      process.env.HOME,
      '.local/share/applications/claude-code.desktop'
    );

    await fs.writeFile(desktopPath, desktopEntry);

    // Update MIME database
    execSync('update-desktop-database ~/.local/share/applications/');
  }

  /**
   * Handle incoming URI
   */
  async handleUri(uri) {
    this.emit('uri:received', uri);

    try {
      const result = await this.registry.handle(uri);
      this.emit('uri:handled', { uri, result });
      return result;
    } catch (error) {
      this.emit('uri:error', { uri, error });
      throw error;
    }
  }
}

// Export convenience functions
export function createProtocolRegistry() {
  return new ProtocolRegistry();
}

export function createDeepLinkManager() {
  return new DeepLinkManager();
}

// Default instances
export const protocolRegistry = new ProtocolRegistry();
export const deepLinkManager = new DeepLinkManager();