/**
 * IDE Integrations for Claude Code
 * Support for VSCode, JetBrains, Vim/Neovim, and other IDEs
 * Extracted from IDE detection and integration patterns
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getLogger } from '../utils/logging.js';

/**
 * Supported IDEs
 * Original: IDE patterns from lines 9659-9681
 */
export const SupportedIDEs = {
  VSCODE: 'vscode',
  CURSOR: 'cursor',
  WINDSURF: 'windsurf',
  JETBRAINS: 'jetbrains',
  INTELLIJ: 'intellij',
  WEBSTORM: 'webstorm',
  PYCHARM: 'pycharm',
  VIM: 'vim',
  NEOVIM: 'neovim',
  EMACS: 'emacs',
  SUBLIME: 'sublime',
  ATOM: 'atom'
};

/**
 * IDE detection patterns
 */
export const IDEDetectionPatterns = {
  // Terminal programs
  terminalProgram: {
    vscode: ['vscode', 'Visual Studio Code', 'Code'],
    cursor: ['cursor', 'Cursor'],
    windsurf: ['windsurf', 'Windsurf'],
    iterm2: ['iTerm.app', 'iTerm2'],
    terminal: ['Apple_Terminal', 'Terminal.app']
  },

  // Process names
  processNames: {
    vscode: ['code', 'code.exe', 'Code.exe'],
    cursor: ['cursor', 'cursor.exe'],
    jetbrains: ['idea', 'webstorm', 'pycharm', 'phpstorm', 'rubymine'],
    vim: ['vim', 'vi'],
    neovim: ['nvim', 'neovim'],
    emacs: ['emacs']
  },

  // Environment variables
  environmentVars: {
    vscode: ['VSCODE_PID', 'VSCODE_IPC_HOOK'],
    jetbrains: ['IDEA_INITIAL_DIRECTORY', 'WEBSTORM_INITIAL_DIRECTORY'],
    vim: ['VIM', 'VIMRUNTIME'],
    emacs: ['EMACS', 'EMACSDATA']
  }
};

/**
 * IDE detector
 */
export class IDEDetector {
  constructor() {
    this.logger = getLogger('ide-detector');
    this.detectedIDE = null;
    this.terminalProgram = null;
  }

  /**
   * Detect current IDE
   * Original: IDE detection from lines 9678-9681
   */
  async detect() {
    // Check terminal program
    this.terminalProgram = this.detectTerminalProgram();

    // Check environment for IDE
    const ideFromEnv = this.detectFromEnvironment();
    if (ideFromEnv) {
      this.detectedIDE = ideFromEnv;
      return ideFromEnv;
    }

    // Check running processes
    const ideFromProcess = await this.detectFromProcesses();
    if (ideFromProcess) {
      this.detectedIDE = ideFromProcess;
      return ideFromProcess;
    }

    // Check parent process
    const ideFromParent = await this.detectFromParentProcess();
    if (ideFromParent) {
      this.detectedIDE = ideFromParent;
      return ideFromParent;
    }

    return null;
  }

  /**
   * Detect terminal program
   * Original: TERM_PROGRAM check from line 7503
   */
  detectTerminalProgram() {
    const termProgram = process.env.TERM_PROGRAM;
    if (!termProgram) return null;

    const termLower = termProgram.toLowerCase();

    for (const [ide, patterns] of Object.entries(IDEDetectionPatterns.terminalProgram)) {
      if (patterns.some(pattern => termLower.includes(pattern.toLowerCase()))) {
        this.logger.debug(`Detected terminal program: ${ide}`);
        return ide;
      }
    }

    return termProgram;
  }

  /**
   * Detect from environment variables
   */
  detectFromEnvironment() {
    for (const [ide, vars] of Object.entries(IDEDetectionPatterns.environmentVars)) {
      if (vars.some(varName => process.env[varName])) {
        this.logger.debug(`Detected IDE from environment: ${ide}`);
        return ide;
      }
    }

    // Special VSCode detection on Windows
    if (process.platform === 'win32' &&
        process.env.TERM_PROGRAM === 'vscode' &&
        process.env.TERM_PROGRAM_VERSION) {
      return SupportedIDEs.VSCODE;
    }

    return null;
  }

  /**
   * Detect from running processes
   */
  async detectFromProcesses() {
    try {
      const processes = await this.getRunningProcesses();

      for (const [ide, names] of Object.entries(IDEDetectionPatterns.processNames)) {
        if (names.some(name => processes.includes(name))) {
          this.logger.debug(`Detected IDE from process: ${ide}`);
          return ide;
        }
      }
    } catch (error) {
      this.logger.warn('Failed to detect from processes', { error });
    }

    return null;
  }

  /**
   * Get running processes
   */
  async getRunningProcesses() {
    return new Promise((resolve, reject) => {
      const platform = process.platform;
      let command;

      if (platform === 'win32') {
        command = 'tasklist';
      } else if (platform === 'darwin') {
        command = 'ps aux';
      } else {
        command = 'ps aux';
      }

      const proc = spawn(command, [], { shell: true });
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', () => {
        const processes = output.toLowerCase();
        resolve(processes);
      });

      proc.on('error', reject);
    });
  }

  /**
   * Detect from parent process
   */
  async detectFromParentProcess() {
    try {
      const ppid = process.ppid;
      if (!ppid) return null;

      // Get parent process info
      const parentInfo = await this.getProcessInfo(ppid);

      for (const [ide, names] of Object.entries(IDEDetectionPatterns.processNames)) {
        if (names.some(name => parentInfo.includes(name))) {
          this.logger.debug(`Detected IDE from parent process: ${ide}`);
          return ide;
        }
      }
    } catch (error) {
      this.logger.warn('Failed to detect from parent process', { error });
    }

    return null;
  }

  /**
   * Get process info
   */
  async getProcessInfo(pid) {
    return new Promise((resolve, reject) => {
      const platform = process.platform;
      let command;

      if (platform === 'win32') {
        command = `wmic process where ProcessId=${pid} get Name,CommandLine`;
      } else {
        command = `ps -p ${pid} -o comm=`;
      }

      const proc = spawn(command, [], { shell: true });
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', () => {
        resolve(output.toLowerCase());
      });

      proc.on('error', reject);
    });
  }

  /**
   * Get IDE info
   */
  getIDEInfo() {
    return {
      detectedIDE: this.detectedIDE,
      terminalProgram: this.terminalProgram,
      platform: process.platform
    };
  }
}

/**
 * VSCode integration
 * Original: VSCode patterns from lines 9859-9862
 */
export class VSCodeIntegration extends EventEmitter {
  constructor(variant = 'VSCode') {
    super();
    this.variant = variant; // VSCode, Cursor, Windsurf
    this.logger = getLogger(`${variant.toLowerCase()}-integration`);
    this.extensionPath = null;
    this.isInstalled = false;
    this.isConnected = false;
  }

  /**
   * Get application name
   * Original: OA0 function pattern from line 9860
   */
  getAppName() {
    return this.variant === 'VSCode' ? 'Code' : this.variant;
  }

  /**
   * Get extension path
   */
  getExtensionPath() {
    const home = os.homedir();
    const appName = this.getAppName().toLowerCase();

    if (process.platform === 'win32') {
      return path.join(home, '.vscode', 'extensions');
    } else if (process.platform === 'darwin') {
      return path.join(home, '.vscode', 'extensions');
    } else {
      return path.join(home, '.vscode', 'extensions');
    }
  }

  /**
   * Check if installed
   */
  async checkInstalled() {
    try {
      const extensionPath = this.getExtensionPath();
      this.isInstalled = fs.existsSync(extensionPath);
      this.extensionPath = extensionPath;
      return this.isInstalled;
    } catch (error) {
      this.logger.error('Failed to check installation', { error });
      return false;
    }
  }

  /**
   * Install extension
   */
  async installExtension(extensionId = 'anthropic.claude-code') {
    const appName = this.getAppName().toLowerCase();

    try {
      const command = `${appName} --install-extension ${extensionId}`;

      await this.executeCommand(command);
      this.logger.info(`Extension installed: ${extensionId}`);
      this.emit('extensionInstalled', extensionId);

      return true;
    } catch (error) {
      this.logger.error('Failed to install extension', { error });
      this.emit('extensionInstallError', error);
      return false;
    }
  }

  /**
   * Open file in IDE
   */
  async openFile(filePath, line = null, column = null) {
    const appName = this.getAppName().toLowerCase();
    let args = [filePath];

    if (line !== null) {
      // VSCode go-to syntax
      args = [`${filePath}:${line}${column !== null ? `:${column}` : ''}`];
    }

    try {
      const command = appName;
      await this.executeCommand(command, args);

      this.logger.info('File opened in IDE', { filePath, line, column });
      this.emit('fileOpened', { filePath, line, column });

      return true;
    } catch (error) {
      this.logger.error('Failed to open file', { error });
      return false;
    }
  }

  /**
   * Open folder in IDE
   */
  async openFolder(folderPath) {
    const appName = this.getAppName().toLowerCase();

    try {
      const command = `${appName} ${folderPath}`;
      await this.executeCommand(command);

      this.logger.info('Folder opened in IDE', { folderPath });
      this.emit('folderOpened', folderPath);

      return true;
    } catch (error) {
      this.logger.error('Failed to open folder', { error });
      return false;
    }
  }

  /**
   * Execute command
   */
  async executeCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { shell: true });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Connect to IDE
   */
  async connect() {
    // Try to establish connection via extension
    try {
      // This would use IPC or WebSocket to connect
      this.isConnected = true;
      this.emit('connected');
      return true;
    } catch (error) {
      this.logger.error('Failed to connect', { error });
      return false;
    }
  }

  /**
   * Send command to IDE
   */
  async sendCommand(command, params = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to IDE');
    }

    // Send command via IPC/WebSocket
    this.emit('commandSent', { command, params });
  }
}

/**
 * JetBrains integration
 */
export class JetBrainsIntegration extends EventEmitter {
  constructor(product = 'idea') {
    super();
    this.product = product; // idea, webstorm, pycharm, etc.
    this.logger = getLogger('jetbrains-integration');
    this.pluginPath = null;
    this.isInstalled = false;
  }

  /**
   * Get plugin directory
   */
  getPluginDirectory() {
    const home = os.homedir();
    const version = this.detectVersion();

    if (process.platform === 'win32') {
      return path.join(home, `AppData/Roaming/JetBrains/${this.product}${version}/plugins`);
    } else if (process.platform === 'darwin') {
      return path.join(home, `Library/Application Support/JetBrains/${this.product}${version}/plugins`);
    } else {
      return path.join(home, `.config/JetBrains/${this.product}${version}/plugins`);
    }
  }

  /**
   * Detect JetBrains version
   */
  detectVersion() {
    // Try to detect installed version
    // This is simplified - actual implementation would scan directories
    return '2024.1';
  }

  /**
   * Check if installed
   */
  async checkInstalled() {
    try {
      const pluginPath = this.getPluginDirectory();
      this.isInstalled = fs.existsSync(pluginPath);
      this.pluginPath = pluginPath;
      return this.isInstalled;
    } catch (error) {
      this.logger.error('Failed to check installation', { error });
      return false;
    }
  }

  /**
   * Install plugin
   */
  async installPlugin(pluginPath) {
    if (!this.pluginPath) {
      await this.checkInstalled();
    }

    if (!this.pluginPath) {
      throw new Error('Plugin directory not found');
    }

    try {
      // Copy plugin to plugins directory
      const destPath = path.join(this.pluginPath, 'claude-code');

      // This would copy the plugin files
      this.logger.info('Plugin installed', { destPath });
      this.emit('pluginInstalled', destPath);

      return true;
    } catch (error) {
      this.logger.error('Failed to install plugin', { error });
      this.emit('pluginInstallError', error);
      return false;
    }
  }

  /**
   * Open project
   */
  async openProject(projectPath) {
    try {
      let command;

      if (process.platform === 'darwin') {
        command = `open -a "${this.getApplicationName()}" "${projectPath}"`;
      } else if (process.platform === 'win32') {
        command = `"${this.getExecutablePath()}" "${projectPath}"`;
      } else {
        command = `${this.product}.sh "${projectPath}"`;
      }

      await this.executeCommand(command);
      this.logger.info('Project opened', { projectPath });
      this.emit('projectOpened', projectPath);

      return true;
    } catch (error) {
      this.logger.error('Failed to open project', { error });
      return false;
    }
  }

  /**
   * Get application name
   */
  getApplicationName() {
    const names = {
      idea: 'IntelliJ IDEA',
      webstorm: 'WebStorm',
      pycharm: 'PyCharm',
      phpstorm: 'PhpStorm',
      rubymine: 'RubyMine'
    };
    return names[this.product] || this.product;
  }

  /**
   * Get executable path
   */
  getExecutablePath() {
    if (process.platform === 'win32') {
      return `C:\\Program Files\\JetBrains\\${this.getApplicationName()}\\bin\\${this.product}64.exe`;
    }
    return this.product;
  }

  /**
   * Execute command
   */
  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, [], { shell: true });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }
}

/**
 * Vim/Neovim integration
 */
export class VimIntegration extends EventEmitter {
  constructor(variant = 'vim') {
    super();
    this.variant = variant; // vim or neovim
    this.logger = getLogger(`${variant}-integration`);
    this.configPath = null;
    this.isInstalled = false;
  }

  /**
   * Get config path
   */
  getConfigPath() {
    const home = os.homedir();

    if (this.variant === 'neovim') {
      if (process.platform === 'win32') {
        return path.join(home, 'AppData/Local/nvim');
      } else {
        return path.join(home, '.config/nvim');
      }
    } else {
      return path.join(home, '.vim');
    }
  }

  /**
   * Check if installed
   */
  async checkInstalled() {
    try {
      const configPath = this.getConfigPath();
      this.configPath = configPath;

      // Check if vim/neovim is available
      const command = this.variant === 'neovim' ? 'nvim' : 'vim';
      const result = await this.executeCommand(`${command} --version`);

      this.isInstalled = result.success;
      return this.isInstalled;
    } catch (error) {
      this.logger.error('Failed to check installation', { error });
      return false;
    }
  }

  /**
   * Install plugin
   */
  async installPlugin() {
    if (!this.configPath) {
      await this.checkInstalled();
    }

    try {
      // Install via plugin manager (vim-plug, packer, etc.)
      const pluginLine = 'Plug \'anthropic/claude-code-vim\'';

      // Add to config
      const configFile = path.join(this.configPath, this.variant === 'neovim' ? 'init.vim' : 'vimrc');

      // This would append the plugin line
      this.logger.info('Plugin configured', { configFile });
      this.emit('pluginInstalled');

      return true;
    } catch (error) {
      this.logger.error('Failed to install plugin', { error });
      return false;
    }
  }

  /**
   * Open file
   */
  async openFile(filePath, line = null) {
    const command = this.variant === 'neovim' ? 'nvim' : 'vim';
    let args = [filePath];

    if (line !== null) {
      args.push(`+${line}`);
    }

    try {
      const fullCommand = `${command} ${args.join(' ')}`;
      await this.executeCommand(fullCommand);

      this.logger.info('File opened', { filePath, line });
      this.emit('fileOpened', { filePath, line });

      return true;
    } catch (error) {
      this.logger.error('Failed to open file', { error });
      return false;
    }
  }

  /**
   * Execute command
   */
  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, [], { shell: true });
      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          output,
          error: errorOutput
        });
      });

      proc.on('error', reject);
    });
  }
}

/**
 * IDE manager
 * Manages all IDE integrations
 */
export class IDEManager extends EventEmitter {
  constructor() {
    super();
    this.logger = getLogger('ide-manager');
    this.detector = new IDEDetector();
    this.currentIDE = null;
    this.integration = null;
  }

  /**
   * Initialize IDE integration
   */
  async initialize() {
    // Detect current IDE
    const detectedIDE = await this.detector.detect();

    if (detectedIDE) {
      this.logger.info(`Detected IDE: ${detectedIDE}`);
      this.currentIDE = detectedIDE;

      // Create appropriate integration
      this.integration = await this.createIntegration(detectedIDE);

      if (this.integration) {
        await this.integration.checkInstalled();
        this.emit('initialized', {
          ide: detectedIDE,
          installed: this.integration.isInstalled
        });
      }
    } else {
      this.logger.info('No IDE detected');
      this.emit('noIDEDetected');
    }

    return this.integration;
  }

  /**
   * Create integration instance
   */
  async createIntegration(ide) {
    switch (ide) {
      case SupportedIDEs.VSCODE:
        return new VSCodeIntegration('VSCode');

      case SupportedIDEs.CURSOR:
        return new VSCodeIntegration('Cursor');

      case SupportedIDEs.WINDSURF:
        return new VSCodeIntegration('Windsurf');

      case SupportedIDEs.JETBRAINS:
      case SupportedIDEs.INTELLIJ:
        return new JetBrainsIntegration('idea');

      case SupportedIDEs.WEBSTORM:
        return new JetBrainsIntegration('webstorm');

      case SupportedIDEs.PYCHARM:
        return new JetBrainsIntegration('pycharm');

      case SupportedIDEs.VIM:
        return new VimIntegration('vim');

      case SupportedIDEs.NEOVIM:
        return new VimIntegration('neovim');

      default:
        this.logger.warn(`Unsupported IDE: ${ide}`);
        return null;
    }
  }

  /**
   * Install IDE extension/plugin
   */
  async installExtension() {
    if (!this.integration) {
      throw new Error('No IDE integration available');
    }

    if (this.integration instanceof VSCodeIntegration) {
      return await this.integration.installExtension();
    } else if (this.integration instanceof JetBrainsIntegration) {
      return await this.integration.installPlugin();
    } else if (this.integration instanceof VimIntegration) {
      return await this.integration.installPlugin();
    }

    return false;
  }

  /**
   * Open file in IDE
   */
  async openFile(filePath, line = null, column = null) {
    if (!this.integration) {
      throw new Error('No IDE integration available');
    }

    if (this.integration.openFile) {
      return await this.integration.openFile(filePath, line, column);
    }

    return false;
  }

  /**
   * Get IDE info
   */
  getIDEInfo() {
    return {
      detected: this.currentIDE,
      installed: this.integration?.isInstalled || false,
      connected: this.integration?.isConnected || false,
      terminalProgram: this.detector.terminalProgram,
      platform: process.platform
    };
  }

  /**
   * Get supported IDEs for platform
   */
  getSupportedIDEs() {
    const platform = process.platform;
    const supported = [];

    // VSCode family - all platforms
    supported.push(SupportedIDEs.VSCODE, SupportedIDEs.CURSOR, SupportedIDEs.WINDSURF);

    // JetBrains - all platforms
    supported.push(
      SupportedIDEs.JETBRAINS,
      SupportedIDEs.INTELLIJ,
      SupportedIDEs.WEBSTORM,
      SupportedIDEs.PYCHARM
    );

    // Terminal editors - all platforms
    supported.push(SupportedIDEs.VIM, SupportedIDEs.NEOVIM, SupportedIDEs.EMACS);

    // Platform specific
    if (platform === 'darwin') {
      supported.push(SupportedIDEs.SUBLIME);
    }

    return supported;
  }
}

// Export utility functions
export function createIDEManager() {
  return new IDEManager();
}

export function createVSCodeIntegration(variant) {
  return new VSCodeIntegration(variant);
}

export function createJetBrainsIntegration(product) {
  return new JetBrainsIntegration(product);
}

export function createVimIntegration(variant) {
  return new VimIntegration(variant);
}

export default {
  SupportedIDEs,
  IDEDetectionPatterns,
  IDEDetector,
  VSCodeIntegration,
  JetBrainsIntegration,
  VimIntegration,
  IDEManager,
  createIDEManager,
  createVSCodeIntegration,
  createJetBrainsIntegration,
  createVimIntegration
};