/**
 * Agent Execution System for Claude Code
 * Parallel task execution and agent orchestration
 * Reconstructed from Task tool and execution patterns
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { getLogger } from '../utils/logging.js';
import { AGENT_TYPES, getTaskConfiguration, buildAgentSystemPrompt } from '../tools/task.js';
import { ErrorRecoveryManager } from '../error/error-recovery.js';

/**
 * Task states
 */
export const TaskState = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Task priority levels
 */
export const TaskPriority = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3
};

/**
 * Individual task representation
 */
export class Task {
  constructor(options) {
    this.id = options.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = options.type || 'general-purpose';
    this.description = options.description;
    this.prompt = options.prompt;
    this.priority = options.priority || TaskPriority.NORMAL;
    this.dependencies = options.dependencies || [];
    this.state = TaskState.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.attempts = 0;
    this.maxAttempts = options.maxAttempts || 3;
    this.metadata = options.metadata || {};
    this.onProgress = options.onProgress;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  /**
   * Get task duration
   */
  getDuration() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  /**
   * Check if task can run
   */
  canRun(completedTasks = new Set()) {
    return this.dependencies.every(dep => completedTasks.has(dep));
  }

  /**
   * Update task state
   */
  setState(state) {
    this.state = state;
    if (state === TaskState.RUNNING && !this.startTime) {
      this.startTime = Date.now();
    }
    if ([TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED].includes(state)) {
      this.endTime = Date.now();
    }
  }

  /**
   * Convert to serializable object
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      state: this.state,
      priority: this.priority,
      dependencies: this.dependencies,
      duration: this.getDuration(),
      attempts: this.attempts,
      result: this.result,
      error: this.error,
      metadata: this.metadata
    };
  }
}

/**
 * Task queue for managing execution order
 */
export class TaskQueue {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency || 5;
    this.queue = [];
    this.running = new Set();
    this.completed = new Set();
    this.failed = new Set();
  }

  /**
   * Add task to queue
   */
  enqueue(task) {
    // Insert based on priority
    const insertIndex = this.queue.findIndex(t => t.priority < task.priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }
    task.setState(TaskState.QUEUED);
  }

  /**
   * Get next runnable task
   */
  dequeue() {
    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      if (task.canRun(this.completed)) {
        this.queue.splice(i, 1);
        return task;
      }
    }
    return null;
  }

  /**
   * Check if can run more tasks
   */
  canRunMore() {
    return this.running.size < this.maxConcurrency;
  }

  /**
   * Mark task as running
   */
  markRunning(task) {
    this.running.add(task.id);
    task.setState(TaskState.RUNNING);
  }

  /**
   * Mark task as completed
   */
  markCompleted(task) {
    this.running.delete(task.id);
    this.completed.add(task.id);
    task.setState(TaskState.COMPLETED);
  }

  /**
   * Mark task as failed
   */
  markFailed(task) {
    this.running.delete(task.id);
    this.failed.add(task.id);
    task.setState(TaskState.FAILED);
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      total: this.queue.length + this.running.size + this.completed.size + this.failed.size
    };
  }
}

/**
 * Agent executor for running individual agents
 */
export class AgentExecutor {
  constructor(options = {}) {
    this.logger = options.logger || getLogger('agent-executor');
    this.tools = options.tools || [];
    this.apiClient = options.apiClient;
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.maxThinkingTokens = options.maxThinkingTokens || 15000;
  }

  /**
   * Execute agent task
   */
  async execute(task) {
    this.logger.info(`Executing agent task: ${task.id}`, { type: task.type, description: task.description });

    try {
      // Get agent configuration
      const config = await getTaskConfiguration(task.type);

      // Select model
      const model = config.model || this.model;

      // Resolve tools
      const tools = this.resolveTools(config.tools);

      // Build system prompt
      const systemPrompt = buildAgentSystemPrompt(task.type);

      // Build messages
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: task.prompt
        }
      ];

      // Execute with API client
      const response = await this.executeWithAPI({
        messages,
        model,
        tools,
        maxTokens: this.maxThinkingTokens,
        onProgress: task.onProgress
      });

      // Process response
      const result = this.processResponse(response);

      this.logger.info(`Agent task completed: ${task.id}`, { duration: task.getDuration() });

      return result;

    } catch (error) {
      this.logger.error(`Agent task failed: ${task.id}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Resolve tools for agent
   */
  resolveTools(configTools) {
    if (!configTools || configTools.includes('*')) {
      return this.tools;
    }

    return this.tools.filter(tool => configTools.includes(tool.name));
  }

  /**
   * Execute with API client
   */
  async executeWithAPI(options) {
    // This would integrate with the actual Anthropic client
    // For now, return a mock response
    const startTime = Date.now();

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      content: 'Task completed successfully',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      duration: Date.now() - startTime
    };
  }

  /**
   * Process API response
   */
  processResponse(response) {
    return {
      content: response.content,
      tokens: response.usage,
      duration: response.duration
    };
  }
}

/**
 * Parallel agent orchestrator
 */
export class ParallelAgentOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || getLogger('agent-orchestrator');
    this.queue = new TaskQueue(options.queue);
    this.executor = new AgentExecutor(options.executor);
    this.errorRecovery = new ErrorRecoveryManager(options.errorRecovery);
    this.tasks = new Map();
    this.isRunning = false;
    this.abortController = null;
  }

  /**
   * Create and add task
   */
  createTask(options) {
    const task = new Task(options);
    this.tasks.set(task.id, task);
    this.queue.enqueue(task);
    this.emit('task:created', task);
    return task;
  }

  /**
   * Create multiple parallel tasks
   */
  createParallelTasks(taskOptions) {
    const tasks = taskOptions.map(options => this.createTask(options));
    this.logger.info(`Created ${tasks.length} parallel tasks`);
    return tasks;
  }

  /**
   * Create sequential tasks with dependencies
   */
  createSequentialTasks(taskOptions) {
    const tasks = [];
    let previousTaskId = null;

    for (const options of taskOptions) {
      if (previousTaskId) {
        options.dependencies = [previousTaskId];
      }
      const task = this.createTask(options);
      tasks.push(task);
      previousTaskId = task.id;
    }

    this.logger.info(`Created ${tasks.length} sequential tasks`);
    return tasks;
  }

  /**
   * Start processing tasks
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Orchestrator already running');
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.emit('orchestrator:started');

    this.logger.info('Starting agent orchestrator');

    while (this.isRunning && !this.abortController.signal.aborted) {
      // Check if we can run more tasks
      if (this.queue.canRunMore()) {
        const task = this.queue.dequeue();

        if (task) {
          // Run task without waiting
          this.runTask(task).catch(error => {
            this.logger.error(`Task execution error: ${task.id}`, { error });
          });
        } else if (this.queue.running.size === 0) {
          // No tasks running and none can start
          break;
        }
      }

      // Small delay to prevent CPU spinning
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isRunning = false;
    this.emit('orchestrator:stopped');
    this.logger.info('Agent orchestrator stopped');
  }

  /**
   * Run individual task
   */
  async runTask(task) {
    this.queue.markRunning(task);
    this.emit('task:started', task);

    try {
      // Execute with retry logic
      const result = await this.errorRecovery.executeWithRetry(
        async (attempt) => {
          task.attempts = attempt + 1;
          return await this.executor.execute(task);
        },
        {
          maxRetries: task.maxAttempts - 1,
          onRetry: (attempt, error) => {
            this.logger.warn(`Retrying task ${task.id}`, { attempt, error: error.message });
            this.emit('task:retry', { task, attempt, error });
          }
        }
      );

      // Success
      task.result = result;
      this.queue.markCompleted(task);
      this.emit('task:completed', task);

      if (task.onComplete) {
        task.onComplete(result);
      }

    } catch (error) {
      // Failure
      task.error = error;
      this.queue.markFailed(task);
      this.emit('task:failed', { task, error });

      if (task.onError) {
        task.onError(error);
      }
    }
  }

  /**
   * Stop processing
   */
  stop() {
    if (!this.isRunning) return;

    this.logger.info('Stopping agent orchestrator');
    this.isRunning = false;

    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Wait for all tasks to complete
   */
  async waitForCompletion(timeout = 300000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const stats = this.queue.getStats();

        if (stats.running === 0 && stats.queued === 0) {
          clearInterval(checkInterval);
          resolve(stats);
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error('Timeout waiting for tasks to complete'));
        }
      }, 1000);
    });
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    const stats = this.queue.getStats();
    const tasks = this.getAllTasks();

    return {
      isRunning: this.isRunning,
      stats,
      tasks: tasks.map(t => t.toJSON())
    };
  }

  /**
   * Clear completed tasks
   */
  clearCompleted() {
    for (const [id, task] of this.tasks) {
      if (task.state === TaskState.COMPLETED) {
        this.tasks.delete(id);
      }
    }
  }
}

/**
 * Create agent orchestrator instance
 */
export function createAgentOrchestrator(options) {
  return new ParallelAgentOrchestrator(options);
}

/**
 * Execute tasks in parallel
 */
export async function executeInParallel(taskOptions, orchestratorOptions) {
  const orchestrator = createAgentOrchestrator(orchestratorOptions);

  // Create parallel tasks
  const tasks = orchestrator.createParallelTasks(taskOptions);

  // Start processing
  await orchestrator.start();

  // Wait for completion
  await orchestrator.waitForCompletion();

  // Return results
  return tasks.map(task => ({
    id: task.id,
    result: task.result,
    error: task.error,
    state: task.state
  }));
}

/**
 * Execute tasks sequentially
 */
export async function executeSequentially(taskOptions, orchestratorOptions) {
  const orchestrator = createAgentOrchestrator({
    ...orchestratorOptions,
    queue: { maxConcurrency: 1 }
  });

  // Create sequential tasks
  const tasks = orchestrator.createSequentialTasks(taskOptions);

  // Start processing
  await orchestrator.start();

  // Wait for completion
  await orchestrator.waitForCompletion();

  // Return results
  return tasks.map(task => ({
    id: task.id,
    result: task.result,
    error: task.error,
    state: task.state
  }));
}

export default {
  Task,
  TaskState,
  TaskPriority,
  TaskQueue,
  AgentExecutor,
  ParallelAgentOrchestrator,
  createAgentOrchestrator,
  executeInParallel,
  executeSequentially
};