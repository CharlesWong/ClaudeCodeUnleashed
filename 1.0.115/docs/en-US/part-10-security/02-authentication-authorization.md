# Part 10.2: Authentication and Authorization

## Introduction

The Claude Code authentication and authorization system ensures that only legitimate users can access the system and that they can only perform actions within their granted permissions. This chapter explores the implementation of API key management, session handling, role-based access control (RBAC), and dynamic permission evaluation.

## Table of Contents
1. [Authentication Implementation](#authentication-implementation)
2. [API Key Management](#api-key-management)
3. [Session Management](#session-management)
4. [Role-Based Access Control](#role-based-access-control)
5. [Permission System](#permission-system)
6. [Tool Authorization](#tool-authorization)
7. [Audit System](#audit-system)
8. [Performance Implications](#performance-implications)

## Authentication Implementation

### Core Authentication Service

```javascript
class AuthenticationService {
  constructor() {
    this.providers = new Map();
    this.sessions = new Map();
    this.failedAttempts = new Map();
    this.config = {
      maxFailedAttempts: 5,
      lockoutDuration: 300000, // 5 minutes
      sessionTimeout: 86400000, // 24 hours
      requireStrongKey: true
    };

    this.initializeProviders();
  }

  initializeProviders() {
    // Register authentication providers
    this.registerProvider('api-key', new APIKeyProvider());
    this.registerProvider('oauth2', new OAuth2Provider());
    this.registerProvider('jwt', new JWTProvider());
    this.registerProvider('mcp', new MCPAuthProvider());
  }

  registerProvider(name, provider) {
    this.providers.set(name, provider);
  }

  async authenticate(credentials) {
    // Check for lockout
    if (this.isLockedOut(credentials.identifier)) {
      throw new AuthenticationError('Account temporarily locked due to failed attempts');
    }

    try {
      // Determine provider
      const provider = this.selectProvider(credentials);

      if (!provider) {
        throw new AuthenticationError('No suitable authentication provider');
      }

      // Attempt authentication
      const result = await provider.authenticate(credentials);

      if (result.success) {
        // Clear failed attempts
        this.failedAttempts.delete(credentials.identifier);

        // Create session
        const session = await this.createSession(result.user, provider.name);

        return {
          success: true,
          user: result.user,
          session: session.id,
          expiresAt: session.expiresAt
        };
      }

      // Record failed attempt
      this.recordFailedAttempt(credentials.identifier);

      return {
        success: false,
        error: result.error || 'Authentication failed'
      };

    } catch (error) {
      // Record failed attempt
      this.recordFailedAttempt(credentials.identifier);

      throw error;
    }
  }

  selectProvider(credentials) {
    // API Key pattern
    if (credentials.apiKey && /^sk-[a-zA-Z0-9]{48}$/.test(credentials.apiKey)) {
      return this.providers.get('api-key');
    }

    // JWT token
    if (credentials.token && credentials.token.split('.').length === 3) {
      return this.providers.get('jwt');
    }

    // OAuth2
    if (credentials.accessToken && credentials.provider) {
      return this.providers.get('oauth2');
    }

    // MCP
    if (credentials.mcpToken) {
      return this.providers.get('mcp');
    }

    return null;
  }

  async createSession(user, provider) {
    const sessionId = this.generateSessionId();

    const session = {
      id: sessionId,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles || [],
        permissions: user.permissions || []
      },
      provider,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.sessionTimeout,
      lastActivity: Date.now(),
      metadata: {
        ip: user.ip,
        userAgent: user.userAgent,
        location: user.location
      }
    };

    this.sessions.set(sessionId, session);

    // Schedule cleanup
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, this.config.sessionTimeout);

    return session;
  }

  generateSessionId() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  isLockedOut(identifier) {
    const attempts = this.failedAttempts.get(identifier);

    if (!attempts) {
      return false;
    }

    if (attempts.count >= this.config.maxFailedAttempts) {
      const lockoutEnd = attempts.lastAttempt + this.config.lockoutDuration;

      if (Date.now() < lockoutEnd) {
        return true;
      }

      // Lockout expired, reset
      this.failedAttempts.delete(identifier);
    }

    return false;
  }

  recordFailedAttempt(identifier) {
    const attempts = this.failedAttempts.get(identifier) || {
      count: 0,
      lastAttempt: 0
    };

    attempts.count++;
    attempts.lastAttempt = Date.now();

    this.failedAttempts.set(identifier, attempts);
  }

  async validateSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return {
        valid: false,
        error: 'Session not found'
      };
    }

    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return {
        valid: false,
        error: 'Session expired'
      };
    }

    // Update last activity
    session.lastActivity = Date.now();

    return {
      valid: true,
      user: session.user
    };
  }

  async revokeSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (session) {
      this.sessions.delete(sessionId);

      // Audit log
      await this.auditLog({
        event: 'session.revoked',
        sessionId,
        timestamp: Date.now()
      });

      return true;
    }

    return false;
  }

  async refreshSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new AuthenticationError('Session not found');
    }

    // Extend expiration
    session.expiresAt = Date.now() + this.config.sessionTimeout;
    session.lastActivity = Date.now();

    // Generate new session ID for security
    const newSessionId = this.generateSessionId();
    this.sessions.delete(sessionId);
    this.sessions.set(newSessionId, session);

    return {
      sessionId: newSessionId,
      expiresAt: session.expiresAt
    };
  }
}

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
```

## API Key Management

### API Key Provider

```javascript
class APIKeyProvider {
  constructor() {
    this.name = 'api-key';
    this.keyPattern = /^sk-[a-zA-Z0-9]{48}$/;
    this.keyCache = new Map();
    this.rateLimiter = new RateLimiter();
  }

  async authenticate(credentials) {
    const { apiKey } = credentials;

    // Validate format
    if (!this.validateKeyFormat(apiKey)) {
      return {
        success: false,
        error: 'Invalid API key format'
      };
    }

    // Check cache
    const cached = this.keyCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        success: true,
        user: cached.user
      };
    }

    // Check rate limit
    const rateLimitOk = await this.rateLimiter.checkLimit(apiKey);
    if (!rateLimitOk) {
      return {
        success: false,
        error: 'Rate limit exceeded'
      };
    }

    // Validate with Anthropic API
    const validationResult = await this.validateWithAPI(apiKey);

    if (validationResult.valid) {
      // Cache result
      this.keyCache.set(apiKey, {
        user: validationResult.user,
        expiresAt: Date.now() + 300000 // 5 minutes
      });

      return {
        success: true,
        user: validationResult.user
      };
    }

    return {
      success: false,
      error: validationResult.error || 'Invalid API key'
    };
  }

  validateKeyFormat(key) {
    if (!key || typeof key !== 'string') {
      return false;
    }

    return this.keyPattern.test(key);
  }

  async validateWithAPI(apiKey) {
    try {
      // In production, this would make a real API call
      // For now, we'll simulate validation
      const response = await this.simulateAPIValidation(apiKey);

      return {
        valid: response.valid,
        user: response.user,
        error: response.error
      };

    } catch (error) {
      console.error('API key validation error:', error);
      return {
        valid: false,
        error: 'Failed to validate API key'
      };
    }
  }

  async simulateAPIValidation(apiKey) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // For demonstration, accept keys starting with sk-
    if (apiKey.startsWith('sk-')) {
      return {
        valid: true,
        user: {
          id: this.hashKey(apiKey).slice(0, 8),
          email: 'user@example.com',
          roles: ['developer'],
          permissions: ['messages.create', 'tools.execute'],
          quotas: {
            requestsPerMinute: 60,
            tokensPerDay: 1000000
          }
        }
      };
    }

    return {
      valid: false,
      error: 'Invalid or expired API key'
    };
  }

  hashKey(key) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

// API Key Manager for key lifecycle
class APIKeyManager {
  constructor() {
    this.keys = new Map();
    this.rotationSchedule = new Map();
  }

  async generateKey(userId, options = {}) {
    const key = this.createKey();

    const keyData = {
      key: key.hash,
      userId,
      createdAt: Date.now(),
      expiresAt: options.expiresAt || Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
      permissions: options.permissions || [],
      metadata: options.metadata || {},
      lastUsed: null,
      usageCount: 0
    };

    this.keys.set(key.hash, keyData);

    // Schedule rotation if requested
    if (options.autoRotate) {
      this.scheduleRotation(key.hash, options.rotationInterval || 30 * 24 * 60 * 60 * 1000);
    }

    return {
      key: key.full,  // Return full key only on creation
      hash: key.hash,
      expiresAt: keyData.expiresAt
    };
  }

  createKey() {
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(36).toString('base64').replace(/[+/=]/g, '');
    const key = `sk-${randomBytes}`;

    return {
      full: key,
      hash: this.hashKey(key)
    };
  }

  hashKey(key) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  async rotateKey(keyHash) {
    const oldKeyData = this.keys.get(keyHash);

    if (!oldKeyData) {
      throw new Error('Key not found');
    }

    // Generate new key
    const newKey = await this.generateKey(oldKeyData.userId, {
      permissions: oldKeyData.permissions,
      metadata: {
        ...oldKeyData.metadata,
        rotatedFrom: keyHash
      },
      autoRotate: !!this.rotationSchedule.has(keyHash)
    });

    // Mark old key for expiration
    oldKeyData.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days grace period
    oldKeyData.metadata.rotatedTo = newKey.hash;

    return newKey;
  }

  scheduleRotation(keyHash, interval) {
    const timeoutId = setTimeout(() => {
      this.rotateKey(keyHash).catch(error => {
        console.error('Key rotation failed:', error);
      });
    }, interval);

    this.rotationSchedule.set(keyHash, timeoutId);
  }

  async revokeKey(keyHash) {
    const keyData = this.keys.get(keyHash);

    if (keyData) {
      keyData.expiresAt = Date.now();
      keyData.metadata.revokedAt = Date.now();

      // Cancel rotation if scheduled
      const timeoutId = this.rotationSchedule.get(keyHash);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.rotationSchedule.delete(keyHash);
      }

      return true;
    }

    return false;
  }

  async validateKey(keyHash) {
    const keyData = this.keys.get(keyHash);

    if (!keyData) {
      return {
        valid: false,
        error: 'Key not found'
      };
    }

    if (Date.now() > keyData.expiresAt) {
      return {
        valid: false,
        error: 'Key expired'
      };
    }

    // Update usage
    keyData.lastUsed = Date.now();
    keyData.usageCount++;

    return {
      valid: true,
      userId: keyData.userId,
      permissions: keyData.permissions
    };
  }
}
```

## Session Management

### Session Manager

```javascript
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.config = {
      maxConcurrentSessions: 5,
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      inactivityTimeout: 30 * 60 * 1000,   // 30 minutes
      renewalThreshold: 60 * 60 * 1000     // 1 hour
    };
  }

  async createSession(user, metadata = {}) {
    // Check concurrent sessions
    const userSessions = this.getUserSessions(user.id);

    if (userSessions.length >= this.config.maxConcurrentSessions) {
      // Revoke oldest session
      const oldest = userSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      await this.revokeSession(oldest.id);
    }

    const session = {
      id: this.generateSessionId(),
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles || [],
        permissions: user.permissions || []
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.sessionTimeout,
      lastActivity: Date.now(),
      renewable: true,
      metadata: {
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        device: this.detectDevice(metadata.userAgent),
        location: metadata.location
      },
      tokens: {
        access: this.generateAccessToken(user),
        refresh: this.generateRefreshToken()
      }
    };

    this.sessions.set(session.id, session);

    // Schedule expiration
    this.scheduleExpiration(session);

    return session;
  }

  generateSessionId() {
    const crypto = require('crypto');
    return `sess_${crypto.randomBytes(24).toString('hex')}`;
  }

  generateAccessToken(user) {
    // Simple token for demonstration
    // In production, use proper JWT
    const payload = {
      sub: user.id,
      roles: user.roles,
      exp: Date.now() + 3600000 // 1 hour
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  generateRefreshToken() {
    const crypto = require('crypto');
    return `ref_${crypto.randomBytes(32).toString('hex')}`;
  }

  detectDevice(userAgent) {
    if (!userAgent) return 'unknown';

    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
  }

  getUserSessions(userId) {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId);
  }

  async validateSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return {
        valid: false,
        error: 'Session not found'
      };
    }

    // Check expiration
    if (Date.now() > session.expiresAt) {
      await this.revokeSession(sessionId);
      return {
        valid: false,
        error: 'Session expired'
      };
    }

    // Check inactivity
    const inactiveTime = Date.now() - session.lastActivity;
    if (inactiveTime > this.config.inactivityTimeout) {
      await this.revokeSession(sessionId);
      return {
        valid: false,
        error: 'Session timed out due to inactivity'
      };
    }

    // Update activity
    session.lastActivity = Date.now();

    // Check if renewal needed
    const timeUntilExpiry = session.expiresAt - Date.now();
    if (session.renewable && timeUntilExpiry < this.config.renewalThreshold) {
      await this.renewSession(sessionId);
    }

    return {
      valid: true,
      user: session.user
    };
  }

  async renewSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.renewable) {
      return false;
    }

    // Extend expiration
    session.expiresAt = Date.now() + this.config.sessionTimeout;

    // Regenerate tokens
    session.tokens.access = this.generateAccessToken(session.user);

    // Reschedule expiration
    this.scheduleExpiration(session);

    return true;
  }

  async revokeSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Clear scheduled expiration
      if (session.expirationTimeout) {
        clearTimeout(session.expirationTimeout);
      }

      // Remove session
      this.sessions.delete(sessionId);

      // Audit log
      await this.auditLog({
        event: 'session.revoked',
        sessionId,
        userId: session.userId,
        timestamp: Date.now()
      });

      return true;
    }

    return false;
  }

  scheduleExpiration(session) {
    // Clear existing timeout
    if (session.expirationTimeout) {
      clearTimeout(session.expirationTimeout);
    }

    const timeUntilExpiry = session.expiresAt - Date.now();

    session.expirationTimeout = setTimeout(() => {
      this.revokeSession(session.id);
    }, timeUntilExpiry);
  }

  async auditLog(event) {
    // Would log to audit system
    console.log('Audit:', event);
  }
}
```

## Role-Based Access Control

### RBAC System

```javascript
class RBACSystem {
  constructor() {
    this.roles = new Map();
    this.permissions = new Map();
    this.roleHierarchy = new Map();
    this.userRoles = new Map();

    this.initializeDefaultRoles();
  }

  initializeDefaultRoles() {
    // Define permissions
    this.definePermission('messages.create', 'Create messages');
    this.definePermission('messages.read', 'Read messages');
    this.definePermission('messages.delete', 'Delete messages');

    this.definePermission('tools.bash.execute', 'Execute bash commands');
    this.definePermission('tools.read.execute', 'Read files');
    this.definePermission('tools.write.execute', 'Write files');
    this.definePermission('tools.edit.execute', 'Edit files');

    this.definePermission('agents.run', 'Run agents');
    this.definePermission('agents.create', 'Create agents');
    this.definePermission('agents.modify', 'Modify agents');

    this.definePermission('admin.users', 'Manage users');
    this.definePermission('admin.roles', 'Manage roles');
    this.definePermission('admin.system', 'System administration');

    // Define roles
    this.defineRole('admin', {
      description: 'System administrator',
      permissions: ['*'], // All permissions
      inherits: []
    });

    this.defineRole('developer', {
      description: 'Developer with full tool access',
      permissions: [
        'messages.*',
        'tools.*',
        'agents.run'
      ],
      inherits: ['user']
    });

    this.defineRole('user', {
      description: 'Standard user',
      permissions: [
        'messages.create',
        'messages.read',
        'tools.read.execute'
      ],
      inherits: []
    });

    this.defineRole('viewer', {
      description: 'Read-only access',
      permissions: [
        'messages.read'
      ],
      inherits: []
    });
  }

  definePermission(name, description) {
    this.permissions.set(name, {
      name,
      description,
      createdAt: Date.now()
    });
  }

  defineRole(name, config) {
    const role = {
      name,
      description: config.description,
      permissions: this.expandPermissions(config.permissions),
      inherits: config.inherits || [],
      createdAt: Date.now()
    };

    this.roles.set(name, role);

    // Update hierarchy
    if (config.inherits) {
      for (const parent of config.inherits) {
        if (!this.roleHierarchy.has(parent)) {
          this.roleHierarchy.set(parent, []);
        }
        this.roleHierarchy.get(parent).push(name);
      }
    }
  }

  expandPermissions(permissions) {
    const expanded = new Set();

    for (const perm of permissions) {
      if (perm === '*') {
        // All permissions
        for (const p of this.permissions.keys()) {
          expanded.add(p);
        }
      } else if (perm.endsWith('*')) {
        // Wildcard permissions
        const prefix = perm.slice(0, -1);
        for (const p of this.permissions.keys()) {
          if (p.startsWith(prefix)) {
            expanded.add(p);
          }
        }
      } else {
        // Exact permission
        expanded.add(perm);
      }
    }

    return Array.from(expanded);
  }

  async assignRole(userId, roleName) {
    const role = this.roles.get(roleName);

    if (!role) {
      throw new Error(`Role not found: ${roleName}`);
    }

    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }

    this.userRoles.get(userId).add(roleName);

    // Audit log
    await this.auditLog({
      event: 'role.assigned',
      userId,
      role: roleName,
      timestamp: Date.now()
    });

    return true;
  }

  async revokeRole(userId, roleName) {
    const userRoles = this.userRoles.get(userId);

    if (userRoles) {
      userRoles.delete(roleName);

      // Audit log
      await this.auditLog({
        event: 'role.revoked',
        userId,
        role: roleName,
        timestamp: Date.now()
      });

      return true;
    }

    return false;
  }

  getUserPermissions(userId) {
    const userRoles = this.userRoles.get(userId);
    const permissions = new Set();

    if (!userRoles) {
      return [];
    }

    // Collect permissions from all roles
    for (const roleName of userRoles) {
      const role = this.roles.get(roleName);

      if (role) {
        // Add direct permissions
        for (const perm of role.permissions) {
          permissions.add(perm);
        }

        // Add inherited permissions
        for (const inheritedRole of role.inherits) {
          const inherited = this.roles.get(inheritedRole);
          if (inherited) {
            for (const perm of inherited.permissions) {
              permissions.add(perm);
            }
          }
        }
      }
    }

    return Array.from(permissions);
  }

  hasPermission(userId, permission) {
    const userPermissions = this.getUserPermissions(userId);
    return userPermissions.includes(permission);
  }

  hasRole(userId, roleName) {
    const userRoles = this.userRoles.get(userId);
    return userRoles ? userRoles.has(roleName) : false;
  }

  async auditLog(event) {
    // Would log to audit system
    console.log('RBAC Audit:', event);
  }
}
```

## Permission System

### Dynamic Permission Evaluation

```javascript
class PermissionEvaluator {
  constructor(rbacSystem) {
    this.rbac = rbacSystem;
    this.policies = [];
    this.cache = new Map();
  }

  addPolicy(policy) {
    this.policies.push(policy);
  }

  async evaluate(context) {
    const { user, resource, action } = context;

    // Check cache
    const cacheKey = `${user.id}:${resource}:${action}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // Evaluate permission
    const result = await this.evaluateUncached(context);

    // Cache result
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + 60000 // 1 minute
    });

    return result;
  }

  async evaluateUncached(context) {
    const { user, resource, action } = context;

    // Build required permission
    const requiredPermission = this.buildPermission(resource, action);

    // Check RBAC permissions
    const hasPermission = this.rbac.hasPermission(user.id, requiredPermission);

    if (!hasPermission) {
      return {
        allowed: false,
        reason: 'Insufficient permissions',
        required: requiredPermission
      };
    }

    // Evaluate dynamic policies
    for (const policy of this.policies) {
      const policyResult = await policy.evaluate(context);

      if (!policyResult.allowed) {
        return {
          allowed: false,
          reason: policyResult.reason,
          policy: policy.name
        };
      }
    }

    return {
      allowed: true
    };
  }

  buildPermission(resource, action) {
    // Convert resource and action to permission string
    return `${resource}.${action}`;
  }
}

// Dynamic policies
class TimeBasedAccessPolicy {
  constructor() {
    this.name = 'time-based-access';
    this.rules = [
      {
        role: 'developer',
        allowedHours: { start: 6, end: 22 }, // 6am - 10pm
        allowedDays: [1, 2, 3, 4, 5] // Monday - Friday
      }
    ];
  }

  async evaluate(context) {
    const { user } = context;
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Find applicable rule
    const rule = this.rules.find(r =>
      user.roles && user.roles.includes(r.role)
    );

    if (!rule) {
      return { allowed: true }; // No restriction
    }

    // Check time restrictions
    if (hour < rule.allowedHours.start || hour >= rule.allowedHours.end) {
      return {
        allowed: false,
        reason: `Access denied outside allowed hours (${rule.allowedHours.start}-${rule.allowedHours.end})`
      };
    }

    if (!rule.allowedDays.includes(day)) {
      return {
        allowed: false,
        reason: 'Access denied on weekends'
      };
    }

    return { allowed: true };
  }
}

class ResourceQuotaPolicy {
  constructor() {
    this.name = 'resource-quota';
    this.quotas = new Map();
  }

  async evaluate(context) {
    const { user, resource } = context;
    const userId = user.id;

    // Get user quota
    const quota = this.getQuota(userId);

    // Check resource-specific limits
    if (resource === 'tools.bash') {
      if (quota.bashCommands >= 100) {
        return {
          allowed: false,
          reason: 'Daily bash command limit exceeded'
        };
      }
      quota.bashCommands++;
    }

    if (resource === 'messages') {
      if (quota.messages >= 1000) {
        return {
          allowed: false,
          reason: 'Daily message limit exceeded'
        };
      }
      quota.messages++;
    }

    return { allowed: true };
  }

  getQuota(userId) {
    if (!this.quotas.has(userId)) {
      this.quotas.set(userId, {
        messages: 0,
        bashCommands: 0,
        resetTime: this.getNextResetTime()
      });
    }

    const quota = this.quotas.get(userId);

    // Reset if needed
    if (Date.now() > quota.resetTime) {
      quota.messages = 0;
      quota.bashCommands = 0;
      quota.resetTime = this.getNextResetTime();
    }

    return quota;
  }

  getNextResetTime() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }
}
```

## Tool Authorization

### Tool Permission System

```javascript
class ToolAuthorizationSystem {
  constructor() {
    this.toolPermissions = new Map();
    this.toolPolicies = new Map();

    this.initializeToolPermissions();
  }

  initializeToolPermissions() {
    // Define tool permissions
    this.defineToolPermission('Bash', {
      permission: 'tools.bash.execute',
      riskLevel: 'high',
      requiresAudit: true,

      additionalChecks: async (input, user) => {
        // Check for dangerous commands
        const dangerous = this.checkDangerousCommand(input.command);
        if (dangerous) {
          return {
            allowed: false,
            reason: `Dangerous command detected: ${dangerous}`
          };
        }

        // Check user-specific restrictions
        if (user.restrictions?.noBash) {
          return {
            allowed: false,
            reason: 'User restricted from bash access'
          };
        }

        return { allowed: true };
      }
    });

    this.defineToolPermission('Write', {
      permission: 'tools.write.execute',
      riskLevel: 'medium',
      requiresAudit: true,

      additionalChecks: async (input, user) => {
        // Check file path restrictions
        if (!this.isAllowedPath(input.file_path, user)) {
          return {
            allowed: false,
            reason: 'File path not allowed'
          };
        }

        return { allowed: true };
      }
    });

    this.defineToolPermission('Read', {
      permission: 'tools.read.execute',
      riskLevel: 'low',
      requiresAudit: false,

      additionalChecks: async (input, user) => {
        // Check for sensitive files
        if (this.isSensitivePath(input.file_path)) {
          return {
            allowed: false,
            reason: 'Cannot read sensitive files'
          };
        }

        return { allowed: true };
      }
    });

    this.defineToolPermission('Edit', {
      permission: 'tools.edit.execute',
      riskLevel: 'medium',
      requiresAudit: true,

      additionalChecks: async (input, user) => {
        // Similar to Write tool
        if (!this.isAllowedPath(input.file_path, user)) {
          return {
            allowed: false,
            reason: 'File path not allowed'
          };
        }

        return { allowed: true };
      }
    });

    this.defineToolPermission('WebFetch', {
      permission: 'tools.webfetch.execute',
      riskLevel: 'low',
      requiresAudit: false,

      additionalChecks: async (input, user) => {
        // Check URL restrictions
        if (!this.isAllowedURL(input.url)) {
          return {
            allowed: false,
            reason: 'URL not allowed'
          };
        }

        return { allowed: true };
      }
    });

    this.defineToolPermission('Task', {
      permission: 'agents.run',
      riskLevel: 'high',
      requiresAudit: true,

      additionalChecks: async (input, user) => {
        // Check agent type restrictions
        const allowedAgents = user.allowedAgents || ['general'];

        if (!allowedAgents.includes(input.subagent_type)) {
          return {
            allowed: false,
            reason: `Agent type not allowed: ${input.subagent_type}`
          };
        }

        return { allowed: true };
      }
    });
  }

  defineToolPermission(toolName, config) {
    this.toolPermissions.set(toolName, config);
  }

  async authorizeToolUse(toolName, input, user) {
    const config = this.toolPermissions.get(toolName);

    if (!config) {
      return {
        allowed: false,
        reason: `Unknown tool: ${toolName}`
      };
    }

    // Check basic permission
    const hasPermission = user.permissions?.includes(config.permission);

    if (!hasPermission) {
      return {
        allowed: false,
        reason: `Missing permission: ${config.permission}`
      };
    }

    // Run additional checks
    if (config.additionalChecks) {
      const checkResult = await config.additionalChecks(input, user);

      if (!checkResult.allowed) {
        return checkResult;
      }
    }

    // Check tool-specific policies
    const policy = this.toolPolicies.get(toolName);
    if (policy) {
      const policyResult = await policy.evaluate({ tool: toolName, input, user });

      if (!policyResult.allowed) {
        return policyResult;
      }
    }

    // Audit if required
    if (config.requiresAudit) {
      await this.auditToolUse(toolName, input, user);
    }

    return {
      allowed: true,
      riskLevel: config.riskLevel
    };
  }

  checkDangerousCommand(command) {
    const dangerousPatterns = [
      { pattern: /rm\s+-rf\s+\//, name: 'rm -rf /' },
      { pattern: /:(){ :|:& };:/, name: 'fork bomb' },
      { pattern: /dd\s+if=.*of=\/dev\/[sh]d/, name: 'disk overwrite' },
      { pattern: />\/dev\/[sh]d/, name: 'write to disk device' }
    ];

    for (const { pattern, name } of dangerousPatterns) {
      if (pattern.test(command)) {
        return name;
      }
    }

    return null;
  }

  isAllowedPath(path, user) {
    // Default allowed paths
    const allowedPaths = [
      process.cwd(),
      '/tmp',
      '/var/tmp'
    ];

    // Add user-specific paths
    if (user.allowedPaths) {
      allowedPaths.push(...user.allowedPaths);
    }

    // Check if path is within allowed directories
    const normalizedPath = require('path').resolve(path);

    return allowedPaths.some(allowed =>
      normalizedPath.startsWith(allowed)
    );
  }

  isSensitivePath(path) {
    const sensitivePatterns = [
      /\.env$/,
      /\.git\//,
      /\.ssh\//,
      /password/i,
      /secret/i,
      /key\.pem$/
    ];

    return sensitivePatterns.some(pattern => pattern.test(path));
  }

  isAllowedURL(url) {
    try {
      const parsed = new URL(url);

      // Block local URLs
      if (parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname.startsWith('192.168.') ||
          parsed.hostname.startsWith('10.')) {
        return false;
      }

      // Block certain protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      return true;

    } catch {
      return false;
    }
  }

  async auditToolUse(toolName, input, user) {
    const audit = {
      event: 'tool.executed',
      tool: toolName,
      user: {
        id: user.id,
        email: user.email
      },
      input: this.sanitizeForAudit(input),
      timestamp: Date.now()
    };

    // Would send to audit logging system
    console.log('Tool Audit:', audit);
  }

  sanitizeForAudit(input) {
    // Remove sensitive data from audit logs
    const sanitized = { ...input };

    // Mask potential secrets
    if (sanitized.content) {
      sanitized.content = sanitized.content
        .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***')
        .replace(/password=["'][^"']+["']/gi, 'password="***"');
    }

    return sanitized;
  }
}
```

## Audit System

### Comprehensive Audit Logging

```javascript
class AuditSystem {
  constructor() {
    this.storage = new AuditStorage();
    this.filters = [];
    this.alerts = new Map();
  }

  async log(event) {
    // Enrich event
    const enrichedEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: event.timestamp || Date.now(),
      serverTime: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production'
    };

    // Apply filters
    for (const filter of this.filters) {
      if (!filter.shouldLog(enrichedEvent)) {
        return; // Skip logging
      }
    }

    // Store event
    await this.storage.store(enrichedEvent);

    // Check alerts
    await this.checkAlerts(enrichedEvent);
  }

  generateEventId() {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
  }

  addFilter(filter) {
    this.filters.push(filter);
  }

  addAlert(name, condition, action) {
    this.alerts.set(name, { condition, action });
  }

  async checkAlerts(event) {
    for (const [name, alert] of this.alerts) {
      if (alert.condition(event)) {
        await alert.action(event);
      }
    }
  }

  async query(criteria) {
    return await this.storage.query(criteria);
  }
}

class AuditStorage {
  constructor() {
    this.events = [];
    this.maxEvents = 100000;
    this.indexes = {
      byUser: new Map(),
      byEvent: new Map(),
      byTimestamp: []
    };
  }

  async store(event) {
    // Add to main storage
    this.events.push(event);

    // Update indexes
    this.updateIndexes(event);

    // Rotate if needed
    if (this.events.length > this.maxEvents) {
      await this.rotate();
    }
  }

  updateIndexes(event) {
    // Index by user
    if (event.userId) {
      if (!this.indexes.byUser.has(event.userId)) {
        this.indexes.byUser.set(event.userId, []);
      }
      this.indexes.byUser.get(event.userId).push(event);
    }

    // Index by event type
    if (event.event) {
      if (!this.indexes.byEvent.has(event.event)) {
        this.indexes.byEvent.set(event.event, []);
      }
      this.indexes.byEvent.get(event.event).push(event);
    }

    // Index by timestamp
    this.indexes.byTimestamp.push({
      timestamp: event.timestamp,
      event
    });
  }

  async rotate() {
    // Archive old events
    const toArchive = this.events.splice(0, this.maxEvents / 2);

    // Would write to permanent storage
    console.log(`Archiving ${toArchive.length} audit events`);

    // Rebuild indexes
    this.rebuildIndexes();
  }

  rebuildIndexes() {
    this.indexes = {
      byUser: new Map(),
      byEvent: new Map(),
      byTimestamp: []
    };

    for (const event of this.events) {
      this.updateIndexes(event);
    }
  }

  async query(criteria) {
    let results = this.events;

    // Filter by user
    if (criteria.userId) {
      results = this.indexes.byUser.get(criteria.userId) || [];
    }

    // Filter by event type
    if (criteria.event) {
      results = results.filter(e => e.event === criteria.event);
    }

    // Filter by time range
    if (criteria.startTime || criteria.endTime) {
      results = results.filter(e => {
        if (criteria.startTime && e.timestamp < criteria.startTime) return false;
        if (criteria.endTime && e.timestamp > criteria.endTime) return false;
        return true;
      });
    }

    // Limit results
    if (criteria.limit) {
      results = results.slice(-criteria.limit);
    }

    return results;
  }
}

// Audit alerts
class SecurityAlerts {
  static setupAlerts(auditSystem) {
    // Failed authentication attempts
    auditSystem.addAlert(
      'failed-auth',
      event => event.event === 'auth.failed',
      async event => {
        const recentFailures = await auditSystem.query({
          event: 'auth.failed',
          userId: event.userId,
          startTime: Date.now() - 300000 // Last 5 minutes
        });

        if (recentFailures.length >= 5) {
          console.error('ALERT: Multiple failed authentication attempts', {
            userId: event.userId,
            attempts: recentFailures.length
          });
        }
      }
    );

    // Privilege escalation
    auditSystem.addAlert(
      'privilege-escalation',
      event => event.event === 'permission.denied' && event.permission?.includes('admin'),
      async event => {
        console.error('ALERT: Attempted privilege escalation', {
          userId: event.userId,
          permission: event.permission
        });
      }
    );

    // Dangerous commands
    auditSystem.addAlert(
      'dangerous-command',
      event => event.event === 'tool.executed' && event.riskLevel === 'high',
      async event => {
        console.error('ALERT: High-risk tool execution', {
          tool: event.tool,
          user: event.user,
          input: event.input
        });
      }
    );
  }
}
```

## Performance Implications

### Authentication Performance

```javascript
class AuthenticationPerformance {
  static async measurePerformance() {
    const metrics = {
      apiKeyValidation: await this.measureAPIKeyValidation(),
      sessionCreation: await this.measureSessionCreation(),
      permissionCheck: await this.measurePermissionCheck(),
      toolAuthorization: await this.measureToolAuthorization()
    };

    return this.analyzeMetrics(metrics);
  }

  static async measureAPIKeyValidation() {
    const provider = new APIKeyProvider();
    const testKey = 'sk-' + 'a'.repeat(48);

    const iterations = 1000;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      await provider.validateKeyFormat(testKey);
    }

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6 / iterations; // ms per validation
  }

  static async measureSessionCreation() {
    const sessionManager = new SessionManager();
    const testUser = {
      id: 'test-user',
      email: 'test@example.com',
      roles: ['developer']
    };

    const start = process.hrtime.bigint();
    await sessionManager.createSession(testUser);
    const end = process.hrtime.bigint();

    return Number(end - start) / 1e6;
  }

  static async measurePermissionCheck() {
    const rbac = new RBACSystem();
    const evaluator = new PermissionEvaluator(rbac);

    // Setup test user
    await rbac.assignRole('test-user', 'developer');

    const context = {
      user: { id: 'test-user' },
      resource: 'tools.bash',
      action: 'execute'
    };

    const iterations = 1000;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      await evaluator.evaluate(context);
    }

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6 / iterations;
  }

  static async measureToolAuthorization() {
    const toolAuth = new ToolAuthorizationSystem();
    const testInput = { command: 'ls -la' };
    const testUser = {
      id: 'test-user',
      permissions: ['tools.bash.execute']
    };

    const start = process.hrtime.bigint();
    await toolAuth.authorizeToolUse('Bash', testInput, testUser);
    const end = process.hrtime.bigint();

    return Number(end - start) / 1e6;
  }

  static analyzeMetrics(metrics) {
    const analysis = {
      metrics,
      totalOverhead: Object.values(metrics).reduce((sum, time) => sum + time, 0),
      recommendations: []
    };

    if (metrics.apiKeyValidation > 0.1) {
      analysis.recommendations.push('Optimize API key validation with caching');
    }

    if (metrics.sessionCreation > 10) {
      analysis.recommendations.push('Consider async session creation');
    }

    if (metrics.permissionCheck > 0.5) {
      analysis.recommendations.push('Implement permission caching');
    }

    if (metrics.toolAuthorization > 5) {
      analysis.recommendations.push('Cache tool authorization results');
    }

    return analysis;
  }
}
```

## Summary

The Claude Code authentication and authorization system provides:

1. **Multi-provider Authentication**: Support for API keys, OAuth2, JWT, and MCP tokens
2. **Secure Session Management**: Session lifecycle with automatic renewal and expiration
3. **Comprehensive RBAC**: Role-based access control with inheritance and wildcards
4. **Dynamic Permissions**: Policy-based permission evaluation with caching
5. **Tool Authorization**: Fine-grained control over tool execution
6. **Complete Audit Trail**: Comprehensive logging with alerting capabilities
7. **Performance Optimization**: Caching and optimization for minimal overhead
8. **Security Best Practices**: Rate limiting, lockout protection, and secure token handling

The system ensures secure access control while maintaining flexibility and performance.

## Next Steps

In the next section, we'll explore data protection mechanisms including encryption and secure storage.

---

*Part of the Claude Code Technical Series - Security*