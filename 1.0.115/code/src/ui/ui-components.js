/**
 * Claude Code UI Components
 *
 * Additional React/Ink components for terminal UI including progress bars,
 * spinners, prompts, dialogs, and interactive elements.
 *
 * Extracted from claude-code-full-extract.js (lines ~46000-46500)
 * Part of the 90% → 95% extraction phase
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useFocus } from 'ink';
import { EventEmitter } from 'events';
import chalk from 'chalk';

/**
 * Progress Bar Component
 * Shows progress for long-running operations
 */
export const ProgressBar = ({
  value = 0,
  total = 100,
  width = 40,
  showPercentage = true,
  color = 'cyan',
  bgColor = 'gray',
  label = '',
  format = 'bar'
}) => {
  const percentage = Math.min(100, Math.max(0, (value / total) * 100));
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;

  const bar = format === 'bar' ? (
    <>
      {chalk[color]('█'.repeat(filled))}
      {chalk[bgColor]('░'.repeat(empty))}
    </>
  ) : format === 'dots' ? (
    <>
      {chalk[color]('●'.repeat(filled))}
      {chalk[bgColor]('○'.repeat(empty))}
    </>
  ) : (
    <>
      {chalk[color]('='.repeat(filled))}
      {chalk[bgColor]('-'.repeat(empty))}
    </>
  );

  return (
    <Box flexDirection="column">
      {label && <Text>{label}</Text>}
      <Box>
        <Text>[{bar}]</Text>
        {showPercentage && (
          <Text> {percentage.toFixed(1)}%</Text>
        )}
      </Box>
    </Box>
  );
};

/**
 * Spinner Component
 * Animated loading indicator
 */
export const Spinner = ({
  type = 'dots',
  color = 'cyan',
  text = 'Loading...',
  showTips = true
}) => {
  const spinners = {
    dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    line: ['|', '/', '-', '\\'],
    circle: ['◐', '◓', '◑', '◒'],
    square: ['◰', '◳', '◲', '◱'],
    arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
    bounce: ['⠁', '⠂', '⠄', '⠂'],
    pulse: ['◯', '◉', '●', '◉']
  };

  const [frame, setFrame] = useState(0);
  const frames = spinners[type] || spinners.dots;

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(prev => (prev + 1) % frames.length);
    }, 80);

    return () => clearInterval(timer);
  }, [frames.length]);

  const tips = [
    'Tip: Use Ctrl+C to cancel',
    'Tip: Check logs with --verbose',
    'Tip: Use --help for more options'
  ];

  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!showTips) return;

    const timer = setInterval(() => {
      setTipIndex(prev => (prev + 1) % tips.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [showTips]);

  return (
    <Box>
      <Text color={color}>{frames[frame]}</Text>
      <Text> {text}</Text>
      {showTips && (
        <Text dimColor> {tips[tipIndex]}</Text>
      )}
    </Box>
  );
};

/**
 * Status Bar Component
 * Shows current status at bottom of screen
 */
export const StatusBar = ({
  items = [],
  position = 'bottom',
  separator = ' | ',
  color = 'dim'
}) => {
  const formatItem = (item) => {
    if (typeof item === 'string') {
      return item;
    }
    if (item.label && item.value !== undefined) {
      return `${item.label}: ${item.value}`;
    }
    return '';
  };

  const content = items
    .map(formatItem)
    .filter(Boolean)
    .join(separator);

  return (
    <Box
      borderStyle="single"
      borderColor={color}
      paddingX={1}
      marginTop={position === 'bottom' ? 1 : 0}
      marginBottom={position === 'top' ? 1 : 0}
    >
      <Text color={color}>{content}</Text>
    </Box>
  );
};

/**
 * Interactive Menu Component
 * Allows user to select from options
 */
export const Menu = ({
  items = [],
  onSelect,
  onCancel,
  title = '',
  multiSelect = false,
  showNumbers = true
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(items.length - 1, prev + 1));
    } else if (key.return) {
      if (multiSelect) {
        if (selectedItems.has(selectedIndex)) {
          selectedItems.delete(selectedIndex);
        } else {
          selectedItems.add(selectedIndex);
        }
        setSelectedItems(new Set(selectedItems));
      } else {
        onSelect && onSelect(items[selectedIndex], selectedIndex);
      }
    } else if (key.escape) {
      onCancel && onCancel();
    } else if (input === 'q') {
      exit();
    } else if (showNumbers && /[1-9]/.test(input)) {
      const num = parseInt(input) - 1;
      if (num < items.length) {
        setSelectedIndex(num);
        if (!multiSelect) {
          onSelect && onSelect(items[num], num);
        }
      }
    }
  });

  return (
    <Box flexDirection="column">
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}
      {items.map((item, index) => (
        <Box key={index}>
          <Text color={selectedIndex === index ? 'cyan' : 'white'}>
            {selectedIndex === index ? '❯ ' : '  '}
            {showNumbers && `${index + 1}. `}
            {multiSelect && (selectedItems.has(index) ? '☑ ' : '☐ ')}
            {typeof item === 'string' ? item : item.label || item.name}
          </Text>
        </Box>
      ))}
      {multiSelect && (
        <Box marginTop={1}>
          <Text dimColor>Press Enter to toggle, Q to confirm</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Prompt Component
 * Input prompt for user interaction
 */
export const Prompt = ({
  message = 'Enter value:',
  defaultValue = '',
  onSubmit,
  onCancel,
  placeholder = '',
  mask = false,
  validate
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState('');

  useInput((input, key) => {
    if (key.return) {
      if (validate) {
        const validationError = validate(value);
        if (validationError) {
          setError(validationError);
          return;
        }
      }
      onSubmit && onSubmit(value);
    } else if (key.escape) {
      onCancel && onCancel();
    } else if (key.backspace || key.delete) {
      setValue(prev => prev.slice(0, -1));
      setError('');
    } else if (!key.ctrl && !key.meta && input) {
      setValue(prev => prev + input);
      setError('');
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{message} </Text>
        <Text color="cyan">
          {mask ? '*'.repeat(value.length) : value}
          {!value && placeholder && <Text dimColor>{placeholder}</Text>}
        </Text>
        <Text color="gray">│</Text>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Dialog Component
 * Modal-like dialog for important messages
 */
export const Dialog = ({
  title,
  message,
  type = 'info',
  buttons = ['OK'],
  onSelect,
  width = 50
}) => {
  const [selectedButton, setSelectedButton] = useState(0);

  useInput((input, key) => {
    if (key.leftArrow) {
      setSelectedButton(prev => Math.max(0, prev - 1));
    } else if (key.rightArrow) {
      setSelectedButton(prev => Math.min(buttons.length - 1, prev + 1));
    } else if (key.return) {
      onSelect && onSelect(buttons[selectedButton], selectedButton);
    }
  });

  const typeColors = {
    info: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red'
  };

  const typeIcons = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    error: '✗'
  };

  return (
    <Box
      borderStyle="double"
      borderColor={typeColors[type]}
      paddingX={2}
      paddingY={1}
      width={width}
      flexDirection="column"
    >
      <Box marginBottom={1}>
        <Text color={typeColors[type]} bold>
          {typeIcons[type]} {title}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>
      <Box justifyContent="center">
        {buttons.map((button, index) => (
          <Box key={index} marginX={1}>
            <Text
              inverse={selectedButton === index}
              color={selectedButton === index ? 'white' : 'gray'}
            >
              {' '}{button}{' '}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/**
 * Toast Notification Component
 * Temporary notification message
 */
export const Toast = ({
  message,
  type = 'info',
  duration = 3000,
  position = 'top-right',
  onClose
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onClose && onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const typeStyles = {
    info: { bg: 'blue', fg: 'white', icon: 'ℹ' },
    success: { bg: 'green', fg: 'white', icon: '✓' },
    warning: { bg: 'yellow', fg: 'black', icon: '⚠' },
    error: { bg: 'red', fg: 'white', icon: '✗' }
  };

  const style = typeStyles[type];

  return (
    <Box
      paddingX={1}
      backgroundColor={style.bg}
    >
      <Text color={style.fg}>
        {style.icon} {message}
      </Text>
    </Box>
  );
};

/**
 * Badge Component
 * Small status indicator
 */
export const Badge = ({
  text,
  color = 'blue',
  variant = 'solid'
}) => {
  if (variant === 'solid') {
    return (
      <Text backgroundColor={color} color="white">
        {' '}{text}{' '}
      </Text>
    );
  } else if (variant === 'outline') {
    return (
      <Text color={color}>
        [{text}]
      </Text>
    );
  } else {
    return (
      <Text color={color}>
        {text}
      </Text>
    );
  }
};

/**
 * Divider Component
 * Visual separator
 */
export const Divider = ({
  width = 40,
  character = '─',
  color = 'gray',
  title = '',
  titleColor = 'white'
}) => {
  if (title) {
    const padding = Math.floor((width - title.length - 2) / 2);
    const leftPad = character.repeat(Math.max(0, padding));
    const rightPad = character.repeat(Math.max(0, width - padding - title.length - 2));

    return (
      <Box>
        <Text color={color}>{leftPad}</Text>
        <Text color={titleColor}> {title} </Text>
        <Text color={color}>{rightPad}</Text>
      </Box>
    );
  }

  return (
    <Text color={color}>
      {character.repeat(width)}
    </Text>
  );
};

/**
 * List Component
 * Formatted list display
 */
export const List = ({
  items = [],
  ordered = false,
  marker = '•',
  markerColor = 'cyan',
  compact = false
}) => {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Box key={index} marginBottom={compact ? 0 : 1}>
          <Text color={markerColor}>
            {ordered ? `${index + 1}.` : marker}{' '}
          </Text>
          <Text>{item}</Text>
        </Box>
      ))}
    </Box>
  );
};

/**
 * Table Component
 * Simple table display
 */
export const Table = ({
  headers = [],
  rows = [],
  borderStyle = 'single',
  headerColor = 'cyan',
  cellPadding = 1
}) => {
  const columnWidths = headers.map((header, i) => {
    const headerWidth = header.length;
    const maxRowWidth = Math.max(...rows.map(row =>
      (row[i] || '').toString().length
    ));
    return Math.max(headerWidth, maxRowWidth) + cellPadding * 2;
  });

  const renderRow = (cells, color) => (
    <Box>
      {cells.map((cell, i) => (
        <Box key={i} width={columnWidths[i]} paddingX={cellPadding}>
          <Text color={color}>{cell}</Text>
        </Box>
      ))}
    </Box>
  );

  return (
    <Box flexDirection="column" borderStyle={borderStyle}>
      {renderRow(headers, headerColor)}
      <Divider width={columnWidths.reduce((a, b) => a + b, 0)} />
      {rows.map((row, i) => renderRow(row, 'white'))}
    </Box>
  );
};

/**
 * Tabs Component
 * Tab navigation interface
 */
export const Tabs = ({
  tabs = [],
  activeTab = 0,
  onTabChange,
  color = 'cyan'
}) => {
  const [selectedTab, setSelectedTab] = useState(activeTab);

  useInput((input, key) => {
    if (key.leftArrow) {
      const newTab = Math.max(0, selectedTab - 1);
      setSelectedTab(newTab);
      onTabChange && onTabChange(newTab);
    } else if (key.rightArrow) {
      const newTab = Math.min(tabs.length - 1, selectedTab + 1);
      setSelectedTab(newTab);
      onTabChange && onTabChange(newTab);
    } else if (/[1-9]/.test(input)) {
      const num = parseInt(input) - 1;
      if (num < tabs.length) {
        setSelectedTab(num);
        onTabChange && onTabChange(num);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        {tabs.map((tab, index) => (
          <Box key={index} marginRight={2}>
            <Text
              color={selectedTab === index ? color : 'gray'}
              bold={selectedTab === index}
              underline={selectedTab === index}
            >
              {tab.label || tab}
            </Text>
          </Box>
        ))}
      </Box>
      {tabs[selectedTab].content && (
        <Box>{tabs[selectedTab].content}</Box>
      )}
    </Box>
  );
};

/**
 * Theme Colors
 * Color schemes for Claude Code UI
 */
export const themes = {
  claude: {
    primary: 'rgb(215,119,87)',
    primaryShimmer: 'rgb(245,149,117)',
    secondary: 'rgb(87,105,247)',
    secondaryShimmer: 'rgb(117,135,255)',
    success: 'rgb(0,255,0)',
    warning: 'rgb(255,255,0)',
    error: 'rgb(255,0,0)',
    info: 'rgb(0,255,255)',
    bash: 'rgb(255,0,135)',
    permission: 'rgb(87,105,247)',
    permissionShimmer: 'rgb(137,155,255)',
    planMode: 'rgb(0,102,102)'
  },
  dark: {
    primary: '#cdcd00',
    primaryShimmer: '#ffff00',
    secondary: '#5c5cff',
    secondaryShimmer: '#8c8cff',
    success: '#00ff00',
    warning: '#ffff00',
    error: '#ff0000',
    info: '#00ffff',
    bash: '#ff00ff',
    permission: '#5c5cff',
    permissionShimmer: '#8c8cff',
    planMode: '#00ffff'
  },
  light: {
    primary: 'rgb(255,153,51)',
    primaryShimmer: 'rgb(255,183,101)',
    secondary: 'rgb(51,102,255)',
    secondaryShimmer: 'rgb(101,152,255)',
    success: 'rgb(0,204,0)',
    warning: 'rgb(255,204,0)',
    error: 'rgb(255,51,51)',
    info: 'rgb(51,204,255)',
    bash: 'rgb(0,102,204)',
    permission: 'rgb(51,102,255)',
    permissionShimmer: 'rgb(101,152,255)',
    planMode: 'rgb(51,102,102)'
  }
};

// Export UI Manager
export class UIManager extends EventEmitter {
  constructor() {
    super();
    this.theme = themes.claude;
    this.components = new Map();
  }

  setTheme(themeName) {
    if (themes[themeName]) {
      this.theme = themes[themeName];
      this.emit('theme:changed', themeName);
    }
  }

  registerComponent(name, component) {
    this.components.set(name, component);
  }

  getComponent(name) {
    return this.components.get(name);
  }

  showProgress(options) {
    return <ProgressBar {...options} />;
  }

  showSpinner(options) {
    return <Spinner {...options} />;
  }

  showMenu(items, options) {
    return <Menu items={items} {...options} />;
  }

  showPrompt(options) {
    return <Prompt {...options} />;
  }

  showDialog(options) {
    return <Dialog {...options} />;
  }

  showToast(message, type, options) {
    return <Toast message={message} type={type} {...options} />;
  }
}

export const uiManager = new UIManager();