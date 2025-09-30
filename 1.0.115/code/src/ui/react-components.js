/**
 * React UI Components
 * Settings, theme, model selection and other UI components
 * Extracted from lines 36150-37000 of original file
 */

import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../hooks/use-keypress';

/**
 * Theme Selector Component
 * Allows users to select between different color themes
 * Original: function Db1
 */
export function ThemeSelector({
  onThemeSelect,
  showIntroText = false,
  helpText = '',
  showHelpTextBelow = false,
  hideEscToCancel = false,
  skipExitHandling = false
}) {
  const [currentTheme] = useTheme();
  const { setPreviewTheme, savePreview } = usePreviewTheme();
  const exitState = useExitHandler(skipExitHandling ? () => {} : undefined);

  const themes = [
    { label: 'Dark mode', value: 'dark' },
    { label: 'Light mode', value: 'light' },
    { label: 'Dark mode (colorblind-friendly)', value: 'dark-daltonized' },
    { label: 'Light mode (colorblind-friendly)', value: 'light-daltonized' },
    { label: 'Dark mode (ANSI colors only)', value: 'dark-ansi' },
    { label: 'Light mode (ANSI colors only)', value: 'light-ansi' }
  ];

  const handleFocus = useCallback((theme) => {
    setPreviewTheme(theme);
  }, [setPreviewTheme]);

  const handleChange = useCallback((theme) => {
    savePreview();
    onThemeSelect(theme);
  }, [savePreview, onThemeSelect]);

  const handleCancel = skipExitHandling ?
    () => savePreview() :
    async () => {
      savePreview();
      await exitProcess(0);
    };

  return (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      <Box flexDirection="column">
        {showIntroText && (
          <Text>Select your preferred theme:</Text>
        )}

        <Select
          options={themes}
          onFocus={handleFocus}
          onChange={handleChange}
          onCancel={handleCancel}
          visibleOptionCount={6}
          defaultValue={currentTheme}
        />
      </Box>

      {showHelpTextBelow && helpText && (
        <Box paddingLeft={1}>
          <Text dimColor>{helpText}</Text>
        </Box>
      )}

      {!hideEscToCancel && (
        <Box marginLeft={3}>
          <Text dimColor>
            {exitState.pending ? exitState.keyName : 'Esc to cancel'}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Model Selector Component
 * Allows users to select AI model
 * Original: function $b1
 */
export function ModelSelector({ initial, onSelect }) {
  const defaultValue = initial === null ? '__NO_PREFERENCE__' : initial;
  const [selectedModel, setSelectedModel] = useState(defaultValue);
  const models = getAvailableModels();
  const exitState = useExitHandler();
  const isPro = getCurrentSessionContext() && getSubscriptionTier() === 'pro';

  const visibleCount = Math.min(10, models.length);

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="remember"
        paddingX={2}
        paddingY={1}
        width="100%"
      >
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>
            Switch between Claude models. Applies to this session and future Claude Code sessions.
            For custom model names, specify with --model.
          </Text>
        </Box>

        <Box flexDirection="column" paddingX={1}>
          <Select
            defaultValue={selectedModel}
            focusValue={models.some(m => m.value === selectedModel) ? selectedModel : models[0]?.value}
            options={models.map(m => ({
              ...m,
              value: m.value === null ? '__NO_PREFERENCE__' : m.value
            }))}
            onFocus={setSelectedModel}
            onChange={(value) => onSelect(value === '__NO_PREFERENCE__' ? null : value)}
            onCancel={() => {}}
            visibleOptionCount={visibleCount}
          />
        </Box>

        {isPro && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              Want Opus 4.1? Run <Text bold>/upgrade</Text> to upgrade to Max
            </Text>
          </Box>
        )}
      </Box>

      <Box paddingX={1}>
        <Text dimColor>
          {exitState.pending ? exitState.keyName : 'Esc to exit'}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Output Style Selector
 * Allows users to select output style preference
 * Original: function qb1
 */
export function OutputStyleSelector({ initialStyle, onComplete, onCancel }) {
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOutputStyles()
      .then(loadedStyles => {
        const options = formatOutputStyles(loadedStyles);
        setStyles(options);
        setLoading(false);
      })
      .catch(() => {
        const defaultOptions = formatOutputStyles(getDefaultStyles());
        setStyles(defaultOptions);
        setLoading(false);
      });
  }, []);

  const handleSelection = useCallback((style) => {
    onComplete(style);
  }, [onComplete]);

  if (loading) {
    return (
      <Box>
        <Text>Loading output styles...</Text>
      </Box>
    );
  }

  return (
    <DialogBox
      title="Choose your preferred output style:"
      onCancel={onCancel}
      borderDimColor
    >
      <Box flexDirection="column" gap={1}>
        <Select
          options={styles}
          defaultValue={initialStyle}
          onChange={handleSelection}
          onCancel={onCancel}
          visibleOptionCount={Math.min(6, styles.length)}
        />
      </Box>
    </DialogBox>
  );
}

/**
 * Settings Component
 * Main settings UI with all configuration options
 * Original: function LWB
 */
export function Settings({
  onClose,
  isConnectedToIde,
  isAutocheckpointingAvailable
}) {
  const [theme, setTheme] = useTheme();
  const [globalConfig, setGlobalConfig] = useState(getGlobalConfig());
  const [localSettings, setLocalSettings] = useState(getLocalSettings());
  const [outputStyle, setOutputStyle] = useState(localSettings?.outputStyle || 'default');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const exitState = useExitHandler();
  const [{ mainLoopModel, todoFeatureEnabled, verbose }, updateAppState] = useAppState();
  const [pendingChanges, setPendingChanges] = useState({});
  const [activeDialog, setActiveDialog] = useState(null);

  // Setting options configuration
  const settings = [
    {
      id: 'autoCompactEnabled',
      label: 'Auto-compact',
      value: globalConfig.autoCompactEnabled,
      type: 'boolean',
      onChange(value) {
        const config = { ...getGlobalConfig(), autoCompactEnabled: value };
        updateGlobalConfig(config);
        setGlobalConfig(config);
        trackEvent('tengu_auto_compact_setting_changed', { enabled: value });
      }
    },
    {
      id: 'todoFeatureEnabled',
      label: 'Use todo list',
      value: todoFeatureEnabled,
      type: 'boolean',
      onChange(value) {
        updateAppState(state => ({ ...state, todoFeatureEnabled: value }));
      }
    },
    {
      id: 'verbose',
      label: 'Verbose output',
      value: verbose,
      type: 'boolean',
      onChange(value) {
        updateAppState(state => ({ ...state, verbose: value }));
      }
    },
    {
      id: 'theme',
      label: 'Theme',
      value: theme,
      type: 'managedEnum',
      onChange: setTheme
    },
    {
      id: 'outputStyle',
      label: 'Output style',
      value: outputStyle,
      type: 'managedEnum',
      onChange: () => {}
    },
    {
      id: 'model',
      label: 'Model',
      value: mainLoopModel === null ? 'Default (recommended)' : mainLoopModel,
      type: 'managedEnum',
      onChange(model) {
        updateAppState(state => ({ ...state, mainLoopModel: model }));
      }
    }
  ];

  // Add auto-checkpointing if available
  if (isAutocheckpointingAvailable) {
    settings.splice(1, 0, {
      id: 'autocheckpointingEnabled',
      label: 'Auto-checkpointing',
      value: globalConfig.autocheckpointingEnabled,
      type: 'boolean',
      onChange(value) {
        const config = { ...getGlobalConfig(), autocheckpointingEnabled: value };
        updateGlobalConfig(config);
        setGlobalConfig(config);
        trackEvent('tengu_autocheckpointing_setting_changed', { enabled: value });
      }
    });
  }

  useKeypress((key, modifiers) => {
    if (activeDialog !== null) {
      setActiveDialog(null);
      return;
    }

    const currentSetting = settings[selectedIndex];

    // Handle value changes
    if (modifiers.return || key === ' ') {
      if (currentSetting.type === 'boolean') {
        currentSetting.onChange(!currentSetting.value);
      } else if (currentSetting.type === 'managedEnum') {
        switch (currentSetting.id) {
          case 'theme':
            setActiveDialog('theme');
            break;
          case 'model':
            setActiveDialog('model');
            break;
          case 'outputStyle':
            setActiveDialog('outputStyle');
            break;
        }
      }
    }

    // Navigation
    if (modifiers.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    }
    if (modifiers.downArrow) {
      setSelectedIndex(Math.min(settings.length - 1, selectedIndex + 1));
    }

    // Exit
    if (key === 'escape') {
      onClose();
    }
  });

  // Render active dialog
  if (activeDialog) {
    switch (activeDialog) {
      case 'theme':
        return (
          <ThemeSelector
            initialTheme={theme}
            onThemeSelect={(newTheme) => {
              setTheme(newTheme);
              setActiveDialog(null);
            }}
            skipExitHandling
          />
        );
      case 'model':
        return (
          <ModelSelector
            initial={mainLoopModel}
            onSelect={(model) => {
              settings.find(s => s.id === 'model').onChange(model);
              setActiveDialog(null);
            }}
          />
        );
      case 'outputStyle':
        return (
          <OutputStyleSelector
            initialStyle={outputStyle}
            onComplete={(style) => {
              setOutputStyle(style || 'default');
              setActiveDialog(null);
              saveLocalSettings({ outputStyle: style });
              trackEvent('tengu_output_style_changed', { style: style || 'default' });
            }}
            onCancel={() => setActiveDialog(null)}
          />
        );
    }
  }

  // Render settings list
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderDimColor
        paddingX={1}
        marginTop={1}
      >
        <Box flexDirection="column" minHeight={2} marginBottom={1}>
          <Text bold>Settings</Text>
        </Box>

        {settings.map((setting, index) => {
          const isSelected = index === selectedIndex;

          return (
            <Box key={setting.id} height={2} minHeight={2}>
              <Box width={44}>
                <Text color={isSelected ? 'suggestion' : undefined}>
                  {isSelected ? '> ' : '  '}
                  {setting.label}
                </Text>
              </Box>

              <Box>
                {setting.type === 'boolean' ? (
                  <Text color={isSelected ? 'suggestion' : undefined}>
                    {setting.value ? 'Enabled' : 'Disabled'}
                  </Text>
                ) : (
                  <Text color={isSelected ? 'suggestion' : undefined}>
                    {formatSettingValue(setting)}
                  </Text>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box marginLeft={3}>
        <Text dimColor>
          {exitState.pending ?
            exitState.keyName :
            '↑/↓ to select · Enter/Tab/Space to change · Esc to close'
          }
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Token Usage Display Component
 * Shows current token usage with visual grid
 * Original: function OWB
 */
export function TokenUsageDisplay({ data }) {
  const {
    categories,
    totalTokens,
    rawMaxTokens,
    percentage,
    gridRows,
    model,
    memoryFiles,
    mcpTools
  } = data;

  const { columns } = getTerminalDimensions();
  const isCompact = columns < 80;
  const visibleCategories = categories.filter(c => c.tokens > 0 && c.name !== 'Free space');

  return (
    <Box flexDirection="column" padding={isCompact ? 0 : 1}>
      <Box flexDirection="row" gap={2} alignItems="center">
        {/* Token grid visualization */}
        <Box flexDirection="column" flexShrink={0}>
          {gridRows.map((row, rowIndex) => (
            <Box key={rowIndex} flexDirection="row" marginLeft={-1}>
              {row.map((cell, cellIndex) => (
                <Text
                  key={cellIndex}
                  color={cell.categoryName === 'Free space' ? undefined : cell.color}
                >
                  {cell.char}
                </Text>
              ))}
            </Box>
          ))}
        </Box>

        {/* Token statistics */}
        <Box flexDirection="column" gap={0} flexShrink={0}>
          <Text dimColor>
            {model} • {Math.round(totalTokens / 1000)}k/{Math.round(rawMaxTokens / 1000)}k tokens ({percentage}%)
          </Text>

          {visibleCategories.map((category, index) => (
            <Box key={index}>
              <Text color={category.color}>{category.icon}</Text>
              <Text> {category.name}</Text>
              <Text dimColor>
                {' '}
                {category.tokens < 1000 ? category.tokens : `${(category.tokens / 1000).toFixed(1)}k`}
                {' tokens ('}
                {((category.tokens / rawMaxTokens) * 100).toFixed(1)}%)
              </Text>
            </Box>
          ))}

          {(categories.find(c => c.name === 'Free space')?.tokens ?? 0) > 0 && (
            <Box>
              <Text>□ Free space</Text>
              <Text dimColor>
                {' '}
                {((categories.find(c => c.name === 'Free space')?.tokens || 0) / 1000).toFixed(1)}k
                {' ('}
                {(((categories.find(c => c.name === 'Free space')?.tokens || 0) / rawMaxTokens) * 100).toFixed(1)}%)
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* MCP tools section */}
      {mcpTools.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>MCP Tools</Text>
          {mcpTools.map((tool, index) => (
            <Box key={index}>
              <Text>{tool.name}</Text>
              <Text dimColor>
                {' '}
                {tool.tokens < 1000 ? tool.tokens : `${(tool.tokens / 1000).toFixed(1)}k`}
                {' tokens'}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Memory files section */}
      {memoryFiles.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Memory Files</Text>
          {memoryFiles.map((file, index) => (
            <Box key={index}>
              <Text>{getFileSourceLabel(file.source)}: {file.name}</Text>
              <Text dimColor>
                {' '}
                {file.tokens < 1000 ? file.tokens : `${(file.tokens / 1000).toFixed(1)}k`}
                {' tokens'}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * Dialog Box Component
 * Reusable dialog container
 * Original: function Jb
 */
export function DialogBox({
  title,
  subtitle,
  children,
  onCancel,
  borderColor,
  borderDimColor
}) {
  const exitState = useExitHandler();

  useKeypress((key) => {
    if (key === 'escape') {
      onCancel();
    }
  });

  return (
    <>
      <Box
        flexDirection="column"
        paddingX={1}
        paddingBottom={1}
        borderStyle="round"
        borderColor={borderColor}
        borderDimColor={borderDimColor}
        gap={1}
      >
        <Box flexDirection="column">
          {title && <Text bold>{title}</Text>}
          {subtitle && <Text dimColor>{subtitle}</Text>}
        </Box>

        {children}
      </Box>

      <Box marginLeft={3}>
        <Text dimColor>
          {exitState.pending ? exitState.keyName : 'Esc to cancel'}
        </Text>
      </Box>
    </>
  );
}

// Helper functions
function formatSettingValue(setting) {
  switch (setting.id) {
    case 'theme':
      const themeNames = {
        'dark': 'Dark mode',
        'light': 'Light mode',
        'dark-daltonized': 'Dark mode (colorblind-friendly)',
        'light-daltonized': 'Light mode (colorblind-friendly)',
        'dark-ansi': 'Dark mode (ANSI colors only)',
        'light-ansi': 'Light mode (ANSI colors only)'
      };
      return themeNames[setting.value] || setting.value;
    default:
      return String(setting.value);
  }
}

function getFileSourceLabel(source) {
  switch (source) {
    case 'projectSettings': return 'Project';
    case 'userSettings': return 'User';
    case 'localSettings': return 'Local';
    case 'flagSettings': return 'Flag';
    case 'policySettings': return 'Policy';
    case 'plugin': return 'Plugin';
    case 'built-in': return 'Built-in';
    default: return String(source);
  }
}

function formatOutputStyles(styles) {
  const DEFAULT_STYLE = 'Default';
  const DEFAULT_DESCRIPTION = 'Claude completes coding tasks efficiently and provides concise responses';

  return Object.entries(styles).map(([key, value]) => ({
    label: value?.name ?? DEFAULT_STYLE,
    value: key,
    description: value?.description ?? DEFAULT_DESCRIPTION
  }));
}

// Placeholder hooks/functions - would need to be imported
function useTheme() { return ['dark', () => {}]; }
function usePreviewTheme() { return { setPreviewTheme: () => {}, savePreview: () => {} }; }
function useExitHandler() { return { pending: false, keyName: null }; }
function useAppState() { return [{}, () => {}]; }
function useKeypress() { }
function getGlobalConfig() { return {}; }
function updateGlobalConfig() { }
function getLocalSettings() { return {}; }
function saveLocalSettings() { }
function getAvailableModels() { return []; }
function getCurrentSessionContext() { return null; }
function getSubscriptionTier() { return 'free'; }
function getTerminalDimensions() { return { columns: 80 }; }
function loadOutputStyles() { return Promise.resolve({}); }
function getDefaultStyles() { return {}; }
function exitProcess() { return Promise.resolve(); }
function trackEvent() { }

export default {
  ThemeSelector,
  ModelSelector,
  OutputStyleSelector,
  Settings,
  TokenUsageDisplay,
  DialogBox
};