/**
 * Task Tool
 * Launch autonomous agent tasks
 */

import { performance } from 'perf_hooks';

// Input schema for Task
const taskSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'A short (3-5 word) description of the task'
    },
    prompt: {
      type: 'string',
      description: 'The task for the agent to perform'
    },
    subagent_type: {
      type: 'string',
      description: 'The type of specialized agent to use for this task'
    }
  },
  required: ['description', 'prompt', 'subagent_type']
};

// Available agent types
const AGENT_TYPES = {
  'general-purpose': {
    description: 'General-purpose agent for researching complex questions',
    tools: ['*'],
    model: 'claude-3-5-sonnet-20241022'
  },
  'statusline-setup': {
    description: 'Configure Claude Code status line setting',
    tools: ['Read', 'Edit'],
    model: 'claude-3-haiku-20240307'
  },
  'output-style-setup': {
    description: 'Create Claude Code output style',
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    model: 'claude-3-haiku-20240307'
  },
  'code-reviewer': {
    description: 'Review code for quality and issues',
    tools: ['Read', 'Grep'],
    model: 'claude-3-5-sonnet-20241022'
  },
  'test-runner': {
    description: 'Run tests and report results',
    tools: ['Bash', 'Read'],
    model: 'claude-3-haiku-20240307'
  }
};

/**
 * Get task configuration
 */
async function getTaskConfiguration(subagentType) {
  const config = AGENT_TYPES[subagentType];
  if (!config) {
    throw new Error(`Unknown subagent type: ${subagentType}`);
  }

  return {
    source: 'built-in',
    model: config.model,
    tools: config.tools,
    systemPrompt: buildAgentSystemPrompt(subagentType),
    color: getAgentColor(subagentType)
  };
}

/**
 * Build system prompt for agent
 */
function buildAgentSystemPrompt(subagentType) {
  const basePrompt = `You are a specialized ${subagentType} agent.
You have been given a specific task to complete autonomously.
Focus on the task at hand and complete it efficiently.`;

  const agentSpecific = {
    'general-purpose': `
You can use any available tools to research and answer questions.
Be thorough in your investigation and provide comprehensive answers.`,

    'code-reviewer': `
Review the code for:
- Bugs and potential issues
- Code quality and best practices
- Performance concerns
- Security vulnerabilities
Provide constructive feedback with specific suggestions.`,

    'test-runner': `
Run the appropriate test commands and report:
- Test results (pass/fail)
- Coverage information
- Any errors or failures
- Suggestions for fixing failures`,

    'statusline-setup': `
Configure the Claude Code status line by:
- Reading the current configuration
- Understanding user preferences
- Updating the configuration appropriately`,

    'output-style-setup': `
Create or update Claude Code output styles by:
- Understanding the desired format
- Creating appropriate style templates
- Ensuring compatibility with existing styles`
  };

  return basePrompt + (agentSpecific[subagentType] || '');
}

/**
 * Get agent color for UI
 */
function getAgentColor(subagentType) {
  const colors = {
    'general-purpose': 'blue',
    'code-reviewer': 'yellow',
    'test-runner': 'green',
    'statusline-setup': 'cyan',
    'output-style-setup': 'magenta'
  };
  return colors[subagentType] || 'white';
}

/**
 * Select appropriate model
 */
function selectModel(configModel, mainLoopModel) {
  return configModel || mainLoopModel || 'claude-3-5-sonnet-20241022';
}

/**
 * Resolve tools for agent
 */
function resolveTools(configTools, availableTools, source) {
  if (!configTools || configTools.includes('*')) {
    return { resolvedTools: availableTools };
  }

  const resolved = [];
  for (const toolName of configTools) {
    const tool = availableTools.find(t => t.name === toolName);
    if (tool) {
      resolved.push(tool);
    }
  }

  return { resolvedTools: resolved };
}

/**
 * Execute task
 */
async function* executeTask(config) {
  // This would integrate with the actual task execution system
  // For now, return a mock execution
  yield {
    type: 'progress',
    data: { message: 'Starting task execution...' }
  };

  // Simulate task execution
  await new Promise(resolve => setTimeout(resolve, 100));

  yield {
    type: 'assistant',
    content: [{
      type: 'text',
      text: 'Task completed successfully.'
    }],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0
    }
  };
}

/**
 * Calculate max thinking tokens
 */
function calculateMaxThinkingTokens(messages) {
  // Base calculation on message complexity
  const messageCount = messages.length;
  const hasTools = messages.some(m =>
    m.content?.some(c => c.type === 'tool_use')
  );

  if (hasTools) return 50000;
  if (messageCount > 10) return 30000;
  return 15000;
}

/**
 * Task tool definition
 */
const TaskTool = {
  name: 'Task',
  description: 'Launch a new agent to handle complex tasks autonomously',
  inputSchema: taskSchema,

  async validateInput({ description, prompt, subagent_type }) {
    if (!description || description.split(' ').length > 10) {
      return {
        result: false,
        errorMessage: 'Description must be 3-10 words'
      };
    }

    if (!prompt) {
      return {
        result: false,
        errorMessage: 'Prompt is required'
      };
    }

    if (!subagent_type || !AGENT_TYPES[subagent_type]) {
      return {
        result: false,
        errorMessage: `Invalid subagent_type. Must be one of: ${Object.keys(AGENT_TYPES).join(', ')}`
      };
    }

    return { result: true };
  },

  async checkPermissions(input) {
    return {
      behavior: 'allow',
      updatedInput: input
    };
  },

  async *call(input, context) {
    const startTime = Date.now();
    const { description, prompt, subagent_type } = input;

    // Get task configuration
    const taskConfig = await getTaskConfiguration(subagent_type);

    // Select model and tools
    const model = selectModel(
      taskConfig.model,
      context.options?.mainLoopModel
    );
    const { resolvedTools } = resolveTools(
      taskConfig.tools,
      context.options?.tools || [],
      taskConfig.source
    );

    // Build messages
    const messages = [{
      role: 'user',
      content: prompt
    }];

    // Execute task
    let resultMessages = [];
    let totalToolUseCount = 0;
    let responseContent = '';

    for await (const message of executeTask({
      messages,
      model,
      tools: resolvedTools,
      abortController: context.abortController,
      options: context.options
    })) {
      if (message.type === 'progress') {
        yield {
          type: 'progress',
          data: message.data
        };
      } else if (message.type === 'assistant') {
        resultMessages.push(message);

        // Extract text content
        for (const content of message.content || []) {
          if (content.type === 'text') {
            responseContent += content.text;
          } else if (content.type === 'tool_use') {
            totalToolUseCount++;
          }
        }
      }
    }

    // Calculate token usage
    const lastMessage = resultMessages[resultMessages.length - 1];
    const totalTokens = lastMessage?.usage ?
      (lastMessage.usage.cache_creation_input_tokens || 0) +
      lastMessage.usage.input_tokens +
      lastMessage.usage.output_tokens :
      null;

    yield {
      type: 'result',
      data: {
        content: responseContent,
        totalDurationMs: Date.now() - startTime,
        totalTokens,
        totalToolUseCount,
        subagent_type,
        description
      }
    };
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    const summary = [
      `Agent: ${data.subagent_type}`,
      `Task: ${data.description}`,
      `Tools used: ${data.totalToolUseCount}`,
      `Duration: ${Math.round(data.totalDurationMs / 1000)}s`,
      '',
      'Result:',
      data.content
    ].join('\n');

    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: summary
    };
  },

  async prompt({ tools }) {
    return buildTaskPrompt(tools);
  },

  userFacingName() {
    return 'Task';
  },

  isEnabled() {
    return true;
  },

  isConcurrencySafe() {
    return true;
  },

  isReadOnly() {
    return true;
  }
};

/**
 * Build task prompt
 */
function buildTaskPrompt(tools) {
  const availableAgents = Object.entries(AGENT_TYPES)
    .map(([type, config]) => `- ${type}: ${config.description}`)
    .join('\n');

  return `Available agent types:
${availableAgents}

Choose the appropriate agent type based on the task requirements.`;
}

export {
  TaskTool,
  AGENT_TYPES,
  getTaskConfiguration,
  buildAgentSystemPrompt,
  calculateMaxThinkingTokens,
  executeTask
};