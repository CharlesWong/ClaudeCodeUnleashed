# 第10.3部分：数据保护

## 介绍

Claude Code中的数据保护涵盖了静态和传输中的加密、敏感信息的安全存储、隐私控制以及数据生命周期管理。本章探讨了保护用户数据、API密钥、对话历史和系统秘密的综合数据保护机制。

## 目录
1. [加密架构](#加密架构)
2. [安全存储](#安全存储)
3. [密钥管理](#密钥管理)
4. [数据隐私](#数据隐私)
5. [安全通信](#安全通信)
6. [数据净化](#数据净化)
7. [合规和标准](#合规和标准)
8. [性能影响](#性能影响)

## 加密架构

### 加密服务

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
    // 加载或生成主密钥
    this.masterKey = await this.getMasterKey();

    // 定期轮换数据密钥
    this.scheduleKeyRotation();
  }

  async getMasterKey() {
    // 在生产环境中，从安全密钥管理服务检索
    // 为了演示，从环境变量生成
    const masterKeySource = process.env.MASTER_KEY || this.generateMasterKey();

    return this.crypto.createHash('sha256')
      .update(masterKeySource)
      .digest();
  }

  generateMasterKey() {
    return this.crypto.randomBytes(32).toString('hex');
  }

  async encryptData(data, context = {}) {
    // 获取或生成数据加密密钥
    const dataKey = await this.getDataKey(context);

    // 生成初始化向量
    const iv = this.crypto.randomBytes(16);

    // 创建加密器
    const cipher = this.crypto.createCipheriv(
      this.algorithm,
      dataKey,
      iv
    );

    // 加密数据
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);

    // 获取认证标签
    const authTag = cipher.getAuthTag();

    // 创建加密负载
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
    // 解析负载
    const payload = this.parsePayload(encryptedPayload);

    // 验证版本
    if (payload.version !== 1) {
      throw new Error(`不支持的加密版本: ${payload.version}`);
    }

    // 获取数据密钥
    const context = this.decryptContext(payload.context);
    const dataKey = await this.getDataKey(context);

    // 创建解密器
    const decipher = this.crypto.createDecipheriv(
      payload.algorithm,
      dataKey,
      Buffer.from(payload.iv, 'base64')
    );

    // 设置认证标签
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    // 解密数据
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  async getDataKey(context) {
    const keyId = context.keyId || 'default';

    if (!this.dataKeys.has(keyId)) {
      // 从主密钥派生数据密钥
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
        rotationDue: Date.now() + 86400000 // 24小时
      });
    }

    const keyData = this.dataKeys.get(keyId);

    // 检查是否需要轮换
    if (Date.now() > keyData.rotationDue) {
      await this.rotateDataKey(keyId);
      return this.dataKeys.get(keyId).key;
    }

    return keyData.key;
  }

  async rotateDataKey(keyId) {
    const oldKey = this.dataKeys.get(keyId);

    // 生成新密钥
    const salt = this.crypto.randomBytes(this.saltLength);
    const newKey = this.crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      this.iterations,
      this.keyLength,
      'sha256'
    );

    // 存储新密钥
    this.dataKeys.set(keyId, {
      key: newKey,
      salt,
      createdAt: Date.now(),
      rotationDue: Date.now() + 86400000,
      previousKey: oldKey // 保留以解密旧数据
    });

    // 使用新密钥重新加密现有数据（异步过程）
    this.scheduleReEncryption(keyId);
  }

  scheduleKeyRotation() {
    setInterval(() => {
      for (const [keyId, keyData] of this.dataKeys) {
        if (Date.now() > keyData.rotationDue) {
          this.rotateDataKey(keyId).catch(error => {
            console.error(`密钥轮换失败 ${keyId}:`, error);
          });
        }
      }
    }, 3600000); // 每小时检查
  }

  scheduleReEncryption(keyId) {
    // 将实现现有数据的重新加密
    console.log(`计划重新加密密钥: ${keyId}`);
  }

  encryptContext(context) {
    // 加密上下文元数据
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
    // 在实际实现中，将解密
    return encryptedContext ? {} : {};
  }

  serializePayload(payload) {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  parsePayload(encryptedPayload) {
    try {
      return JSON.parse(Buffer.from(encryptedPayload, 'base64').toString());
    } catch (error) {
      throw new Error('无效的加密负载');
    }
  }

  // 敏感数据的字段级加密
  async encryptField(value, fieldName) {
    const context = { field: fieldName };
    return await this.encryptData(value, context);
  }

  async decryptField(encryptedValue, fieldName) {
    return await this.decryptData(encryptedValue);
  }

  // 可搜索字段的确定性加密
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

## 安全存储

### 安全数据存储

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

    // 准备数据
    let storedData = data;

    if (storeOptions.encrypt) {
      storedData = await this.encryption.encryptData(data, {
        key,
        type: storeOptions.type
      });
    }

    // 存储数据
    this.storage.set(key, storedData);

    // 存储元数据
    this.metadata.set(key, {
      createdAt: Date.now(),
      expiresAt: storeOptions.ttl ? Date.now() + storeOptions.ttl : null,
      encrypted: storeOptions.encrypt,
      tags: storeOptions.tags,
      size: JSON.stringify(storedData).length
    });

    // 更新索引
    this.updateIndexes(key, storeOptions.tags);

    // 计划过期
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

    // 检查过期
    if (metadata.expiresAt && Date.now() > metadata.expiresAt) {
      this.delete(key);
      return null;
    }

    // 如果需要则解密
    if (metadata.encrypted) {
      return await this.encryption.decryptData(data);
    }

    return data;
  }

  async update(key, data, options = {}) {
    const existing = await this.retrieve(key);

    if (!existing) {
      throw new Error(`未找到密钥: ${key}`);
    }

    // 如果指定则与现有数据合并
    const updatedData = options.merge ? { ...existing, ...data } : data;

    // 使用相同选项重新存储
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

// 不同数据类型的专门存储
class ConversationStore extends SecureDataStore {
  constructor(encryptionService) {
    super(encryptionService);
    this.conversationIndex = new Map();
  }

  async storeMessage(conversationId, message) {
    const messageId = this.generateMessageId();
    const key = `conv:${conversationId}:msg:${messageId}`;

    // 存储加密消息
    await this.store(key, message, {
      encrypt: true,
      tags: ['message', conversationId],
      ttl: 7 * 24 * 60 * 60 * 1000 // 7天
    });

    // 更新对话索引
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
    // 始终加密凭据
    const key = `cred:${name}`;

    // 记录访问
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

    // 记录访问
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

    // 使用时间戳存储旧凭据
    const oldCredential = await this.getCredential(name);
    if (oldCredential) {
      await this.store(`${key}:old:${Date.now()}`, oldCredential, {
        encrypt: true,
        ttl: 7 * 24 * 60 * 60 * 1000 // 保留7天
      });
    }

    // 存储新凭据
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

## 密钥管理

### 密钥管理器

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
        keyRotation: config.keyRotation || 86400000 // 24小时
      },
      audit: []
    };

    this.vaults.set(name, vault);

    return vault;
  }

  async storeSecret(vaultName, secretName, value, metadata = {}) {
    const vault = this.vaults.get(vaultName);

    if (!vault) {
      throw new Error(`未找到保险库: ${vaultName}`);
    }

    // 检查访问策略
    if (!this.checkPolicy(vault.accessPolicy, 'write')) {
      throw new Error('保险库策略拒绝访问');
    }

    // 加密密钥
    const encryptedValue = await this.encryption.encryptData(value, {
      vault: vaultName,
      secret: secretName
    });

    // 存储密钥
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

    // 审计日志
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
      throw new Error(`未找到保险库: ${vaultName}`);
    }

    // 检查访问策略
    if (!this.checkPolicy(vault.accessPolicy, 'read')) {
      throw new Error('保险库策略拒绝访问');
    }

    const secret = vault.secrets.get(secretName);

    if (!secret) {
      throw new Error(`未找到密钥: ${secretName}`);
    }

    // 更新访问指标
    secret.accessCount++;
    secret.lastAccessed = Date.now();

    // 审计日志
    vault.audit.push({
      action: 'retrieve',
      secret: secretName,
      version: secret.version,
      timestamp: Date.now(),
      user: options.user
    });

    // 解密密钥
    const decryptedValue = await this.encryption.decryptData(secret.value);

    // 根据选项返回
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
    // 获取当前密钥
    const currentSecret = await this.getSecret(vaultName, secretName, {
      includeMetadata: true
    });

    // 存档当前版本
    const vault = this.vaults.get(vaultName);
    const archiveKey = `${secretName}:v${currentSecret.version}`;
    vault.secrets.set(archiveKey, vault.secrets.get(secretName));

    // 存储新版本
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
      throw new Error(`未找到保险库: ${vaultName}`);
    }

    // 检查访问策略
    if (!this.checkPolicy(vault.accessPolicy, 'delete')) {
      throw new Error('保险库策略拒绝访问');
    }

    const deleted = vault.secrets.delete(secretName);

    if (deleted) {
      // 审计日志
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

// 环境变量加密
class EnvironmentEncryption {
  constructor(secretManager) {
    this.secretManager = secretManager;
    this.encryptedVars = new Set();
  }

  async encryptEnvironmentVariable(name, value) {
    // 存储在密钥管理器中
    await this.secretManager.storeSecret('environment', name, value);

    // 标记为已加密
    this.encryptedVars.add(name);

    // 在环境中设置占位符
    process.env[name] = `encrypted:${name}`;
  }

  async getEnvironmentVariable(name) {
    if (!this.encryptedVars.has(name)) {
      return process.env[name];
    }

    // 从密钥管理器检索
    return await this.secretManager.getSecret('environment', name);
  }

  async loadEncryptedEnvironment() {
    // 加载所有加密变量
    for (const name of this.encryptedVars) {
      const value = await this.getEnvironmentVariable(name);

      // 创建代理以透明访问
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

## 数据隐私

### 隐私管理器

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
      // 如果敏感度低于阈值则跳过
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
        return '[已编辑]';
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
    // 生成可逆令牌
    const token = `${type}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // 存储映射以供反转（在生产环境中，使用安全存储）
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

    // 查找此类型的最新同意
    const relevantRecords = records
      .filter(r => r.consentType === consentType)
      .sort((a, b) => b.timestamp - a.timestamp);

    return relevantRecords.length > 0 && relevantRecords[0].granted;
  }

  getCurrentIP() {
    // 在生产环境中将获取实际IP
    return '0.0.0.0';
  }

  getConsentVersion(consentType) {
    // 同意书版本跟踪
    const versions = {
      dataProcessing: '1.0',
      analytics: '1.1',
      marketing: '2.0'
    };

    return versions[consentType] || '1.0';
  }

  async anonymizeData(data, options = {}) {
    const anonymized = JSON.parse(JSON.stringify(data));

    // 删除直接标识符
    const identifierFields = options.identifiers || [
      'name', 'email', 'phone', 'address', 'id', 'userId'
    ];

    for (const field of identifierFields) {
      if (field in anonymized) {
        anonymized[field] = this.anonymizeField(anonymized[field], field);
      }
    }

    // 应用k-匿名性
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
      return '已匿名化';
    }

    if (typeof value === 'number') {
      return 0;
    }

    return null;
  }

  applyKAnonymity(data, k) {
    // 为k-匿名性进行泛化
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

## 安全通信

### TLS/SSL实现

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

      // 客户端证书认证
      requestCert: options.requestCert || false,
      rejectUnauthorized: options.rejectUnauthorized !== false,

      // 会话恢复
      sessionTimeout: 300,

      // OCSP装订
      requestOCSP: true
    };

    const server = this.https.createServer(serverOptions);

    // 添加安全头
    server.on('request', (req, res) => {
      this.addSecurityHeaders(res);
    });

    return server;
  }

  createSecureClient(options = {}) {
    const clientOptions = {
      ...this.config,
      ca: options.ca || this.loadCA(),

      // 证书验证
      rejectUnauthorized: options.rejectUnauthorized !== false,
      checkServerIdentity: this.checkServerIdentity.bind(this),

      // 证书固定
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

    // 内容安全策略
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    );

    // 其他安全头
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  checkServerIdentity(hostname, cert) {
    // 自定义证书验证
    const defaultCheck = this.tls.checkServerIdentity(hostname, cert);

    if (defaultCheck) {
      return defaultCheck;
    }

    // 附加检查
    if (this.isPinnedCertificate(cert)) {
      return undefined; // 有效
    }

    // 检查证书透明度
    if (!this.hasCertificateTransparency(cert)) {
      return new Error('证书透明度验证失败');
    }

    return undefined;
  }

  isPinnedCertificate(cert) {
    // 检查固定证书
    const fingerprint = this.getCertificateFingerprint(cert);
    return this.config.pinnedCertificates?.includes(fingerprint);
  }

  getCertificateFingerprint(cert) {
    return this.crypto.createHash('sha256')
      .update(cert.raw)
      .digest('hex');
  }

  hasCertificateTransparency(cert) {
    // 检查SCT（签名证书时间戳）
    // 在生产环境中，将根据CT日志进行验证
    return cert.raw && cert.raw.length > 0;
  }

  loadCertificate() {
    // 从安全存储加载
    return process.env.TLS_CERT || '';
  }

  loadPrivateKey() {
    // 从安全存储加载
    return process.env.TLS_KEY || '';
  }

  loadCA() {
    // 加载CA证书
    return process.env.TLS_CA || '';
  }
}

// 消息的端到端加密
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
    // 生成临时AES密钥
    const aesKey = this.crypto.randomBytes(32);
    const iv = this.crypto.randomBytes(16);

    // 使用AES加密消息
    const cipher = this.crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encryptedMessage = Buffer.concat([
      cipher.update(JSON.stringify(message), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // 使用接收者的公钥加密AES密钥
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
      throw new Error('未找到用户密钥');
    }

    // 使用私钥解密AES密钥
    const aesKey = this.crypto.privateDecrypt(
      {
        key: userKeys.privateKey,
        passphrase: this.getPassphrase(userId)
      },
      Buffer.from(encryptedData.encryptedKey, 'base64')
    );

    // 使用AES解密消息
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
    // 在生产环境中，从用户主密码派生
    return `passphrase-${userId}`;
  }
}
```

## 数据净化

### 净化服务

```javascript
class DataSanitizationService {
  constructor() {
    this.sanitizers = new Map();
    this.initializeSanitizers();
  }

  initializeSanitizers() {
    // HTML净化器
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

    // SQL净化器
    this.registerSanitizer('sql', {
      sanitize(input) {
        return input
          .replace(/'/g, "''")
          .replace(/"/g, '""')
          .replace(/;/g, '')
          .replace(/--/g, '');
      }
    });

    // 命令净化器
    this.registerSanitizer('command', {
      sanitize(input) {
        const dangerous = /[;&|`$(){}[\]<>\\]/g;
        return input.replace(dangerous, '');
      }
    });

    // 路径净化器
    this.registerSanitizer('path', {
      sanitize(input) {
        const path = require('path');

        // 删除路径遍历尝试
        let sanitized = input.replace(/\.\./g, '');

        // 规范化路径
        sanitized = path.normalize(sanitized);

        // 确保在安全目录内
        const safePath = path.resolve('/safe/base/path');
        const resolvedPath = path.resolve(safePath, sanitized);

        if (!resolvedPath.startsWith(safePath)) {
          throw new Error('检测到路径遍历');
        }

        return resolvedPath;
      }
    });

    // JSON净化器
    this.registerSanitizer('json', {
      sanitize(input) {
        try {
          // 解析并重新字符串化以删除任何非JSON内容
          return JSON.stringify(JSON.parse(input));
        } catch {
          throw new Error('无效的JSON输入');
        }
      }
    });

    // URL净化器
    this.registerSanitizer('url', {
      sanitize(input) {
        try {
          const url = new URL(input);

          // 仅允许http(s)协议
          if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('无效的协议');
          }

          // 删除凭据
          url.username = '';
          url.password = '';

          return url.toString();
        } catch {
          throw new Error('无效的URL');
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
      throw new Error(`未知的净化器类型: ${type}`);
    }

    return sanitizer.sanitize(input);
  }

  sanitizeObject(obj, schema) {
    const sanitized = {};

    for (const [key, config] of Object.entries(schema)) {
      if (key in obj) {
        sanitized[key] = this.sanitize(obj[key], config.type);
      } else if (config.required) {
        throw new Error(`缺少必需字段: ${key}`);
      } else if (config.default !== undefined) {
        sanitized[key] = config.default;
      }
    }

    return sanitized;
  }

  // 输出编码
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

// 日志净化
class LogSanitizer {
  constructor(privacyManager) {
    this.privacy = privacyManager;
  }

  sanitizeLogEntry(entry) {
    const sanitized = JSON.parse(JSON.stringify(entry));

    // 编辑PII
    if (sanitized.message) {
      const redacted = this.privacy.redactPII(sanitized.message, {
        sensitivity: 'medium',
        method: 'mask'
      });
      sanitized.message = redacted.text;
    }

    // 删除敏感字段
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

    // 递归清理嵌套对象
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        this.removeSensitiveFields(value, fields);
      }
    }
  }
}
```

## 合规和标准

### 合规管理器

```javascript
class ComplianceManager {
  constructor() {
    this.standards = new Map();
    this.auditors = new Map();
    this.reports = [];

    this.initializeStandards();
  }

  initializeStandards() {
    // GDPR合规
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

        // 检查数据最小化
        results.push({
          requirement: 'data-minimization',
          passed: system.privacy?.hasDataMinimization,
          message: '仅收集必要数据'
        });

        // 检查同意管理
        results.push({
          requirement: 'consent-management',
          passed: system.privacy?.hasConsentManagement,
          message: '实施同意跟踪'
        });

        return results;
      }
    });

    // SOC 2合规
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

        // 检查加密
        results.push({
          requirement: 'encryption',
          passed: system.encryption?.isEnabled,
          message: '数据必须在静态和传输中加密'
        });

        // 检查访问控制
        results.push({
          requirement: 'access-controls',
          passed: system.auth?.hasRBAC,
          message: '实施基于角色的访问控制'
        });

        return results;
      }
    });

    // HIPAA合规（如果处理健康数据）
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

        // 检查审计日志
        results.push({
          requirement: 'audit-logs',
          passed: system.audit?.isEnabled,
          message: '维护全面的审计日志'
        });

        // 检查传输安全
        results.push({
          requirement: 'transmission-security',
          passed: system.tls?.minVersion >= 'TLSv1.2',
          message: '使用TLS 1.2或更高版本'
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
      throw new Error(`未知标准: ${standardName}`);
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

## 性能影响

### 数据保护性能

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
      message: '加密性能测试数据',
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
      联系John Doe，邮箱john.doe@example.com或电话555-123-4567。
      他的社保号是123-45-6789，信用卡号4111-1111-1111-1111。
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
      analysis.recommendations.push('考虑硬件加速加密');
    }

    if (metrics.piiDetectionTime > 2) {
      analysis.recommendations.push('优化PII检测模式');
    }

    if (metrics.sanitizationTime > 0.5) {
      analysis.recommendations.push('缓存净化结果');
    }

    if (analysis.totalOverhead > 10) {
      analysis.recommendations.push('考虑异步处理数据保护');
    }

    return analysis;
  }
}
```

## 总结

Claude Code的数据保护系统提供：

1. **全面加密**：具有密钥轮换和安全密钥管理的AES-256-GCM
2. **安全存储**：具有TTL和访问控制的加密数据存储
3. **密钥管理**：具有版本控制和审计的基于保险库的密钥存储
4. **隐私保护**：PII检测、编辑和同意管理
5. **安全通信**：具有证书固定和E2E加密的TLS 1.2+
6. **数据净化**：各种数据类型的上下文感知净化
7. **合规支持**：GDPR、SOC2和HIPAA合规验证
8. **性能优化**：最小开销的高效加密

该系统确保数据机密性、完整性和可用性，同时保持与隐私法规的合规性。

## 下一步

在第10部分的最后一节中，我们将探讨漏洞预防机制。

---

*Claude Code技术系列的一部分 - 安全*