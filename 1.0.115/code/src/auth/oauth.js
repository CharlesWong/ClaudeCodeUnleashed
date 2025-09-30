/**
 * OAuth Authentication Module
 * Handles OAuth flow for Claude.ai authentication
 */

import crypto from 'crypto';
import { promisify } from 'util';
import express from 'express';

// OAuth configuration
const OAUTH_CLIENT_ID = "anthropic-cli-public";
const OAUTH_AUTHORIZE_URL = "https://claude.ai/api/auth/oauth/authorize";
const OAUTH_TOKEN_URL = "https://claude.ai/api/auth/oauth/token";
const OAUTH_REDIRECT_URI = "http://localhost:6394";
const OAUTH_SCOPES = ["read", "write"];

/**
 * Generate PKCE challenge for OAuth
 */
function generatePKCEChallenge() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

/**
 * Build OAuth authorization URL
 */
function buildAuthorizationURL(state, codeChallenge, options = {}) {
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  if (options.organizationUuid) {
    params.append("organization_uuid", options.organizationUuid);
  }

  if (options.loginHint) {
    params.append("login_hint", options.loginHint);
  }

  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: OAUTH_CLIENT_ID,
    code: code,
    redirect_uri: OAUTH_REDIRECT_URI,
    code_verifier: codeVerifier
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return await response.json();
}

/**
 * Refresh OAuth access token
 */
async function refreshAccessToken(refreshToken, organizationUuid = null) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: OAUTH_CLIENT_ID,
    refresh_token: refreshToken
  });

  if (organizationUuid) {
    params.append("organization_uuid", organizationUuid);
  }

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return await response.json();
}

/**
 * Validate OAuth account
 */
async function validateOAuthAccount(accessToken) {
  const response = await fetch('https://claude.ai/api/auth/current_account', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to validate OAuth account');
  }

  return await response.json();
}

/**
 * Handle OAuth callback
 */
async function handleOAuthCallback(code, state, expectedState, codeVerifier) {
  if (state !== expectedState) {
    throw new Error('OAuth state mismatch - possible CSRF attack');
  }

  const tokens = await exchangeCodeForTokens(code, codeVerifier);
  const account = await validateOAuthAccount(tokens.access_token);

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000),
    account: account
  };
}

/**
 * Start OAuth server for callback
 */
async function startOAuthCallbackServer(port = 6394) {
  const app = express();

  return new Promise((resolve, reject) => {
    let server;

    app.get('/callback', (req, res) => {
      const { code, state, error } = req.query;

      if (error) {
        res.send('Authentication failed. You can close this window.');
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      res.send('Authentication successful! You can close this window.');
      server.close();
      resolve({ code, state });
    });

    server = app.listen(port, 'localhost', () => {
      console.log(`OAuth callback server listening on port ${port}`);
    });

    server.on('error', reject);
  });
}

/**
 * Complete OAuth flow
 */
async function performOAuthFlow(options = {}) {
  const state = crypto.randomBytes(16).toString('base64url');
  const { verifier, challenge } = generatePKCEChallenge();

  const authUrl = buildAuthorizationURL(state, challenge, options);

  console.log(`Please open the following URL in your browser:\n${authUrl}`);

  // Start callback server
  const { code, state: returnedState } = await startOAuthCallbackServer();

  // Handle callback
  const result = await handleOAuthCallback(code, returnedState, state, verifier);

  return result;
}

export {
  generatePKCEChallenge,
  buildAuthorizationURL,
  exchangeCodeForTokens,
  refreshAccessToken,
  validateOAuthAccount,
  handleOAuthCallback,
  startOAuthCallbackServer,
  performOAuthFlow
};