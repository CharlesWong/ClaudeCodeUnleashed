/**
 * Documentation System for Claude Code
 * Help generation, command documentation, and markdown utilities
 * Extracted from documentation and help-related patterns
 */

import { EventEmitter } from 'events';
import { getLogger } from '../utils/logging.js';
import * as fs from 'fs/promises';

/**
 * Documentation types
 */
export const DocType = {
  COMMAND: 'command',
  TOOL: 'tool',
  API: 'api',
  CONFIGURATION: 'configuration',
  GUIDE: 'guide',
  REFERENCE: 'reference',
  TUTORIAL: 'tutorial'
};

/**
 * Documentation format
 */
export const DocFormat = {
  MARKDOWN: 'markdown',
  HTML: 'html',
  JSON: 'json',
  PLAIN: 'plain'
};

/**
 * Schema field descriptor
 * Original: .describe() patterns from lines 1071-1140
 */
export class SchemaFieldDescriptor {
  constructor(field, type, description, options = {}) {
    this.field = field;
    this.type = type;
    this.description = description;
    this.required = options.required || false;
    this.defaultValue = options.defaultValue;
    this.examples = options.examples || [];
    this.constraints = options.constraints || {};
  }

  /**
   * Generate markdown documentation
   */
  toMarkdown() {
    const parts = [];

    parts.push(`### ${this.field}`);
    parts.push('');
    parts.push(this.description);
    parts.push('');
    parts.push(`- **Type**: ${this.type}`);
    parts.push(`- **Required**: ${this.required ? 'Yes' : 'No'}`);

    if (this.defaultValue !== undefined) {
      parts.push(`- **Default**: \`${JSON.stringify(this.defaultValue)}\``);
    }

    if (this.constraints.min !== undefined) {
      parts.push(`- **Minimum**: ${this.constraints.min}`);
    }

    if (this.constraints.max !== undefined) {
      parts.push(`- **Maximum**: ${this.constraints.max}`);
    }

    if (this.constraints.enum) {
      parts.push(`- **Allowed values**: ${this.constraints.enum.map(v => `\`${v}\``).join(', ')}`);
    }

    if (this.examples.length > 0) {
      parts.push('');
      parts.push('**Examples:**');
      this.examples.forEach(example => {
        parts.push('```json');
        parts.push(JSON.stringify(example, null, 2));
        parts.push('```');
      });
    }

    return parts.join('\n');
  }
}

/**
 * Command documentation
 */
export class CommandDoc {
  constructor(name, description, options = {}) {
    this.name = name;
    this.description = description;
    this.aliases = options.aliases || [];
    this.parameters = options.parameters || [];
    this.flags = options.flags || [];
    this.examples = options.examples || [];
    this.notes = options.notes || [];
    this.seeAlso = options.seeAlso || [];
  }

  /**
   * Generate help text
   * Original: --help pattern
   */
  generateHelp(format = DocFormat.PLAIN) {
    switch (format) {
      case DocFormat.MARKDOWN:
        return this.toMarkdown();
      case DocFormat.HTML:
        return this.toHTML();
      case DocFormat.JSON:
        return this.toJSON();
      default:
        return this.toPlainText();
    }
  }

  /**
   * Generate plain text help
   */
  toPlainText() {
    const lines = [];

    // Header
    lines.push(this.name.toUpperCase());
    lines.push('='.repeat(this.name.length));
    lines.push('');
    lines.push(this.description);
    lines.push('');

    // Usage
    lines.push('USAGE:');
    lines.push(`  ${this.name} ${this.getUsagePattern()}`);
    lines.push('');

    // Aliases
    if (this.aliases.length > 0) {
      lines.push('ALIASES:');
      this.aliases.forEach(alias => {
        lines.push(`  ${alias}`);
      });
      lines.push('');
    }

    // Parameters
    if (this.parameters.length > 0) {
      lines.push('PARAMETERS:');
      this.parameters.forEach(param => {
        lines.push(`  ${param.name.padEnd(20)} ${param.description}`);
        if (param.required) {
          lines.push(`  ${''.padEnd(20)} (required)`);
        }
      });
      lines.push('');
    }

    // Flags
    if (this.flags.length > 0) {
      lines.push('FLAGS:');
      this.flags.forEach(flag => {
        const flagStr = flag.short ? `-${flag.short}, --${flag.name}` : `--${flag.name}`;
        lines.push(`  ${flagStr.padEnd(20)} ${flag.description}`);
      });
      lines.push('');
    }

    // Examples
    if (this.examples.length > 0) {
      lines.push('EXAMPLES:');
      this.examples.forEach(example => {
        lines.push(`  ${example.command}`);
        if (example.description) {
          lines.push(`    ${example.description}`);
        }
        lines.push('');
      });
    }

    // Notes
    if (this.notes.length > 0) {
      lines.push('NOTES:');
      this.notes.forEach(note => {
        lines.push(`  - ${note}`);
      });
      lines.push('');
    }

    // See also
    if (this.seeAlso.length > 0) {
      lines.push('SEE ALSO:');
      lines.push(`  ${this.seeAlso.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate markdown documentation
   */
  toMarkdown() {
    const lines = [];

    lines.push(`# ${this.name}`);
    lines.push('');
    lines.push(this.description);
    lines.push('');

    lines.push('## Usage');
    lines.push('```bash');
    lines.push(`${this.name} ${this.getUsagePattern()}`);
    lines.push('```');
    lines.push('');

    if (this.aliases.length > 0) {
      lines.push('## Aliases');
      this.aliases.forEach(alias => {
        lines.push(`- \`${alias}\``);
      });
      lines.push('');
    }

    if (this.parameters.length > 0) {
      lines.push('## Parameters');
      lines.push('');
      lines.push('| Parameter | Description | Required |');
      lines.push('|-----------|-------------|----------|');
      this.parameters.forEach(param => {
        lines.push(`| ${param.name} | ${param.description} | ${param.required ? 'Yes' : 'No'} |`);
      });
      lines.push('');
    }

    if (this.flags.length > 0) {
      lines.push('## Flags');
      lines.push('');
      lines.push('| Flag | Short | Description |');
      lines.push('|------|-------|-------------|');
      this.flags.forEach(flag => {
        lines.push(`| --${flag.name} | ${flag.short ? `-${flag.short}` : ''} | ${flag.description} |`);
      });
      lines.push('');
    }

    if (this.examples.length > 0) {
      lines.push('## Examples');
      lines.push('');
      this.examples.forEach(example => {
        if (example.description) {
          lines.push(`### ${example.description}`);
        }
        lines.push('```bash');
        lines.push(example.command);
        lines.push('```');
        lines.push('');
      });
    }

    if (this.notes.length > 0) {
      lines.push('## Notes');
      lines.push('');
      this.notes.forEach(note => {
        lines.push(`- ${note}`);
      });
      lines.push('');
    }

    if (this.seeAlso.length > 0) {
      lines.push('## See Also');
      lines.push('');
      this.seeAlso.forEach(ref => {
        lines.push(`- [${ref}](#${ref.toLowerCase().replace(/\s+/g, '-')})`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Generate HTML documentation
   */
  toHTML() {
    const markdown = this.toMarkdown();
    // Simple markdown to HTML conversion
    return markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n)+/g, '<ul>$&</ul>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Generate JSON documentation
   */
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      aliases: this.aliases,
      parameters: this.parameters,
      flags: this.flags,
      examples: this.examples,
      notes: this.notes,
      seeAlso: this.seeAlso
    };
  }

  /**
   * Get usage pattern
   */
  getUsagePattern() {
    const parts = [];

    // Add parameters
    this.parameters.forEach(param => {
      if (param.required) {
        parts.push(`<${param.name}>`);
      } else {
        parts.push(`[${param.name}]`);
      }
    });

    // Add flags indicator
    if (this.flags.length > 0) {
      parts.push('[OPTIONS]');
    }

    return parts.join(' ');
  }
}

/**
 * Tool documentation
 */
export class ToolDoc {
  constructor(name, description, schema = {}) {
    this.name = name;
    this.description = description;
    this.schema = schema;
    this.examples = [];
    this.notes = [];
  }

  /**
   * Add example
   */
  addExample(input, output, description = '') {
    this.examples.push({ input, output, description });
  }

  /**
   * Generate documentation
   */
  generate(format = DocFormat.MARKDOWN) {
    switch (format) {
      case DocFormat.MARKDOWN:
        return this.toMarkdown();
      case DocFormat.JSON:
        return this.toJSON();
      default:
        return this.toPlainText();
    }
  }

  /**
   * Generate markdown
   */
  toMarkdown() {
    const lines = [];

    lines.push(`# Tool: ${this.name}`);
    lines.push('');
    lines.push(this.description);
    lines.push('');

    if (this.schema.parameters) {
      lines.push('## Parameters');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(this.schema.parameters, null, 2));
      lines.push('```');
      lines.push('');
    }

    if (this.examples.length > 0) {
      lines.push('## Examples');
      lines.push('');
      this.examples.forEach(example => {
        if (example.description) {
          lines.push(`### ${example.description}`);
        }
        lines.push('**Input:**');
        lines.push('```json');
        lines.push(JSON.stringify(example.input, null, 2));
        lines.push('```');
        if (example.output) {
          lines.push('**Output:**');
          lines.push('```json');
          lines.push(JSON.stringify(example.output, null, 2));
          lines.push('```');
        }
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * Generate plain text
   */
  toPlainText() {
    const lines = [];

    lines.push(`TOOL: ${this.name}`);
    lines.push('='.repeat(this.name.length + 6));
    lines.push('');
    lines.push(this.description);
    lines.push('');

    if (this.schema.parameters) {
      lines.push('PARAMETERS:');
      lines.push(JSON.stringify(this.schema.parameters, null, 2));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate JSON
   */
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema,
      examples: this.examples,
      notes: this.notes
    };
  }
}

/**
 * Documentation generator
 * Main documentation system
 */
export class DocumentationGenerator extends EventEmitter {
  constructor() {
    super();
    this.logger = getLogger('documentation');
    this.commands = new Map();
    this.tools = new Map();
    this.guides = new Map();
    this.references = new Map();
  }

  /**
   * Register command documentation
   */
  registerCommand(commandDoc) {
    this.commands.set(commandDoc.name, commandDoc);

    // Also register aliases
    commandDoc.aliases.forEach(alias => {
      this.commands.set(alias, commandDoc);
    });
  }

  /**
   * Register tool documentation
   */
  registerTool(toolDoc) {
    this.tools.set(toolDoc.name, toolDoc);
  }

  /**
   * Register guide
   */
  registerGuide(name, content) {
    this.guides.set(name, content);
  }

  /**
   * Register reference
   */
  registerReference(name, content) {
    this.references.set(name, content);
  }

  /**
   * Generate help for command
   */
  getCommandHelp(commandName, format = DocFormat.PLAIN) {
    const doc = this.commands.get(commandName);
    if (!doc) {
      return `Command '${commandName}' not found. Use 'help' to see available commands.`;
    }
    return doc.generateHelp(format);
  }

  /**
   * Generate tool documentation
   */
  getToolDoc(toolName, format = DocFormat.MARKDOWN) {
    const doc = this.tools.get(toolName);
    if (!doc) {
      return `Tool '${toolName}' not found.`;
    }
    return doc.generate(format);
  }

  /**
   * Generate all commands help
   */
  getAllCommandsHelp(format = DocFormat.PLAIN) {
    const lines = [];

    if (format === DocFormat.MARKDOWN) {
      lines.push('# Available Commands');
      lines.push('');

      // Group commands by category
      const categories = this.categorizeCommands();

      Object.entries(categories).forEach(([category, commands]) => {
        lines.push(`## ${category}`);
        lines.push('');
        commands.forEach(cmd => {
          lines.push(`- **${cmd.name}**: ${cmd.description}`);
        });
        lines.push('');
      });
    } else {
      lines.push('AVAILABLE COMMANDS');
      lines.push('==================');
      lines.push('');

      // Get unique commands (not aliases)
      const uniqueCommands = new Set();
      this.commands.forEach(cmd => uniqueCommands.add(cmd));

      Array.from(uniqueCommands).forEach(cmd => {
        lines.push(`  ${cmd.name.padEnd(20)} ${cmd.description}`);
        if (cmd.aliases.length > 0) {
          lines.push(`  ${''.padEnd(20)} Aliases: ${cmd.aliases.join(', ')}`);
        }
      });
    }

    return lines.join('\n');
  }

  /**
   * Categorize commands
   */
  categorizeCommands() {
    const categories = {
      'File Operations': [],
      'Code Editing': [],
      'Version Control': [],
      'Testing': [],
      'Documentation': [],
      'Utilities': []
    };

    const processed = new Set();

    this.commands.forEach(cmd => {
      if (processed.has(cmd)) return;
      processed.add(cmd);

      // Simple categorization based on command name
      if (['read', 'write', 'glob', 'grep'].includes(cmd.name.toLowerCase())) {
        categories['File Operations'].push(cmd);
      } else if (['edit', 'multiedit'].includes(cmd.name.toLowerCase())) {
        categories['Code Editing'].push(cmd);
      } else if (['git', 'commit', 'push'].some(k => cmd.name.toLowerCase().includes(k))) {
        categories['Version Control'].push(cmd);
      } else if (['test', 'lint'].some(k => cmd.name.toLowerCase().includes(k))) {
        categories['Testing'].push(cmd);
      } else if (['help', 'docs'].some(k => cmd.name.toLowerCase().includes(k))) {
        categories['Documentation'].push(cmd);
      } else {
        categories['Utilities'].push(cmd);
      }
    });

    // Remove empty categories
    Object.keys(categories).forEach(cat => {
      if (categories[cat].length === 0) {
        delete categories[cat];
      }
    });

    return categories;
  }

  /**
   * Generate full documentation
   */
  generateFullDocumentation(format = DocFormat.MARKDOWN) {
    const sections = [];

    // Title
    if (format === DocFormat.MARKDOWN) {
      sections.push('# Claude Code Documentation');
      sections.push('');
      sections.push('## Table of Contents');
      sections.push('');
      sections.push('- [Commands](#commands)');
      sections.push('- [Tools](#tools)');
      sections.push('- [Guides](#guides)');
      sections.push('- [References](#references)');
      sections.push('');
    }

    // Commands
    sections.push(this.getAllCommandsHelp(format));
    sections.push('');

    // Tools
    if (this.tools.size > 0) {
      if (format === DocFormat.MARKDOWN) {
        sections.push('# Tools');
        sections.push('');
      } else {
        sections.push('TOOLS');
        sections.push('=====');
        sections.push('');
      }

      this.tools.forEach(tool => {
        sections.push(tool.generate(format));
        sections.push('');
      });
    }

    // Guides
    if (this.guides.size > 0) {
      if (format === DocFormat.MARKDOWN) {
        sections.push('# Guides');
        sections.push('');
      } else {
        sections.push('GUIDES');
        sections.push('======');
        sections.push('');
      }

      this.guides.forEach((content, name) => {
        if (format === DocFormat.MARKDOWN) {
          sections.push(`## ${name}`);
        } else {
          sections.push(name);
          sections.push('-'.repeat(name.length));
        }
        sections.push('');
        sections.push(content);
        sections.push('');
      });
    }

    // References
    if (this.references.size > 0) {
      if (format === DocFormat.MARKDOWN) {
        sections.push('# References');
        sections.push('');
      } else {
        sections.push('REFERENCES');
        sections.push('==========');
        sections.push('');
      }

      this.references.forEach((content, name) => {
        sections.push(content);
        sections.push('');
      });
    }

    return sections.join('\n');
  }

  /**
   * Export documentation
   */
  async exportDocumentation(outputPath, format = DocFormat.MARKDOWN) {
    const content = this.generateFullDocumentation(format);

    // This would use the Write tool in practice
    // fs already imported at top of file
    await fs.writeFile(outputPath, content, 'utf8');

    this.logger.info(`Documentation exported to ${outputPath}`);
    this.emit('exported', { path: outputPath, format });
  }
}

/**
 * Interactive help system
 * Original: help command patterns
 */
export class InteractiveHelp {
  constructor(docGenerator) {
    this.docGenerator = docGenerator;
    this.logger = getLogger('help');
    this.searchIndex = new Map();
    this.buildSearchIndex();
  }

  /**
   * Build search index
   */
  buildSearchIndex() {
    // Index commands
    this.docGenerator.commands.forEach(cmd => {
      const keywords = this.extractKeywords(cmd.name + ' ' + cmd.description);
      keywords.forEach(keyword => {
        if (!this.searchIndex.has(keyword)) {
          this.searchIndex.set(keyword, []);
        }
        this.searchIndex.get(keyword).push({
          type: 'command',
          name: cmd.name,
          item: cmd
        });
      });
    });

    // Index tools
    this.docGenerator.tools.forEach(tool => {
      const keywords = this.extractKeywords(tool.name + ' ' + tool.description);
      keywords.forEach(keyword => {
        if (!this.searchIndex.has(keyword)) {
          this.searchIndex.set(keyword, []);
        }
        this.searchIndex.get(keyword).push({
          type: 'tool',
          name: tool.name,
          item: tool
        });
      });
    });
  }

  /**
   * Extract keywords
   */
  extractKeywords(text) {
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'for', 'with'].includes(word));
  }

  /**
   * Search help
   */
  search(query) {
    const results = new Set();
    const queryKeywords = this.extractKeywords(query);

    queryKeywords.forEach(keyword => {
      const matches = this.searchIndex.get(keyword);
      if (matches) {
        matches.forEach(match => results.add(match));
      }
    });

    return Array.from(results);
  }

  /**
   * Get contextual help
   */
  getContextualHelp(context) {
    // Determine what help to show based on context
    if (context.command) {
      return this.docGenerator.getCommandHelp(context.command);
    }

    if (context.tool) {
      return this.docGenerator.getToolDoc(context.tool);
    }

    if (context.error) {
      return this.getErrorHelp(context.error);
    }

    return this.docGenerator.getAllCommandsHelp();
  }

  /**
   * Get error help
   */
  getErrorHelp(error) {
    const lines = [];

    lines.push('ERROR HELP');
    lines.push('==========');
    lines.push('');
    lines.push(`Error: ${error.message}`);
    lines.push('');

    // Provide suggestions based on error
    const suggestions = this.getErrorSuggestions(error);
    if (suggestions.length > 0) {
      lines.push('Suggestions:');
      suggestions.forEach(suggestion => {
        lines.push(`  - ${suggestion}`);
      });
      lines.push('');
    }

    // Find related help topics
    const relatedTopics = this.search(error.message);
    if (relatedTopics.length > 0) {
      lines.push('Related help topics:');
      relatedTopics.slice(0, 3).forEach(topic => {
        lines.push(`  - ${topic.name} (${topic.type})`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Get error suggestions
   */
  getErrorSuggestions(error) {
    const suggestions = [];

    if (error.message.includes('permission')) {
      suggestions.push('Check file permissions');
      suggestions.push('Run with appropriate privileges');
    }

    if (error.message.includes('not found')) {
      suggestions.push('Verify the file/command exists');
      suggestions.push('Check the spelling');
    }

    if (error.message.includes('syntax')) {
      suggestions.push('Review command syntax');
      suggestions.push('Use --help flag for usage');
    }

    return suggestions;
  }
}

/**
 * Tutorial system
 * Original: educational prompt patterns from lines 11393-11397
 */
export class TutorialSystem {
  constructor() {
    this.tutorials = new Map();
    this.progress = new Map();
    this.logger = getLogger('tutorial');
  }

  /**
   * Register tutorial
   */
  registerTutorial(name, tutorial) {
    this.tutorials.set(name, tutorial);
  }

  /**
   * Start tutorial
   */
  startTutorial(name) {
    const tutorial = this.tutorials.get(name);
    if (!tutorial) {
      throw new Error(`Tutorial '${name}' not found`);
    }

    this.progress.set(name, {
      currentStep: 0,
      completed: false,
      startTime: Date.now()
    });

    return tutorial.steps[0];
  }

  /**
   * Get next step
   */
  nextStep(name) {
    const tutorial = this.tutorials.get(name);
    const progress = this.progress.get(name);

    if (!tutorial || !progress) {
      return null;
    }

    progress.currentStep++;

    if (progress.currentStep >= tutorial.steps.length) {
      progress.completed = true;
      return {
        completed: true,
        message: tutorial.completionMessage || 'Tutorial completed!'
      };
    }

    return tutorial.steps[progress.currentStep];
  }

  /**
   * Get tutorial progress
   */
  getProgress(name) {
    return this.progress.get(name);
  }
}

// Export utility functions
export function createDocGenerator() {
  return new DocumentationGenerator();
}

export function createCommandDoc(name, description, options) {
  return new CommandDoc(name, description, options);
}

export function createToolDoc(name, description, schema) {
  return new ToolDoc(name, description, schema);
}

export function createInteractiveHelp(docGenerator) {
  return new InteractiveHelp(docGenerator);
}

export function createTutorialSystem() {
  return new TutorialSystem();
}

export default {
  DocType,
  DocFormat,
  SchemaFieldDescriptor,
  CommandDoc,
  ToolDoc,
  DocumentationGenerator,
  InteractiveHelp,
  TutorialSystem,
  createDocGenerator,
  createCommandDoc,
  createToolDoc,
  createInteractiveHelp,
  createTutorialSystem
};