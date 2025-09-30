/**
 * MCP Server UI Components
 * User interface for managing MCP servers
 * Extracted from lines 41639-42337
 */

import React, { useState, useEffect, useMemo, useCallback, useContext, createContext } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { exec } from 'child_process';

/**
 * MCP Server List Component
 * Shows list of configured MCP servers
 * Original: function oN0() - lines 41639-41704
 */
export function MCPServerList({ servers, onSelectServer, onComplete }) {
  const [theme] = useTheme();
  const keyboardHint = useKeyboardHint();

  if (servers.length === 0) return null;

  const configScope = getConfigScope();

  const serverOptions = servers.map(server => {
    let statusIcon = '';
    let statusText = '';
    let statusDisplay = '';

    if (server.type === 'connected') {
      statusIcon = theme.success('✓');
      statusText = 'connected · Enter to view details';
      statusDisplay = `${statusIcon} ${statusText}`;
    } else if (server.type === 'pending') {
      statusIcon = theme.inactive('○');
      statusText = 'connecting...';
      statusDisplay = `${statusIcon} ${statusText}`;
    } else if (server.type === 'needs-auth') {
      statusIcon = theme.warning('▲');
      statusText = 'disconnected · Enter to login';
      statusDisplay = `${statusIcon} ${statusText}`;
    } else if (server.type === 'failed') {
      statusIcon = theme.error('✗');
      if (server.errorMessage) {
        statusText = `failed · Enter to view details`;
      } else {
        statusText = 'failed';
      }
      statusDisplay = `${statusIcon} ${statusText}`;
    }

    return {
      label: server.name,
      value: server.name,
      description: statusDisplay,
      dimDescription: false
    };
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingX={1} borderStyle="round" borderDimColor>
        <Text bold>MCP Servers</Text>
        <SelectInput
          items={serverOptions}
          onChange={value => {
            const server = servers.find(s => s.name === value);
            if (server) onSelectServer(server);
          }}
          onCancel={() => onComplete()}
        />

        {configScope && (
          <Box marginTop={1}>
            <Text dimColor>
              ※ Tip: {' '}
              {configScope === 'user'
                ? 'These servers are configured in your user settings'
                : configScope === 'project'
                  ? 'These servers are configured in your project settings'
                  : 'These servers are configured locally'}
            </Text>
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          {['user', 'project', 'local'].map(scope => (
            <Box key={scope} flexDirection="column" marginLeft={1}>
              <Text dimColor>
                {scope === 'user' && '~/.claude/config.json'}
                {scope === 'project' && '.claude.json'}
                {scope === 'local' && '.claude.local.json'}
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1} marginLeft={0}>
          <Text dimColor>
            Learn more at:{' '}
            <Text color="claude">
              https://docs.claude.ai/mcp
            </Text>
          </Text>
        </Box>
      </Box>

      <Box marginLeft={3}>
        <Text dimColor>
          {keyboardHint.pending ? 'Loading...' : keyboardHint.text}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Server Tool Count Display
 * Shows summary of tools, resources and prompts
 * Original: function uf1() - lines 41707-41714
 */
export function ServerToolSummary({ serverToolsCount, serverPromptsCount, serverResourcesCount }) {
  const features = [];

  if (serverToolsCount > 0) features.push('tools');
  if (serverResourcesCount > 0) features.push('resources');
  if (serverPromptsCount > 0) features.push('prompts');

  return (
    <Box>
      <Text>
        {serverToolsCount} {features.join(', ')}
      </Text>
    </Box>
  );
}

/**
 * MCP Server Details (Connected)
 * Shows details for a connected MCP server
 * Original: function tN0() - lines 41817-41899
 */
export function MCPServerDetails({ server, serverToolsCount, onViewTools, onCancel, onComplete }) {
  const [theme] = useTheme();
  const keyboardHint = useKeyboardHint();
  const [config] = useConfig();
  const reconnectServer = useMCPReconnect();
  const [isReconnecting, setIsReconnecting] = useState(false);

  const serverTitle = String(server.name).charAt(0).toUpperCase() + String(server.name).slice(1);
  const commandsCount = getServerCommands(config.mcp.commands, server.name).length;

  const options = [];
  if (serverToolsCount > 0) {
    options.push({ label: 'View Tools', value: 'tools' });
  }
  options.push({ label: 'Reconnect', value: 'reconnectMcpServer' });

  if (options.length === 0) {
    options.push({ label: 'Back', value: 'back' });
  }

  if (isReconnecting) {
    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Text color="text">
          Reconnecting to {server.name}...
        </Text>
        <Box>
          <Spinner type="dots" />
        </Box>
      </Box>
    );
  }

  return (
    <>
      <Box flexDirection="column" paddingX={1} borderStyle="round">
        <Box flexDirection="column" gap={0}>
          <Box>
            <Text bold>{serverTitle}</Text>
            {server.type === 'connected' && (
              <>
                <Text> </Text>
                <Text color="success">Connected</Text>
              </>
            )}
          </Box>

          <Box>
            <Text dimColor>Transport: </Text>
            <Text>{server.transport}</Text>
          </Box>

          {server.command && (
            <Box>
              <Text dimColor>Command: </Text>
              <Text>{server.command}</Text>
            </Box>
          )}

          <Box>
            <Text dimColor>Features: </Text>
            <ServerToolSummary
              serverToolsCount={serverToolsCount}
              serverPromptsCount={commandsCount}
              serverResourcesCount={config.mcp.resources[server.name]?.length || 0}
            />
          </Box>

          {serverToolsCount > 0 && (
            <Box>
              <Text dimColor>
                {serverToolsCount} tool{serverToolsCount > 1 ? 's' : ''} available
              </Text>
            </Box>
          )}
        </Box>

        {options.length > 0 && (
          <Box marginTop={1}>
            <SelectInput
              items={options}
              onChange={async value => {
                if (value === 'tools') {
                  onViewTools();
                } else if (value === 'reconnectMcpServer') {
                  setIsReconnecting(true);
                  try {
                    const result = await reconnectServer(server.name);
                    const message = getReconnectSuccessMessage(result, server.name);
                    onComplete?.(message);
                  } catch (error) {
                    onComplete?.(getReconnectErrorMessage(error, server.name));
                  } finally {
                    setIsReconnecting(false);
                  }
                } else if (value === 'back') {
                  onCancel();
                }
              }}
              onCancel={onCancel}
            />
          </Box>
        )}
      </Box>

      <Box marginLeft={3}>
        <Text dimColor>
          {keyboardHint.pending ? 'Loading...' : keyboardHint.text}
        </Text>
      </Box>
    </>
  );
}

/**
 * MCP Server Auth Details (Needs Authentication)
 * Shows details for server needing authentication
 * Original: function eN0() - lines 41901-42062
 */
export function MCPServerAuthDetails({ server, serverToolsCount, onViewTools, onCancel, onComplete }) {
  const [theme] = useTheme();
  const keyboardHint = useKeyboardHint();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authUrl, setAuthUrl] = useState(null);
  const [config, updateConfig] = useConfig();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [abortController, setAbortController] = useState(null);

  useInput((input, key) => {
    if (key.escape) {
      if (abortController) abortController.abort();
      setIsAuthenticating(false);
      setAuthUrl(null);
      setAbortController(null);
    }
  });

  const serverTitle = String(server.name).charAt(0).toUpperCase() + String(server.name).slice(1);
  const commandsCount = getServerCommands(config.mcp.commands, server.name).length;
  const reconnectServer = useMCPReconnect();

  const handleAuthenticate = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthUrl(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const authResult = await server.authenticate(controller.signal);

      if (authResult.url) {
        setAuthUrl(authResult.url);
        // Open browser
        await openBrowser(authResult.url);
      }

      // Wait for authentication
      const success = await authResult.waitForAuth();

      if (success) {
        // Reconnect after auth
        const reconnectResult = await reconnectServer(server.name);

        if (reconnectResult.type === 'connected') {
          const message = server.isAuthenticated
            ? `Authentication successful. Reconnected to ${server.name}.`
            : `Authentication successful. Connected to ${server.name}.`;
          onComplete?.(message);
        } else if (reconnectResult.type === 'needs-auth') {
          onComplete?.(
            'Authentication successful, but server still requires authentication. ' +
            'You may need to manually restart Claude Code.'
          );
        } else {
          onComplete?.(
            'Authentication successful, but server reconnection failed. ' +
            'You may need to manually restart Claude Code for the changes to take effect.'
          );
        }
      }
    } catch (error) {
      console.error(`Authentication failed: ${error}`);
    } finally {
      setIsAuthenticating(false);
      setAbortController(null);
    }
  }, [server, reconnectServer, onComplete]);

  const handleClearAuth = async () => {
    updateConfig(config => {
      const tools = removeServerTools(config.mcp.tools, server.name);
      const commands = removeServerCommands(config.mcp.commands, server.name);
      const resources = removeServerResources(config.mcp.resources, server.name);

      return {
        ...config,
        mcp: {
          ...config.mcp,
          tools,
          commands,
          resources
        }
      };
    });

    onComplete?.(`Authentication cleared for ${server.name}.`);
  };

  if (isAuthenticating) {
    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box>
          <Text>Authenticating with {server.name}...</Text>
          <Spinner type="dots" />
        </Box>

        {authUrl && (
          <Box flexDirection="column">
            <Text dimColor>
              If your browser doesn't open automatically, copy this URL manually:
            </Text>
            <Text color="claude">{authUrl}</Text>
          </Box>
        )}

        <Box marginLeft={3}>
          <Text dimColor>
            Return here after authenticating in your browser. Press Esc to go back.
          </Text>
        </Box>
      </Box>
    );
  }

  if (isReconnecting) {
    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Text color="text">
          Reconnecting to {server.name}…
        </Text>
        <Box>
          <Spinner type="dots" />
        </Box>
      </Box>
    );
  }

  const options = [];

  if (server.isAuthenticated) {
    options.push({ label: 'Re-authenticate', value: 'reauth' });
    options.push({ label: 'Clear authentication', value: 'clear-auth' });
  } else {
    options.push({ label: 'Authenticate', value: 'auth' });
  }

  if (serverToolsCount > 0) {
    options.push({ label: 'View Tools', value: 'tools' });
  }

  if (options.length === 0) {
    options.push({ label: 'Back', value: 'back' });
  }

  return (
    <>
      <Box flexDirection="column" paddingX={1} borderStyle="round">
        <Box flexDirection="column" gap={0}>
          <Box>
            <Text bold>{serverTitle}</Text>
            {server.isAuthenticated ? (
              <>
                <Text> </Text>
                <Text color="warning">Re-authentication required</Text>
              </>
            ) : (
              <>
                <Text> </Text>
                <Text color="warning">Authentication required</Text>
              </>
            )}
          </Box>

          <Box>
            <Text dimColor>Transport: </Text>
            <Text>{server.transport}</Text>
          </Box>

          <Box>
            <Text dimColor>Features: </Text>
            <ServerToolSummary
              serverToolsCount={serverToolsCount}
              serverPromptsCount={commandsCount}
              serverResourcesCount={config.mcp.resources[server.name]?.length || 0}
            />
          </Box>

          {serverToolsCount > 0 && (
            <Box>
              <Text dimColor>
                {serverToolsCount} tool{serverToolsCount > 1 ? 's' : ''} available
              </Text>
            </Box>
          )}
        </Box>

        {options.length > 0 && (
          <Box marginTop={1}>
            <SelectInput
              items={options}
              onChange={async value => {
                switch (value) {
                  case 'tools':
                    onViewTools();
                    break;
                  case 'auth':
                  case 'reauth':
                    await handleAuthenticate();
                    break;
                  case 'clear-auth':
                    await handleClearAuth();
                    break;
                  case 'reconnectMcpServer':
                    setIsReconnecting(true);
                    try {
                      const result = await reconnectServer(server.name);
                      const message = getReconnectSuccessMessage(result, server.name);
                      onComplete?.(message);
                    } catch (error) {
                      onComplete?.(getReconnectErrorMessage(error, server.name));
                    } finally {
                      setIsReconnecting(false);
                    }
                    break;
                  case 'back':
                    onCancel();
                    break;
                }
              }}
              onCancel={onCancel}
            />
          </Box>
        )}
      </Box>

      <Box marginLeft={3}>
        <Text dimColor>
          {keyboardHint.pending ? 'Loading...' : keyboardHint.text}
        </Text>
      </Box>
    </>
  );
}

/**
 * MCP Connection Manager Context Provider
 * Provides reconnection functionality
 * Original: function mf1() - lines 41803-41806
 */
const MCPReconnectContext = createContext(null);

export function MCPConnectionManager({ children, dynamicMcpConfig, isStrictMcpConfig }) {
  const { reconnectMcpServer } = useMCPConnection(dynamicMcpConfig, isStrictMcpConfig);
  const value = useMemo(() => ({ reconnectMcpServer }), [reconnectMcpServer]);

  return (
    <MCPReconnectContext.Provider value={value}>
      {children}
    </MCPReconnectContext.Provider>
  );
}

export function useMCPReconnect() {
  const context = useContext(MCPReconnectContext);
  if (!context) {
    throw new Error('useMcpReconnect must be used within MCPConnectionManager');
  }
  return context.reconnectMcpServer;
}

// Helper functions
function getConfigScope() {
  // Implementation would determine which config file servers come from
  return 'user';
}

function getServerCommands(commands, serverName) {
  return commands.filter(cmd => cmd.serverName === serverName);
}

function removeServerTools(tools, serverName) {
  return tools.filter(tool => !tool.name?.startsWith(`mcp__${serverName}`));
}

function removeServerCommands(commands, serverName) {
  return commands.filter(cmd => cmd.serverName !== serverName);
}

function removeServerResources(resources, serverName) {
  const { [serverName]: _, ...rest } = resources;
  return rest;
}

function getReconnectSuccessMessage(result, serverName) {
  switch (result.type) {
    case 'connected':
      return `Successfully reconnected to ${serverName}`;
    case 'needs-auth':
      return `${serverName} requires authentication`;
    case 'failed':
      return `Failed to reconnect to ${serverName}`;
    default:
      return `Reconnection status: ${result.type}`;
  }
}

function getReconnectErrorMessage(error, serverName) {
  return `Error reconnecting to ${serverName}: ${error}`;
}

async function openBrowser(url) {
  // Implementation would open the URL in the default browser
  const platform = process.platform;

  let command;
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Failed to open browser: ${error}`);
      }
      resolve();
    });
  });
}