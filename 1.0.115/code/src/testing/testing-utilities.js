/**
 * Testing Utilities for Claude Code
 * Code validation, linting integration, and test execution support
 * Extracted from validation patterns and testing-related functionality
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getLogger } from '../utils/logging.js';
import { ErrorRecoveryManager } from '../error/error-recovery.js';

/**
 * Supported linters
 * Original: lines 30942-30948
 */
export const SUPPORTED_LINTERS = [
  'eslint',
  'eslint-plugin',
  'tslint',
  'prettier',
  'stylelint',
  'jshint',
  'standardjs',
  'rubocop',
  'pylint',
  'flake8',
  'mypy',
  'ruff',
  'black',
  'rustfmt',
  'clippy'
];

/**
 * Test runner types
 */
export const TestRunnerType = {
  JEST: 'jest',
  MOCHA: 'mocha',
  VITEST: 'vitest',
  PYTEST: 'pytest',
  RSPEC: 'rspec',
  GO_TEST: 'go test',
  CARGO_TEST: 'cargo test',
  NPM_TEST: 'npm test',
  CUSTOM: 'custom'
};

/**
 * Validation result
 */
export class ValidationResult {
  constructor(isValid, errors = [], warnings = []) {
    this.isValid = isValid;
    this.errors = errors;
    this.warnings = warnings;
    this.timestamp = Date.now();
  }

  hasErrors() {
    return this.errors.length > 0;
  }

  hasWarnings() {
    return this.warnings.length > 0;
  }

  getFormattedOutput() {
    const output = [];

    if (this.errors.length > 0) {
      output.push('Errors:');
      this.errors.forEach(err => {
        output.push(`  - ${err.message} (${err.file}:${err.line}:${err.column})`);
      });
    }

    if (this.warnings.length > 0) {
      output.push('Warnings:');
      this.warnings.forEach(warn => {
        output.push(`  - ${warn.message} (${warn.file}:${warn.line}:${warn.column})`);
      });
    }

    return output.join('\n');
  }
}

/**
 * Code validator
 * Validates code syntax and structure
 */
export class CodeValidator {
  constructor() {
    this.logger = getLogger('code-validator');
    this.validators = new Map();
    this.setupDefaultValidators();
  }

  /**
   * Setup default validators
   */
  setupDefaultValidators() {
    // JavaScript/TypeScript validator
    this.registerValidator('javascript', async (code, options) => {
      try {
        // Basic syntax check using Function constructor
        if (!options?.skipSyntaxCheck) {
          new Function(code);
        }
        return new ValidationResult(true);
      } catch (error) {
        return new ValidationResult(false, [{
          message: error.message,
          line: this.extractLineNumber(error.stack),
          column: 0,
          file: options?.filename || 'unknown'
        }]);
      }
    });

    // JSON validator
    this.registerValidator('json', async (code, options) => {
      try {
        JSON.parse(code);
        return new ValidationResult(true);
      } catch (error) {
        return new ValidationResult(false, [{
          message: error.message,
          line: 0,
          column: 0,
          file: options?.filename || 'unknown'
        }]);
      }
    });

    // Python validator (basic)
    this.registerValidator('python', async (code, options) => {
      // Check for obvious syntax errors
      const indentationErrors = this.checkPythonIndentation(code);
      if (indentationErrors.length > 0) {
        return new ValidationResult(false, indentationErrors);
      }
      return new ValidationResult(true);
    });
  }

  /**
   * Register a validator
   */
  registerValidator(language, validator) {
    this.validators.set(language, validator);
  }

  /**
   * Validate code
   */
  async validate(code, language, options = {}) {
    const validator = this.validators.get(language);
    if (!validator) {
      this.logger.warn(`No validator for language: ${language}`);
      return new ValidationResult(true);
    }

    try {
      return await validator(code, options);
    } catch (error) {
      this.logger.error('Validation error', { error, language });
      return new ValidationResult(false, [{
        message: `Validation failed: ${error.message}`,
        line: 0,
        column: 0,
        file: options.filename || 'unknown'
      }]);
    }
  }

  /**
   * Check Python indentation
   */
  checkPythonIndentation(code) {
    const errors = [];
    const lines = code.split('\n');
    let expectedIndent = 0;
    const indentStack = [0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('#')) continue;

      const currentIndent = line.length - line.trimStart().length;

      if (trimmed.endsWith(':')) {
        indentStack.push(currentIndent + 4);
        expectedIndent = currentIndent + 4;
      } else if (currentIndent < indentStack[indentStack.length - 1]) {
        while (indentStack.length > 1 && indentStack[indentStack.length - 1] > currentIndent) {
          indentStack.pop();
        }

        if (currentIndent !== indentStack[indentStack.length - 1]) {
          errors.push({
            message: 'Indentation error',
            line: i + 1,
            column: 0,
            file: 'code'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Extract line number from error stack
   */
  extractLineNumber(stack) {
    const match = stack?.match(/<anonymous>:(\d+):/);
    return match ? parseInt(match[1]) : 0;
  }
}

/**
 * Linter integration
 * Integrates with various linting tools
 */
export class LinterIntegration extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.logger = getLogger('linter-integration');
    this.linters = new Map();
    this.setupDefaultLinters();
  }

  /**
   * Setup default linters
   * Original: isLinterDiagnostic pattern
   */
  setupDefaultLinters() {
    // ESLint configuration
    this.linters.set('eslint', {
      command: 'npx eslint',
      args: ['--format', 'json'],
      parser: this.parseESLintOutput
    });

    // Prettier
    this.linters.set('prettier', {
      command: 'npx prettier',
      args: ['--check'],
      parser: this.parsePrettierOutput
    });

    // TSLint (deprecated but still supported)
    this.linters.set('tslint', {
      command: 'npx tslint',
      args: ['--format', 'json'],
      parser: this.parseTSLintOutput
    });

    // Python linters
    this.linters.set('pylint', {
      command: 'pylint',
      args: ['--output-format=json'],
      parser: this.parsePylintOutput
    });

    this.linters.set('ruff', {
      command: 'ruff',
      args: ['check', '--format=json'],
      parser: this.parseRuffOutput
    });

    // Rust linters
    this.linters.set('clippy', {
      command: 'cargo clippy',
      args: ['--message-format=json'],
      parser: this.parseClippyOutput
    });
  }

  /**
   * Run linter
   */
  async runLinter(linterName, files, options = {}) {
    const linter = this.linters.get(linterName);
    if (!linter) {
      throw new Error(`Unknown linter: ${linterName}`);
    }

    this.emit('linter:start', { linter: linterName, files });

    try {
      const command = this.buildCommand(linter, files, options);
      const output = await this.executeCommand(command);
      const results = linter.parser.call(this, output);

      this.emit('linter:complete', { linter: linterName, results });
      return results;
    } catch (error) {
      this.emit('linter:error', { linter: linterName, error });
      throw error;
    }
  }

  /**
   * Build linter command
   */
  buildCommand(linter, files, options) {
    const args = [...linter.args];

    if (options.config) {
      args.push('--config', options.config);
    }

    if (options.fix) {
      args.push('--fix');
    }

    args.push(...files);

    return `${linter.command} ${args.join(' ')}`;
  }

  /**
   * Execute command
   */
  async executeCommand(command) {
    // This would use the Bash tool in practice
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(command);
      return stdout;
    } catch (error) {
      // Linters often exit with non-zero codes for errors
      return error.stdout || error.message;
    }
  }

  /**
   * Parse ESLint output
   */
  parseESLintOutput(output) {
    try {
      const data = JSON.parse(output);
      const errors = [];
      const warnings = [];

      data.forEach(file => {
        file.messages.forEach(msg => {
          const diagnostic = {
            message: msg.message,
            line: msg.line,
            column: msg.column,
            file: file.filePath,
            rule: msg.ruleId
          };

          if (msg.severity === 2) {
            errors.push(diagnostic);
          } else {
            warnings.push(diagnostic);
          }
        });
      });

      return new ValidationResult(errors.length === 0, errors, warnings);
    } catch {
      return new ValidationResult(false, [{ message: 'Failed to parse ESLint output' }]);
    }
  }

  /**
   * Parse Prettier output
   */
  parsePrettierOutput(output) {
    const lines = output.split('\n');
    const errors = [];

    lines.forEach(line => {
      if (line.includes('✖')) {
        errors.push({
          message: 'Code style issue',
          file: line.split(':')[0],
          line: 0,
          column: 0
        });
      }
    });

    return new ValidationResult(errors.length === 0, errors);
  }

  /**
   * Parse TSLint output
   */
  parseTSLintOutput(output) {
    return this.parseESLintOutput(output); // Similar format
  }

  /**
   * Parse Pylint output
   */
  parsePylintOutput(output) {
    try {
      const data = JSON.parse(output);
      const errors = [];
      const warnings = [];

      data.forEach(msg => {
        const diagnostic = {
          message: msg.message,
          line: msg.line,
          column: msg.column,
          file: msg.path,
          type: msg.type
        };

        if (msg.type === 'error' || msg.type === 'fatal') {
          errors.push(diagnostic);
        } else {
          warnings.push(diagnostic);
        }
      });

      return new ValidationResult(errors.length === 0, errors, warnings);
    } catch {
      return new ValidationResult(false, [{ message: 'Failed to parse Pylint output' }]);
    }
  }

  /**
   * Parse Ruff output
   */
  parseRuffOutput(output) {
    try {
      const data = JSON.parse(output);
      const errors = [];

      Object.entries(data).forEach(([file, issues]) => {
        issues.forEach(issue => {
          errors.push({
            message: issue.message,
            line: issue.location.row,
            column: issue.location.column,
            file: file,
            code: issue.code
          });
        });
      });

      return new ValidationResult(errors.length === 0, errors);
    } catch {
      return new ValidationResult(false, [{ message: 'Failed to parse Ruff output' }]);
    }
  }

  /**
   * Parse Clippy output
   */
  parseClippyOutput(output) {
    const errors = [];
    const warnings = [];
    const lines = output.split('\n');

    lines.forEach(line => {
      try {
        const data = JSON.parse(line);
        if (data.reason === 'compiler-message') {
          const msg = data.message;
          const diagnostic = {
            message: msg.message,
            line: msg.spans[0]?.line_start || 0,
            column: msg.spans[0]?.column_start || 0,
            file: msg.spans[0]?.file_name || 'unknown'
          };

          if (msg.level === 'error') {
            errors.push(diagnostic);
          } else if (msg.level === 'warning') {
            warnings.push(diagnostic);
          }
        }
      } catch {
        // Not a JSON line
      }
    });

    return new ValidationResult(errors.length === 0, errors, warnings);
  }

  /**
   * Check if diagnostic is from a linter
   * Original: isLinterDiagnostic function
   */
  isLinterDiagnostic(source) {
    return SUPPORTED_LINTERS.some(linter =>
      source.toLowerCase().includes(linter)
    );
  }
}

/**
 * Test runner
 * Executes tests using various test frameworks
 */
export class TestRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.logger = getLogger('test-runner');
    this.errorRecovery = new ErrorRecoveryManager();
    this.runners = new Map();
    this.setupDefaultRunners();
  }

  /**
   * Setup default test runners
   */
  setupDefaultRunners() {
    // Jest
    this.runners.set(TestRunnerType.JEST, {
      command: 'npx jest',
      args: ['--json', '--outputFile=test-results.json'],
      parser: this.parseJestOutput
    });

    // Mocha
    this.runners.set(TestRunnerType.MOCHA, {
      command: 'npx mocha',
      args: ['--reporter', 'json'],
      parser: this.parseMochaOutput
    });

    // Vitest
    this.runners.set(TestRunnerType.VITEST, {
      command: 'npx vitest',
      args: ['run', '--reporter=json'],
      parser: this.parseVitestOutput
    });

    // Pytest
    this.runners.set(TestRunnerType.PYTEST, {
      command: 'pytest',
      args: ['--json-report', '--json-report-file=test-results.json'],
      parser: this.parsePytestOutput
    });

    // RSpec
    this.runners.set(TestRunnerType.RSPEC, {
      command: 'rspec',
      args: ['--format', 'json'],
      parser: this.parseRSpecOutput
    });

    // Go test
    this.runners.set(TestRunnerType.GO_TEST, {
      command: 'go test',
      args: ['-json'],
      parser: this.parseGoTestOutput
    });

    // Cargo test
    this.runners.set(TestRunnerType.CARGO_TEST, {
      command: 'cargo test',
      args: ['--', '--format=json'],
      parser: this.parseCargoTestOutput
    });
  }

  /**
   * Run tests
   */
  async runTests(runner, pattern = '', options = {}) {
    const runnerConfig = this.runners.get(runner);
    if (!runnerConfig) {
      throw new Error(`Unknown test runner: ${runner}`);
    }

    this.emit('test:start', { runner, pattern });

    try {
      const result = await this.errorRecovery.executeWithRetry(async () => {
        const command = this.buildTestCommand(runnerConfig, pattern, options);
        const output = await this.executeCommand(command);
        return runnerConfig.parser.call(this, output);
      });

      this.emit('test:complete', { runner, result });
      return result;
    } catch (error) {
      this.emit('test:error', { runner, error });
      throw error;
    }
  }

  /**
   * Build test command
   */
  buildTestCommand(runner, pattern, options) {
    const args = [...runner.args];

    if (pattern) {
      args.push(pattern);
    }

    if (options.watch) {
      args.push('--watch');
    }

    if (options.coverage) {
      args.push('--coverage');
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    return `${runner.command} ${args.join(' ')}`;
  }

  /**
   * Execute command
   */
  async executeCommand(command) {
    // This would use the Bash tool in practice
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(command);
    return stdout;
  }

  /**
   * Parse Jest output
   */
  parseJestOutput(output) {
    try {
      const data = JSON.parse(output);
      return {
        success: data.success,
        numPassedTests: data.numPassedTests,
        numFailedTests: data.numFailedTests,
        numPendingTests: data.numPendingTests,
        numTotalTests: data.numTotalTests,
        testResults: data.testResults,
        coverage: data.coverageMap
      };
    } catch {
      return { success: false, error: 'Failed to parse Jest output' };
    }
  }

  /**
   * Parse Mocha output
   */
  parseMochaOutput(output) {
    try {
      const data = JSON.parse(output);
      return {
        success: data.failures === 0,
        numPassedTests: data.passes,
        numFailedTests: data.failures,
        numPendingTests: data.pending,
        numTotalTests: data.tests,
        testResults: data.tests
      };
    } catch {
      return { success: false, error: 'Failed to parse Mocha output' };
    }
  }

  /**
   * Parse Vitest output
   */
  parseVitestOutput(output) {
    return this.parseJestOutput(output); // Similar format
  }

  /**
   * Parse Pytest output
   */
  parsePytestOutput(output) {
    try {
      const data = JSON.parse(output);
      return {
        success: data.summary.failed === 0,
        numPassedTests: data.summary.passed,
        numFailedTests: data.summary.failed,
        numPendingTests: data.summary.skipped,
        numTotalTests: data.summary.total,
        testResults: data.tests
      };
    } catch {
      return { success: false, error: 'Failed to parse Pytest output' };
    }
  }

  /**
   * Parse RSpec output
   */
  parseRSpecOutput(output) {
    try {
      const data = JSON.parse(output);
      return {
        success: data.summary.failure_count === 0,
        numPassedTests: data.summary.example_count - data.summary.failure_count,
        numFailedTests: data.summary.failure_count,
        numPendingTests: data.summary.pending_count,
        numTotalTests: data.summary.example_count,
        testResults: data.examples
      };
    } catch {
      return { success: false, error: 'Failed to parse RSpec output' };
    }
  }

  /**
   * Parse Go test output
   */
  parseGoTestOutput(output) {
    const lines = output.split('\n');
    let passed = 0;
    let failed = 0;
    const results = [];

    lines.forEach(line => {
      try {
        const data = JSON.parse(line);
        if (data.Action === 'pass') {
          passed++;
          results.push({ name: data.Test, status: 'passed' });
        } else if (data.Action === 'fail') {
          failed++;
          results.push({ name: data.Test, status: 'failed' });
        }
      } catch {
        // Not a JSON line
      }
    });

    return {
      success: failed === 0,
      numPassedTests: passed,
      numFailedTests: failed,
      numTotalTests: passed + failed,
      testResults: results
    };
  }

  /**
   * Parse Cargo test output
   */
  parseCargoTestOutput(output) {
    const lines = output.split('\n');
    let passed = 0;
    let failed = 0;

    lines.forEach(line => {
      if (line.includes('test result: ok')) {
        const match = line.match(/(\d+) passed/);
        if (match) passed = parseInt(match[1]);
      }
      if (line.includes('test result: FAILED')) {
        const match = line.match(/(\d+) failed/);
        if (match) failed = parseInt(match[1]);
      }
    });

    return {
      success: failed === 0,
      numPassedTests: passed,
      numFailedTests: failed,
      numTotalTests: passed + failed
    };
  }
}

/**
 * Test coverage analyzer
 */
export class CoverageAnalyzer {
  constructor() {
    this.logger = getLogger('coverage-analyzer');
    this.thresholds = {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80
    };
  }

  /**
   * Analyze coverage data
   */
  analyzeCoverage(coverageData, thresholds = this.thresholds) {
    const summary = this.calculateSummary(coverageData);
    const passed = this.checkThresholds(summary, thresholds);
    const uncoveredFiles = this.findUncoveredFiles(coverageData);

    return {
      summary,
      passed,
      thresholds,
      uncoveredFiles,
      report: this.generateReport(summary, thresholds, uncoveredFiles)
    };
  }

  /**
   * Calculate coverage summary
   */
  calculateSummary(coverageData) {
    const totals = {
      statements: { covered: 0, total: 0 },
      branches: { covered: 0, total: 0 },
      functions: { covered: 0, total: 0 },
      lines: { covered: 0, total: 0 }
    };

    Object.values(coverageData).forEach(file => {
      totals.statements.covered += file.s?.covered || 0;
      totals.statements.total += file.s?.total || 0;
      totals.branches.covered += file.b?.covered || 0;
      totals.branches.total += file.b?.total || 0;
      totals.functions.covered += file.f?.covered || 0;
      totals.functions.total += file.f?.total || 0;
      totals.lines.covered += file.l?.covered || 0;
      totals.lines.total += file.l?.total || 0;
    });

    return {
      statements: (totals.statements.covered / totals.statements.total) * 100,
      branches: (totals.branches.covered / totals.branches.total) * 100,
      functions: (totals.functions.covered / totals.functions.total) * 100,
      lines: (totals.lines.covered / totals.lines.total) * 100
    };
  }

  /**
   * Check coverage thresholds
   */
  checkThresholds(summary, thresholds) {
    return Object.entries(thresholds).every(([key, threshold]) =>
      summary[key] >= threshold
    );
  }

  /**
   * Find uncovered files
   */
  findUncoveredFiles(coverageData) {
    const uncovered = [];

    Object.entries(coverageData).forEach(([file, data]) => {
      const coverage = (data.l?.covered || 0) / (data.l?.total || 1) * 100;
      if (coverage < 100) {
        uncovered.push({
          file,
          coverage,
          uncoveredLines: this.getUncoveredLines(data)
        });
      }
    });

    return uncovered.sort((a, b) => a.coverage - b.coverage);
  }

  /**
   * Get uncovered lines
   */
  getUncoveredLines(fileData) {
    const lines = [];
    if (fileData.statementMap && fileData.s) {
      Object.entries(fileData.s).forEach(([key, count]) => {
        if (count === 0) {
          const statement = fileData.statementMap[key];
          if (statement) {
            lines.push(statement.start.line);
          }
        }
      });
    }
    return lines;
  }

  /**
   * Generate coverage report
   */
  generateReport(summary, thresholds, uncoveredFiles) {
    const report = [];

    report.push('Coverage Summary:');
    report.push('================');

    Object.entries(summary).forEach(([key, value]) => {
      const threshold = thresholds[key];
      const status = value >= threshold ? '✓' : '✗';
      report.push(`${status} ${key}: ${value.toFixed(2)}% (threshold: ${threshold}%)`);
    });

    if (uncoveredFiles.length > 0) {
      report.push('');
      report.push('Files with low coverage:');
      report.push('========================');
      uncoveredFiles.slice(0, 5).forEach(file => {
        report.push(`- ${file.file}: ${file.coverage.toFixed(2)}%`);
        if (file.uncoveredLines.length > 0) {
          report.push(`  Uncovered lines: ${file.uncoveredLines.slice(0, 5).join(', ')}${file.uncoveredLines.length > 5 ? '...' : ''}`);
        }
      });
    }

    return report.join('\n');
  }
}

// Export utility functions
export function createValidator() {
  return new CodeValidator();
}

export function createLinter(options) {
  return new LinterIntegration(options);
}

export function createTestRunner(options) {
  return new TestRunner(options);
}

export function createCoverageAnalyzer() {
  return new CoverageAnalyzer();
}

export default {
  SUPPORTED_LINTERS,
  TestRunnerType,
  ValidationResult,
  CodeValidator,
  LinterIntegration,
  TestRunner,
  CoverageAnalyzer,
  createValidator,
  createLinter,
  createTestRunner,
  createCoverageAnalyzer
};