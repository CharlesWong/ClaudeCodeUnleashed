# 第10.1部分：安全架构

## 简介

Claude Code安全架构实现了纵深防御原则，以防范各种安全威胁，同时保持可用性。本章探讨多层安全方法，从认证和授权到输入验证、命令净化和安全通信协议。

## 目录
1. [安全原则](#安全原则)
2. [威胁模型](#威胁模型)
3. [安全层次](#安全层次)
4. [认证系统](#认证系统)
5. [授权框架](#授权框架)
6. [输入验证](#输入验证)
7. [安全通信](#安全通信)
8. [性能影响](#性能影响)

## 安全原则

### 核心安全原则

```javascript
class SecurityPrinciples {
  static principles = {
    // 纵深防御
    defenseInDepth: {
      description: '多层安全控制',
      implementation: [
        'API级别的认证',
        '工具访问授权',
        '输入验证和净化',
        '命令执行限制',
        '输出过滤'
      ]
    },

    // 最小权限原则
    leastPrivilege: {
      description: '最小必要权限',
      implementation: [
        '默认只读工具',
        '写操作需要明确权限',
        '沙箱命令执行',
        '受限的文件系统访问'
      ]
    },

    // 安全设计
    securityByDesign: {
      description: '架构中内建安全性',
      implementation: [
        '安全默认设置',
        '故障安全机制',
        '审计日志',
        '加密通信'
      ]
    },

    // 零信任
    zeroTrust: {
      description: '永不信任，始终验证',
      implementation: [
        '验证所有输入',
        '认证每个请求',
        '验证工具权限',
        '监控所有活动'
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

## 威胁模型

### 威胁分类

```javascript
class ThreatModel {
  constructor() {
    this.threats = new Map();
    this.mitigations = new Map();
    this.riskMatrix = new Map();

    this.initializeThreats();
  }

  initializeThreats() {
    // 命令注入威胁
    this.addThreat({
      id: 'CMD-INJ-001',
      name: 'Shell命令注入',
      category: '注入',
      severity: '严重',
      description: '通过用户输入注入恶意命令',

      attackVectors: [
        '未转义的shell元字符',
        '使用 ; && || 的命令链接',
        '反引号命令替换',
        '变量扩展攻击'
      ],

      mitigations: [
        '输入净化',
        '命令白名单',
        'Shell参数转义',
        '沙箱执行'
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

    // 路径遍历威胁
    this.addThreat({
      id: 'PATH-TRV-001',
      name: '目录遍历',
      category: '访问控制',
      severity: '高',
      description: '未授权的文件系统访问',

      attackVectors: [
        '../序列',
        '绝对路径操纵',
        '符号链接攻击',
        '隐藏文件访问'
      ],

      mitigations: [
        '路径规范化',
        'Chroot/jail环境',
        '访问控制列表',
        '路径验证'
      ],

      detection: {
        patterns: [
          /\.\.\//,
          /^\/(?!tmp|var\/tmp)/,  // 安全目录外的绝对路径
          /^\./,  // 隐藏文件
          /~\//   // 主目录扩展
        ],

        check(path) {
          return this.patterns.some(p => p.test(path));
        }
      }
    });

    // API密钥泄露
    this.addThreat({
      id: 'KEY-EXP-001',
      name: 'API密钥泄露',
      category: '信息泄露',
      severity: '严重',
      description: '认证凭据暴露',

      attackVectors: [
        '包含密钥的日志',
        '带有凭据的错误消息',
        '命令历史暴露',
        '环境变量泄漏'
      ],

      mitigations: [
        '日志中的密钥掩码',
        '安全密钥存储',
        '环境隔离',
        '凭据轮换'
      ],

      detection: {
        patterns: [
          /sk-[a-zA-Z0-9]{48}/,  // Anthropic API密钥模式
          /api[_-]?key/i,
          /authorization:\s*bearer/i
        ],

        check(content) {
          return this.patterns.some(p => p.test(content));
        }
      }
    });

    // 拒绝服务
    this.addThreat({
      id: 'DOS-001',
      name: '资源耗尽',
      category: '可用性',
      severity: '高',
      description: '系统资源耗尽攻击',

      attackVectors: [
        '无限循环',
        'Fork炸弹',
        '内存耗尽',
        '磁盘填充'
      ],

      mitigations: [
        '资源限制',
        '超时控制',
        '速率限制',
        '进程隔离'
      ],

      detection: {
        patterns: [
          /:(){ :|:& };:/,  // Fork炸弹
          /\/dev\/zero/,    // 磁盘填充
          /while\s+true/,   // 无限循环
        ],

        check(command) {
          return this.patterns.some(p => p.test(command));
        }
      }
    });
  }

  addThreat(threat) {
    this.threats.set(threat.id, threat);

    // 计算风险分数
    const riskScore = this.calculateRisk(threat);
    this.riskMatrix.set(threat.id, riskScore);
  }

  calculateRisk(threat) {
    const severityScores = {
      严重: 10,
      高: 7,
      中: 5,
      低: 3
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
    if (score >= 70) return '严重';
    if (score >= 50) return '高';
    if (score >= 30) return '中';
    return '低';
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

## 安全层次

### 分层安全架构

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

    // 通过每个安全层处理
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

    // 记录安全事件
    console.error(`安全阻止: ${layer}`, {
      reason,
      threat,
      request: context.request,
      timestamp: new Date().toISOString()
    });

    // 警报监控
    this.alertMonitoring(context);
  }

  handleSecurityError(error, context) {
    console.error('安全层错误:', error);

    // 失败时关闭 - 出错时阻止
    context.blocked = {
      layer: 'error-handler',
      reason: '安全处理错误',
      error: error.message
    };
  }

  alertMonitoring(context) {
    // 发送到监控系统
    const alert = {
      type: 'SECURITY_BLOCK',
      severity: context.blocked.threat?.severity || '中等',
      context,
      timestamp: Date.now()
    };

    // 将发送到监控服务
    this.layers.find(l => l instanceof MonitoringLayer)?.alert(alert);
  }
}

// 网络安全层
class NetworkSecurityLayer {
  async process(context) {
    // TLS/SSL验证
    if (!this.isSecureConnection(context.request)) {
      context.blocked = {
        layer: 'network',
        reason: '不安全的连接'
      };
    }

    // IP过滤
    if (!this.isAllowedIP(context.request.ip)) {
      context.blocked = {
        layer: 'network',
        reason: '不允许的IP'
      };
    }

    // 速率限制
    if (!this.checkRateLimit(context.request)) {
      context.blocked = {
        layer: 'network',
        reason: '超过速率限制'
      };
    }

    return context;
  }

  isSecureConnection(request) {
    return request.protocol === 'https' || request.isLocal;
  }

  isAllowedIP(ip) {
    // 检查IP白名单/黑名单
    return true; // 简化示例
  }

  checkRateLimit(request) {
    // 实现速率限制
    return true; // 简化示例
  }
}
```

## 认证系统

### API密钥认证

```javascript
class AuthenticationLayer {
  constructor() {
    this.authMethods = new Map();
    this.sessionStore = new Map();

    // 注册认证方法
    this.registerMethod('api-key', new APIKeyAuth());
    this.registerMethod('oauth', new OAuthAuth());
    this.registerMethod('jwt', new JWTAuth());
  }

  registerMethod(name, method) {
    this.authMethods.set(name, method);
  }

  async process(context) {
    const { request } = context;

    // 提取凭据
    const credentials = this.extractCredentials(request);

    if (!credentials) {
      context.blocked = {
        layer: 'authentication',
        reason: '未提供凭据'
      };
      return context;
    }

    // 认证
    const authResult = await this.authenticate(credentials);

    if (!authResult.success) {
      context.blocked = {
        layer: 'authentication',
        reason: authResult.error
      };
      return context;
    }

    // 设置用户上下文
    context.user = authResult.user;
    context.session = await this.createSession(authResult.user);

    return context;
  }

  extractCredentials(request) {
    // 检查各种凭据位置
    const credentials = {
      apiKey: null,
      token: null,
      method: null
    };

    // 请求头中的API密钥
    if (request.headers['x-api-key']) {
      credentials.apiKey = request.headers['x-api-key'];
      credentials.method = 'api-key';
    }

    // Bearer令牌
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      credentials.token = authHeader.slice(7);
      credentials.method = 'jwt';
    }

    // 环境变量回退
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
        error: `未知的认证方法: ${credentials.method}`
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
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24小时
      permissions: await this.loadUserPermissions(user)
    };

    this.sessionStore.set(sessionId, session);

    // 安排清理
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
    // 从配置或数据库加载用户权限
    return user.permissions || ['read', 'write', 'execute'];
  }
}

// API密钥认证方法
class APIKeyAuth {
  constructor() {
    this.keyStore = new Map();
    this.keyPattern = /^sk-[a-zA-Z0-9]{48}$/;
  }

  async authenticate(credentials) {
    const { apiKey } = credentials;

    // 验证密钥格式
    if (!this.validateKeyFormat(apiKey)) {
      return {
        success: false,
        error: '无效的API密钥格式'
      };
    }

    // 哈希密钥以进行比较
    const keyHash = this.hashKey(apiKey);

    // 验证密钥（生产环境中会检查API）
    const isValid = await this.verifyKey(keyHash);

    if (!isValid) {
      return {
        success: false,
        error: '无效或过期的API密钥'
      };
    }

    // 获取用户信息
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
    // 生产环境中会使用Anthropic API验证
    // 现在简化验证
    return keyHash.length === 64;
  }

  async getUserForKey(keyHash) {
    // 将从数据库或API获取
    return {
      id: keyHash.slice(0, 8),
      type: 'api-key',
      permissions: ['messages.create', 'tools.execute']
    };
  }
}
```

## 授权框架

### 权限系统

```javascript
class AuthorizationLayer {
  constructor() {
    this.permissions = new Map();
    this.roles = new Map();
    this.policies = [];

    this.initializePermissions();
  }

  initializePermissions() {
    // 定义权限
    this.definePermission('tools.bash.execute', {
      description: '执行bash命令',
      risk: 'high',
      requiresAudit: true
    });

    this.definePermission('tools.write.execute', {
      description: '写入文件',
      risk: 'medium',
      requiresAudit: true
    });

    this.definePermission('tools.read.execute', {
      description: '读取文件',
      risk: 'low',
      requiresAudit: false
    });

    // 定义角色
    this.defineRole('admin', {
      permissions: ['*'],  // 所有权限
      description: '具有完全访问权限的管理员'
    });

    this.defineRole('developer', {
      permissions: [
        'tools.*.execute',
        'messages.create',
        'agents.run'
      ],
      description: '具有工具访问权限的开发者'
    });

    this.defineRole('viewer', {
      permissions: [
        'tools.read.execute',
        'messages.read'
      ],
      description: '只读访问'
    });

    // 定义策略
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
    // 将权限字符串转换为正则表达式模式
    const pattern = permission
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');

    return new RegExp(`^${pattern}$`);
  }

  compilePermissions(permissions) {
    const compiled = [];

    for (const perm of permissions) {
      if (perm === '*') {
        return [/.*/];  // 匹配所有
      }

      compiled.push(this.createPermissionPattern(perm));
    }

    return compiled;
  }

  async process(context) {
    const { user, request } = context;

    // 提取所需权限
    const requiredPermission = this.extractRequiredPermission(request);

    if (!requiredPermission) {
      return context;  // 无需权限
    }

    // 检查用户权限
    const hasPermission = await this.checkPermission(
      user,
      requiredPermission,
      context
    );

    if (!hasPermission) {
      context.blocked = {
        layer: 'authorization',
        reason: `权限被拒绝: ${requiredPermission}`
      };
      return context;
    }

    // 检查策略
    for (const policy of this.policies) {
      const policyResult = await policy.evaluate(context);

      if (!policyResult.allowed) {
        context.blocked = {
          layer: 'authorization',
          reason: `策略违规: ${policyResult.reason}`,
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
    // 将请求映射到所需权限
    if (request.tool) {
      return `tools.${request.tool}.execute`;
    }

    if (request.endpoint) {
      return `api.${request.endpoint}`;
    }

    return null;
  }

  async checkPermission(user, permission, context) {
    // 获取用户的有效权限
    const userPermissions = await this.getUserPermissions(user);

    // 检查是否有任何权限匹配
    for (const userPerm of userPermissions) {
      if (userPerm.test ? userPerm.test(permission) : userPerm === permission) {
        // 记录授权
        context.audit.push({
          type: 'authorization',
          permission,
          granted: true,
          timestamp: Date.now()
        });

        return true;
      }
    }

    // 记录拒绝
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

    // 从用户对象获取权限
    if (user.permissions) {
      permissions.push(...user.permissions);
    }

    // 从角色获取权限
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

// 策略实现
class TimeBasedPolicy {
  constructor() {
    this.name = 'time-based-access';
    this.allowedHours = { start: 6, end: 22 };  // 上午6点到晚上10点
  }

  async evaluate(context) {
    const hour = new Date().getHours();

    if (hour < this.allowedHours.start || hour >= this.allowedHours.end) {
      return {
        allowed: false,
        reason: '在允许的时间之外访问'
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

    // 检查请求限制
    if (usage.requests >= this.limits.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: '超过请求限制'
      };
    }

    // 检查令牌限制
    if (usage.tokens >= this.limits.maxTokensPerDay) {
      return {
        allowed: false,
        reason: '超过令牌限制'
      };
    }

    // 更新使用情况
    this.updateUsage(userId, context);

    return { allowed: true };
  }

  getUsage(userId) {
    if (!this.usage.has(userId)) {
      this.usage.set(userId, {
        requests: 0,
        tokens: 0,
        resetTime: Date.now() + 3600000  // 1小时
      });
    }

    const usage = this.usage.get(userId);

    // 如需重置
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

## 输入验证

### 验证层

```javascript
class ValidationLayer {
  constructor() {
    this.validators = new Map();
    this.sanitizers = new Map();

    this.initializeValidators();
  }

  initializeValidators() {
    // 命令验证器
    this.registerValidator('command', {
      validate(input) {
        const dangerous = [
          /rm\s+-rf\s+\//,  // rm -rf /
          /:(){ :|:& };:/,   // Fork炸弹
          /dd\s+if=.*of=\/dev\/[sh]d/,  // 磁盘覆写
          />\s*\/dev\/[sh]d/  // 重定向到磁盘
        ];

        for (const pattern of dangerous) {
          if (pattern.test(input)) {
            return {
              valid: false,
              error: '检测到危险命令',
              pattern: pattern.toString()
            };
          }
        }

        return { valid: true };
      },

      sanitize(input) {
        // 转义shell元字符
        return input
          .replace(/([;&|`$()])/g, '\\$1')
          .replace(/\n/g, ' ');
      }
    });

    // 文件路径验证器
    this.registerValidator('filepath', {
      validate(input) {
        // 检查路径遍历
        if (input.includes('../')) {
          return {
            valid: false,
            error: '检测到路径遍历'
          };
        }

        // 检查安全目录外的绝对路径
        if (input.startsWith('/') && !this.isSafePath(input)) {
          return {
            valid: false,
            error: '安全目录外的绝对路径'
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
        // 规范化和解析路径
        return path.normalize(input);
      }
    });

    // 内容验证器
    this.registerValidator('content', {
      validate(input) {
        // 检查机密信息
        const secretPatterns = [
          /sk-[a-zA-Z0-9]{48}/,  // API密钥
          /-----BEGIN.*PRIVATE KEY-----/,  // 私钥
          /password\s*=\s*["'][^"']+["']/i  // 密码
        ];

        for (const pattern of secretPatterns) {
          if (pattern.test(input)) {
            return {
              valid: false,
              error: '检测到潜在的机密信息',
              pattern: pattern.toString()
            };
          }
        }

        return { valid: true };
      },

      sanitize(input) {
        // 屏蔽潜在的机密信息
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

    // 确定验证类型
    const validationType = this.getValidationType(request);

    if (!validationType) {
      return context;  // 无需验证
    }

    // 获取验证器
    const validator = this.validators.get(validationType);

    if (!validator) {
      context.blocked = {
        layer: 'validation',
        reason: `没有类型的验证器: ${validationType}`
      };
      return context;
    }

    // 验证输入
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

    // 净化输入
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

## 安全通信

### 加密通信层

```javascript
class SecureCommunication {
  constructor() {
    this.crypto = require('crypto');
    this.algorithm = 'aes-256-gcm';
    this.keys = new Map();
  }

  async establishSecureChannel(clientId) {
    // 生成会话密钥
    const sessionKey = this.generateSessionKey();
    const iv = this.crypto.randomBytes(16);

    // 存储会话信息
    this.keys.set(clientId, {
      key: sessionKey,
      iv,
      createdAt: Date.now(),
      messageCount: 0
    });

    // 返回加密的会话信息
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
    // 生产环境中会使用真实的密钥对
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
      throw new Error('未建立会话');
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
      throw new Error('未建立会话');
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

    // 生成新密钥
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
    const MAX_AGE = 3600000;  // 1小时

    return session.messageCount > MAX_MESSAGES ||
           (Date.now() - session.createdAt) > MAX_AGE;
  }
}

// HTTPS/TLS配置
class TLSConfiguration {
  static getConfig() {
    return {
      // TLS版本
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',

      // 密码套件（按优先级顺序）
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384'
      ].join(':'),

      // 证书配置
      cert: process.env.TLS_CERT,
      key: process.env.TLS_KEY,
      ca: process.env.TLS_CA,

      // 安全选项
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

    // 检查过期
    const now = Date.now();
    if (cert.valid_to < now) {
      return {
        valid: false,
        error: '证书已过期'
      };
    }

    // 检查尚未生效
    if (cert.valid_from > now) {
      return {
        valid: false,
        error: '证书尚未生效'
      };
    }

    // 验证签名
    // 生产环境中会实现完整的链验证

    return { valid: true };
  }
}
```

## 性能影响

### 安全性能监控

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
      recommendations.push('考虑缓存认证结果');
    }

    if (metrics.authorization > 5) {
      recommendations.push('优化权限检查逻辑');
    }

    if (metrics.validation > 20) {
      recommendations.push('使用编译的正则表达式模式进行验证');
    }

    if (metrics.encryption > 50) {
      recommendations.push('考虑对加密使用硬件加速');
    }

    if (metrics.total > 100) {
      recommendations.push('安全开销较大，考虑优化');
    }

    return recommendations;
  }
}
```

## 总结

Claude Code安全架构实现了全面的纵深防御：

1. **多层安全**：网络、认证、授权、验证和监控层
2. **威胁建模**：主动识别和缓解安全威胁
3. **强认证**：使用安全存储和轮换的API密钥验证
4. **细粒度授权**：具有动态策略的基于角色的访问控制
5. **输入验证**：全面的输入净化和验证
6. **安全通信**：带有可选端到端加密的TLS/HTTPS
7. **性能监控**：跟踪安全开销并提供优化建议
8. **审计日志**：完整的安全决策审计跟踪

该架构在保持灵活性和性能的同时优先考虑安全性，确保AI辅助操作的安全执行。

## 下一步

在下一节中，我们将详细探讨认证和授权的实现。

---

*Claude Code技术系列的一部分 - 安全*