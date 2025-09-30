/**
 * Installation and Update System
 * Complete installation, update, and migration management
 * Extracted from lines 20000-21000 of original file
 */

import { join } from 'path';
import { constants } from 'fs';
import fs from 'fs';
import semver from 'semver';

// Constants
const PACKAGE_INFO = {
  PACKAGE_URL: '@anthropic-ai/claude-code',
  VERSION: '1.0.115'
};

const UPDATE_LOCK_TIMEOUT = 300000; // 5 minutes

// Command Specs (lines 20401-20503)
const COMMAND_SPECS = {
  pyright: {
    name: 'pyright',
    description: 'Type checker for Python',
    options: [
      { name: '--version', description: 'Print pyright version and exit' },
      { name: ['--watch', '-w'], description: 'Continue to run and watch for changes' },
      { name: ['--project', '-p'], args: { name: 'FILE OR DIRECTORY' } },
      { name: ['--typeshedpath', '-t'], description: 'Use typeshed type stubs at this location', args: { name: 'DIRECTORY' } },
      { name: '--verifytypes', description: 'Verify completeness of types in py.typed package', args: { name: 'IMPORT' } },
      { name: '--ignoreexternal', description: 'Ignore external imports for --verifytypes' },
      { name: '--pythonpath', description: 'Path to the Python interpreter', args: { name: 'FILE' } },
      { name: '--pythonplatform', description: 'Analyze for platform', args: { name: 'PLATFORM' } },
      { name: '--pythonversion', description: 'Analyze for Python version', args: { name: 'VERSION' } },
      { name: ['--venvpath', '-v'], description: 'Directory that contains virtual environments', args: { name: 'DIRECTORY' } },
      { name: '--verbose', description: 'Emit verbose diagnostics' },
      { name: '--stats', description: 'Print detailed performance stats' },
      { name: '--level', description: 'Minimum diagnostic level', args: { name: 'LEVEL' } },
      { name: '--skipunannotated', description: 'Skip type analysis of unannotated functions' },
      { name: '--warnings', description: 'Use exit code of 1 if warnings are reported' }
    ],
    args: { name: 'files', description: 'Files to analyze', isVariadic: true, isOptional: true }
  },

  timeout: {
    name: 'timeout',
    description: 'Run a command with a time limit',
    args: [
      { name: 'duration', description: 'Duration to wait before timing out (e.g., 10, 5s, 2m)', isOptional: false },
      { name: 'command', description: 'Command to run', isCommand: true }
    ]
  },

  sleep: {
    name: 'sleep',
    description: 'Delay for a specified amount of time',
    args: {
      name: 'duration',
      description: 'Duration to sleep (seconds or with suffix like 5s, 2m, 1h)',
      isOptional: false
    }
  },

  alias: {
    name: 'alias',
    description: 'Create or list command aliases',
    args: {
      name: 'definition',
      description: 'Alias definition in the form name=value',
      isOptional: true,
      isVariadic: true
    }
  },

  nohup: {
    name: 'nohup',
    description: 'Run a command immune to hangups',
    args: { name: 'command', description: 'Command to run with nohup', isCommand: true }
  },

  time: {
    name: 'time',
    description: 'Time a command',
    args: { name: 'command', description: 'Command to time', isCommand: true }
  },

  srun: {
    name: 'srun',
    description: 'Run a command on SLURM cluster nodes',
    options: [
      {
        name: ['-n', '--ntasks'],
        description: 'Number of tasks',
        args: { name: 'count', description: 'Number of tasks to run' }
      },
      {
        name: ['-N', '--nodes'],
        description: 'Number of nodes',
        args: { name: 'count', description: 'Number of nodes to allocate' }
      }
    ],
    args: { name: 'command', description: 'Command to run on the cluster', isCommand: true }
  }
};

// Installation Functions
// Original: lines 20025-20041

/**
 * Uninstall global Claude Code
 * Original: async function gBB()
 */
async function uninstallGlobalClaudeCode() {
  try {
    const args = [
      'uninstall',
      '-g',
      '--force',
      PACKAGE_INFO.PACKAGE_URL
    ];

    const result = await executeCommand('npm', args);
    return result.code === 0;
  } catch (error) {
    console.error('Uninstall failed:', error);
    return false;
  }
}

/**
 * Track installation migration
 * Original: function wv(arg, options)
 */
function trackInstallationMigration(result, reason) {
  trackEvent('tengu_local_install_migration', { result, reason });
}

/**
 * Check minimum version requirement
 * Original: async function mBB()
 */
async function checkMinimumVersion(config) {
  try {
    if (config.minVersion && semver.lt(PACKAGE_INFO.VERSION, config.minVersion)) {
      console.error(`
A newer version (${config.minVersion} or higher) is required to continue.

To update, please run:
    claude update

This will ensure you have access to the latest features and improvements.
`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Version check failed:', error);
  }
}

// Lock File Management
// Original: lines 20074-20100

/**
 * Get update lock file path
 * Original: function Gd()
 */
function getUpdateLockPath() {
  return join(getTemporaryDirectory(), '.update.lock');
}

/**
 * Check and acquire update lock
 * Original: function zx6()
 */
function acquireUpdateLock() {
  try {
    const tempDir = getTemporaryDirectory();
    const lockPath = getUpdateLockPath();

    // Create temp directory if doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Check existing lock
    if (fs.existsSync(lockPath)) {
      const stats = fs.statSync(lockPath);

      // If lock is older than timeout, remove it
      if (Date.now() - stats.mtimeMs < UPDATE_LOCK_TIMEOUT) {
        return false; // Lock held by another process
      }

      try {
        fs.unlinkSync(lockPath);
      } catch (error) {
        console.error('Failed to remove stale lock:', error);
        return false;
      }
    }

    // Create new lock
    fs.writeFileSync(lockPath, process.pid.toString());
    return true;
  } catch (error) {
    console.error('Failed to acquire lock:', error);
    return false;
  }
}

/**
 * Release update lock
 * Original: function Hx6()
 */
function releaseUpdateLock() {
  try {
    const lockPath = getUpdateLockPath();
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch (error) {
    console.error('Failed to release lock:', error);
  }
}

// Permission Checking
// Original: lines 20101-20125

/**
 * Get global npm/bun prefix
 * Original: async function Dx6()
 */
async function getGlobalPrefix() {
  const isRunningWithBun = systemPlatformInfo.isRunningWithBun();

  let result = null;
  if (isRunningWithBun) {
    result = await executeCommand('bun', ['pm', 'bin', '-g']);
  } else {
    result = await executeCommand('npm', ['prefix', '-g']);
  }

  if (result.code !== 0) {
    console.error(`Failed to check ${isRunningWithBun ? 'bun' : 'npm'} permissions`);
    return null;
  }

  return result.stdout.trim();
}

/**
 * Check npm/bun permissions
 * Original: async function nD0()
 */
async function checkUpdatePermissions() {
  try {
    const prefix = await getGlobalPrefix();
    if (!prefix) {
      return { hasPermissions: false, npmPrefix: null };
    }

    let hasWriteAccess = false;
    try {
      fs.accessSync(prefix, constants.W_OK);
      hasWriteAccess = true;
    } catch {
      hasWriteAccess = false;
    }

    return {
      hasPermissions: hasWriteAccess,
      npmPrefix: prefix
    };
  } catch (error) {
    console.error('Permission check failed:', error);
    return { hasPermissions: false, npmPrefix: null };
  }
}

// Update System
// Original: lines 20126-20196

/**
 * Check for available updates
 * Original: async function tk1()
 */
async function checkForUpdates() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5000); // 5 second timeout

  try {
    const result = await executeCommand(
      'npm',
      ['view', PACKAGE_INFO.PACKAGE_URL, 'version'],
      { signal: controller.signal }
    );

    if (result.code !== 0) {
      console.error(`npm view failed with code ${result.code}`);
      if (result.stderr) console.error(`npm stderr: ${result.stderr.trim()}`);
      if (result.stdout) console.error(`npm stdout: ${result.stdout.trim()}`);
      return null;
    }

    return result.stdout.trim();
  } catch (error) {
    console.error('Update check failed:', error);
    return null;
  }
}

/**
 * Perform auto-update
 * Original: async function SG1()
 */
async function performAutoUpdate() {
  // Check lock
  if (!acquireUpdateLock()) {
    console.log('Another process is currently installing an update');
    trackEvent('tengu_auto_updater_lock_contention', {
      pid: process.pid,
      currentVersion: PACKAGE_INFO.VERSION
    });
    return 'in_progress';
  }

  try {
    // Remove old aliases
    removeOldAliases();

    // Check for Windows NPM in WSL
    if (!systemPlatformInfo.isRunningWithBun() && systemPlatformInfo.isNpmFromWindowsPath()) {
      console.error(`
Error: Windows NPM detected in WSL

You're running Claude Code in WSL but using the Windows NPM installation from /mnt/c/.

To fix this issue:
  1. Install Node.js within your Linux distribution: e.g. sudo apt install nodejs npm
  2. Make sure Linux NPM is in your PATH before the Windows version
  3. Try updating again with 'claude update'
`);
      trackEvent('tengu_auto_updater_windows_npm_in_wsl', {
        currentVersion: PACKAGE_INFO.VERSION
      });
      return 'install_failed';
    }

    // Check permissions
    const { hasPermissions } = await checkUpdatePermissions();
    if (!hasPermissions) {
      return 'no_permissions';
    }

    // Perform update
    const command = systemPlatformInfo.isRunningWithBun() ? 'bun' : 'npm';
    const result = await executeCommand(command, [
      'install',
      '-g',
      PACKAGE_INFO.PACKAGE_URL
    ]);

    if (result.code !== 0) {
      console.error(`Failed to install new version: ${result.stdout} ${result.stderr}`);
      return 'install_failed';
    }

    return 'success';
  } finally {
    releaseUpdateLock();
  }
}

/**
 * Remove old shell aliases
 * Original: function Cx6()
 */
function removeOldAliases() {
  const shellConfigs = getShellConfigFiles();

  for (const [shell, configPath] of Object.entries(shellConfigs)) {
    try {
      const content = readShellConfig(configPath);
      if (!content) continue;

      const { filtered, hadAlias } = removeClaudeAlias(content);
      if (hadAlias) {
        writeShellConfig(configPath, filtered);
        console.log(`Removed claude alias from ${configPath}`);
      }
    } catch (error) {
      console.error(`Failed to remove alias from ${configPath}: ${error}`);
    }
  }
}

// Installation Detection
// Original: lines 20209-20284

/**
 * Get installation type
 * Original: function I$()
 */
function getInstallationType() {
  const scriptPath = process.argv[1] || '';
  const normalizedPath = scriptPath.split(path.sep).join('/');

  // Development install
  if (normalizedPath.includes('/build-ant/') || normalizedPath.includes('/build-external/')) {
    return 'development';
  }

  // Native install
  if (isNativeInstall()) {
    return 'native';
  }

  // Local npm install
  if (normalizedPath.includes('/.local/bin/claude')) {
    return 'native';
  }

  if (isLocalNpmInstall()) {
    return 'npm-local';
  }

  // Global npm install
  const globalPaths = [
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
    '/opt/homebrew/lib/node_modules',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/.nvm/versions/node/'
  ];

  if (globalPaths.some(p => normalizedPath.includes(p))) {
    return 'npm-global';
  }

  return 'unknown';
}

/**
 * Get installation path
 * Original: async function $x6()
 */
async function getInstallationPath() {
  if (isNativeInstall()) {
    const which = await executeCommand('which', ['claude']);
    if (which.code === 0 && which.stdout) {
      return which.stdout.trim();
    }

    const localBinPath = path.join(getHomeDirectory(), '.local/bin/claude');
    if (fs.existsSync(localBinPath)) {
      return localBinPath;
    }

    return 'native';
  }

  try {
    return process.argv[0] || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get invoked binary path
 * Original: function dBB()
 */
function getInvokedBinaryPath() {
  try {
    return process.argv[1] || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Find all Claude installations
 * Original: async function wx6()
 */
async function findAllInstallations() {
  const installations = [];
  const homeDir = getHomeDirectory();

  // Check local npm install
  const localPath = path.join(homeDir, '.claude', 'local');
  if (isLocalNpmInstall()) {
    installations.push({ type: 'npm-local', path: localPath });
  }

  // Check global npm installs
  const npmList = await executeCommand('npm', ['list', '-g', '--depth=0']);
  if (npmList.code === 0 && npmList.stdout) {
    const globalPrefix = npmList.stdout.trim().split('\n')[0];
    const isWindows = process.platform === 'win32';

    // Check for main package
    const packages = [PACKAGE_INFO.PACKAGE_URL];
    if (PACKAGE_INFO.PACKAGE_URL !== '@anthropic-ai/claude-code') {
      packages.push('@anthropic-ai/claude-code');
    }

    for (const pkg of packages) {
      const binPath = isWindows ?
        path.join(globalPrefix, 'claude') :
        path.join(globalPrefix, 'bin', 'claude');

      if (fs.existsSync(binPath)) {
        installations.push({ type: 'npm-global', path: binPath });
      }
    }
  }

  // Check native install
  const nativePath = path.join(homeDir, '.local', 'bin', 'claude');
  if (fs.existsSync(nativePath)) {
    installations.push({ type: 'native', path: nativePath });
  }

  // Check additional native location
  if (getGlobalConfig().installMethod === 'native') {
    const nativeSharePath = path.join(homeDir, '.local', 'share', 'claude');
    if (fs.existsSync(nativeSharePath) && !installations.some(i => i.type === 'native')) {
      installations.push({ type: 'native', path: nativeSharePath });
    }
  }

  return installations;
}

// Installation Diagnostics
// Original: lines 20285-20399

/**
 * Get installation warnings
 * Original: function qx6(arg)
 */
function getInstallationWarnings(installationType) {
  const warnings = [];
  const config = getGlobalConfig();

  if (installationType === 'development') {
    return warnings;
  }

  // Check PATH for native install
  if (installationType === 'native') {
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    const homeDir = getHomeDirectory();
    const localBinDir = path.join(homeDir, '.local', 'bin');

    const inPath = pathDirs.some(dir => {
      const normalized = dir.split(path.sep).join('/');
      return normalized === localBinDir ||
             dir === '~/.local/bin' ||
             dir === '$HOME/.local/bin';
    });

    if (!inPath) {
      warnings.push({
        issue: 'Native installation exists but ~/.local/bin is not in your PATH',
        fix: 'Add ~/.local/bin to your PATH in your shell configuration'
      });
    }
  }

  // Check installation method mismatch
  if (installationType === 'npm-local' && config.installMethod !== 'local') {
    warnings.push({
      issue: 'Local npm installation exists but not configured as install method',
      fix: 'Consider setting installMethod to "local" in configuration'
    });
  }

  if (installationType === 'native' && config.installMethod !== 'native') {
    warnings.push({
      issue: 'Native installation exists but not configured as install method',
      fix: 'Consider setting installMethod to "native" in configuration'
    });
  }

  // Check alias for local install
  if (installationType === 'npm-local') {
    const aliasExists = checkClaudeAlias();
    const binaryAccessible = checkBinaryAccessible();

    if (aliasExists && !binaryAccessible) {
      warnings.push({
        issue: 'Local installation not accessible',
        fix: 'Alias exists but points to invalid target. Update alias: alias claude="~/.claude/local/claude"'
      });
    } else if (!aliasExists) {
      warnings.push({
        issue: 'Local installation not accessible',
        fix: 'Create alias: alias claude="~/.claude/local/claude"'
      });
    }
  }

  return warnings;
}

/**
 * Get complete installation info
 * Original: async function j11()
 */
async function getInstallationInfo() {
  const installationType = getInstallationType();
  const version = PACKAGE_INFO.VERSION || 'unknown';
  const installationPath = await getInstallationPath();
  const invokedBinary = getInvokedBinaryPath();
  const multipleInstallations = await findAllInstallations();
  let warnings = getInstallationWarnings(installationType);

  // Check for leftover installations
  if (installationType === 'native') {
    const isWindows = process.platform === 'win32';

    for (const install of multipleInstallations) {
      if (install.type === 'npm-global') {
        warnings.push({
          issue: `Leftover npm global installation at ${install.path}`,
          fix: 'Run: npm -g uninstall @anthropic-ai/claude-code'
        });
      } else if (install.type === 'npm-local') {
        warnings.push({
          issue: `Leftover npm local installation at ${install.path}`,
          fix: isWindows ?
            `Run: rmdir /s /q "${install.path}"` :
            `Run: rm -rf ${install.path}`
        });
      }
    }
  }

  // Check update permissions
  const { hasPermissions } = await checkUpdatePermissions();
  if (!hasPermissions && !isAutoUpdateDisabled()) {
    warnings.push({
      issue: 'Insufficient permissions for auto-updates',
      fix: 'Run with elevated permissions or disable auto-updates'
    });
  }

  // Get hook system status
  const hookSystemStatus = getHookSystemStatus();

  return {
    installationType,
    version,
    installationPath,
    invokedBinary,
    autoUpdates: isAutoUpdateDisabled() ? 'false' : 'default (true)',
    hasUpdatePermissions: hasPermissions,
    multipleInstallations,
    warnings,
    hookSystem: {
      working: hookSystemStatus.working ?? true,
      mode: hookSystemStatus.mode,
      systemPath: hookSystemStatus.mode === 'system' ? hookSystemStatus.path : null
    }
  };
}

// Helper functions - would need to be imported
function getTemporaryDirectory() { return '/tmp'; }
function getHomeDirectory() { return process.env.HOME || ''; }
function getGlobalConfig() { return {}; }
function executeCommand(cmd, args, opts) { return Promise.resolve({ code: 0, stdout: '', stderr: '' }); }
function trackEvent(name, data) { console.log(`Event: ${name}`, data); }
function isNativeInstall() { return false; }
function isLocalNpmInstall() { return false; }
function getShellConfigFiles() { return {}; }
function readShellConfig(path) { return ''; }
function writeShellConfig(path, content) { }
function removeClaudeAlias(content) { return { filtered: content, hadAlias: false }; }
function checkClaudeAlias() { return false; }
function checkBinaryAccessible() { return true; }
function isAutoUpdateDisabled() { return false; }
function getHookSystemStatus() { return { working: true, mode: 'user' }; }

export {
  // Main functions
  uninstallGlobalClaudeCode,
  trackInstallationMigration,
  checkMinimumVersion,
  acquireUpdateLock,
  releaseUpdateLock,
  getGlobalPrefix,
  checkUpdatePermissions,
  checkForUpdates,
  performAutoUpdate,
  removeOldAliases,
  getInstallationType,
  getInstallationPath,
  getInvokedBinaryPath,
  findAllInstallations,
  getInstallationWarnings,
  getInstallationInfo,

  // Constants
  PACKAGE_INFO,
  UPDATE_LOCK_TIMEOUT,
  COMMAND_SPECS
};