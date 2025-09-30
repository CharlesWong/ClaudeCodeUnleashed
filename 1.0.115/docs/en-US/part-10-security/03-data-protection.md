# Part 10.3: Data Protection

## Introduction

Data protection in Claude Code encompasses encryption at rest and in transit, secure storage of sensitive information, privacy controls, and data lifecycle management. This chapter explores the comprehensive data protection mechanisms that safeguard user data, API keys, conversation history, and system secrets.

## Table of Contents
1. [Encryption Architecture](#encryption-architecture)
2. [Secure Storage](#secure-storage)
3. [Secrets Management](#secrets-management)
4. [Data Privacy](#data-privacy)
5. [Secure Communication](#secure-communication)
6. [Data Sanitization](#data-sanitization)
7. [Compliance and Standards](#compliance-and-standards)
8. [Performance Implications](#performance-implications)

## Encryption Architecture

### Encryption Service

```javascript
class EncryptionService {
  constructor() {
    this.crypto = require('crypto');
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationAlgorithm = 'pbkdf2';
    this.keyLength = 32;
    this.saltLength = 32;
    this.tagLength = 16;
    this.iterations = 100000;

    this.masterKey = null;
    this.dataKeys = new Map();
  }

  async initialize() {
    // Load or generate master key
    this.masterKey = await this.getMasterKey();

    // Rotate data keys periodically
    this.scheduleKeyRotation();
  }

  async getMasterKey() {
    // In production, retrieve from secure key management service
    // For demonstration, generate from environment
    const masterKeySource = process.env.MASTER_KEY || this.generateMasterKey();

    return this.crypto.createHash('sha256')
      .update(masterKeySource)
      .digest();
  }

  generateMasterKey() {
    return this.crypto.randomBytes(32).toString('hex');
  }

  async encryptData(data, context = {}) {
    // Get or generate data encryption key
    const dataKey = await this.getDataKey(context);

    // Generate IV
    const iv = this.crypto.randomBytes(16);

    // Create cipher
    const cipher = this.crypto.createCipheriv(
      this.algorithm,
      dataKey,
      iv
    );

    // Encrypt data
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Create encrypted payload
    const payload = {
      version: 1,
      algorithm: this.algorithm,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      data: encrypted.toString('base64'),
      context: this.encryptContext(context),
      timestamp: Date.now()
    };

    return this.serializePayload(payload);
  }

  async decryptData(encryptedPayload) {
    // Parse payload
    const payload = this.parsePayload(encryptedPayload);

    // Validate version
    if (payload.version !== 1) {
      throw new Error(`Unsupported encryption version: ${payload.version}`);
    }

    // Get data key
    const context = this.decryptContext(payload.context);
    const dataKey = await this.getDataKey(context);

    // Create decipher
    const decipher = this.crypto.createDecipheriv(
      payload.algorithm,
      dataKey,
      Buffer.from(payload.iv, 'base64')
    );

    // Set auth tag
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    // Decrypt data
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  async getDataKey(context) {
    const keyId = context.keyId || 'default';

    if (!this.dataKeys.has(keyId)) {
      // Derive data key from master key
      const salt = this.crypto.randomBytes(this.saltLength);

      const dataKey = this.crypto.pbkdf2Sync(
        this.masterKey,
        salt,
        this.iterations,
        this.keyLength,
        'sha256'
      );

      this.dataKeys.set(keyId, {
        key: dataKey,
        salt,
        createdAt: Date.now(),
        rotationDue: Date.now() + 86400000 // 24 hours
      });
    }

    const keyData = this.dataKeys.get(keyId);

    // Check if rotation needed
    if (Date.now() > keyData.rotationDue) {
      await this.rotateDataKey(keyId);
      return this.dataKeys.get(keyId).key;
    }

    return keyData.key;
  }

  async rotateDataKey(keyId) {
    const oldKey = this.dataKeys.get(keyId);

    // Generate new key
    const salt = this.crypto.randomBytes(this.saltLength);
    const newKey = this.crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      this.iterations,
      this.keyLength,
      'sha256'
    );

    // Store new key
    this.dataKeys.set(keyId, {
      key: newKey,
      salt,
      createdAt: Date.now(),
      rotationDue: Date.now() + 86400000,
      previousKey: oldKey // Keep for decryption of old data
    });

    // Re-encrypt existing data with new key (async process)
    this.scheduleReEncryption(keyId);
  }

  scheduleKeyRotation() {
    setInterval(() => {
      for (const [keyId, keyData] of this.dataKeys) {
        if (Date.now() > keyData.rotationDue) {
          this.rotateDataKey(keyId).catch(error => {
            console.error(`Key rotation failed for ${keyId}:`, error);
          });
        }
      }
    }, 3600000); // Check hourly
  }

  scheduleReEncryption(keyId) {
    // Would implement re-encryption of existing data
    console.log(`Scheduled re-encryption for key: ${keyId}`);
  }

  encryptContext(context) {
    // Encrypt context metadata
    if (!context || Object.keys(context).length === 0) {
      return null;
    }

    const contextStr = JSON.stringify(context);
    const hash = this.crypto.createHash('sha256')
      .update(contextStr)
      .digest('base64');

    return hash;
  }

  decryptContext(encryptedContext) {
    // In real implementation, would decrypt
    return encryptedContext ? {} : {};
  }

  serializePayload(payload) {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  parsePayload(encryptedPayload) {
    try {
      return JSON.parse(Buffer.from(encryptedPayload, 'base64').toString());
    } catch (error) {
      throw new Error('Invalid encrypted payload');
    }
  }

  // Field-level encryption for sensitive data
  async encryptField(value, fieldName) {
    const context = { field: fieldName };
    return await this.encryptData(value, context);
  }

  async decryptField(encryptedValue, fieldName) {
    return await this.decryptData(encryptedValue);
  }

  // Deterministic encryption for searchable fields
  encryptDeterministic(value, salt) {
    const hash = this.crypto.pbkdf2Sync(
      value,
      salt,
      1000,
      32,
      'sha256'
    );

    return hash.toString('base64');
  }
}
```

## Secure Storage

### Secure Data Store

```javascript
class SecureDataStore {
  constructor(encryptionService) {
    this.encryption = encryptionService;
    this.storage = new Map();
    this.metadata = new Map();
    this.indexes = new Map();
  }

  async store(key, data, options = {}) {
    const storeOptions = {
      encrypt: true,
      ttl: null,
      tags: [],
      ...options
    };

    // Prepare data
    let storedData = data;

    if (storeOptions.encrypt) {
      storedData = await this.encryption.encryptData(data, {
        key,
        type: storeOptions.type
      });
    }

    // Store data
    this.storage.set(key, storedData);

    // Store metadata
    this.metadata.set(key, {
      createdAt: Date.now(),
      expiresAt: storeOptions.ttl ? Date.now() + storeOptions.ttl : null,
      encrypted: storeOptions.encrypt,
      tags: storeOptions.tags,
      size: JSON.stringify(storedData).length
    });

    // Update indexes
    this.updateIndexes(key, storeOptions.tags);

    // Schedule expiration
    if (storeOptions.ttl) {
      this.scheduleExpiration(key, storeOptions.ttl);
    }

    return key;
  }

  async retrieve(key) {
    const data = this.storage.get(key);
    const metadata = this.metadata.get(key);

    if (!data) {
      return null;
    }

    // Check expiration
    if (metadata.expiresAt && Date.now() > metadata.expiresAt) {
      this.delete(key);
      return null;
    }

    // Decrypt if needed
    if (metadata.encrypted) {
      return await this.encryption.decryptData(data);
    }

    return data;
  }

  async update(key, data, options = {}) {
    const existing = await this.retrieve(key);

    if (!existing) {
      throw new Error(`Key not found: ${key}`);
    }

    // Merge with existing data if specified
    const updatedData = options.merge ? { ...existing, ...data } : data;

    // Re-store with same options
    const metadata = this.metadata.get(key);
    return await this.store(key, updatedData, {
      encrypt: metadata.encrypted,
      ttl: metadata.expiresAt ? metadata.expiresAt - Date.now() : null,
      tags: metadata.tags
    });
  }

  delete(key) {
    const deleted = this.storage.delete(key);
    this.metadata.delete(key);
    this.removeFromIndexes(key);

    return deleted;
  }

  updateIndexes(key, tags) {
    for (const tag of tags) {
      if (!this.indexes.has(tag)) {
        this.indexes.set(tag, new Set());
      }
      this.indexes.get(tag).add(key);
    }
  }

  removeFromIndexes(key) {
    for (const [tag, keys] of this.indexes) {
      keys.delete(key);
    }
  }

  scheduleExpiration(key, ttl) {
    setTimeout(() => {
      this.delete(key);
    }, ttl);
  }

  async findByTag(tag) {
    const keys = this.indexes.get(tag);

    if (!keys) {
      return [];
    }

    const results = [];

    for (const key of keys) {
      const data = await this.retrieve(key);
      if (data) {
        results.push({ key, data });
      }
    }

    return results;
  }

  getStats() {
    let totalSize = 0;
    let encryptedCount = 0;

    for (const metadata of this.metadata.values()) {
      totalSize += metadata.size;
      if (metadata.encrypted) {
        encryptedCount++;
      }
    }

    return {
      totalItems: this.storage.size,
      totalSize,
      encryptedItems: encryptedCount,
      indexes: this.indexes.size
    };
  }
}

// Specialized stores for different data types
class ConversationStore extends SecureDataStore {
  constructor(encryptionService) {
    super(encryptionService);
    this.conversationIndex = new Map();
  }

  async storeMessage(conversationId, message) {
    const messageId = this.generateMessageId();
    const key = `conv:${conversationId}:msg:${messageId}`;

    // Store encrypted message
    await this.store(key, message, {
      encrypt: true,
      tags: ['message', conversationId],
      ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Update conversation index
    if (!this.conversationIndex.has(conversationId)) {
      this.conversationIndex.set(conversationId, []);
    }
    this.conversationIndex.get(conversationId).push(messageId);

    return messageId;
  }

  async getConversation(conversationId) {
    const messageIds = this.conversationIndex.get(conversationId) || [];
    const messages = [];

    for (const messageId of messageIds) {
      const key = `conv:${conversationId}:msg:${messageId}`;
      const message = await this.retrieve(key);

      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}

class CredentialStore extends SecureDataStore {
  constructor(encryptionService) {
    super(encryptionService);
    this.accessLog = [];
  }

  async storeCredential(name, credential, options = {}) {
    // Always encrypt credentials
    const key = `cred:${name}`;

    // Log access
    this.accessLog.push({
      action: 'store',
      credential: name,
      timestamp: Date.now(),
      user: options.user
    });

    return await this.store(key, credential, {
      encrypt: true,
      tags: ['credential', options.type || 'api-key'],
      ...options
    });
  }

  async getCredential(name, options = {}) {
    const key = `cred:${name}`;

    // Log access
    this.accessLog.push({
      action: 'retrieve',
      credential: name,
      timestamp: Date.now(),
      user: options.user
    });

    return await this.retrieve(key);
  }

  async rotateCredential(name, newCredential) {
    const key = `cred:${name}`;

    // Store old credential with timestamp
    const oldCredential = await this.getCredential(name);
    if (oldCredential) {
      await this.store(`${key}:old:${Date.now()}`, oldCredential, {
        encrypt: true,
        ttl: 7 * 24 * 60 * 60 * 1000 // Keep for 7 days
      });
    }

    // Store new credential
    return await this.storeCredential(name, newCredential);
  }

  getAccessLog(filter = {}) {
    let log = [...this.accessLog];

    if (filter.credential) {
      log = log.filter(l => l.credential === filter.credential);
    }

    if (filter.action) {
      log = log.filter(l => l.action === filter.action);
    }

    if (filter.since) {
      log = log.filter(l => l.timestamp >= filter.since);
    }

    return log;
  }
}
```

## Secrets Management

### Secret Manager

```javascript
class SecretManager {
  constructor(encryptionService) {
    this.encryption = encryptionService;
    this.secrets = new Map();
    this.vaults = new Map();
    this.policies = new Map();
  }

  async createVault(name, config = {}) {
    const vault = {
      name,
      createdAt: Date.now(),
      secrets: new Map(),
      accessPolicy: config.policy || 'default',
      encryption: {
        algorithm: config.algorithm || 'aes-256-gcm',
        keyRotation: config.keyRotation || 86400000 // 24 hours
      },
      audit: []
    };

    this.vaults.set(name, vault);

    return vault;
  }

  async storeSecret(vaultName, secretName, value, metadata = {}) {
    const vault = this.vaults.get(vaultName);

    if (!vault) {
      throw new Error(`Vault not found: ${vaultName}`);
    }

    // Check access policy
    if (!this.checkPolicy(vault.accessPolicy, 'write')) {
      throw new Error('Access denied by vault policy');
    }

    // Encrypt secret
    const encryptedValue = await this.encryption.encryptData(value, {
      vault: vaultName,
      secret: secretName
    });

    // Store secret
    const secret = {
      name: secretName,
      value: encryptedValue,
      version: this.getNextVersion(vault, secretName),
      createdAt: Date.now(),
      createdBy: metadata.user || 'system',
      metadata,
      accessCount: 0,
      lastAccessed: null
    };

    vault.secrets.set(secretName, secret);

    // Audit log
    vault.audit.push({
      action: 'store',
      secret: secretName,
      version: secret.version,
      timestamp: Date.now(),
      user: metadata.user
    });

    return {
      vault: vaultName,
      secret: secretName,
      version: secret.version
    };
  }

  async getSecret(vaultName, secretName, options = {}) {
    const vault = this.vaults.get(vaultName);

    if (!vault) {
      throw new Error(`Vault not found: ${vaultName}`);
    }

    // Check access policy
    if (!this.checkPolicy(vault.accessPolicy, 'read')) {
      throw new Error('Access denied by vault policy');
    }

    const secret = vault.secrets.get(secretName);

    if (!secret) {
      throw new Error(`Secret not found: ${secretName}`);
    }

    // Update access metrics
    secret.accessCount++;
    secret.lastAccessed = Date.now();

    // Audit log
    vault.audit.push({
      action: 'retrieve',
      secret: secretName,
      version: secret.version,
      timestamp: Date.now(),
      user: options.user
    });

    // Decrypt secret
    const decryptedValue = await this.encryption.decryptData(secret.value);

    // Return based on options
    if (options.includeMetadata) {
      return {
        value: decryptedValue,
        metadata: secret.metadata,
        version: secret.version,
        createdAt: secret.createdAt
      };
    }

    return decryptedValue;
  }

  async rotateSecret(vaultName, secretName, newValue, metadata = {}) {
    // Get current secret
    const currentSecret = await this.getSecret(vaultName, secretName, {
      includeMetadata: true
    });

    // Archive current version
    const vault = this.vaults.get(vaultName);
    const archiveKey = `${secretName}:v${currentSecret.version}`;
    vault.secrets.set(archiveKey, vault.secrets.get(secretName));

    // Store new version
    return await this.storeSecret(vaultName, secretName, newValue, {
      ...metadata,
      previousVersion: currentSecret.version
    });
  }

  getNextVersion(vault, secretName) {
    let maxVersion = 0;

    for (const [key, secret] of vault.secrets) {
      if (key === secretName || key.startsWith(`${secretName}:v`)) {
        maxVersion = Math.max(maxVersion, secret.version || 0);
      }
    }

    return maxVersion + 1;
  }

  checkPolicy(policyName, action) {
    const policy = this.policies.get(policyName) || this.getDefaultPolicy();

    return policy.allows(action);
  }

  getDefaultPolicy() {
    return {
      allows: (action) => ['read', 'write'].includes(action)
    };
  }

  async deleteSecret(vaultName, secretName, options = {}) {
    const vault = this.vaults.get(vaultName);

    if (!vault) {
      throw new Error(`Vault not found: ${vaultName}`);
    }

    // Check access policy
    if (!this.checkPolicy(vault.accessPolicy, 'delete')) {
      throw new Error('Access denied by vault policy');
    }

    const deleted = vault.secrets.delete(secretName);

    if (deleted) {
      // Audit log
      vault.audit.push({
        action: 'delete',
        secret: secretName,
        timestamp: Date.now(),
        user: options.user
      });
    }

    return deleted;
  }

  getAuditLog(vaultName, filter = {}) {
    const vault = this.vaults.get(vaultName);

    if (!vault) {
      return [];
    }

    let audit = [...vault.audit];

    if (filter.secret) {
      audit = audit.filter(a => a.secret === filter.secret);
    }

    if (filter.action) {
      audit = audit.filter(a => a.action === filter.action);
    }

    if (filter.since) {
      audit = audit.filter(a => a.timestamp >= filter.since);
    }

    return audit;
  }
}

// Environment variable encryption
class EnvironmentEncryption {
  constructor(secretManager) {
    this.secretManager = secretManager;
    this.encryptedVars = new Set();
  }

  async encryptEnvironmentVariable(name, value) {
    // Store in secret manager
    await this.secretManager.storeSecret('environment', name, value);

    // Mark as encrypted
    this.encryptedVars.add(name);

    // Set placeholder in environment
    process.env[name] = `encrypted:${name}`;
  }

  async getEnvironmentVariable(name) {
    if (!this.encryptedVars.has(name)) {
      return process.env[name];
    }

    // Retrieve from secret manager
    return await this.secretManager.getSecret('environment', name);
  }

  async loadEncryptedEnvironment() {
    // Load all encrypted variables
    for (const name of this.encryptedVars) {
      const value = await this.getEnvironmentVariable(name);

      // Create proxy for transparent access
      Object.defineProperty(process.env, name, {
        get: () => value,
        set: (newValue) => {
          this.encryptEnvironmentVariable(name, newValue);
        }
      });
    }
  }
}
```

## Data Privacy

### Privacy Manager

```javascript
class PrivacyManager {
  constructor() {
    this.piiPatterns = this.initializePIIPatterns();
    this.redactionRules = new Map();
    this.consentRecords = new Map();
  }

  initializePIIPatterns() {
    return {
      email: {
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        type: 'email',
        sensitivity: 'medium'
      },
      phone: {
        pattern: /(\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
        type: 'phone',
        sensitivity: 'medium'
      },
      ssn: {
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        type: 'ssn',
        sensitivity: 'high'
      },
      creditCard: {
        pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        type: 'credit_card',
        sensitivity: 'high'
      },
      ipAddress: {
        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        type: 'ip_address',
        sensitivity: 'low'
      },
      apiKey: {
        pattern: /\b(sk|pk|api[_-]?key)[_-][a-zA-Z0-9]{32,}\b/gi,
        type: 'api_key',
        sensitivity: 'critical'
      }
    };
  }

  detectPII(text) {
    const detected = [];

    for (const [name, config] of Object.entries(this.piiPatterns)) {
      const matches = text.match(config.pattern);

      if (matches) {
        detected.push({
          type: config.type,
          sensitivity: config.sensitivity,
          matches: matches.map(match => ({
            value: match,
            position: text.indexOf(match),
            length: match.length
          }))
        });
      }
    }

    return detected;
  }

  redactPII(text, options = {}) {
    let redacted = text;
    const redactionMap = new Map();

    const sensitivity = options.sensitivity || 'low';
    const method = options.method || 'mask';

    for (const [name, config] of Object.entries(this.piiPatterns)) {
      // Skip if sensitivity is lower than threshold
      if (this.compareSensitivity(config.sensitivity, sensitivity) < 0) {
        continue;
      }

      redacted = redacted.replace(config.pattern, (match) => {
        const redactedValue = this.redactValue(match, method, config.type);
        redactionMap.set(match, redactedValue);
        return redactedValue;
      });
    }

    return {
      text: redacted,
      redactionMap,
      piiDetected: redactionMap.size > 0
    };
  }

  redactValue(value, method, type) {
    switch (method) {
      case 'mask':
        return this.maskValue(value, type);
      case 'hash':
        return this.hashValue(value);
      case 'tokenize':
        return this.tokenizeValue(value, type);
      case 'remove':
        return '[REDACTED]';
      default:
        return '***';
    }
  }

  maskValue(value, type) {
    switch (type) {
      case 'email':
        const [localPart, domain] = value.split('@');
        return localPart[0] + '***@' + domain;

      case 'phone':
        return value.slice(0, 3) + '***' + value.slice(-2);

      case 'credit_card':
        return '****-****-****-' + value.slice(-4);

      case 'ssn':
        return '***-**-' + value.slice(-4);

      default:
        return value[0] + '*'.repeat(value.length - 2) + value.slice(-1);
    }
  }

  hashValue(value) {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(value)
      .digest('hex')
      .slice(0, 8);
  }

  tokenizeValue(value, type) {
    // Generate reversible token
    const token = `${type}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Store mapping for reversal (in production, use secure storage)
    this.redactionRules.set(token, value);

    return token;
  }

  compareSensitivity(a, b) {
    const levels = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4
    };

    return levels[a] - levels[b];
  }

  async recordConsent(userId, consentType, granted) {
    const record = {
      userId,
      consentType,
      granted,
      timestamp: Date.now(),
      ip: this.getCurrentIP(),
      version: this.getConsentVersion(consentType)
    };

    if (!this.consentRecords.has(userId)) {
      this.consentRecords.set(userId, []);
    }

    this.consentRecords.get(userId).push(record);

    return record;
  }

  hasConsent(userId, consentType) {
    const records = this.consentRecords.get(userId);

    if (!records) {
      return false;
    }

    // Find most recent consent for this type
    const relevantRecords = records
      .filter(r => r.consentType === consentType)
      .sort((a, b) => b.timestamp - a.timestamp);

    return relevantRecords.length > 0 && relevantRecords[0].granted;
  }

  getCurrentIP() {
    // Would get actual IP in production
    return '0.0.0.0';
  }

  getConsentVersion(consentType) {
    // Version tracking for consent forms
    const versions = {
      dataProcessing: '1.0',
      analytics: '1.1',
      marketing: '2.0'
    };

    return versions[consentType] || '1.0';
  }

  async anonymizeData(data, options = {}) {
    const anonymized = JSON.parse(JSON.stringify(data));

    // Remove direct identifiers
    const identifierFields = options.identifiers || [
      'name', 'email', 'phone', 'address', 'id', 'userId'
    ];

    for (const field of identifierFields) {
      if (field in anonymized) {
        anonymized[field] = this.anonymizeField(anonymized[field], field);
      }
    }

    // Apply k-anonymity
    if (options.kAnonymity) {
      this.applyKAnonymity(anonymized, options.kAnonymity);
    }

    return anonymized;
  }

  anonymizeField(value, fieldName) {
    if (fieldName === 'email') {
      return 'user@example.com';
    }

    if (typeof value === 'string') {
      return 'ANONYMIZED';
    }

    if (typeof value === 'number') {
      return 0;
    }

    return null;
  }

  applyKAnonymity(data, k) {
    // Generalization for k-anonymity
    if (data.age) {
      data.ageRange = this.generalizeAge(data.age);
      delete data.age;
    }

    if (data.zipCode) {
      data.zipCode = data.zipCode.slice(0, 3) + '**';
    }

    if (data.salary) {
      data.salaryRange = this.generalizeSalary(data.salary);
      delete data.salary;
    }
  }

  generalizeAge(age) {
    if (age < 20) return '< 20';
    if (age < 30) return '20-29';
    if (age < 40) return '30-39';
    if (age < 50) return '40-49';
    return '50+';
  }

  generalizeSalary(salary) {
    if (salary < 30000) return '< 30k';
    if (salary < 50000) return '30k-50k';
    if (salary < 75000) return '50k-75k';
    if (salary < 100000) return '75k-100k';
    return '100k+';
  }
}
```

## Secure Communication

### TLS/SSL Implementation

```javascript
class SecureCommunication {
  constructor() {
    this.tls = require('tls');
    this.https = require('https');
    this.crypto = require('crypto');

    this.config = {
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-CHACHA20-POLY1305'
      ].join(':'),
      honorCipherOrder: true,
      secureOptions:
        this.tls.constants.SSL_OP_NO_SSLv2 |
        this.tls.constants.SSL_OP_NO_SSLv3 |
        this.tls.constants.SSL_OP_NO_TLSv1 |
        this.tls.constants.SSL_OP_NO_TLSv1_1
    };
  }

  createSecureServer(options = {}) {
    const serverOptions = {
      ...this.config,
      cert: options.cert || this.loadCertificate(),
      key: options.key || this.loadPrivateKey(),
      ca: options.ca || this.loadCA(),

      // Client certificate authentication
      requestCert: options.requestCert || false,
      rejectUnauthorized: options.rejectUnauthorized !== false,

      // Session resumption
      sessionTimeout: 300,

      // OCSP stapling
      requestOCSP: true
    };

    const server = this.https.createServer(serverOptions);

    // Add security headers
    server.on('request', (req, res) => {
      this.addSecurityHeaders(res);
    });

    return server;
  }

  createSecureClient(options = {}) {
    const clientOptions = {
      ...this.config,
      ca: options.ca || this.loadCA(),

      // Certificate validation
      rejectUnauthorized: options.rejectUnauthorized !== false,
      checkServerIdentity: this.checkServerIdentity.bind(this),

      // Certificate pinning
      pinnedCertificates: options.pinnedCertificates || []
    };

    return this.https.Agent(clientOptions);
  }

  addSecurityHeaders(res) {
    // HSTS
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    );

    // Other security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  checkServerIdentity(hostname, cert) {
    // Custom certificate validation
    const defaultCheck = this.tls.checkServerIdentity(hostname, cert);

    if (defaultCheck) {
      return defaultCheck;
    }

    // Additional checks
    if (this.isPinnedCertificate(cert)) {
      return undefined; // Valid
    }

    // Check certificate transparency
    if (!this.hasCertificateTransparency(cert)) {
      return new Error('Certificate transparency validation failed');
    }

    return undefined;
  }

  isPinnedCertificate(cert) {
    // Check against pinned certificates
    const fingerprint = this.getCertificateFingerprint(cert);
    return this.config.pinnedCertificates?.includes(fingerprint);
  }

  getCertificateFingerprint(cert) {
    return this.crypto.createHash('sha256')
      .update(cert.raw)
      .digest('hex');
  }

  hasCertificateTransparency(cert) {
    // Check for SCT (Signed Certificate Timestamp)
    // In production, would verify against CT logs
    return cert.raw && cert.raw.length > 0;
  }

  loadCertificate() {
    // Load from secure storage
    return process.env.TLS_CERT || '';
  }

  loadPrivateKey() {
    // Load from secure storage
    return process.env.TLS_KEY || '';
  }

  loadCA() {
    // Load CA certificates
    return process.env.TLS_CA || '';
  }
}

// End-to-end encryption for messages
class E2EEncryption {
  constructor() {
    this.crypto = require('crypto');
    this.keys = new Map();
  }

  async generateKeyPair(userId) {
    const { publicKey, privateKey } = this.crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: this.getPassphrase(userId)
      }
    });

    this.keys.set(userId, { publicKey, privateKey });

    return { publicKey };
  }

  async encryptMessage(message, recipientPublicKey) {
    // Generate ephemeral AES key
    const aesKey = this.crypto.randomBytes(32);
    const iv = this.crypto.randomBytes(16);

    // Encrypt message with AES
    const cipher = this.crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encryptedMessage = Buffer.concat([
      cipher.update(JSON.stringify(message), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Encrypt AES key with recipient's public key
    const encryptedKey = this.crypto.publicEncrypt(
      recipientPublicKey,
      aesKey
    );

    return {
      encryptedMessage: encryptedMessage.toString('base64'),
      encryptedKey: encryptedKey.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  }

  async decryptMessage(encryptedData, userId) {
    const userKeys = this.keys.get(userId);

    if (!userKeys) {
      throw new Error('User keys not found');
    }

    // Decrypt AES key with private key
    const aesKey = this.crypto.privateDecrypt(
      {
        key: userKeys.privateKey,
        passphrase: this.getPassphrase(userId)
      },
      Buffer.from(encryptedData.encryptedKey, 'base64')
    );

    // Decrypt message with AES
    const decipher = this.crypto.createDecipheriv(
      'aes-256-gcm',
      aesKey,
      Buffer.from(encryptedData.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));

    const decryptedMessage = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.encryptedMessage, 'base64')),
      decipher.final()
    ]);

    return JSON.parse(decryptedMessage.toString('utf8'));
  }

  getPassphrase(userId) {
    // In production, derive from user's master password
    return `passphrase-${userId}`;
  }
}
```

## Data Sanitization

### Sanitization Service

```javascript
class DataSanitizationService {
  constructor() {
    this.sanitizers = new Map();
    this.initializeSanitizers();
  }

  initializeSanitizers() {
    // HTML sanitizer
    this.registerSanitizer('html', {
      sanitize(input) {
        return input
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/\//g, '&#x2F;');
      }
    });

    // SQL sanitizer
    this.registerSanitizer('sql', {
      sanitize(input) {
        return input
          .replace(/'/g, "''")
          .replace(/"/g, '""')
          .replace(/;/g, '')
          .replace(/--/g, '');
      }
    });

    // Command sanitizer
    this.registerSanitizer('command', {
      sanitize(input) {
        const dangerous = /[;&|`$(){}[\]<>\\]/g;
        return input.replace(dangerous, '');
      }
    });

    // Path sanitizer
    this.registerSanitizer('path', {
      sanitize(input) {
        const path = require('path');

        // Remove path traversal attempts
        let sanitized = input.replace(/\.\./g, '');

        // Normalize path
        sanitized = path.normalize(sanitized);

        // Ensure within safe directory
        const safePath = path.resolve('/safe/base/path');
        const resolvedPath = path.resolve(safePath, sanitized);

        if (!resolvedPath.startsWith(safePath)) {
          throw new Error('Path traversal detected');
        }

        return resolvedPath;
      }
    });

    // JSON sanitizer
    this.registerSanitizer('json', {
      sanitize(input) {
        try {
          // Parse and re-stringify to remove any non-JSON content
          return JSON.stringify(JSON.parse(input));
        } catch {
          throw new Error('Invalid JSON input');
        }
      }
    });

    // URL sanitizer
    this.registerSanitizer('url', {
      sanitize(input) {
        try {
          const url = new URL(input);

          // Only allow http(s) protocols
          if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('Invalid protocol');
          }

          // Remove credentials
          url.username = '';
          url.password = '';

          return url.toString();
        } catch {
          throw new Error('Invalid URL');
        }
      }
    });
  }

  registerSanitizer(type, sanitizer) {
    this.sanitizers.set(type, sanitizer);
  }

  sanitize(input, type) {
    const sanitizer = this.sanitizers.get(type);

    if (!sanitizer) {
      throw new Error(`Unknown sanitizer type: ${type}`);
    }

    return sanitizer.sanitize(input);
  }

  sanitizeObject(obj, schema) {
    const sanitized = {};

    for (const [key, config] of Object.entries(schema)) {
      if (key in obj) {
        sanitized[key] = this.sanitize(obj[key], config.type);
      } else if (config.required) {
        throw new Error(`Missing required field: ${key}`);
      } else if (config.default !== undefined) {
        sanitized[key] = config.default;
      }
    }

    return sanitized;
  }

  // Output encoding
  encodeForContext(data, context) {
    switch (context) {
      case 'html':
        return this.sanitize(data, 'html');
      case 'attribute':
        return data.replace(/"/g, '&quot;');
      case 'javascript':
        return JSON.stringify(data);
      case 'url':
        return encodeURIComponent(data);
      case 'css':
        return data.replace(/[^\w]/g, '\\$&');
      default:
        return data;
    }
  }
}

// Log sanitization
class LogSanitizer {
  constructor(privacyManager) {
    this.privacy = privacyManager;
  }

  sanitizeLogEntry(entry) {
    const sanitized = JSON.parse(JSON.stringify(entry));

    // Redact PII
    if (sanitized.message) {
      const redacted = this.privacy.redactPII(sanitized.message, {
        sensitivity: 'medium',
        method: 'mask'
      });
      sanitized.message = redacted.text;
    }

    // Remove sensitive fields
    const sensitiveFields = [
      'password', 'apiKey', 'token', 'secret',
      'authorization', 'cookie', 'sessionId'
    ];

    this.removeSensitiveFields(sanitized, sensitiveFields);

    return sanitized;
  }

  removeSensitiveFields(obj, fields) {
    for (const field of fields) {
      delete obj[field];
    }

    // Recursively clean nested objects
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        this.removeSensitiveFields(value, fields);
      }
    }
  }
}
```

## Compliance and Standards

### Compliance Manager

```javascript
class ComplianceManager {
  constructor() {
    this.standards = new Map();
    this.auditors = new Map();
    this.reports = [];

    this.initializeStandards();
  }

  initializeStandards() {
    // GDPR compliance
    this.registerStandard('GDPR', {
      requirements: [
        'data-minimization',
        'purpose-limitation',
        'consent-management',
        'right-to-erasure',
        'data-portability',
        'breach-notification'
      ],

      validate(system) {
        const results = [];

        // Check data minimization
        results.push({
          requirement: 'data-minimization',
          passed: system.privacy?.hasDataMinimization,
          message: 'Collect only necessary data'
        });

        // Check consent management
        results.push({
          requirement: 'consent-management',
          passed: system.privacy?.hasConsentManagement,
          message: 'Implement consent tracking'
        });

        return results;
      }
    });

    // SOC 2 compliance
    this.registerStandard('SOC2', {
      requirements: [
        'access-controls',
        'encryption',
        'monitoring',
        'incident-response',
        'change-management'
      ],

      validate(system) {
        const results = [];

        // Check encryption
        results.push({
          requirement: 'encryption',
          passed: system.encryption?.isEnabled,
          message: 'Data must be encrypted at rest and in transit'
        });

        // Check access controls
        results.push({
          requirement: 'access-controls',
          passed: system.auth?.hasRBAC,
          message: 'Implement role-based access control'
        });

        return results;
      }
    });

    // HIPAA compliance (if handling health data)
    this.registerStandard('HIPAA', {
      requirements: [
        'access-controls',
        'audit-logs',
        'encryption',
        'data-integrity',
        'transmission-security'
      ],

      validate(system) {
        const results = [];

        // Check audit logs
        results.push({
          requirement: 'audit-logs',
          passed: system.audit?.isEnabled,
          message: 'Maintain comprehensive audit logs'
        });

        // Check transmission security
        results.push({
          requirement: 'transmission-security',
          passed: system.tls?.minVersion >= 'TLSv1.2',
          message: 'Use TLS 1.2 or higher'
        });

        return results;
      }
    });
  }

  registerStandard(name, config) {
    this.standards.set(name, config);
  }

  async runComplianceCheck(standardName, system) {
    const standard = this.standards.get(standardName);

    if (!standard) {
      throw new Error(`Unknown standard: ${standardName}`);
    }

    const results = standard.validate(system);
    const report = {
      standard: standardName,
      timestamp: Date.now(),
      results,
      passed: results.every(r => r.passed),
      compliance: (results.filter(r => r.passed).length / results.length * 100).toFixed(1)
    };

    this.reports.push(report);

    return report;
  }

  generateComplianceReport(standardName) {
    const reports = this.reports.filter(r => r.standard === standardName);

    if (reports.length === 0) {
      return null;
    }

    const latest = reports[reports.length - 1];

    return {
      standard: standardName,
      lastChecked: new Date(latest.timestamp).toISOString(),
      complianceLevel: `${latest.compliance}%`,
      issues: latest.results.filter(r => !r.passed),
      recommendations: this.generateRecommendations(latest)
    };
  }

  generateRecommendations(report) {
    const recommendations = [];

    for (const result of report.results) {
      if (!result.passed) {
        recommendations.push({
          requirement: result.requirement,
          action: result.message,
          priority: this.getPriority(result.requirement)
        });
      }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  getPriority(requirement) {
    const priorities = {
      'encryption': 5,
      'access-controls': 5,
      'audit-logs': 4,
      'consent-management': 4,
      'data-minimization': 3
    };

    return priorities[requirement] || 2;
  }
}
```

## Performance Implications

### Data Protection Performance

```javascript
class DataProtectionPerformance {
  static async measurePerformance() {
    const metrics = {
      encryptionOverhead: await this.measureEncryption(),
      decryptionOverhead: await this.measureDecryption(),
      piiDetectionTime: await this.measurePIIDetection(),
      sanitizationTime: await this.measureSanitization()
    };

    return this.analyzeMetrics(metrics);
  }

  static async measureEncryption() {
    const encryption = new EncryptionService();
    await encryption.initialize();

    const testData = {
      message: 'Test data for encryption performance',
      nested: {
        field: 'value'.repeat(100)
      }
    };

    const iterations = 1000;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      await encryption.encryptData(testData);
    }

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6 / iterations;
  }

  static async measureDecryption() {
    const encryption = new EncryptionService();
    await encryption.initialize();

    const testData = { message: 'test' };
    const encrypted = await encryption.encryptData(testData);

    const iterations = 1000;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      await encryption.decryptData(encrypted);
    }

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6 / iterations;
  }

  static async measurePIIDetection() {
    const privacy = new PrivacyManager();
    const testText = `
      Contact John Doe at john.doe@example.com or 555-123-4567.
      His SSN is 123-45-6789 and credit card 4111-1111-1111-1111.
    `;

    const iterations = 1000;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      privacy.detectPII(testText);
    }

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6 / iterations;
  }

  static async measureSanitization() {
    const sanitizer = new DataSanitizationService();
    const testInput = '<script>alert("xss")</script>';

    const iterations = 10000;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      sanitizer.sanitize(testInput, 'html');
    }

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6 / iterations;
  }

  static analyzeMetrics(metrics) {
    const analysis = {
      metrics,
      totalOverhead: Object.values(metrics).reduce((sum, time) => sum + time, 0),
      recommendations: []
    };

    if (metrics.encryptionOverhead > 5) {
      analysis.recommendations.push('Consider hardware acceleration for encryption');
    }

    if (metrics.piiDetectionTime > 2) {
      analysis.recommendations.push('Optimize PII detection patterns');
    }

    if (metrics.sanitizationTime > 0.5) {
      analysis.recommendations.push('Cache sanitization results');
    }

    if (analysis.totalOverhead > 10) {
      analysis.recommendations.push('Consider async processing for data protection');
    }

    return analysis;
  }
}
```

## Summary

Claude Code's data protection system provides:

1. **Comprehensive Encryption**: AES-256-GCM with key rotation and secure key management
2. **Secure Storage**: Encrypted data stores with TTL and access control
3. **Secrets Management**: Vault-based secret storage with versioning and audit
4. **Privacy Protection**: PII detection, redaction, and consent management
5. **Secure Communication**: TLS 1.2+ with certificate pinning and E2E encryption
6. **Data Sanitization**: Context-aware sanitization for various data types
7. **Compliance Support**: GDPR, SOC2, and HIPAA compliance validation
8. **Performance Optimization**: Efficient encryption with minimal overhead

The system ensures data confidentiality, integrity, and availability while maintaining compliance with privacy regulations.

## Next Steps

In the final section of Part 10, we'll explore vulnerability prevention mechanisms.

---

*Part of the Claude Code Technical Series - Security*