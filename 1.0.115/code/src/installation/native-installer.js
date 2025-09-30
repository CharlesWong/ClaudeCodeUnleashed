/**
 * Native Installer System for Claude Code
 * Manages native binary installation and updates
 * Extracted from lines 42757-43240
 */

import { join, dirname, resolve, delimiter, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import axios from 'axios';
import lockfile from 'lockfile';

// Installation paths
function getStatePath() {
  return process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state');
}

function getCachePath() {
  return process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
}

function getDataPath() {
  return process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
}

function getBinPath() {
  return join(homedir(), '.local', 'bin');
}

/**
 * Get latest version from channel
 * Original: function F65()
 */
async function getChannelVersion(channel = 'stable', baseUrl, config) {
  try {
    const response = await axios.get(`${baseUrl}/${channel}`, {
      timeout: 30000,
      responseType: 'text',
      ...config
    });

    return response.data.trim();
  } catch (error) {
    throw new Error(`Failed to fetch version for channel ${channel}: ${error.message}`);
  }
}

/**
 * Resolve version to install
 * Original: function WL0()
 */
async function resolveVersion(versionOrChannel) {
  // If specific version provided
  if (versionOrChannel && /^v?\d+\.\d+\.\d+(-\S+)?$/.test(versionOrChannel)) {
    return versionOrChannel.startsWith('v')
      ? versionOrChannel.slice(1)
      : versionOrChannel;
  }

  // Otherwise treat as channel
  const channel = versionOrChannel || 'stable';
  if (channel !== 'stable' && channel !== 'latest') {
    throw new Error(`Invalid channel: ${versionOrChannel}. Use 'stable' or 'latest'`);
  }

  return getChannelVersion(channel);
}

/**
 * Download and verify binary
 * Original: function V65()
 */
async function downloadAndVerify(url, outputPath, expectedChecksum, config = {}) {
  const tempFile = `${outputPath}.tmp`;

  const response = await axios.get(url, {
    timeout: 300000,
    responseType: 'arraybuffer',
    ...config
  });

  // Calculate checksum
  const hash = createHash('sha256');
  hash.update(response.data);
  const actualChecksum = hash.digest('hex');

  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`);
  }

  // Write to temp file then rename
  fs.writeFileSync(tempFile, response.data);
  fs.renameSync(tempFile, outputPath);
}

/**
 * Get platform identifier
 * Original: function QS()
 */
function getPlatformIdentifier() {
  const platform = process.platform;
  const arch = process.arch === 'x64' ? 'x64'
    : process.arch === 'arm64' ? 'arm64'
    : null;

  if (!arch) {
    throw new Error(`Unsupported architecture: ${process.arch}`);
  }

  // Check for musl on Linux
  if (platform === 'linux' && isMuslEnvironment()) {
    return `linux-${arch}-musl`;
  }

  return `${platform}-${arch}`;
}

/**
 * Get binary name for platform
 * Original: function af1()
 */
function getBinaryName(platform) {
  return platform.startsWith('win32') ? 'claude.exe' : 'claude';
}

/**
 * Get installation directories
 * Original: function CA1()
 */
function getInstallationDirs() {
  const platform = getPlatformIdentifier();
  const binaryName = getBinaryName(platform);

  return {
    versions: join(getDataPath(), 'claude', 'versions'),
    staging: join(getCachePath(), 'claude', 'staging'),
    locks: join(getStatePath(), 'claude', 'locks'),
    bin: getBinPath(),
    binaryName
  };
}

/**
 * Check if binary is valid
 * Original: function DA1()
 */
function isValidBinary(path) {
  if (!fs.existsSync(path)) return false;

  try {
    const stats = fs.statSync(path);
    // Check it's a file and has reasonable size (> 10MB)
    return stats.isFile() && stats.size > 10485760;
  } catch {
    return false;
  }
}

/**
 * Get paths for specific version
 * Original: function JL0()
 */
function getVersionPaths(version) {
  const dirs = getInstallationDirs();

  // Ensure directories exist
  [dirs.versions, dirs.staging, dirs.locks].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const installPath = join(dirs.versions, version);
  if (!fs.existsSync(installPath)) {
    fs.mkdirSync(installPath, { recursive: true });
  }

  return {
    stagingPath: join(dirs.staging, version),
    installPath
  };
}

/**
 * Acquire installation lock
 * Original: function azB()
 */
async function withInstallLock(path, operation, retries = 0) {
  const dirs = getInstallationDirs();
  const lockName = basename(path);
  const lockPath = join(dirs.locks, `${lockName}.lock`);

  if (!fs.existsSync(dirs.locks)) {
    fs.mkdirSync(dirs.locks, { recursive: true });
  }

  let unlock = null;

  try {
    // Acquire lock
    unlock = await lockfile.lock(path, {
      stale: 60000,
      retries: {
        retries,
        minTimeout: retries > 0 ? 1000 : 100,
        maxTimeout: retries > 0 ? 5000 : 500
      }
    });

    // Execute operation
    await operation();
    return true;

  } catch (error) {
    console.error(`Install operation failed: ${error}`);
    throw error;

  } finally {
    if (unlock) await unlock();
  }
}

/**
 * Atomic file move
 * Original: function szB()
 */
function atomicMove(source, target) {
  const tempTarget = `${target}.tmp.${process.pid}`;

  // Ensure parent directory exists
  const parentDir = dirname(target);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  try {
    // Copy to temp location with correct permissions
    fs.copyFileSync(source, tempTarget);
    fs.chmodSync(tempTarget, 0o755); // rwxr-xr-x

    // Atomic rename
    fs.renameSync(tempTarget, target);

  } catch (error) {
    // Cleanup temp file on error
    try {
      if (fs.existsSync(tempTarget)) {
        fs.unlinkSync(tempTarget);
      }
    } catch {}
    throw error;
  }
}

/**
 * Install from npm package
 * Original: function C65()
 */
function installFromNpm(stagingPath, installPath) {
  const anthropicPackage = join(stagingPath, 'node_modules', '@anthropic-ai');

  // Find platform-specific package
  const platformPackage = getPlatformPackage(anthropicPackage);
  if (!platformPackage) {
    throw new Error('Could not find platform-specific native package');
  }

  const binaryPath = join(anthropicPackage, platformPackage, 'cli');
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Native binary not found at ${binaryPath}`);
  }

  // Move binary to install location
  atomicMove(binaryPath, installPath);

  // Clean up staging
  fs.rmSync(stagingPath, { recursive: true, force: true });
}

/**
 * Install from downloaded binary
 * Original: function U65()
 */
function installFromBinary(stagingPath, installPath) {
  const platform = getPlatformIdentifier();
  const binaryName = getBinaryName(platform);
  const binaryPath = join(stagingPath, binaryName);

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Staged binary not found at ${binaryPath}`);
  }

  // Move binary to install location
  atomicMove(binaryPath, installPath);

  // Clean up staging
  fs.rmSync(stagingPath, { recursive: true, force: true });
}

/**
 * Create or update symlink
 * Original: function N65()
 */
function createOrUpdateSymlink(target, link) {
  const parentDir = dirname(link);

  // Windows special handling
  if (process.platform === 'win32') {
    try {
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (fs.existsSync(link)) {
        // Check if target changed
        try {
          const currentTarget = fs.readlinkSync(link);
          const currentStats = fs.statSync(currentTarget);
          const newStats = fs.statSync(target);

          if (currentStats.size === newStats.size) {
            return false; // No change needed
          }
        } catch {}

        // Backup and replace
        const backup = `${link}.old.${Date.now()}`;
        fs.renameSync(link, backup);

        try {
          fs.copyFileSync(target, link);
          fs.unlinkSync(backup); // Clean up backup on success
        } catch (error) {
          // Restore backup on failure
          try {
            fs.renameSync(backup, link);
          } catch (restoreError) {
            throw new Error(`Failed to restore backup: ${restoreError}`);
          }
          throw error;
        }
      } else {
        fs.copyFileSync(target, link);
      }

      return true;

    } catch (error) {
      console.error(`Failed to create Windows link: ${error}`);
      return false;
    }
  }

  // Unix symlink handling
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  try {
    if (fs.existsSync(link)) {
      // Check if symlink points to correct target
      try {
        const currentTarget = resolve(dirname(link), fs.readlinkSync(link));
        const newTarget = resolve(target);

        if (currentTarget === newTarget) {
          return false; // Already correct
        }
      } catch {}

      fs.unlinkSync(link);
    }
  } catch (error) {
    console.error(`Failed to check/remove existing symlink: ${error}`);
  }

  // Create symlink atomically
  const tempLink = `${link}.tmp.${process.pid}.${Date.now()}`;

  try {
    fs.symlinkSync(target, tempLink);
    fs.renameSync(tempLink, link);
    return true;

  } catch (error) {
    // Clean up temp link on failure
    try {
      if (fs.existsSync(tempLink)) {
        fs.unlinkSync(tempLink);
      }
    } catch {}

    console.error(`Failed to create symlink from ${link} to ${target}: ${error}`);
    return false;
  }
}

/**
 * Main update function
 * Original: function q65()
 */
async function updateNativeInstaller(versionOrChannel, forceReinstall = false) {
  const version = await resolveVersion(versionOrChannel);
  const { installPath, stagingPath } = getVersionPaths(version);

  console.log(`Checking for native installer update to version ${version}`);

  const success = await withInstallLock(installPath, async () => {
    // Check if already installed
    if (!isVersionInstalled(version) || forceReinstall) {
      console.log(
        forceReinstall
          ? `Force reinstalling native installer version ${version}`
          : `Downloading native installer version ${version}`
      );

      // Download and install
      const installType = await downloadVersion(version, stagingPath);
      finalizeInstall(version, installType);

      // Clean up old versions
      const dirs = getInstallationDirs();
      cleanupOldVersions(dirs.versions);
    }
  }, 3);

  if (!success) {
    return false;
  }

  console.log(`Successfully updated to version ${version}`);
  return true;
}

/**
 * Check if version is installed
 * Original: function w65()
 */
function isVersionInstalled(version) {
  const { installPath } = getVersionPaths(version);
  return isValidBinary(installPath);
}

/**
 * Clean up old versions
 * Original: part of function XL0()
 */
function cleanupOldVersions(versionsDir, keepCount = 2) {
  if (!fs.existsSync(versionsDir)) return;

  try {
    const versions = fs.readdirSync(versionsDir)
      .filter(name => {
        const versionPath = join(versionsDir, name);
        try {
          const stats = fs.statSync(versionPath);
          return stats.isFile() && (stats.size === 0 || isValidBinary(versionPath));
        } catch {
          return false;
        }
      });

    // Get current symlink target
    const binPath = getBinPath();
    const claudePath = join(binPath, 'claude');
    let currentVersion = null;

    if (fs.existsSync(claudePath)) {
      try {
        currentVersion = resolve(fs.readlinkSync(claudePath));
      } catch {}
    }

    // Keep current version and newest versions
    const protectedPaths = new Set([currentVersion].filter(Boolean));

    const versionInfos = versions.map(name => {
      const path = resolve(versionsDir, name);
      return {
        name,
        path,
        mtime: fs.statSync(path).mtime
      };
    })
    .filter(v => !protectedPaths.has(v.path))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Remove old versions beyond keep count
    const toDelete = versionInfos.slice(keepCount);

    let deletedCount = 0;
    for (const version of toDelete) {
      try {
        fs.unlinkSync(version.path);
        deletedCount++;
        console.log(`Removed old version: ${version.name}`);
      } catch (error) {
        console.error(`Failed to delete version ${version.name}: ${error}`);
      }
    }

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} old versions`);
    }

  } catch (error) {
    console.error(`Version cleanup failed: ${error}`);
  }
}

/**
 * Uninstall native installer
 * Original: function cI1()
 */
function uninstallNativeInstaller() {
  const dirs = getInstallationDirs();
  const claudePath = join(dirs.bin, 'claude');

  try {
    if (fs.existsSync(claudePath)) {
      fs.unlinkSync(claudePath);
      console.log(`Removed claude symlink from ${claudePath}`);
    }
  } catch (error) {
    console.error(`Failed to remove claude symlink: ${error}`);
  }

  // Clean up version directories
  try {
    if (fs.existsSync(dirs.versions)) {
      fs.rmSync(dirs.versions, { recursive: true, force: true });
      console.log(`Removed version directory: ${dirs.versions}`);
    }
  } catch (error) {
    console.error(`Failed to remove version directory: ${error}`);
  }
}

// Helper functions
function isMuslEnvironment() {
  // Check for musl libc (Alpine Linux, etc.)
  try {
    const output = execSync('ldd --version 2>&1', { encoding: 'utf8' });
    return output.includes('musl');
  } catch {
    return false;
  }
}

function getPlatformPackage(anthropicPackage) {
  const platform = getPlatformIdentifier();
  const packages = fs.readdirSync(anthropicPackage);

  // Find matching platform package
  return packages.find(pkg => pkg.includes(platform));
}

function downloadVersion(version, stagingPath) {
  // Implementation would download the version
  // Returns 'npm' or 'binary' to indicate install type
  throw new Error('Download not implemented');
}

function finalizeInstall(version, installType) {
  const { stagingPath, installPath } = getVersionPaths(version);

  if (installType === 'npm') {
    installFromNpm(stagingPath, installPath);
  } else {
    installFromBinary(stagingPath, installPath);
  }
}

// Export main functions
export {
  updateNativeInstaller,
  isVersionInstalled,
  uninstallNativeInstaller,
  createOrUpdateSymlink,
  getInstallationDirs,
  getPlatformIdentifier,
  cleanupOldVersions,
  withInstallLock
};