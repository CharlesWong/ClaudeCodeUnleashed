# Part 10.1: Security Architecture

## Introduction

The Claude Code security architecture implements defense-in-depth principles to protect against various security threats while maintaining usability. This chapter explores the multi-layered security approach, from authentication and authorization to input validation, command sanitization, and secure communication protocols.

## Table of Contents
1. [Security Principles](#security-principles)
2. [Threat Model](#threat-model)
3. [Security Layers](#security-layers)
4. [Authentication System](#authentication-system)
5. [Authorization Framework](#authorization-framework)
6. [Input Validation](#input-validation)
7. [Secure Communication](#secure-communication)
8. [Performance Implications](#performance-implications)

## Security Principles

### Core Security Tenets

```javascript
class SecurityPrinciples {
  static principles = {
    // Defense in Depth
    defenseInDepth: {
      description: 'Multiple layers of security controls',
      implementation: [
        'Authentication at API level',
        'Authorization for tool access',
        'Input validation and sanitization',
        'Command execution restrictions',
        'Output filtering'
      ]
    },

    // Principle of Least Privilege
    leastPrivilege: {
      description: 'Minimal necessary permissions',
      implementation: [
        'Read-only tools by default',
        'Explicit permission for write operations',
        'Sandboxed command execution',
        'Restricted file system access'
      ]
    },

    // Security by Design
    securityByDesign: {
      description: 'Security built into architecture',
      implementation: [
        'Secure defaults',
        'Fail-safe mechanisms',
        'Audit logging',
        'Encrypted communication'
      ]
    },

    // Zero Trust
    zeroTrust: {
      description: 'Never trust, always verify',
      implementation: [
        'Validate all inputs',
        'Authenticate every request',
        'Verify tool permissions',
        'Monitor all activities'
      ]
    }
  };

  static implement() {
    return {
      authentication: new AuthenticationLayer(),
      authorization: new AuthorizationLayer(),
      validation: new ValidationLayer(),
      monitoring: new SecurityMonitor()
    };
  }
}
```

## Threat Model

### Threat Classification

```javascript
class ThreatModel {
  constructor() {
    this.threats = new Map();
    this.mitigations = new Map();
    this.riskMatrix = new Map();

    this.initializeThreats();
  }

  initializeThreats() {
    // Command Injection Threats
    this.addThreat({
      id: 'CMD-INJ-001',
      name: 'Shell Command Injection',
      category: 'Injection',
      severity: 'Critical',
      description: 'Malicious commands injected through user input',

      attackVectors: [
        'Unescaped shell metacharacters',
        'Command chaining with ; && ||',
        'Backtick command substitution',
        'Variable expansion attacks'
      ],

      mitigations: [
        'Input sanitization',
        'Command allowlisting',
        'Shell argument escaping',
        'Sandbox execution'
      ],

      detection: {
        patterns: [
          /[;&|`$()]/,
          /\$\{.*\}/,
          /\$\(.*\)/,
          />>/
        ],

        check(input) {
          return this.patterns.some(p => p.test(input));
        }
      }
    });

    // Path Traversal Threats
    this.addThreat({
      id: 'PATH-TRV-001',
      name: 'Directory Traversal',
      category: 'Access Control',
      severity: 'High',
      description: 'Unauthorized file system access',

      attackVectors: [
        '../ sequences',
        'Absolute path manipulation',
        'Symbolic link attacks',
        'Hidden file access'
      ],

      mitigations: [
        'Path normalization',
        'Chroot/jail environments',
        'Access control lists',
        'Path validation'
      ],

      detection: {
        patterns: [
          /\.\.\//,
          /^\/(?!tmp|var\/tmp)/,  // Absolute paths outside safe dirs
          /^\./,  // Hidden files
          /~\//   // Home directory expansion
        ],

        check(path) {
          return this.patterns.some(p => p.test(path));
        }
      }
    });

    // API Key Exposure
    this.addThreat({
      id: 'KEY-EXP-001',
      name: 'API Key Exposure',
      category: 'Information Disclosure',
      severity: 'Critical',
      description: 'Exposure of authentication credentials',

      attackVectors: [
        'Logs containing keys',
        'Error messages with credentials',
        'Command history exposure',
        'Environment variable leakage'
      ],

      mitigations: [
        'Key masking in logs',
        'Secure key storage',
        'Environment isolation',
        'Credential rotation'
      ],

      detection: {
        patterns: [
          /sk-[a-zA-Z0-9]{48}/,  // Anthropic API key pattern
          /api[_-]?key/i,
          /authorization:\s*bearer/i
        ],

        check(content) {
          return this.patterns.some(p => p.test(content));
        }
      }
    });

    // Denial of Service
    this.addThreat({
      id: 'DOS-001',
      name: 'Resource Exhaustion',
      category: 'Availability',
      severity: 'High',
      description: 'System resource exhaustion attacks',

      attackVectors: [
        'Infinite loops',
        'Fork bombs',
        'Memory exhaustion',
        'Disk filling'
      ],

      mitigations: [
        'Resource limits',
        'Timeout controls',
        'Rate limiting',
        'Process isolation'
      ],

      detection: {
        patterns: [
          /:(){ :|:& };:/,  // Fork bomb
          /\/dev\/zero/,    // Disk filling
          /while\s+true/,   // Infinite loops
        ],

        check(command) {
          return this.patterns.some(p => p.test(command));
        }
      }
    });
  }

  addThreat(threat) {
    this.threats.set(threat.id, threat);

    // Calculate risk score
    const riskScore = this.calculateRisk(threat);
    this.riskMatrix.set(threat.id, riskScore);
  }

  calculateRisk(threat) {
    const severityScores = {
      Critical: 10,
      High: 7,
      Medium: 5,
      Low: 3
    };

    const likelihood = threat.attackVectors.length * 2;
    const impact = severityScores[threat.severity];

    return {
      score: likelihood * impact,
      level: this.getRiskLevel(likelihood * impact),
      likelihood,
      impact
    };
  }

  getRiskLevel(score) {
    if (score >= 70) return 'Critical';
    if (score >= 50) return 'High';
    if (score >= 30) return 'Medium';
    return 'Low';
  }

  assessThreat(input) {
    const detectedThreats = [];

    for (const [id, threat] of this.threats) {
      if (threat.detection.check(input)) {
        detectedThreats.push({
          threat,
          risk: this.riskMatrix.get(id)
        });
      }
    }

    return detectedThreats.sort((a, b) => b.risk.score - a.risk.score);
  }
}
```

## Security Layers

### Layered Security Architecture

```javascript
class SecurityArchitecture {
  constructor() {
    this.layers = [
      new NetworkSecurityLayer(),
      new AuthenticationLayer(),
      new AuthorizationLayer(),
      new ValidationLayer(),
      new ExecutionSecurityLayer(),
      new MonitoringLayer()
    ];
  }

  async processRequest(request) {
    let context = {
      request,
      user: null,
      permissions: [],
      validated: false,
      audit: []
    };

    // Process through each security layer
    for (const layer of this.layers) {
      try {
        context = await layer.process(context);

        if (context.blocked) {
          this.handleBlocked(context);
          return null;
        }

      } catch (error) {
        this.handleSecurityError(error, context);
        return null;
      }
    }

    return context;
  }

  handleBlocked(context) {
    const { layer, reason, threat } = context.blocked;

    // Log security event
    console.error(`Security Block: ${layer}`, {
      reason,
      threat,
      request: context.request,
      timestamp: new Date().toISOString()
    });

    // Alert monitoring
    this.alertMonitoring(context);
  }

  handleSecurityError(error, context) {
    console.error('Security Layer Error:', error);

    // Fail closed - block on error
    context.blocked = {
      layer: 'error-handler',
      reason: 'Security processing error',
      error: error.message
    };
  }

  alertMonitoring(context) {
    // Send to monitoring system
    const alert = {
      type: 'SECURITY_BLOCK',
      severity: context.blocked.threat?.severity || 'Medium',
      context,
      timestamp: Date.now()
    };

    // Would send to monitoring service
    this.layers.find(l => l instanceof MonitoringLayer)?.alert(alert);
  }
}

// Network Security Layer
class NetworkSecurityLayer {
  async process(context) {
    // TLS/SSL verification
    if (!this.isSecureConnection(context.request)) {
      context.blocked = {
        layer: 'network',
        reason: 'Insecure connection'
      };
    }

    // IP filtering
    if (!this.isAllowedIP(context.request.ip)) {
      context.blocked = {
        layer: 'network',
        reason: 'IP not allowed'
      };
    }

    // Rate limiting
    if (!this.checkRateLimit(context.request)) {
      context.blocked = {
        layer: 'network',
        reason: 'Rate limit exceeded'
      };
    }

    return context;
  }

  isSecureConnection(request) {
    return request.protocol === 'https' || request.isLocal;
  }

  isAllowedIP(ip) {
    // Check IP allowlist/blocklist
    return true; // Simplified
  }

  checkRateLimit(request) {
    // Implement rate limiting
    return true; // Simplified
  }
}
```

## Authentication System

### API Key Authentication

```javascript
class AuthenticationLayer {
  constructor() {
    this.authMethods = new Map();
    this.sessionStore = new Map();

    // Register authentication methods
    this.registerMethod('api-key', new APIKeyAuth());
    this.registerMethod('oauth', new OAuthAuth());
    this.registerMethod('jwt', new JWTAuth());
  }

  registerMethod(name, method) {
    this.authMethods.set(name, method);
  }

  async process(context) {
    const { request } = context;

    // Extract credentials
    const credentials = this.extractCredentials(request);

    if (!credentials) {
      context.blocked = {
        layer: 'authentication',
        reason: 'No credentials provided'
      };
      return context;
    }

    // Authenticate
    const authResult = await this.authenticate(credentials);

    if (!authResult.success) {
      context.blocked = {
        layer: 'authentication',
        reason: authResult.error
      };
      return context;
    }

    // Set user context
    context.user = authResult.user;
    context.session = await this.createSession(authResult.user);

    return context;
  }

  extractCredentials(request) {
    // Check various credential locations
    const credentials = {
      apiKey: null,
      token: null,
      method: null
    };

    // API Key in header
    if (request.headers['x-api-key']) {
      credentials.apiKey = request.headers['x-api-key'];
      credentials.method = 'api-key';
    }

    // Bearer token
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      credentials.token = authHeader.slice(7);
      credentials.method = 'jwt';
    }

    // Environment variable fallback
    if (!credentials.apiKey && process.env.ANTHROPIC_API_KEY) {
      credentials.apiKey = process.env.ANTHROPIC_API_KEY;
      credentials.method = 'api-key';
    }

    return credentials.method ? credentials : null;
  }

  async authenticate(credentials) {
    const method = this.authMethods.get(credentials.method);

    if (!method) {
      return {
        success: false,
        error: `Unknown authentication method: ${credentials.method}`
      };
    }

    return await method.authenticate(credentials);
  }

  async createSession(user) {
    const sessionId = this.generateSessionId();

    const session = {
      id: sessionId,
      user,
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      permissions: await this.loadUserPermissions(user)
    };

    this.sessionStore.set(sessionId, session);

    // Schedule cleanup
    setTimeout(() => {
      this.sessionStore.delete(sessionId);
    }, session.expiresAt - Date.now());

    return session;
  }

  generateSessionId() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  async loadUserPermissions(user) {
    // Load user permissions from config or database
    return user.permissions || ['read', 'write', 'execute'];
  }
}

// API Key Authentication Method
class APIKeyAuth {
  constructor() {
    this.keyStore = new Map();
    this.keyPattern = /^sk-[a-zA-Z0-9]{48}$/;
  }

  async authenticate(credentials) {
    const { apiKey } = credentials;

    // Validate key format
    if (!this.validateKeyFormat(apiKey)) {
      return {
        success: false,
        error: 'Invalid API key format'
      };
    }

    // Hash key for comparison
    const keyHash = this.hashKey(apiKey);

    // Verify key (would check against API in production)
    const isValid = await this.verifyKey(keyHash);

    if (!isValid) {
      return {
        success: false,
        error: 'Invalid or expired API key'
      };
    }

    // Get user info
    const user = await this.getUserForKey(keyHash);

    return {
      success: true,
      user
    };
  }

  validateKeyFormat(key) {
    return this.keyPattern.test(key);
  }

  hashKey(key) {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(key)
      .digest('hex');
  }

  async verifyKey(keyHash) {
    // In production, would verify with Anthropic API
    // For now, simplified validation
    return keyHash.length === 64;
  }

  async getUserForKey(keyHash) {
    // Would fetch from database or API
    return {
      id: keyHash.slice(0, 8),
      type: 'api-key',
      permissions: ['messages.create', 'tools.execute']
    };
  }
}
```

## Authorization Framework

### Permission System

```javascript
class AuthorizationLayer {
  constructor() {
    this.permissions = new Map();
    this.roles = new Map();
    this.policies = [];

    this.initializePermissions();
  }

  initializePermissions() {
    // Define permissions
    this.definePermission('tools.bash.execute', {
      description: 'Execute bash commands',
      risk: 'high',
      requiresAudit: true
    });

    this.definePermission('tools.write.execute', {
      description: 'Write files',
      risk: 'medium',
      requiresAudit: true
    });

    this.definePermission('tools.read.execute', {
      description: 'Read files',
      risk: 'low',
      requiresAudit: false
    });

    // Define roles
    this.defineRole('admin', {
      permissions: ['*'],  // All permissions
      description: 'Administrator with full access'
    });

    this.defineRole('developer', {
      permissions: [
        'tools.*.execute',
        'messages.create',
        'agents.run'
      ],
      description: 'Developer with tool access'
    });

    this.defineRole('viewer', {
      permissions: [
        'tools.read.execute',
        'messages.read'
      ],
      description: 'Read-only access'
    });

    // Define policies
    this.addPolicy(new TimeBasedPolicy());
    this.addPolicy(new ResourceLimitPolicy());
    this.addPolicy(new GeographicPolicy());
  }

  definePermission(name, config) {
    this.permissions.set(name, {
      name,
      ...config,
      pattern: this.createPermissionPattern(name)
    });
  }

  defineRole(name, config) {
    this.roles.set(name, {
      name,
      ...config,
      compiledPermissions: this.compilePermissions(config.permissions)
    });
  }

  addPolicy(policy) {
    this.policies.push(policy);
  }

  createPermissionPattern(permission) {
    // Convert permission string to regex pattern
    const pattern = permission
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');

    return new RegExp(`^${pattern}$`);
  }

  compilePermissions(permissions) {
    const compiled = [];

    for (const perm of permissions) {
      if (perm === '*') {
        return [/.*/];  // Match all
      }

      compiled.push(this.createPermissionPattern(perm));
    }

    return compiled;
  }

  async process(context) {
    const { user, request } = context;

    // Extract required permission
    const requiredPermission = this.extractRequiredPermission(request);

    if (!requiredPermission) {
      return context;  // No permission required
    }

    // Check user permissions
    const hasPermission = await this.checkPermission(
      user,
      requiredPermission,
      context
    );

    if (!hasPermission) {
      context.blocked = {
        layer: 'authorization',
        reason: `Permission denied: ${requiredPermission}`
      };
      return context;
    }

    // Check policies
    for (const policy of this.policies) {
      const policyResult = await policy.evaluate(context);

      if (!policyResult.allowed) {
        context.blocked = {
          layer: 'authorization',
          reason: `Policy violation: ${policyResult.reason}`,
          policy: policy.name
        };
        return context;
      }
    }

    context.authorized = true;
    context.permissions = await this.getUserPermissions(user);

    return context;
  }

  extractRequiredPermission(request) {
    // Map request to required permission
    if (request.tool) {
      return `tools.${request.tool}.execute`;
    }

    if (request.endpoint) {
      return `api.${request.endpoint}`;
    }

    return null;
  }

  async checkPermission(user, permission, context) {
    // Get user's effective permissions
    const userPermissions = await this.getUserPermissions(user);

    // Check if any permission matches
    for (const userPerm of userPermissions) {
      if (userPerm.test ? userPerm.test(permission) : userPerm === permission) {
        // Log authorization
        context.audit.push({
          type: 'authorization',
          permission,
          granted: true,
          timestamp: Date.now()
        });

        return true;
      }
    }

    // Log denial
    context.audit.push({
      type: 'authorization',
      permission,
      granted: false,
      timestamp: Date.now()
    });

    return false;
  }

  async getUserPermissions(user) {
    const permissions = [];

    // Get permissions from user object
    if (user.permissions) {
      permissions.push(...user.permissions);
    }

    // Get permissions from roles
    if (user.roles) {
      for (const roleName of user.roles) {
        const role = this.roles.get(roleName);
        if (role) {
          permissions.push(...role.compiledPermissions);
        }
      }
    }

    return permissions;
  }
}

// Policy implementations
class TimeBasedPolicy {
  constructor() {
    this.name = 'time-based-access';
    this.allowedHours = { start: 6, end: 22 };  // 6am to 10pm
  }

  async evaluate(context) {
    const hour = new Date().getHours();

    if (hour < this.allowedHours.start || hour >= this.allowedHours.end) {
      return {
        allowed: false,
        reason: 'Access outside allowed hours'
      };
    }

    return { allowed: true };
  }
}

class ResourceLimitPolicy {
  constructor() {
    this.name = 'resource-limits';
    this.limits = {
      maxRequestsPerHour: 1000,
      maxTokensPerDay: 1000000
    };
    this.usage = new Map();
  }

  async evaluate(context) {
    const userId = context.user.id;
    const usage = this.getUsage(userId);

    // Check request limit
    if (usage.requests >= this.limits.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: 'Request limit exceeded'
      };
    }

    // Check token limit
    if (usage.tokens >= this.limits.maxTokensPerDay) {
      return {
        allowed: false,
        reason: 'Token limit exceeded'
      };
    }

    // Update usage
    this.updateUsage(userId, context);

    return { allowed: true };
  }

  getUsage(userId) {
    if (!this.usage.has(userId)) {
      this.usage.set(userId, {
        requests: 0,
        tokens: 0,
        resetTime: Date.now() + 3600000  // 1 hour
      });
    }

    const usage = this.usage.get(userId);

    // Reset if needed
    if (Date.now() > usage.resetTime) {
      usage.requests = 0;
      usage.resetTime = Date.now() + 3600000;
    }

    return usage;
  }

  updateUsage(userId, context) {
    const usage = this.getUsage(userId);
    usage.requests++;
    usage.tokens += context.request.estimatedTokens || 0;
  }
}
```

## Input Validation

### Validation Layer

```javascript
class ValidationLayer {
  constructor() {
    this.validators = new Map();
    this.sanitizers = new Map();

    this.initializeValidators();
  }

  initializeValidators() {
    // Command validator
    this.registerValidator('command', {
      validate(input) {
        const dangerous = [
          /rm\s+-rf\s+\//,  // rm -rf /
          /:(){ :|:& };:/,   // Fork bomb
          /dd\s+if=.*of=\/dev\/[sh]d/,  // Disk overwrite
          />\s*\/dev\/[sh]d/  // Redirect to disk
        ];

        for (const pattern of dangerous) {
          if (pattern.test(input)) {
            return {
              valid: false,
              error: 'Dangerous command detected',
              pattern: pattern.toString()
            };
          }
        }

        return { valid: true };
      },

      sanitize(input) {
        // Escape shell metacharacters
        return input
          .replace(/([;&|`$()])/g, '\\$1')
          .replace(/\n/g, ' ');
      }
    });

    // File path validator
    this.registerValidator('filepath', {
      validate(input) {
        // Check for path traversal
        if (input.includes('../')) {
          return {
            valid: false,
            error: 'Path traversal detected'
          };
        }

        // Check for absolute paths outside safe directories
        if (input.startsWith('/') && !this.isSafePath(input)) {
          return {
            valid: false,
            error: 'Absolute path outside safe directories'
          };
        }

        return { valid: true };
      },

      isSafePath(path) {
        const safePaths = ['/tmp', '/var/tmp', process.cwd()];
        return safePaths.some(safe => path.startsWith(safe));
      },

      sanitize(input) {
        const path = require('path');
        // Normalize and resolve path
        return path.normalize(input);
      }
    });

    // Content validator
    this.registerValidator('content', {
      validate(input) {
        // Check for secrets
        const secretPatterns = [
          /sk-[a-zA-Z0-9]{48}/,  // API keys
          /-----BEGIN.*PRIVATE KEY-----/,  // Private keys
          /password\s*=\s*["'][^"']+["']/i  // Passwords
        ];

        for (const pattern of secretPatterns) {
          if (pattern.test(input)) {
            return {
              valid: false,
              error: 'Potential secret detected',
              pattern: pattern.toString()
            };
          }
        }

        return { valid: true };
      },

      sanitize(input) {
        // Mask potential secrets
        return input
          .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***')
          .replace(/password\s*=\s*["'][^"']+["']/gi, 'password="***"');
      }
    });
  }

  registerValidator(type, validator) {
    this.validators.set(type, validator);
  }

  async process(context) {
    const { request } = context;

    // Determine validation type
    const validationType = this.getValidationType(request);

    if (!validationType) {
      return context;  // No validation needed
    }

    // Get validator
    const validator = this.validators.get(validationType);

    if (!validator) {
      context.blocked = {
        layer: 'validation',
        reason: `No validator for type: ${validationType}`
      };
      return context;
    }

    // Validate input
    const input = this.extractInput(request);
    const validationResult = validator.validate(input);

    if (!validationResult.valid) {
      context.blocked = {
        layer: 'validation',
        reason: validationResult.error,
        details: validationResult
      };
      return context;
    }

    // Sanitize input
    if (validator.sanitize) {
      request.sanitizedInput = validator.sanitize(input);
    }

    context.validated = true;

    return context;
  }

  getValidationType(request) {
    if (request.tool === 'bash') return 'command';
    if (request.tool === 'write' || request.tool === 'edit') return 'filepath';
    if (request.content) return 'content';
    return null;
  }

  extractInput(request) {
    return request.input || request.command || request.content || '';
  }
}
```

## Secure Communication

### Encrypted Communication Layer

```javascript
class SecureCommunication {
  constructor() {
    this.crypto = require('crypto');
    this.algorithm = 'aes-256-gcm';
    this.keys = new Map();
  }

  async establishSecureChannel(clientId) {
    // Generate session keys
    const sessionKey = this.generateSessionKey();
    const iv = this.crypto.randomBytes(16);

    // Store session info
    this.keys.set(clientId, {
      key: sessionKey,
      iv,
      createdAt: Date.now(),
      messageCount: 0
    });

    // Return encrypted session info
    return {
      sessionId: clientId,
      publicKey: await this.getPublicKey(),
      algorithm: this.algorithm
    };
  }

  generateSessionKey() {
    return this.crypto.randomBytes(32);
  }

  async getPublicKey() {
    // Would use real key pair in production
    const { publicKey } = this.crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      }
    });

    return publicKey;
  }

  encrypt(data, clientId) {
    const session = this.keys.get(clientId);

    if (!session) {
      throw new Error('No session established');
    }

    const cipher = this.crypto.createCipheriv(
      this.algorithm,
      session.key,
      session.iv
    );

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      authTag: authTag.toString('base64'),
      iv: session.iv.toString('base64')
    };
  }

  decrypt(encryptedData, clientId) {
    const session = this.keys.get(clientId);

    if (!session) {
      throw new Error('No session established');
    }

    const decipher = this.crypto.createDecipheriv(
      this.algorithm,
      session.key,
      Buffer.from(encryptedData.iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.encrypted, 'base64')),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  rotateKeys(clientId) {
    const session = this.keys.get(clientId);

    if (!session) {
      return false;
    }

    // Generate new key
    session.key = this.generateSessionKey();
    session.iv = this.crypto.randomBytes(16);
    session.rotatedAt = Date.now();
    session.messageCount = 0;

    return true;
  }

  shouldRotate(clientId) {
    const session = this.keys.get(clientId);

    if (!session) {
      return false;
    }

    const MAX_MESSAGES = 1000;
    const MAX_AGE = 3600000;  // 1 hour

    return session.messageCount > MAX_MESSAGES ||
           (Date.now() - session.createdAt) > MAX_AGE;
  }
}

// HTTPS/TLS Configuration
class TLSConfiguration {
  static getConfig() {
    return {
      // TLS version
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',

      // Cipher suites (in order of preference)
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384'
      ].join(':'),

      // Certificate configuration
      cert: process.env.TLS_CERT,
      key: process.env.TLS_KEY,
      ca: process.env.TLS_CA,

      // Security options
      rejectUnauthorized: true,
      requestCert: false,

      // HSTS
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    };
  }

  static validateCertificate(cert) {
    const crypto = require('crypto');

    // Check expiration
    const now = Date.now();
    if (cert.valid_to < now) {
      return {
        valid: false,
        error: 'Certificate expired'
      };
    }

    // Check not yet valid
    if (cert.valid_from > now) {
      return {
        valid: false,
        error: 'Certificate not yet valid'
      };
    }

    // Verify signature
    // Would implement full chain validation in production

    return { valid: true };
  }
}
```

## Performance Implications

### Security Performance Monitoring

```javascript
class SecurityPerformanceMonitor {
  constructor() {
    this.metrics = {
      authenticationTime: [],
      authorizationTime: [],
      validationTime: [],
      encryptionTime: [],
      totalSecurityOverhead: []
    };
  }

  async measureSecurityOverhead() {
    const results = {
      authentication: await this.measureAuthentication(),
      authorization: await this.measureAuthorization(),
      validation: await this.measureValidation(),
      encryption: await this.measureEncryption(),
      total: 0
    };

    results.total = Object.values(results)
      .filter(v => typeof v === 'number')
      .reduce((sum, time) => sum + time, 0);

    return results;
  }

  async measureAuthentication() {
    const auth = new AuthenticationLayer();
    const testRequest = {
      headers: {
        'x-api-key': 'sk-' + 'a'.repeat(48)
      }
    };

    const start = process.hrtime.bigint();
    await auth.process({ request: testRequest });
    const end = process.hrtime.bigint();

    return Number(end - start) / 1e6;  // ms
  }

  async measureAuthorization() {
    const authz = new AuthorizationLayer();
    const testContext = {
      user: { permissions: ['tools.read.execute'] },
      request: { tool: 'read' }
    };

    const start = process.hrtime.bigint();
    await authz.process(testContext);
    const end = process.hrtime.bigint();

    return Number(end - start) / 1e6;
  }

  async measureValidation() {
    const validation = new ValidationLayer();
    const testContext = {
      request: {
        tool: 'bash',
        command: 'echo "test command"'
      }
    };

    const start = process.hrtime.bigint();
    await validation.process(testContext);
    const end = process.hrtime.bigint();

    return Number(end - start) / 1e6;
  }

  async measureEncryption() {
    const secure = new SecureCommunication();
    const clientId = 'test-client';

    await secure.establishSecureChannel(clientId);

    const testData = { message: 'test'.repeat(100) };

    const start = process.hrtime.bigint();
    const encrypted = secure.encrypt(testData, clientId);
    secure.decrypt(encrypted, clientId);
    const end = process.hrtime.bigint();

    return Number(end - start) / 1e6;
  }

  getRecommendations(metrics) {
    const recommendations = [];

    if (metrics.authentication > 10) {
      recommendations.push('Consider caching authentication results');
    }

    if (metrics.authorization > 5) {
      recommendations.push('Optimize permission checking logic');
    }

    if (metrics.validation > 20) {
      recommendations.push('Use compiled regex patterns for validation');
    }

    if (metrics.encryption > 50) {
      recommendations.push('Consider hardware acceleration for encryption');
    }

    if (metrics.total > 100) {
      recommendations.push('Security overhead is significant, consider optimization');
    }

    return recommendations;
  }
}
```

## Summary

The Claude Code security architecture implements comprehensive defense-in-depth with:

1. **Multi-layered Security**: Network, authentication, authorization, validation, and monitoring layers
2. **Threat Modeling**: Proactive identification and mitigation of security threats
3. **Strong Authentication**: API key validation with secure storage and rotation
4. **Granular Authorization**: Role-based access control with dynamic policies
5. **Input Validation**: Comprehensive sanitization and validation of all inputs
6. **Secure Communication**: TLS/HTTPS with optional end-to-end encryption
7. **Performance Monitoring**: Tracking security overhead with optimization recommendations
8. **Audit Logging**: Complete audit trail of security decisions

The architecture prioritizes security while maintaining usability and performance, ensuring safe execution of AI-assisted operations.

## Next Steps

In the next section, we'll explore the authentication and authorization implementations in detail.

---

*Part of the Claude Code Technical Series - Security*