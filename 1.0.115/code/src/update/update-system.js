/**
 * Claude Code Update System
 *
 * Automatic update checking, downloading, and installation for Claude Code CLI.
 * Includes version management, rollback support, and multi-platform updates.
 *
 * Extracted from claude-code-full-extract.js (lines ~43000-43600)
 * Part of the 85% → 87% extraction phase
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { execSync, spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import https from 'https';
import { createHash } from 'crypto';
import semver from 'semver';

/**
 * Update Manager
 * Handles automatic updates for Claude Code
 */
export class UpdateManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      currentVersion: options.currentVersion || this.getCurrentVersion(),
      updateUrl: options.updateUrl || 'https://api.anthropic.com/claude-code/updates',
      checkInterval: options.checkInterval || 24 * 60 * 60 * 1000, // 24 hours
      autoUpdate: options.autoUpdate !== false,
      autoUpdateProtectedForNative: false,
      installMethod: options.installMethod || 'npm',
      channel: options.channel || 'stable',
      platform: process.platform,
      arch: process.arch
    };

    this.paths = {
      installPath: options.installPath || this.getInstallPath(),
      backupPath: options.backupPath || path.join(this.getInstallPath(), '.backup'),
      tempPath: options.tempPath || path.join(this.getInstallPath(), '.tmp'),
      lockFile: path.join(this.getInstallPath(), '.update.lock')
    };

    this.updateState = {
      checking: false,
      downloading: false,
      installing: false,
      lastCheck: null,
      availableVersion: null,
      downloadProgress: 0
    };

    this.checkTimer = null;
  }

  /**
   * Start automatic update checking
   */
  start() {
    if (this.config.autoUpdate && !this.config.autoUpdateProtectedForNative) {
      this.scheduleCheck();
      this.checkForUpdates(); // Initial check
    }
  }

  /**
   * Stop automatic update checking
   */
  stop() {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Schedule next update check
   */
  scheduleCheck() {
    this.checkTimer = setTimeout(() => {
      this.checkForUpdates();
      this.scheduleCheck();
    }, this.config.checkInterval);
  }

  /**
   * Check for available updates
   */
  async checkForUpdates() {
    if (this.updateState.checking) {
      return null;
    }

    this.updateState.checking = true;
    this.emit('check:start');

    try {
      const updateInfo = await this.fetchUpdateInfo();
      this.updateState.lastCheck = Date.now();

      if (updateInfo && semver.gt(updateInfo.version, this.config.currentVersion)) {
        this.updateState.availableVersion = updateInfo.version;
        this.emit('update:available', updateInfo);

        if (this.config.autoUpdate) {
          await this.downloadAndInstall(updateInfo);
        }

        return updateInfo;
      }

      this.emit('check:complete', { upToDate: true });
      return null;
    } catch (error) {
      this.emit('check:error', error);
      throw error;
    } finally {
      this.updateState.checking = false;
    }
  }

  /**
   * Fetch update information from server
   */
  async fetchUpdateInfo() {
    const params = new URLSearchParams({
      current: this.config.currentVersion,
      channel: this.config.channel,
      platform: this.config.platform,
      arch: this.config.arch,
      method: this.config.installMethod
    });

    return new Promise((resolve, reject) => {
      https.get(`${this.config.updateUrl}?${params}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const info = JSON.parse(data);
            resolve(info);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Download and install update
   */
  async downloadAndInstall(updateInfo) {
    this.emit('update:start', updateInfo);

    try {
      // Acquire update lock
      const lockAcquired = await this.acquireLock();
      if (!lockAcquired) {
        throw new Error('Could not acquire update lock');
      }

      // Download update
      const downloadPath = await this.downloadUpdate(updateInfo);

      // Verify checksum
      await this.verifyChecksum(downloadPath, updateInfo.checksum);

      // Backup current installation
      await this.backupCurrentInstallation();

      // Install update
      await this.installUpdate(downloadPath, updateInfo);

      // Verify installation
      await this.verifyInstallation(updateInfo.version);

      // Clean up
      await this.cleanup();

      this.config.currentVersion = updateInfo.version;
      this.emit('update:complete', updateInfo);

      // Restart if needed
      if (updateInfo.requiresRestart) {
        this.emit('restart:required');
        await this.restart();
      }

    } catch (error) {
      this.emit('update:error', error);
      await this.rollback();
      throw error;
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Download update package
   */
  async downloadUpdate(updateInfo) {
    this.updateState.downloading = true;
    this.updateState.downloadProgress = 0;
    this.emit('download:start', updateInfo);

    const filename = `claude-code-${updateInfo.version}-${this.config.platform}-${this.config.arch}.tar.gz`;
    const downloadPath = path.join(this.paths.tempPath, filename);

    await fs.mkdir(this.paths.tempPath, { recursive: true });

    return new Promise((resolve, reject) => {
      const file = createWriteStream(downloadPath);
      let downloadedBytes = 0;
      const totalBytes = updateInfo.size;

      https.get(updateInfo.downloadUrl, (response) => {
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          this.updateState.downloadProgress = (downloadedBytes / totalBytes) * 100;
          this.emit('download:progress', {
            bytes: downloadedBytes,
            total: totalBytes,
            percent: this.updateState.downloadProgress
          });
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          this.updateState.downloading = false;
          this.emit('download:complete', downloadPath);
          resolve(downloadPath);
        });
      }).on('error', (error) => {
        fs.unlink(downloadPath);
        this.updateState.downloading = false;
        reject(error);
      });
    });
  }

  /**
   * Verify checksum of downloaded file
   */
  async verifyChecksum(filePath, expectedChecksum) {
    const fileBuffer = await fs.readFile(filePath);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');

    if (hash !== expectedChecksum) {
      throw new Error('Checksum verification failed');
    }
  }

  /**
   * Backup current installation
   */
  async backupCurrentInstallation() {
    this.emit('backup:start');

    await fs.rm(this.paths.backupPath, { recursive: true, force: true });
    await fs.mkdir(this.paths.backupPath, { recursive: true });

    const files = await fs.readdir(this.paths.installPath);
    for (const file of files) {
      if (file === '.backup' || file === '.tmp') continue;

      const src = path.join(this.paths.installPath, file);
      const dest = path.join(this.paths.backupPath, file);

      await fs.cp(src, dest, { recursive: true });
    }

    this.emit('backup:complete');
  }

  /**
   * Install update based on method
   */
  async installUpdate(downloadPath, updateInfo) {
    this.updateState.installing = true;
    this.emit('install:start');

    try {
      switch (this.config.installMethod) {
        case 'native':
          await this.installNative(downloadPath, updateInfo);
          break;
        case 'npm':
          await this.installNPM(updateInfo);
          break;
        case 'homebrew':
          await this.installHomebrew(updateInfo);
          break;
        default:
          await this.installTarball(downloadPath);
      }

      this.updateState.installing = false;
      this.emit('install:complete');
    } catch (error) {
      this.updateState.installing = false;
      throw error;
    }
  }

  /**
   * Install using native installer
   */
  async installNative(downloadPath, updateInfo) {
    const platform = this.config.platform;

    if (platform === 'win32') {
      // Windows MSI installer
      execSync(`msiexec /i "${downloadPath}" /quiet`, { stdio: 'inherit' });
    } else if (platform === 'darwin') {
      // macOS PKG installer
      execSync(`sudo installer -pkg "${downloadPath}" -target /`, { stdio: 'inherit' });
    } else {
      // Linux DEB/RPM installer
      if (await this.isDebianBased()) {
        execSync(`sudo dpkg -i "${downloadPath}"`, { stdio: 'inherit' });
      } else {
        execSync(`sudo rpm -U "${downloadPath}"`, { stdio: 'inherit' });
      }
    }
  }

  /**
   * Install using NPM
   */
  async installNPM(updateInfo) {
    const command = `npm install -g claude-code@${updateInfo.version}`;
    execSync(command, { stdio: 'inherit' });
  }

  /**
   * Install using Homebrew
   */
  async installHomebrew(updateInfo) {
    execSync('brew update', { stdio: 'inherit' });
    execSync('brew upgrade claude-code', { stdio: 'inherit' });
  }

  /**
   * Install from tarball
   */
  async installTarball(downloadPath) {
    const extractPath = path.join(this.paths.tempPath, 'extract');
    await fs.mkdir(extractPath, { recursive: true });

    // Extract tarball
    execSync(`tar -xzf "${downloadPath}" -C "${extractPath}"`, { stdio: 'inherit' });

    // Copy files to installation directory
    const files = await fs.readdir(extractPath);
    for (const file of files) {
      const src = path.join(extractPath, file);
      const dest = path.join(this.paths.installPath, file);
      await fs.cp(src, dest, { recursive: true, force: true });
    }
  }

  /**
   * Verify installation
   */
  async verifyInstallation(expectedVersion) {
    const installedVersion = await this.getInstalledVersion();

    if (installedVersion !== expectedVersion) {
      throw new Error(`Installation verification failed. Expected ${expectedVersion}, got ${installedVersion}`);
    }
  }

  /**
   * Rollback to previous version
   */
  async rollback() {
    this.emit('rollback:start');

    try {
      const backupExists = await fs.stat(this.paths.backupPath).then(() => true).catch(() => false);

      if (!backupExists) {
        throw new Error('No backup available for rollback');
      }

      // Restore from backup
      const files = await fs.readdir(this.paths.backupPath);
      for (const file of files) {
        const src = path.join(this.paths.backupPath, file);
        const dest = path.join(this.paths.installPath, file);
        await fs.cp(src, dest, { recursive: true, force: true });
      }

      this.emit('rollback:complete');
    } catch (error) {
      this.emit('rollback:error', error);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup() {
    await fs.rm(this.paths.tempPath, { recursive: true, force: true });
    await fs.rm(this.paths.backupPath, { recursive: true, force: true });
  }

  /**
   * Restart application
   */
  async restart() {
    this.emit('restart:start');

    const args = process.argv.slice(1);
    const options = {
      detached: true,
      stdio: 'ignore'
    };

    spawn(process.argv[0], args, options).unref();
    process.exit(0);
  }

  /**
   * Acquire update lock
   */
  async acquireLock() {
    try {
      await fs.writeFile(this.paths.lockFile, `${process.pid}`, { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        // Check if lock is stale
        const lockPid = await fs.readFile(this.paths.lockFile, 'utf8');
        if (!this.isProcessRunning(parseInt(lockPid))) {
          await fs.unlink(this.paths.lockFile);
          return this.acquireLock();
        }
      }
      return false;
    }
  }

  /**
   * Release update lock
   */
  async releaseLock() {
    try {
      await fs.unlink(this.paths.lockFile);
    } catch (error) {
      // Ignore if lock doesn't exist
    }
  }

  /**
   * Check if process is running
   */
  isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current version
   */
  getCurrentVersion() {
    try {
      const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return pkg.version;
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Get installed version
   */
  async getInstalledVersion() {
    try {
      const output = execSync('claude --version', { encoding: 'utf8' });
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Get installation path
   */
  getInstallPath() {
    if (this.config.platform === 'win32') {
      return path.join(process.env.APPDATA, 'claude-code');
    } else if (this.config.platform === 'darwin') {
      return '/usr/local/bin';
    } else {
      return '/usr/local/bin';
    }
  }

  /**
   * Check if system is Debian-based
   */
  async isDebianBased() {
    try {
      await fs.access('/etc/debian_version');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Version Manager
 * Handles version comparison and management
 */
export class VersionManager {
  constructor() {
    this.versions = new Map();
    this.channels = new Map([
      ['stable', { priority: 1 }],
      ['beta', { priority: 2 }],
      ['nightly', { priority: 3 }]
    ]);
  }

  /**
   * Register version
   */
  registerVersion(version, metadata = {}) {
    this.versions.set(version, {
      version,
      channel: metadata.channel || 'stable',
      releaseDate: metadata.releaseDate || new Date(),
      changelog: metadata.changelog || '',
      deprecated: metadata.deprecated || false,
      yanked: metadata.yanked || false
    });
  }

  /**
   * Get latest version for channel
   */
  getLatestVersion(channel = 'stable') {
    const channelVersions = Array.from(this.versions.entries())
      .filter(([_, meta]) => meta.channel === channel && !meta.yanked)
      .map(([version]) => version)
      .sort(semver.rcompare);

    return channelVersions[0] || null;
  }

  /**
   * Check if update is recommended
   */
  shouldUpdate(currentVersion, channel = 'stable') {
    const latest = this.getLatestVersion(channel);
    if (!latest) return false;

    const current = this.versions.get(currentVersion);
    if (current && current.deprecated) return true;

    return semver.gt(latest, currentVersion);
  }

  /**
   * Get version info
   */
  getVersionInfo(version) {
    return this.versions.get(version);
  }

  /**
   * Get changelog between versions
   */
  getChangelog(fromVersion, toVersion) {
    const versions = Array.from(this.versions.entries())
      .filter(([version]) => semver.gt(version, fromVersion) && semver.lte(version, toVersion))
      .sort(([a], [b]) => semver.compare(a, b))
      .map(([_, meta]) => meta.changelog);

    return versions.join('\n\n');
  }
}

/**
 * Update Policy
 * Defines update behavior and constraints
 */
export class UpdatePolicy {
  constructor(options = {}) {
    this.policy = {
      allowMajor: options.allowMajor !== false,
      allowMinor: options.allowMinor !== false,
      allowPatch: options.allowPatch !== false,
      allowPrerelease: options.allowPrerelease || false,
      requireSignature: options.requireSignature || false,
      requireChecksum: options.requireChecksum !== false,
      maxDownloadSize: options.maxDownloadSize || 500 * 1024 * 1024, // 500MB
      downloadTimeout: options.downloadTimeout || 5 * 60 * 1000, // 5 minutes
      installTimeout: options.installTimeout || 10 * 60 * 1000, // 10 minutes
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 5000 // 5 seconds
    };
  }

  /**
   * Check if update is allowed
   */
  isUpdateAllowed(currentVersion, newVersion) {
    const diff = semver.diff(currentVersion, newVersion);

    switch (diff) {
      case 'major':
        return this.policy.allowMajor;
      case 'minor':
        return this.policy.allowMinor;
      case 'patch':
        return this.policy.allowPatch;
      case 'prerelease':
      case 'prepatch':
      case 'preminor':
      case 'premajor':
        return this.policy.allowPrerelease;
      default:
        return false;
    }
  }

  /**
   * Validate update info
   */
  validateUpdateInfo(updateInfo) {
    const errors = [];

    if (this.policy.requireSignature && !updateInfo.signature) {
      errors.push('Update signature required but not provided');
    }

    if (this.policy.requireChecksum && !updateInfo.checksum) {
      errors.push('Update checksum required but not provided');
    }

    if (updateInfo.size > this.policy.maxDownloadSize) {
      errors.push(`Update size ${updateInfo.size} exceeds maximum ${this.policy.maxDownloadSize}`);
    }

    return { valid: errors.length === 0, errors };
  }
}

// Export convenience functions
export function createUpdateManager(options) {
  return new UpdateManager(options);
}

export function createVersionManager() {
  return new VersionManager();
}

export function createUpdatePolicy(options) {
  return new UpdatePolicy(options);
}

// Default update manager instance
export const defaultUpdateManager = new UpdateManager();