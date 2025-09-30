# 第10.2部分：认证和授权

## 简介

Claude Code认证和授权系统确保只有合法用户才能访问系统，并且他们只能在授予的权限范围内执行操作。本章探讨API密钥管理、会话处理、基于角色的访问控制(RBAC)和动态权限评估的实现。

## 目录
1. [认证实现](#认证实现)
2. [API密钥管理](#api密钥管理)
3. [会话管理](#会话管理)
4. [基于角色的访问控制](#基于角色的访问控制)
5. [权限系统](#权限系统)
6. [工具授权](#工具授权)
7. [审计系统](#审计系统)
8. [性能影响](#性能影响)

## 认证实现

### 核心认证服务

```javascript
class AuthenticationService {
  constructor() {
    this.providers = new Map();
    this.sessions = new Map();
    this.failedAttempts = new Map();
    this.config = {
      maxFailedAttempts: 5,
      lockoutDuration: 300000, // 5分钟
      sessionTimeout: 86400000, // 24小时
      requireStrongKey: true
    };

    this.initializeProviders();
  }

  initializeProviders() {
    // 注册认证提供者
    this.registerProvider('api-key', new APIKeyProvider());
    this.registerProvider('oauth2', new OAuth2Provider());
    this.registerProvider('jwt', new JWTProvider());
    this.registerProvider('mcp', new MCPAuthProvider());
  }

  registerProvider(name, provider) {
    this.providers.set(name, provider);
  }

  async authenticate(credentials) {
    // 检查锁定
    if (this.isLockedOut(credentials.identifier)) {
      throw new AuthenticationError('由于失败尝试次数过多，账户暂时锁定');
    }

    try {
      // 确定提供者
      const provider = this.selectProvider(credentials);

      if (!provider) {
        throw new AuthenticationError('没有合适的认证提供者');
      }

      // 尝试认证
      const result = await provider.authenticate(credentials);

      if (result.success) {
        // 清除失败尝试
        this.failedAttempts.delete(credentials.identifier);

        // 创建会话
        const session = await this.createSession(result.user, provider.name);

        return {
          success: true,
          user: result.user,
          session: session.id,
          expiresAt: session.expiresAt
        };
      }

      // 记录失败尝试
      this.recordFailedAttempt(credentials.identifier);

      return {
        success: false,
        error: result.error || '认证失败'
      };

    } catch (error) {
      // 记录失败尝试
      this.recordFailedAttempt(credentials.identifier);

      throw error;
    }
  }

  selectProvider(credentials) {
    // API密钥模式
    if (credentials.apiKey && /^sk-[a-zA-Z0-9]{48}$/.test(credentials.apiKey)) {
      return this.providers.get('api-key');
    }

    // JWT令牌
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

    // 安排清理
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

      // 锁定已过期，重置
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
        error: '未找到会话'
      };
    }

    // 检查过期
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return {
        valid: false,
        error: '会话已过期'
      };
    }

    // 更新最后活动时间
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

      // 审计日志
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
      throw new AuthenticationError('未找到会话');
    }

    // 延长过期时间
    session.expiresAt = Date.now() + this.config.sessionTimeout;
    session.lastActivity = Date.now();

    // 为安全起见生成新的会话ID
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

## API密钥管理

### API密钥提供者

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

    // 验证格式
    if (!this.validateKeyFormat(apiKey)) {
      return {
        success: false,
        error: '无效的API密钥格式'
      };
    }

    // 检查缓存
    const cached = this.keyCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        success: true,
        user: cached.user
      };
    }

    // 检查速率限制
    const rateLimitOk = await this.rateLimiter.checkLimit(apiKey);
    if (!rateLimitOk) {
      return {
        success: false,
        error: '超过速率限制'
      };
    }

    // 使用Anthropic API验证
    const validationResult = await this.validateWithAPI(apiKey);

    if (validationResult.valid) {
      // 缓存结果
      this.keyCache.set(apiKey, {
        user: validationResult.user,
        expiresAt: Date.now() + 300000 // 5分钟
      });

      return {
        success: true,
        user: validationResult.user
      };
    }

    return {
      success: false,
      error: validationResult.error || '无效的API密钥'
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
      // 生产环境中会进行真实的API调用
      // 现在模拟验证
      const response = await this.simulateAPIValidation(apiKey);

      return {
        valid: response.valid,
        user: response.user,
        error: response.error
      };

    } catch (error) {
      console.error('API密钥验证错误:', error);
      return {
        valid: false,
        error: '验证API密钥失败'
      };
    }
  }

  async simulateAPIValidation(apiKey) {
    // 模拟API调用延迟
    await new Promise(resolve => setTimeout(resolve, 100));

    // 演示用，接受以sk-开头的密钥
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
      error: '无效或过期的API密钥'
    };
  }

  hashKey(key) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

// 密钥生命周期的API密钥管理器
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
      expiresAt: options.expiresAt || Date.now() + 90 * 24 * 60 * 60 * 1000, // 90天
      permissions: options.permissions || [],
      metadata: options.metadata || {},
      lastUsed: null,
      usageCount: 0
    };

    this.keys.set(key.hash, keyData);

    // 如果需要，安排轮换
    if (options.autoRotate) {
      this.scheduleRotation(key.hash, options.rotationInterval || 30 * 24 * 60 * 60 * 1000);
    }

    return {
      key: key.full,  // 仅在创建时返回完整密钥
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
      throw new Error('未找到密钥');
    }

    // 生成新密钥
    const newKey = await this.generateKey(oldKeyData.userId, {
      permissions: oldKeyData.permissions,
      metadata: {
        ...oldKeyData.metadata,
        rotatedFrom: keyHash
      },
      autoRotate: !!this.rotationSchedule.has(keyHash)
    });

    // 标记旧密钥即将过期
    oldKeyData.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天宽限期
    oldKeyData.metadata.rotatedTo = newKey.hash;

    return newKey;
  }

  scheduleRotation(keyHash, interval) {
    const timeoutId = setTimeout(() => {
      this.rotateKey(keyHash).catch(error => {
        console.error('密钥轮换失败:', error);
      });
    }, interval);

    this.rotationSchedule.set(keyHash, timeoutId);
  }

  async revokeKey(keyHash) {
    const keyData = this.keys.get(keyHash);

    if (keyData) {
      keyData.expiresAt = Date.now();
      keyData.metadata.revokedAt = Date.now();

      // 如果已安排轮换，则取消
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
        error: '未找到密钥'
      };
    }

    if (Date.now() > keyData.expiresAt) {
      return {
        valid: false,
        error: '密钥已过期'
      };
    }

    // 更新使用情况
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

## 会话管理

### 会话管理器

```javascript
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.config = {
      maxConcurrentSessions: 5,
      sessionTimeout: 24 * 60 * 60 * 1000, // 24小时
      inactivityTimeout: 30 * 60 * 1000,   // 30分钟
      renewalThreshold: 60 * 60 * 1000     // 1小时
    };
  }

  async createSession(user, metadata = {}) {
    // 检查并发会话
    const userSessions = this.getUserSessions(user.id);

    if (userSessions.length >= this.config.maxConcurrentSessions) {
      // 撤销最旧的会话
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

    // 安排过期
    this.scheduleExpiration(session);

    return session;
  }

  generateSessionId() {
    const crypto = require('crypto');
    return `sess_${crypto.randomBytes(24).toString('hex')}`;
  }

  generateAccessToken(user) {
    // 演示用的简单令牌
    // 生产环境中使用适当的JWT
    const payload = {
      sub: user.id,
      roles: user.roles,
      exp: Date.now() + 3600000 // 1小时
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
        error: '未找到会话'
      };
    }

    // 检查过期
    if (Date.now() > session.expiresAt) {
      await this.revokeSession(sessionId);
      return {
        valid: false,
        error: '会话已过期'
      };
    }

    // 检查不活动
    const inactiveTime = Date.now() - session.lastActivity;
    if (inactiveTime > this.config.inactivityTimeout) {
      await this.revokeSession(sessionId);
      return {
        valid: false,
        error: '由于不活动，会话超时'
      };
    }

    // 更新活动
    session.lastActivity = Date.now();

    // 检查是否需要续订
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

    // 延长过期时间
    session.expiresAt = Date.now() + this.config.sessionTimeout;

    // 重新生成令牌
    session.tokens.access = this.generateAccessToken(session.user);

    // 重新安排过期
    this.scheduleExpiration(session);

    return true;
  }

  async revokeSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (session) {
      // 清除已安排的过期
      if (session.expirationTimeout) {
        clearTimeout(session.expirationTimeout);
      }

      // 删除会话
      this.sessions.delete(sessionId);

      // 审计日志
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
    // 清除现有超时
    if (session.expirationTimeout) {
      clearTimeout(session.expirationTimeout);
    }

    const timeUntilExpiry = session.expiresAt - Date.now();

    session.expirationTimeout = setTimeout(() => {
      this.revokeSession(session.id);
    }, timeUntilExpiry);
  }

  async auditLog(event) {
    // 将记录到审计系统
    console.log('审计:', event);
  }
}
```

## 基于角色的访问控制

### RBAC系统

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
    // 定义权限
    this.definePermission('messages.create', '创建消息');
    this.definePermission('messages.read', '读取消息');
    this.definePermission('messages.delete', '删除消息');

    this.definePermission('tools.bash.execute', '执行bash命令');
    this.definePermission('tools.read.execute', '读取文件');
    this.definePermission('tools.write.execute', '写入文件');
    this.definePermission('tools.edit.execute', '编辑文件');

    this.definePermission('agents.run', '运行代理');
    this.definePermission('agents.create', '创建代理');
    this.definePermission('agents.modify', '修改代理');

    this.definePermission('admin.users', '管理用户');
    this.definePermission('admin.roles', '管理角色');
    this.definePermission('admin.system', '系统管理');

    // 定义角色
    this.defineRole('admin', {
      description: '系统管理员',
      permissions: ['*'], // 所有权限
      inherits: []
    });

    this.defineRole('developer', {
      description: '具有完全工具访问权限的开发者',
      permissions: [
        'messages.*',
        'tools.*',
        'agents.run'
      ],
      inherits: ['user']
    });

    this.defineRole('user', {
      description: '标准用户',
      permissions: [
        'messages.create',
        'messages.read',
        'tools.read.execute'
      ],
      inherits: []
    });

    this.defineRole('viewer', {
      description: '只读访问',
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

    // 更新层次结构
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
        // 所有权限
        for (const p of this.permissions.keys()) {
          expanded.add(p);
        }
      } else if (perm.endsWith('*')) {
        // 通配符权限
        const prefix = perm.slice(0, -1);
        for (const p of this.permissions.keys()) {
          if (p.startsWith(prefix)) {
            expanded.add(p);
          }
        }
      } else {
        // 精确权限
        expanded.add(perm);
      }
    }

    return Array.from(expanded);
  }

  async assignRole(userId, roleName) {
    const role = this.roles.get(roleName);

    if (!role) {
      throw new Error(`未找到角色: ${roleName}`);
    }

    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }

    this.userRoles.get(userId).add(roleName);

    // 审计日志
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

      // 审计日志
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

    // 从所有角色收集权限
    for (const roleName of userRoles) {
      const role = this.roles.get(roleName);

      if (role) {
        // 添加直接权限
        for (const perm of role.permissions) {
          permissions.add(perm);
        }

        // 添加继承的权限
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
    // 将记录到审计系统
    console.log('RBAC审计:', event);
  }
}
```

## 权限系统

### 动态权限评估

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

    // 检查缓存
    const cacheKey = `${user.id}:${resource}:${action}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // 评估权限
    const result = await this.evaluateUncached(context);

    // 缓存结果
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + 60000 // 1分钟
    });

    return result;
  }

  async evaluateUncached(context) {
    const { user, resource, action } = context;

    // 构建所需权限
    const requiredPermission = this.buildPermission(resource, action);

    // 检查RBAC权限
    const hasPermission = this.rbac.hasPermission(user.id, requiredPermission);

    if (!hasPermission) {
      return {
        allowed: false,
        reason: '权限不足',
        required: requiredPermission
      };
    }

    // 评估动态策略
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
    // 将资源和操作转换为权限字符串
    return `${resource}.${action}`;
  }
}

// 动态策略
class TimeBasedAccessPolicy {
  constructor() {
    this.name = 'time-based-access';
    this.rules = [
      {
        role: 'developer',
        allowedHours: { start: 6, end: 22 }, // 上午6点 - 晚上10点
        allowedDays: [1, 2, 3, 4, 5] // 周一 - 周五
      }
    ];
  }

  async evaluate(context) {
    const { user } = context;
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // 查找适用规则
    const rule = this.rules.find(r =>
      user.roles && user.roles.includes(r.role)
    );

    if (!rule) {
      return { allowed: true }; // 无限制
    }

    // 检查时间限制
    if (hour < rule.allowedHours.start || hour >= rule.allowedHours.end) {
      return {
        allowed: false,
        reason: `在允许的时间之外访问(${rule.allowedHours.start}-${rule.allowedHours.end})`
      };
    }

    if (!rule.allowedDays.includes(day)) {
      return {
        allowed: false,
        reason: '周末不允许访问'
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

    // 获取用户配额
    const quota = this.getQuota(userId);

    // 检查资源特定限制
    if (resource === 'tools.bash') {
      if (quota.bashCommands >= 100) {
        return {
          allowed: false,
          reason: '超出每日bash命令限制'
        };
      }
      quota.bashCommands++;
    }

    if (resource === 'messages') {
      if (quota.messages >= 1000) {
        return {
          allowed: false,
          reason: '超出每日消息限制'
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

    // 如果需要重置
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

## 工具授权

### 工具权限系统

```javascript
class ToolAuthorizationSystem {
  constructor() {
    this.toolPermissions = new Map();
    this.toolPolicies = new Map();

    this.initializeToolPermissions();
  }

  initializeToolPermissions() {
    // 定义工具权限
    this.defineToolPermission('Bash', {
      permission: 'tools.bash.execute',
      riskLevel: 'high',
      requiresAudit: true,

      additionalChecks: async (input, user) => {
        // 检查危险命令
        const dangerous = this.checkDangerousCommand(input.command);
        if (dangerous) {
          return {
            allowed: false,
            reason: `检测到危险命令: ${dangerous}`
          };
        }

        // 检查用户特定限制
        if (user.restrictions?.noBash) {
          return {
            allowed: false,
            reason: '用户受限于bash访问'
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
        // 检查文件路径限制
        if (!this.isAllowedPath(input.file_path, user)) {
          return {
            allowed: false,
            reason: '不允许的文件路径'
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
        // 检查敏感文件
        if (this.isSensitivePath(input.file_path)) {
          return {
            allowed: false,
            reason: '无法读取敏感文件'
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
        // 类似于Write工具
        if (!this.isAllowedPath(input.file_path, user)) {
          return {
            allowed: false,
            reason: '不允许的文件路径'
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
        // 检查URL限制
        if (!this.isAllowedURL(input.url)) {
          return {
            allowed: false,
            reason: '不允许的URL'
          };
        }

        return { allowed: true };
      }
    });

    this.defineToolPermission('Task', {
      permission: 'agents.run',
      riskLevel: 'high',
      requiresAudit: true,

      additionalChecks: async (input, user) {
        // 检查代理类型限制
        const allowedAgents = user.allowedAgents || ['general'];

        if (!allowedAgents.includes(input.subagent_type)) {
          return {
            allowed: false,
            reason: `不允许的代理类型: ${input.subagent_type}`
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
        reason: `未知工具: ${toolName}`
      };
    }

    // 检查基本权限
    const hasPermission = user.permissions?.includes(config.permission);

    if (!hasPermission) {
      return {
        allowed: false,
        reason: `缺少权限: ${config.permission}`
      };
    }

    // 运行额外检查
    if (config.additionalChecks) {
      const checkResult = await config.additionalChecks(input, user);

      if (!checkResult.allowed) {
        return checkResult;
      }
    }

    // 检查工具特定策略
    const policy = this.toolPolicies.get(toolName);
    if (policy) {
      const policyResult = await policy.evaluate({ tool: toolName, input, user });

      if (!policyResult.allowed) {
        return policyResult;
      }
    }

    // 如果需要，进行审计
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
      { pattern: /:(){ :|:& };:/, name: 'fork炸弹' },
      { pattern: /dd\s+if=.*of=\/dev\/[sh]d/, name: '磁盘覆写' },
      { pattern: />\/dev\/[sh]d/, name: '写入磁盘设备' }
    ];

    for (const { pattern, name } of dangerousPatterns) {
      if (pattern.test(command)) {
        return name;
      }
    }

    return null;
  }

  isAllowedPath(path, user) {
    // 默认允许的路径
    const allowedPaths = [
      process.cwd(),
      '/tmp',
      '/var/tmp'
    ];

    // 添加用户特定路径
    if (user.allowedPaths) {
      allowedPaths.push(...user.allowedPaths);
    }

    // 检查路径是否在允许的目录内
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

      // 阻止本地URL
      if (parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname.startsWith('192.168.') ||
          parsed.hostname.startsWith('10.')) {
        return false;
      }

      // 阻止某些协议
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

    // 将发送到审计日志系统
    console.log('工具审计:', audit);
  }

  sanitizeForAudit(input) {
    // 从审计日志中删除敏感数据
    const sanitized = { ...input };

    // 屏蔽潜在的机密信息
    if (sanitized.content) {
      sanitized.content = sanitized.content
        .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***')
        .replace(/password=["'][^"']+["']/gi, 'password="***"');
    }

    return sanitized;
  }
}
```

## 审计系统

### 全面的审计日志

```javascript
class AuditSystem {
  constructor() {
    this.storage = new AuditStorage();
    this.filters = [];
    this.alerts = new Map();
  }

  async log(event) {
    // 丰富事件
    const enrichedEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: event.timestamp || Date.now(),
      serverTime: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production'
    };

    // 应用过滤器
    for (const filter of this.filters) {
      if (!filter.shouldLog(enrichedEvent)) {
        return; // 跳过记录
      }
    }

    // 存储事件
    await this.storage.store(enrichedEvent);

    // 检查警报
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
    // 添加到主存储
    this.events.push(event);

    // 更新索引
    this.updateIndexes(event);

    // 如果需要则轮转
    if (this.events.length > this.maxEvents) {
      await this.rotate();
    }
  }

  updateIndexes(event) {
    // 按用户索引
    if (event.userId) {
      if (!this.indexes.byUser.has(event.userId)) {
        this.indexes.byUser.set(event.userId, []);
      }
      this.indexes.byUser.get(event.userId).push(event);
    }

    // 按事件类型索引
    if (event.event) {
      if (!this.indexes.byEvent.has(event.event)) {
        this.indexes.byEvent.set(event.event, []);
      }
      this.indexes.byEvent.get(event.event).push(event);
    }

    // 按时间戳索引
    this.indexes.byTimestamp.push({
      timestamp: event.timestamp,
      event
    });
  }

  async rotate() {
    // 归档旧事件
    const toArchive = this.events.splice(0, this.maxEvents / 2);

    // 将写入永久存储
    console.log(`归档 ${toArchive.length} 个审计事件`);

    // 重建索引
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

    // 按用户过滤
    if (criteria.userId) {
      results = this.indexes.byUser.get(criteria.userId) || [];
    }

    // 按事件类型过滤
    if (criteria.event) {
      results = results.filter(e => e.event === criteria.event);
    }

    // 按时间范围过滤
    if (criteria.startTime || criteria.endTime) {
      results = results.filter(e => {
        if (criteria.startTime && e.timestamp < criteria.startTime) return false;
        if (criteria.endTime && e.timestamp > criteria.endTime) return false;
        return true;
      });
    }

    // 限制结果
    if (criteria.limit) {
      results = results.slice(-criteria.limit);
    }

    return results;
  }
}

// 审计警报
class SecurityAlerts {
  static setupAlerts(auditSystem) {
    // 失败的认证尝试
    auditSystem.addAlert(
      'failed-auth',
      event => event.event === 'auth.failed',
      async event => {
        const recentFailures = await auditSystem.query({
          event: 'auth.failed',
          userId: event.userId,
          startTime: Date.now() - 300000 // 最近5分钟
        });

        if (recentFailures.length >= 5) {
          console.error('警报: 多次失败的认证尝试', {
            userId: event.userId,
            attempts: recentFailures.length
          });
        }
      }
    );

    // 权限提升
    auditSystem.addAlert(
      'privilege-escalation',
      event => event.event === 'permission.denied' && event.permission?.includes('admin'),
      async event => {
        console.error('警报: 尝试权限提升', {
          userId: event.userId,
          permission: event.permission
        });
      }
    );

    // 危险命令
    auditSystem.addAlert(
      'dangerous-command',
      event => event.event === 'tool.executed' && event.riskLevel === 'high',
      async event => {
        console.error('警报: 高风险工具执行', {
          tool: event.tool,
          user: event.user,
          input: event.input
        });
      }
    );
  }
}
```

## 性能影响

### 认证性能

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
    return Number(end - start) / 1e6 / iterations; // 每次验证的毫秒数
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

    // 设置测试用户
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
      analysis.recommendations.push('使用缓存优化API密钥验证');
    }

    if (metrics.sessionCreation > 10) {
      analysis.recommendations.push('考虑异步会话创建');
    }

    if (metrics.permissionCheck > 0.5) {
      analysis.recommendations.push('实现权限缓存');
    }

    if (metrics.toolAuthorization > 5) {
      analysis.recommendations.push('缓存工具授权结果');
    }

    return analysis;
  }
}
```

## 总结

Claude Code认证和授权系统提供：

1. **多提供者认证**：支持API密钥、OAuth2、JWT和MCP令牌
2. **安全会话管理**：具有自动续订和过期的会话生命周期
3. **全面的RBAC**：具有继承和通配符的基于角色的访问控制
4. **动态权限**：具有缓存的基于策略的权限评估
5. **工具授权**：对工具执行的细粒度控制
6. **完整审计跟踪**：具有警报功能的全面日志记录
7. **性能优化**：缓存和优化以实现最小开销
8. **安全最佳实践**：速率限制、锁定保护和安全令牌处理

该系统确保安全的访问控制，同时保持灵活性和性能。

## 下一步

在下一节中，我们将探讨包括加密和安全存储在内的数据保护机制。

---

*Claude Code技术系列的一部分 - 安全*