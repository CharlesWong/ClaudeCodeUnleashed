/**
 * OAuth Flow UI Components
 * Interactive OAuth authentication flow for Claude Code
 * Extracted from lines 40920-41066
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

const PASTE_PROMPT = "Paste code here if prompted > ";

/**
 * OAuth Flow Component for Long-Lived Token Creation
 * Original: function LzB()
 */
export function OAuthFlowUI({ onSuccess, onCancel }) {
  const [state, setState] = useState({ state: "starting" });
  const [oauthProvider] = useState(() => new OAuthProvider());
  const [inputValue, setInputValue] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [statusDisplay] = useState(() => new StatusDisplay());
  const timers = useRef(new Set());
  const abortController = useRef(null);
  const { columns } = useStdout();
  const maxInputWidth = Math.max(50, columns - PASTE_PROMPT.length - 4);

  // Handle keyboard input
  useInput((input, key) => {
    if (state.state === "error") {
      if (key.return && state.toRetry) {
        setInputValue("");
        setCursorOffset(0);
        setState({ state: "about_to_retry", nextState: state.toRetry });
      } else {
        onCancel();
      }
    }
  });

  /**
   * Handle manual auth code input
   * Original: function D()
   */
  async function handleManualAuthCode(code, url) {
    try {
      const [authCode, stateParam] = code.split("#");

      if (!authCode || !stateParam) {
        setState({
          state: "error",
          error: "Invalid code format. Expected format: code#state",
          toRetry: { state: "waiting_for_login", url }
        });
        return;
      }

      trackEvent("tengu_oauth_manual_entry", {});
      await oauthProvider.handleManualAuthCodeInput({
        authorizationCode: authCode,
        state: stateParam
      });

    } catch (error) {
      debugLog(error instanceof Error ? error : new Error(String(error)));
      setState({
        state: "error",
        error: `Authentication failed: ${error.message}`,
        toRetry: { state: "waiting_for_login", url }
      });
    }
  }

  /**
   * Start OAuth flow
   * Original: const callbackFn
   */
  const startOAuthFlow = useCallback(async () => {
    // Clear any existing timers
    timers.current.forEach(timer => clearTimeout(timer));
    timers.current.clear();

    try {
      const result = await oauthProvider.startOAuthFlow(
        async (authUrl) => {
          setState({ state: "waiting_for_login", url: authUrl });

          // Show manual entry option after 3 seconds
          const timer = setTimeout(() => setShowManualEntry(true), 3000);
          timers.current.add(timer);
        },
        {
          loginWithClaudeAi: true,
          inferenceOnly: true,
          expiresIn: 31536000  // 1 year
        }
      );

      await statusDisplay.show();
      statusDisplay.reset();
      setState({ state: "processing" });

      // Store token
      const stored = storeOAuthToken(result);
      if (stored.warning) {
        trackEvent("tengu_oauth_storage_warning", { warning: stored.warning });
      }

      // Success transition
      const successTimer = setTimeout(() => {
        setState({ state: "success", token: result.accessToken });

        const completeTimer = setTimeout(() => {
          onSuccess(result.accessToken);
        }, 1000);

        timers.current.add(completeTimer);
      }, 100);

      timers.current.add(successTimer);

    } catch (error) {
      await statusDisplay.show();
      statusDisplay.reset();
      debugLog(error instanceof Error ? error : new Error(String(error)));

      const errorMessage = error instanceof Error ? error.message : String(error);
      setState({
        state: "error",
        error: errorMessage,
        toRetry: { state: "starting" }
      });

      trackEvent("tengu_oauth_error", { error: errorMessage });
    }
  }, [oauthProvider, onSuccess, statusDisplay]);

  // Start flow on mount
  useEffect(() => {
    if (state.state === "starting") {
      startOAuthFlow();
    }
  }, [state.state, startOAuthFlow]);

  // Handle retry transitions
  useEffect(() => {
    if (state.state === "about_to_retry") {
      statusDisplay.show();
      statusDisplay.reset();

      const timer = setTimeout(() => {
        if (state.nextState.state === "waiting_for_login") {
          setShowManualEntry(true);
        } else {
          setShowManualEntry(false);
        }
        setState(state.nextState);
      }, 500);

      timers.current.add(timer);
    }
  }, [state, statusDisplay]);

  // Update status display
  useEffect(() => {
    const messages = {};

    if (state.state !== "success" &&
        state.state !== "starting" &&
        state.state !== "processing") {
      messages.header = (
        <Box key="header" flexDirection="column" gap={1} paddingBottom={1}>
          <Text bold>Creating Long-Lived Authentication Token</Text>
        </Box>
      );
    }

    if (state.state === "waiting_for_login" && showManualEntry) {
      messages.urlToCopy = (
        <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>
              If your browser doesn't open automatically, copy this URL manually:
            </Text>
          </Box>
          <Box paddingX={1}>
            <Text color="claude">{state.url}</Text>
          </Box>
        </Box>
      );
    }

    statusDisplay.updateMessages(messages);
  }, [statusDisplay, state, showManualEntry]);

  // Cleanup on unmount
  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      oauthProvider.cleanup();
      currentTimers.forEach(timer => clearTimeout(timer));
      currentTimers.clear();
    };
  }, [oauthProvider]);

  /**
   * Render content based on state
   */
  function renderContent() {
    switch (state.state) {
      case "starting":
        return (
          <Box>
            <Text>Starting authentication...</Text>
            <Spinner type="dots" />
          </Box>
        );

      case "waiting_for_login":
        return (
          <Box flexDirection="column" gap={1}>
            {!showManualEntry && (
              <Box>
                <Text>
                  Opening your browser for authentication...
                </Text>
                <Spinner type="dots" />
              </Box>
            )}
            {showManualEntry && (
              <Box>
                <Text>{PASTE_PROMPT}</Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(code) => handleManualAuthCode(code, state.url)}
                  cursorOffset={cursorOffset}
                  onChangeCursorOffset={setCursorOffset}
                  columns={maxInputWidth}
                />
              </Box>
            )}
          </Box>
        );

      case "processing":
        return (
          <Box>
            <Text>Processing authentication...</Text>
            <Spinner type="dots" />
          </Box>
        );

      case "success":
        return (
          <Box flexDirection="column" gap={1}>
            <Text color="success">✓ Authentication successful!</Text>
            <Text dimColor>Token created and stored securely.</Text>
          </Box>
        );

      case "error":
        return (
          <Box flexDirection="column" gap={1}>
            <Text color="error">✗ Authentication failed</Text>
            <Text>{state.error}</Text>
            {state.toRetry ? (
              <Text dimColor>Press Enter to try again, or Esc to cancel</Text>
            ) : (
              <Text dimColor>Press any key to exit</Text>
            )}
          </Box>
        );

      case "about_to_retry":
        return (
          <Box flexDirection="column" gap={1}>
            <Text>Retrying...</Text>
            <Spinner type="dots" />
          </Box>
        );

      default:
        return null;
    }
  }

  return (
    <Box flexDirection="column" gap={1}>
      {state.state === "starting" && (
        <Box flexDirection="column" gap={1} paddingBottom={1}>
          <Text bold>Creating Long-Lived Authentication Token</Text>
          <Text dimColor>
            This will create a token that lasts for 1 year
          </Text>
        </Box>
      )}
      {renderContent()}
    </Box>
  );
}

/**
 * OAuth provider class placeholder
 * Actual implementation would be imported
 */
class OAuthProvider {
  async startOAuthFlow(onAuthUrl, options) {
    // Implementation would handle OAuth flow
    throw new Error("OAuth provider not implemented");
  }

  handleManualAuthCodeInput(params) {
    // Implementation would handle manual code input
    throw new Error("Manual auth not implemented");
  }

  cleanup() {
    // Cleanup implementation
  }
}

/**
 * Status display class placeholder
 */
class StatusDisplay {
  constructor() {
    this.messages = {};
  }

  updateMessages(messages) {
    this.messages = messages;
  }

  async show() {
    // Show status
  }

  reset() {
    this.messages = {};
  }
}

export default OAuthFlowUI;