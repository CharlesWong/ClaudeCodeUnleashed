/**
 * Terminal UI
 * Main terminal interface using Ink
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { Spinner } from './components/spinner.js';
import TextInput from 'ink-text-input';

/**
 * Main terminal UI component
 */
function TerminalUI({ conversationLoop }) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Handle keyboard input
  useInput((key, meta) => {
    if (meta.ctrl && key === 'c') {
      conversationLoop.abort();
      exit();
    }

    if (meta.ctrl && key === 'd') {
      exit();
    }
  });

  // Listen to conversation events
  useEffect(() => {
    const handleStreamDelta = ({ text }) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + text }
          ];
        }
        return [...prev, { role: 'assistant', content: text }];
      });
    };

    const handleMessageComplete = ({ message }) => {
      setIsProcessing(false);
    };

    const handleError = ({ error }) => {
      setError(error.message);
      setIsProcessing(false);
    };

    conversationLoop.on('stream:delta', handleStreamDelta);
    conversationLoop.on('message:complete', handleMessageComplete);
    conversationLoop.on('input:error', handleError);

    return () => {
      conversationLoop.off('stream:delta', handleStreamDelta);
      conversationLoop.off('message:complete', handleMessageComplete);
      conversationLoop.off('input:error', handleError);
    };
  }, [conversationLoop]);

  // Handle input submission
  const handleSubmit = async (value) => {
    if (!value.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: value }]);
    setInput('');
    setIsProcessing(true);
    setError(null);

    try {
      await conversationLoop.processUserInput(value);
    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Claude Code Terminal</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, index) => (
          <MessageDisplay key={index} message={msg} />
        ))}
      </Box>

      {/* Error display */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <Box marginBottom={1}>
          <Spinner label="Processing..." />
        </Box>
      )}

      {/* Input */}
      {!isProcessing && (
        <Box>
          <Text color="green">{'> '}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          Ctrl+C to abort • Ctrl+D to exit • /help for commands
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Message display component
 */
function MessageDisplay({ message }) {
  const roleColor = message.role === 'user' ? 'blue' : 'green';
  const roleLabel = message.role === 'user' ? 'You' : 'Claude';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={roleColor} bold>
        {roleLabel}:
      </Text>
      <Box paddingLeft={2}>
        <Text wrap="wrap">
          {formatContent(message.content)}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Format message content
 */
function formatContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (block.type === 'text') return block.text;
        if (block.type === 'tool_use') return `[Using tool: ${block.name}]`;
        if (block.type === 'tool_result') return `[Tool result: ${block.content.substring(0, 100)}...]`;
        return '';
      })
      .join('\n');
  }

  return JSON.stringify(content);
}

/**
 * Tool use display component
 */
export function ToolUseDisplay({ toolUse, status }) {
  const statusIcon = status === 'running' ? <Spinner /> :
                     status === 'completed' ? '✓' :
                     status === 'error' ? '✗' : '○';

  return (
    <Box>
      <Text color={
        status === 'running' ? 'cyan' :
        status === 'completed' ? 'green' :
        status === 'error' ? 'red' : 'gray'
      }>
        {statusIcon} {toolUse.name}
      </Text>
    </Box>
  );
}

/**
 * Code block display
 */
export function CodeBlock({ code, language = 'text' }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
      <Text dimColor>{language}</Text>
      <Box marginTop={1}>
        <Text>{code}</Text>
      </Box>
    </Box>
  );
}

/**
 * File tree display
 */
export function FileTree({ files, selected }) {
  return (
    <Box flexDirection="column">
      {files.map((file, index) => (
        <Box key={index}>
          <Text color={selected === index ? 'cyan' : undefined}>
            {file.type === 'directory' ? '📁' : '📄'} {file.name}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Start the terminal UI
 */
export function startTerminalUI(conversationLoop) {
  const app = render(
    <TerminalUI conversationLoop={conversationLoop} />
  );

  return app;
}

export {
  TerminalUI,
  MessageDisplay
};