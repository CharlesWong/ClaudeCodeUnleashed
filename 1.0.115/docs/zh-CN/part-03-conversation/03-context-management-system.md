# 第3.3部分：上下文管理系统 - 微压缩深度解析

## 概述

随着与Claude对话的增长，它们不可避免地会遇到token限制。上下文管理系统以创新的微压缩算法为中心，优雅地解决了这一挑战。系统不是截断对话或失去上下文，而是智能地压缩旧消息，同时保留语义含义和重要细节。这个全面的分析探讨了保持对话在限制内而不牺牲连续性的复杂算法、边界检测逻辑和摘要策略。

## 目录

1. [架构概述](#架构概述)
2. [微压缩算法](#微压缩算法)
3. [边界检测逻辑](#边界检测逻辑)
4. [摘要策略](#摘要策略)
5. [Token管理](#token管理)
6. [工具调用保留](#工具调用保留)
7. [性能优化](#性能优化)
8. [实际场景](#实际场景)

## 架构概述

### 核心设计原则

微压缩系统基于几个关键原则运行：

1. **语义保留**：在减少token的同时保持含义
2. **智能边界**：找到自然的对话断点
3. **工具感知**：保留重要的工具交互
4. **渐进式压缩**：对旧内容更积极
5. **透明操作**：用户几乎察觉不到压缩

### 系统常量

```javascript
const COMPACTION_THRESHOLD = 150000;  // 触发压缩前的Token数
const TARGET_SIZE_RATIO = 0.5;        // 压缩到原始大小的50%
const MIN_MESSAGES_TO_COMPACT = 10;   // 允许压缩前的最少消息数
```

### MicrocompactionManager 类

```javascript
class MicrocompactionManager {
  constructor(options = {}) {
    // 可配置阈值
    this.threshold = options.threshold || COMPACTION_THRESHOLD;
    this.targetRatio = options.targetRatio || TARGET_SIZE_RATIO;

    // 功能标志
    this.preserveToolCalls = options.preserveToolCalls !== false;

    // Token计数集成
    this.tokenManager = new TokenManager(options.model);
  }
}
```

## 微压缩算法

### 主压缩流程

核心算法编排整个压缩过程：

```javascript
async applyMicrocompaction(messages) {
  // 步骤1：检查是否需要压缩
  const tokenCount = this.tokenManager.estimateMessagesTokenCount(messages);
  if (tokenCount < this.threshold) {
    return null;  // 不需要压缩
  }

  // 步骤2：确保最少消息数
  if (messages.length < MIN_MESSAGES_TO_COMPACT) {
    return null;  // 消息太少无法进行有意义的压缩
  }

  // 步骤3：找到最佳边界点
  const boundary = this.findCompactionBoundary(messages);
  if (!boundary) {
    return null;  // 找不到合适的边界
  }

  // 步骤4：创建边界前消息的摘要
  const summary = await this.createSummary(
    messages.slice(0, boundary.index),
    boundary
  );

  // 步骤5：构建新的压缩消息列表
  const compactedMessages = [
    this.createBoundaryMarker(boundary),
    ...summary.messages,
    ...messages.slice(boundary.index)
  ];

  // 步骤6：计算并返回结果
  const newTokenCount = this.tokenManager.estimateMessagesTokenCount(compactedMessages);
  const savings = tokenCount - newTokenCount;

  return {
    messages: compactedMessages,
    originalCount: messages.length,
    compactedCount: compactedMessages.length,
    boundary: boundary,
    tokenSavings: savings,
    preCompactTokenCount: tokenCount,
    postCompactTokenCount: newTokenCount
  };
}
```

### 压缩触发器

多种条件可以触发压缩：

```javascript
needsCompaction(messages) {
  const tokenCount = this.tokenManager.estimateMessagesTokenCount(messages);

  // 主要触发器：超出token阈值
  const overTokenLimit = tokenCount >= this.threshold;

  // 次要触发器：消息数过多
  const overMessageLimit = messages.length > 500;

  // 必须有最少消息数
  const hasEnoughMessages = messages.length >= MIN_MESSAGES_TO_COMPACT;

  return (overTokenLimit || overMessageLimit) && hasEnoughMessages;
}
```

## 边界检测逻辑

### 智能边界查找

系统搜索分割对话的最佳点：

```javascript
findCompactionBoundary(messages) {
  // 基于比率计算目标索引
  const targetIndex = Math.floor(messages.length * this.targetRatio);

  let bestBoundary = null;
  let bestScore = -1;

  // 在目标索引周围搜索窗口
  const searchStart = Math.max(MIN_MESSAGES_TO_COMPACT, targetIndex - 5);
  const searchEnd = Math.min(messages.length - 5, targetIndex + 5);

  for (let i = searchStart; i <= searchEnd; i++) {
    const score = this.scoreBoundary(messages, i);

    if (score > bestScore) {
      bestScore = score;
      bestBoundary = {
        index: i,
        score: score,
        timestamp: Date.now()
      };
    }
  }

  return bestBoundary;
}
```

### 边界评分算法

每个潜在边界根据多个因素获得分数：

```javascript
scoreBoundary(messages, index) {
  let score = 100;  // 基础分数

  // 优先工具结果后的边界（+50分）
  if (messages[index - 1]?.type === 'user' &&
      messages[index - 1]?.content?.[0]?.type === 'tool_result') {
    score += 50;
  }

  // 优先助手消息后的边界（+30分）
  if (messages[index - 1]?.type === 'assistant') {
    score += 30;
  }

  // 严重惩罚工具序列中的边界（-100分）
  if (this.isInToolSequence(messages, index)) {
    score -= 100;
  }

  // 奖励自然对话断点（+20分）
  if (this.isConversationBreak(messages, index)) {
    score += 20;
  }

  // 惩罚错误附近的边界（-30分）
  if (this.hasNearbyErrors(messages, index)) {
    score -= 30;
  }

  // 奖励主题变化的边界（+25分）
  if (this.detectsTopicChange(messages, index)) {
    score += 25;
  }

  return score;
}
```

### 工具序列检测

对于保留工具调用/结果对至关重要：

```javascript
isInToolSequence(messages, index) {
  if (index === 0 || index >= messages.length) return false;

  const prev = messages[index - 1];
  const next = messages[index];

  // 模式1：工具使用 -> 工具结果
  if (prev?.type === 'assistant' &&
      prev?.content?.some(c => c.type === 'tool_use')) {
    if (next?.type === 'user' &&
        next?.content?.some(c => c.type === 'tool_result')) {
      return true;  // 永不分离工具使用和其结果
    }
  }

  // 模式2：链式工具调用
  if (prev?.content?.some(c => c.type === 'tool_result') &&
      next?.type === 'assistant' &&
      next?.content?.some(c => c.type === 'tool_use')) {
    // 检查工具结果是否输入到下一个工具
    const toolResultId = prev.content.find(c => c.type === 'tool_result')?.tool_use_id;
    const referencesResult = next.content.some(c =>
      c.type === 'text' && c.text?.includes(toolResultId)
    );

    if (referencesResult) {
      return true;  // 这些工具是相连的
    }
  }

  return false;
}
```

### 自然断点检测

识别对话主题变化：

```javascript
isConversationBreak(messages, index) {
  if (index === 0 || index >= messages.length) return false;

  const prev = messages[index - 1];
  const next = messages[index];

  // 模式1：用户 -> 用户（新问题）
  if (prev?.type === 'user' && next?.type === 'user') {
    return true;
  }

  // 模式2：长时间间隔（5+分钟）
  if (prev?.timestamp && next?.timestamp) {
    const gap = next.timestamp - prev.timestamp;
    if (gap > 300000) {
      return true;
    }
  }

  // 模式3：显式标记
  const nextText = this.extractText(next);
  const breakPhrases = [
    '新问题',
    '不同话题',
    '换个话题',
    '继续',
    '让我们切换'
  ];

  if (breakPhrases.some(phrase => nextText.toLowerCase().includes(phrase))) {
    return true;
  }

  return false;
}
```

## 摘要策略

### 消息分组

消息按类别分类进行有针对性的摘要：

```javascript
groupMessages(messages) {
  const groups = {
    userInputs: [],
    assistantResponses: [],
    toolCalls: [],
    errors: [],
    images: [],
    documents: []
  };

  for (const message of messages) {
    if (message.type === 'user') {
      for (const content of message.content || []) {
        switch (content.type) {
          case 'text':
            groups.userInputs.push(content.text);
            break;

          case 'tool_result':
            if (content.is_error) {
              groups.errors.push({
                tool_use_id: content.tool_use_id,
                error: content.content
              });
            }
            break;

          case 'image':
            groups.images.push({
              media_type: content.source.media_type,
              size: content.source.data.length
            });
            break;

          case 'document':
            groups.documents.push({
              media_type: content.source.media_type,
              size: content.source.data.length
            });
            break;
        }
      }
    } else if (message.type === 'assistant') {
      for (const content of message.content || []) {
        if (content.type === 'text') {
          groups.assistantResponses.push(content.text);
        } else if (content.type === 'tool_use') {
          groups.toolCalls.push({
            id: content.id,
            name: content.name,
            input: content.input
          });
        }
      }
    }
  }

  return groups;
}
```

### 摘要生成

创建简洁而信息丰富的摘要：

```javascript
async createSummary(messages, boundary) {
  const summaryMessages = [];
  const groups = this.groupMessages(messages);

  // 带元数据的系统摘要
  summaryMessages.push({
    type: 'system',
    content: this.createSystemSummary(groups, boundary)
  });

  // 如果相关，工具使用摘要
  if (this.preserveToolCalls && groups.toolCalls.length > 0) {
    const toolSummary = this.createToolSummary(groups.toolCalls);
    if (toolSummary) {
      summaryMessages.push(toolSummary);
    }
  }

  // 对话叙述摘要
  summaryMessages.push({
    type: 'assistant',
    content: [{
      type: 'text',
      text: this.createConversationSummary(groups)
    }]
  });

  // 保留关键信息
  const criticalInfo = this.extractCriticalInformation(messages);
  if (criticalInfo) {
    summaryMessages.push({
      type: 'system',
      content: criticalInfo
    });
  }

  return {
    messages: summaryMessages,
    attachments: [],
    hookResults: []
  };
}
```

### 系统摘要格式

关于压缩内容的结构化元数据：

```javascript
createSystemSummary(groups, boundary) {
  const lines = [
    '# 之前对话摘要',
    `在${new Date(boundary.timestamp).toISOString()}压缩了${boundary.index}条消息`,
    '',
    '## 统计信息',
    `- 用户输入: ${groups.userInputs.length}`,
    `- 助手回应: ${groups.assistantResponses.length}`,
    `- 工具调用: ${groups.toolCalls.length}`,
    `- 遇到的错误: ${groups.errors.length}`,
    `- 处理的图片: ${groups.images.length}`,
    `- 分析的文档: ${groups.documents.length}`,
    '',
    '## Token减少',
    `- 原始token: ~${this.estimateGroupTokens(groups)}`,
    `- 压缩至: ~${this.estimateSummaryTokens(groups)}`,
    `- 节省: ~${Math.round((1 - this.targetRatio) * 100)}%`
  ];

  return lines.join('\n');
}
```

### 工具摘要生成

保留工具使用模式：

```javascript
createToolSummary(toolCalls) {
  if (toolCalls.length === 0) return null;

  // 分析工具使用模式
  const toolStats = this.analyzeToolUsage(toolCalls);

  const summary = [
    '## 工具使用摘要',
    ''
  ];

  // 工具频率
  summary.push('### 频率');
  for (const [name, count] of Object.entries(toolStats.frequency)) {
    summary.push(`- ${name}: ${count} 次调用`);
  }
  summary.push('');

  // 常见操作
  if (toolStats.patterns.length > 0) {
    summary.push('### 常见模式');
    for (const pattern of toolStats.patterns) {
      summary.push(`- ${pattern.description}`);
    }
    summary.push('');
  }

  // 重要结果
  if (toolStats.notableResults.length > 0) {
    summary.push('### 关键结果');
    for (const result of toolStats.notableResults) {
      summary.push(`- ${result}`);
    }
  }

  return {
    type: 'system',
    content: summary.join('\n')
  };
}
```

### 对话叙述

对话流程的人类可读摘要：

```javascript
createConversationSummary(groups) {
  const summary = [];

  summary.push('## 对话摘要\n');

  // 用户请求摘要
  if (groups.userInputs.length > 0) {
    summary.push('### 用户请求');

    // 提取唯一主题
    const topics = this.extractTopics(groups.userInputs);
    for (const topic of topics.slice(0, 5)) {
      summary.push(`- ${topic}`);
    }

    if (topics.length > 5) {
      summary.push(`- ... 还有${topics.length - 5}个主题`);
    }
    summary.push('');
  }

  // 执行的操作摘要
  if (groups.toolCalls.length > 0) {
    summary.push('### 执行的操作');

    const actionSummary = this.summarizeActions(groups.toolCalls);
    for (const action of actionSummary) {
      summary.push(`- ${action}`);
    }
    summary.push('');
  }

  // 关键见解/结果
  if (groups.assistantResponses.length > 0) {
    summary.push('### 讨论的要点');

    const keyPoints = this.extractKeyPoints(groups.assistantResponses);
    for (const point of keyPoints.slice(0, 7)) {
      summary.push(`- ${point}`);
    }
    summary.push('');
  }

  // 错误摘要
  if (groups.errors.length > 0) {
    summary.push('### 已解决的问题');
    const errorTypes = this.categorizeErrors(groups.errors);
    for (const [type, count] of Object.entries(errorTypes)) {
      summary.push(`- ${type}: ${count}次出现`);
    }
  }

  return summary.join('\n');
}
```

## Token管理

### Token估算

准确的token计数对压缩决策至关重要：

```javascript
estimateMessagesTokenCount(messages) {
  let totalTokens = 0;

  for (const message of messages) {
    // 角色token（user/assistant/system）
    totalTokens += 3;

    // 内容token
    if (typeof message.content === 'string') {
      totalTokens += this.estimateStringTokens(message.content);
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        totalTokens += this.estimateBlockTokens(block);
      }
    }

    // 元数据token
    if (message.thinking) {
      totalTokens += this.estimateStringTokens(message.thinking);
    }

    // 格式化开销
    totalTokens += 4;  // 消息结构token
  }

  return totalTokens;
}

estimateStringTokens(text) {
  // 使用字符分析进行更准确的估算
  const baseTokens = Math.ceil(text.length / 4);

  // 调整代码块（更高的token密度）
  const codeBlocks = (text.match(/```/g) || []).length / 2;
  const codeAdjustment = codeBlocks * 50;

  // 调整URL（通常被视为单个token）
  const urls = (text.match(/https?:\/\/[^\s]+/g) || []).length;
  const urlAdjustment = urls * -10;

  // 调整重复模式（压缩）
  const repetitionFactor = this.calculateRepetition(text);
  const repetitionAdjustment = -Math.floor(baseTokens * repetitionFactor * 0.1);

  return baseTokens + codeAdjustment + urlAdjustment + repetitionAdjustment;
}
```

### 块Token估算

不同内容类型有不同的token成本：

```javascript
estimateBlockTokens(block) {
  switch (block.type) {
    case 'text':
      return this.estimateStringTokens(block.text || '');

    case 'tool_use':
      // 工具名称和结构
      let tokens = 10;
      // 工具输入
      tokens += this.estimateStringTokens(JSON.stringify(block.input));
      return tokens;

    case 'tool_result':
      // 结果结构
      let resultTokens = 5;
      // 结果内容
      resultTokens += this.estimateStringTokens(block.content || '');
      return resultTokens;

    case 'image':
      // 图片有固定的token成本，无论大小如何
      return 765;  // 视觉模型的近似值

    case 'document':
      // PDF被处理成token
      const pageEstimate = Math.ceil(block.source.data.length / 50000);
      return pageEstimate * 1000;

    default:
      return 10;  // 未知类型的保守估计
  }
}
```

### 压缩比计算

监控压缩效果：

```javascript
calculateCompressionRatio(original, compressed) {
  const originalTokens = this.estimateMessagesTokenCount(original);
  const compressedTokens = this.estimateMessagesTokenCount(compressed);

  return {
    ratio: compressedTokens / originalTokens,
    savings: originalTokens - compressedTokens,
    percentage: ((1 - (compressedTokens / originalTokens)) * 100).toFixed(1)
  };
}
```

## 工具调用保留

### 关键工具识别

某些工具调用必须详细保留：

```javascript
identifyCriticalTools(toolCalls) {
  const critical = [];

  for (const tool of toolCalls) {
    // 文件修改是关键的
    if (['Write', 'Edit', 'MultiEdit', 'Delete'].includes(tool.name)) {
      critical.push({
        ...tool,
        reason: 'file_modification'
      });
    }

    // 系统更改是关键的
    if (tool.name === 'Bash' && this.isSystemChange(tool.input)) {
      critical.push({
        ...tool,
        reason: 'system_change'
      });
    }

    // 失败的工具需要保留上下文
    if (tool.error || tool.is_error) {
      critical.push({
        ...tool,
        reason: 'error_context'
      });
    }
  }

  return critical;
}

isSystemChange(bashInput) {
  const systemCommands = [
    'npm install',
    'pip install',
    'apt-get',
    'brew install',
    'git clone',
    'git commit',
    'docker',
    'systemctl'
  ];

  const command = bashInput.command || bashInput;
  return systemCommands.some(cmd => command.includes(cmd));
}
```

### 工具结果保留

维护重要的工具输出：

```javascript
preserveToolResults(messages, criticalTools) {
  const preserved = [];
  const criticalIds = new Set(criticalTools.map(t => t.id));

  for (const message of messages) {
    if (message.type === 'user' && message.content) {
      for (const content of message.content) {
        if (content.type === 'tool_result' &&
            criticalIds.has(content.tool_use_id)) {
          // 完整保留关键工具结果
          preserved.push({
            type: 'system',
            content: `[保留的工具结果: ${content.tool_use_id}]\n${content.content}`
          });
        }
      }
    }
  }

  return preserved;
}
```

## 性能优化

### 增量压缩

渐进式压缩以避免大型操作：

```javascript
class IncrementalCompactor {
  constructor() {
    this.compactionHistory = [];
    this.lastCompactionIndex = 0;
  }

  async performIncremental(messages) {
    // 只压缩未压缩的部分
    const newMessages = messages.slice(this.lastCompactionIndex);

    if (newMessages.length < MIN_MESSAGES_TO_COMPACT) {
      return null;
    }

    // 压缩新消息
    const result = await this.compact(newMessages);

    if (result) {
      // 与先前压缩的合并
      const merged = [
        ...messages.slice(0, this.lastCompactionIndex),
        ...result.messages
      ];

      this.lastCompactionIndex = merged.length - newMessages.length + result.boundary.index;
      this.compactionHistory.push({
        timestamp: Date.now(),
        messagesCompacted: result.originalCount,
        tokensSaved: result.tokenSavings
      });

      return merged;
    }

    return null;
  }
}
```

### 缓存Token计数

避免重新计算未更改的消息：

```javascript
class CachedTokenCounter {
  constructor() {
    this.cache = new Map();
    this.version = 0;
  }

  getTokenCount(message) {
    const key = this.getMessageKey(message);

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const count = this.calculateTokenCount(message);
    this.cache.set(key, count);

    // 限制缓存大小
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    return count;
  }

  getMessageKey(message) {
    // 为消息创建稳定键
    return `${message.type}:${message.timestamp}:${this.hashContent(message.content)}`;
  }

  invalidate() {
    this.cache.clear();
    this.version++;
  }
}
```

### 并行摘要生成

加速摘要创建：

```javascript
async createParallelSummaries(groups) {
  const summaryTasks = [];

  // 并行生成摘要
  if (groups.userInputs.length > 0) {
    summaryTasks.push(this.summarizeUserInputs(groups.userInputs));
  }

  if (groups.toolCalls.length > 0) {
    summaryTasks.push(this.summarizeToolCalls(groups.toolCalls));
  }

  if (groups.assistantResponses.length > 0) {
    summaryTasks.push(this.summarizeAssistantResponses(groups.assistantResponses));
  }

  const summaries = await Promise.all(summaryTasks);

  // 合并摘要
  return this.combineSummaries(summaries);
}
```

## 实际场景

### 场景1：长时间调试会话

需要智能压缩的带有许多工具调用的调试会话：

```javascript
// 压缩前：180,000个token
const messages = [
  { type: 'user', content: '调试认证系统' },
  // ... 200+条调试消息，包含Read、Search、Edit工具
  { type: 'assistant', content: '在auth.js第42行找到问题' }
];

// 压缩保留关键信息
const compacted = await microcompactor.applyMicrocompaction(messages);

// 压缩后：90,000个token
compacted.messages = [
  {
    type: 'system',
    content: `# 之前对话摘要
    在200条消息中调试认证系统
    - 检查了45个文件
    - 运行了23次搜索
    - 进行了8次编辑修复问题`
  },
  {
    type: 'system',
    content: `## 保留的关键更改
    - 编辑: auth.js 第42行 - 修复token验证
    - 编辑: middleware.js 第78行 - 添加错误处理
    - 编辑: config.js 第15行 - 更新JWT密钥处理`
  },
  // 最后30条消息完整保留
];
```

### 场景2：多主题对话

自然断点使清洁压缩成为可能：

```javascript
// 有明确主题变化的对话
const messages = [
  // 主题1：设置项目（50条消息）
  { type: 'user', content: '帮我设置一个新的React项目' },
  // ... 设置消息 ...

  // 检测到自然断点
  { type: 'user', content: '太好了！现在让我们处理API' },

  // 主题2：API开发（60条消息）
  // ... API消息 ...

  // 另一个自然断点
  { type: 'user', content: '完美。继续测试' },

  // 主题3：测试（40条消息）
  // ... 测试消息 ...
];

// 在自然边界处压缩
const boundary = microcompactor.findCompactionBoundary(messages);
// 在"太好了！现在让我们处理API"之后选择边界
// 保留当前主题（测试）的完整上下文
```

### 场景3：错误恢复会话

错误及其解决方案被仔细保留：

```javascript
const errorSession = [
  { type: 'user', content: '运行测试套件' },
  {
    type: 'assistant',
    content: [{
      type: 'tool_use',
      name: 'Bash',
      input: { command: 'npm test' }
    }]
  },
  {
    type: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: 'tool_123',
      content: '错误：找不到模块',
      is_error: true
    }]
  },
  // ... 调试和修复 ...
];

// 压缩保留错误上下文
const compacted = {
  type: 'system',
  content: `## 遇到并解决的错误
  - 测试套件中的模块未找到错误
    解决方案：安装缺失的依赖项
  - 测试失败：最初5个，全部修复
    关键修复：更新模拟，修复异步处理`
};
```

## 高级功能

### 语义聚类

将相关消息分组以获得更好的摘要：

```javascript
clusterMessages(messages) {
  const clusters = [];
  let currentCluster = [];
  let currentTopic = null;

  for (const message of messages) {
    const topic = this.detectTopic(message);

    if (topic !== currentTopic && currentCluster.length > 0) {
      clusters.push({
        topic: currentTopic,
        messages: currentCluster,
        tokenCount: this.estimateMessagesTokenCount(currentCluster)
      });
      currentCluster = [];
    }

    currentCluster.push(message);
    currentTopic = topic;
  }

  // 添加最终聚类
  if (currentCluster.length > 0) {
    clusters.push({
      topic: currentTopic,
      messages: currentCluster,
      tokenCount: this.estimateMessagesTokenCount(currentCluster)
    });
  }

  return clusters;
}
```

### 自适应压缩比

根据内容类型调整压缩：

```javascript
determineCompressionRatio(messages) {
  const analysis = this.analyzeContent(messages);

  let ratio = this.targetRatio;

  // 代码密集对话的较少压缩
  if (analysis.codePercentage > 0.5) {
    ratio = Math.min(0.7, ratio + 0.2);
  }

  // 聊天密集对话的更多压缩
  if (analysis.chatPercentage > 0.7) {
    ratio = Math.max(0.3, ratio - 0.2);
  }

  // 错误密集会话保留更多
  if (analysis.errorRate > 0.1) {
    ratio = Math.min(0.6, ratio + 0.1);
  }

  return ratio;
}
```

### 重要性评分

确定哪些消息要详细保留：

```javascript
scoreMessageImportance(message, context) {
  let score = 0;

  // 用户消息很重要
  if (message.type === 'user') {
    score += 30;
  }

  // 错误消息是关键的
  if (this.containsError(message)) {
    score += 50;
  }

  // 带有代码的消息有价值
  if (this.containsCode(message)) {
    score += 20;
  }

  // 最近的消息更重要
  const age = Date.now() - (message.timestamp || 0);
  const recencyBonus = Math.max(0, 30 - Math.floor(age / 60000));
  score += recencyBonus;

  // 后续引用的消息重要
  if (context.referencedMessageIds.has(message.id)) {
    score += 40;
  }

  return score;
}
```

## 与对话流程的集成

### 自动触发

压缩无缝集成到对话流程中：

```javascript
// 在ConversationLoop中
async processUserInput(input, precedingBlocks = []) {
  const userMessage = this.createUserMessage(input, precedingBlocks);
  this.messages.push(userMessage);

  // 自动压缩检查
  const tokenCount = await this.estimateTokenCount();
  if (tokenCount > AUTO_COMPACT_THRESHOLD) {
    this.emit('compaction:needed', { tokenCount });

    // 透明执行压缩
    await this.performAutoCompaction();

    this.emit('compaction:complete', {
      newTokenCount: await this.estimateTokenCount()
    });
  }

  // 继续正常流程
  return await this.queryAssistant();
}
```

### 用户通知

关于压缩的可选通知：

```javascript
// UI可以监听压缩事件
conversationLoop.on('compaction:start', () => {
  ui.showNotification('正在优化对话内存...');
});

conversationLoop.on('compaction:complete', ({ originalCount, newCount }) => {
  ui.showNotification(`已将${originalCount}条消息压缩为${newCount}条`);
});
```

## 性能指标

### 压缩性能

- **边界检测**：500条消息5-20ms
- **摘要生成**：根据内容50-200ms
- **Token计数**：500条消息10-30ms
- **总压缩**：通常100-500ms

### 内存影响

- **压缩前**：大对话5-10MB
- **压缩后**：1-3MB（减少50-70%）
- **缓存开销**：token计数缓存<500KB

### 压缩效果

- **平均压缩**：50-60%的token减少
- **最佳情况**：重复对话70-80%
- **最差情况**：多样化、代码密集会话30-40%

## 结论

通过微压缩的上下文管理系统代表了对有限上下文窗口这一根本挑战的复杂解决方案。通过智能识别自然边界、保留关键信息和生成语义摘要，它使得对话能够有效地无限期持续。系统对工具调用、错误和对话模式的感知确保压缩永远不会失去基本上下文，而其性能优化使过程对用户透明。压缩和保留的这种优雅平衡使得与Claude的长期、复杂对话既成为可能又实用。