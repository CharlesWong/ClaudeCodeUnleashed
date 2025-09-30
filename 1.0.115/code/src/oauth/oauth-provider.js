/**
 * OAuth Provider System
 * Complete OAuth 2.0 with PKCE implementation for MCP servers
 * Extracted from lines 30000-30234 of original file
 */

import crypto from 'crypto';
import { URL } from 'url';
import http from 'http';

// Constants
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/oauth/callback';

/**
 * OAuth Provider Class
 * Original: class Od (lines 30051-30234)
 */
class OAuthProvider {
  serverName;
  serverConfig;
  redirectUri;
  handleRedirection;
  _codeVerifier;
  _authorizationUrl;
  _state;
  _scopes;
  _metadata;

  /**
   * Constructor
   * @param {string} serverName - Name of the server
   * @param {object} serverConfig - Server configuration
   * @param {string} redirectUri - OAuth redirect URI
   * @param {boolean} handleRedirection - Whether to handle redirects
   */
  constructor(serverName, serverConfig, redirectUri = DEFAULT_REDIRECT_URI, handleRedirection = false) {
    this.serverName = serverName;
    this.serverConfig = serverConfig;
    this.redirectUri = redirectUri;
    this.handleRedirection = handleRedirection;
  }

  get redirectUrl() {
    return this.redirectUri;
  }

  get authorizationUrl() {
    return this._authorizationUrl;
  }

  /**
   * Get client metadata
   * Original: lines 30070-30079
   */
  getClientMetadata() {
    const metadata = {
      redirect_uris: [this.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    };

    const scope = this._metadata?.scope || this._metadata?.default_scope;
    if (scope) {
      metadata.scope = scope;
      console.log(`${this.serverName}: Using scope from metadata: ${metadata.scope}`);
    }

    return metadata;
  }

  /**
   * Set OAuth metadata
   * @param {object} metadata - OAuth metadata
   */
  setMetadata(metadata) {
    this._metadata = metadata;
  }

  /**
   * Generate or get OAuth state
   * Original: async state()
   */
  async state() {
    if (!this._state) {
      this._state = crypto.randomBytes(32).toString('base64url');
      console.log(`${this.serverName}: Generated new OAuth state`);
    }
    return this._state;
  }

  /**
   * Get stored tokens
   * Original: lines 30087-30090
   */
  getStoredTokens() {
    const storage = getOAuthStorage();
    const key = getOAuthKey(this.serverName, this.serverConfig);
    return storage?.mcpOAuth?.[key];
  }

  /**
   * Clear stored tokens
   * Original: lines 30091-30107
   */
  clearStoredTokens() {
    const storage = getOAuthStorage();
    const key = getOAuthKey(this.serverName, this.serverConfig);

    const updated = {
      ...storage,
      mcpOAuth: {
        ...storage.mcpOAuth,
        [key]: {
          ...storage.mcpOAuth?.[key],
          serverName: this.serverName,
          serverUrl: this.serverConfig.url,
          accessToken: '',
          expiresAt: 0
        }
      }
    };

    saveOAuthStorage(updated);
  }

  /**
   * Get current tokens
   * Original: async tokens() (lines 30108-30143)
   */
  async tokens() {
    const storage = getOAuthStorage();
    const key = getOAuthKey(this.serverName, this.serverConfig);
    const tokenData = storage?.mcpOAuth?.[key];

    if (!tokenData) {
      console.log(`${this.serverName}: No token data found`);
      return undefined;
    }

    const expiresIn = (tokenData.expiresAt - Date.now()) / 1000;

    // Token expired without refresh token
    if (expiresIn <= 0 && !tokenData.refreshToken) {
      console.log(`${this.serverName}: Token expired without refresh token`);
      return undefined;
    }

    // Proactive refresh if expiring soon
    if (expiresIn <= 300 && tokenData.refreshToken) {
      console.log(`${this.serverName}: Token expires in ${Math.floor(expiresIn)}s, attempting proactive refresh`);

      try {
        const refreshed = await this.refreshAuthorization(tokenData.refreshToken);
        if (refreshed) {
          console.log(`${this.serverName}: Token refreshed successfully`);
          return refreshed;
        }
        console.log(`${this.serverName}: Token refresh failed, returning current tokens`);
      } catch (error) {
        console.error(`${this.serverName}: Token refresh error:`, error);
      }
    }

    const tokens = {
      access_token: tokenData.accessToken,
      refresh_token: tokenData.refreshToken,
      expires_in: expiresIn,
      scope: tokenData.scope,
      token_type: 'Bearer'
    };

    console.log(`${this.serverName}: Returning tokens`);
    console.log(`${this.serverName}: Token length: ${tokens.access_token?.length}`);
    console.log(`${this.serverName}: Has refresh token: ${!!tokens.refresh_token}`);
    console.log(`${this.serverName}: Expires in: ${Math.floor(expiresIn)}s`);

    return tokens;
  }

  /**
   * Save tokens to storage
   * Original: async saveTokens(A) (lines 30144-30166)
   */
  async saveTokens(tokens) {
    const storage = getOAuthStorage();
    const key = getOAuthKey(this.serverName, this.serverConfig);

    console.log(`${this.serverName}: Saving tokens`);
    console.log(`${this.serverName}: Token expires in: ${tokens.expires_in}`);
    console.log(`${this.serverName}: Has refresh token: ${!!tokens.refresh_token}`);

    const updated = {
      ...storage,
      mcpOAuth: {
        ...storage.mcpOAuth,
        [key]: {
          ...storage.mcpOAuth?.[key],
          serverName: this.serverName,
          serverUrl: this.serverConfig.url,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
          scope: tokens.scope
        }
      }
    };

    saveOAuthStorage(updated);
  }

  /**
   * Redirect to authorization URL
   * Original: async redirectToAuthorization(A) (lines 30167-30193)
   */
  async redirectToAuthorization(authUrl) {
    this._authorizationUrl = authUrl.toString();

    // Extract scopes from URL
    const urlParams = new URL(authUrl).searchParams;
    const scopeParam = urlParams.get('scope');

    console.log(`${this.serverName}: Authorization URL: ${authUrl.toString()}`);
    console.log(`${this.serverName}: Scopes in URL: ${scopeParam || 'NOT FOUND'}`);

    if (scopeParam) {
      this._scopes = scopeParam;
      console.log(`${this.serverName}: Captured scopes from authorization URL: ${scopeParam}`);
    } else {
      const metadataScope = this._metadata?.scope || this._metadata?.default_scope;
      if (metadataScope) {
        this._scopes = metadataScope;
        console.log(`${this.serverName}: Using scopes from metadata: ${metadataScope}`);
      } else {
        console.log(`${this.serverName}: No scopes available from URL or metadata`);
      }
    }

    if (!this.handleRedirection) {
      console.log(`${this.serverName}: Redirection handling is disabled, skipping redirect`);
      return;
    }

    const urlString = authUrl.toString();
    console.log(`${this.serverName}: Redirecting to authorization URL`);
    console.log(`${this.serverName}: Opening authorization URL: ${urlString}`);

    const opened = await openBrowser(urlString);
    if (!opened) {
      console.log(`
Couldn't open browser automatically. Please manually open the URL above in your browser.
`);
    }
  }

  /**
   * Save PKCE code verifier
   * Original: async saveCodeVerifier(A) (lines 30194-30196)
   */
  async saveCodeVerifier(verifier) {
    console.log(`${this.serverName}: Saving code verifier`);
    this._codeVerifier = verifier;
  }

  /**
   * Get PKCE code verifier
   * Original: async codeVerifier() (lines 30197-30200)
   */
  async codeVerifier() {
    if (!this._codeVerifier) {
      console.log(`${this.serverName}: No code verifier saved`);
      throw new Error('No code verifier saved');
    }

    console.log(`${this.serverName}: Returning code verifier`);
    return this._codeVerifier;
  }

  /**
   * Refresh authorization token
   * Original: async refreshAuthorization(A) (lines 30201-30222)
   */
  async refreshAuthorization(refreshToken) {
    try {
      console.log(`${this.serverName}: Starting token refresh`);

      const metadata = await discoverOAuthMetadata(new URL(this.serverConfig.url));
      if (!metadata) {
        console.log(`${this.serverName}: Failed to discover OAuth metadata`);
        return undefined;
      }

      if (!metadata.token_endpoint) {
        console.log(`${this.serverName}: No token endpoint in metadata`);
        return undefined;
      }

      const refreshedTokens = await performTokenRefresh({
        tokenEndpoint: metadata.token_endpoint,
        metadata,
        refreshToken,
        resource: new URL(this.serverConfig.url)
      });

      if (refreshedTokens) {
        console.log(`${this.serverName}: Token refresh successful, saving new tokens`);
        await this.saveTokens(refreshedTokens);
        return refreshedTokens;
      }

      console.log(`${this.serverName}: Token refresh returned no tokens`);
      return undefined;
    } catch (error) {
      console.error(`${this.serverName}: Token refresh error:`, error);
      return undefined;
    }
  }

  /**
   * Add client authentication to token request
   * Original: lines 30223-30233
   */
  addClientAuthentication(params) {
    console.log(`${this.serverName}: addClientAuthentication called`);
    console.log(`${this.serverName}: Current params: ${params.toString()}`);
    console.log(`${this.serverName}: Stored scopes: ${this._scopes || 'NONE'}`);

    // Check if we already have a refresh token
    const storage = getOAuthStorage();
    const key = getOAuthKey(this.serverName, this.serverConfig);
    const existingToken = storage?.mcpOAuth?.[key];

    if (existingToken?.refreshToken) {
      console.log(`${this.serverName}: Found existing refresh token`);
    }

    // Add scopes if not present
    if (this._scopes && !params.has('scope')) {
      console.log(`${this.serverName}: Adding scope to token request: ${this._scopes}`);
      params.set('scope', this._scopes);
    } else if (!this._scopes) {
      console.log(`${this.serverName}: ERROR: No scopes stored to add to token request!`);
    }

    console.log(`${this.serverName}: Final params: ${params.toString()}`);
  }
}

/**
 * Handle OAuth callback
 * Original: lines 30000-30050
 */
async function handleOAuthCallback(serverName, serverConfig, authCode, state) {
  console.log(`${serverName}: Handling OAuth callback`);

  // Verify state to prevent CSRF
  const provider = new OAuthProvider(serverName, serverConfig);
  const expectedState = await provider.state();

  if (state !== expectedState) {
    throw new Error('OAuth state mismatch - possible CSRF attack');
  }

  try {
    console.log(`${serverName}: Completing auth flow with authorization code`);

    const result = await completeAuthFlow(provider, {
      serverUrl: serverConfig.url,
      authorizationCode: authCode
    });

    console.log(`${serverName}: Auth result: ${result}`);

    if (result === 'AUTHORIZED') {
      const tokens = await provider.tokens();

      console.log(`${serverName}: Tokens after auth: ${tokens ? 'Present' : 'Missing'}`);

      if (tokens) {
        console.log(`${serverName}: Token access_token length: ${tokens.access_token?.length}`);
        console.log(`${serverName}: Token expires_in: ${tokens.expires_in}`);
      }

      trackEvent('tengu_mcp_oauth_flow_success', {});
      return tokens;
    } else {
      throw new Error('Unexpected auth result: ' + result);
    }
  } catch (error) {
    console.error(`${serverName}: Error during auth completion:`, error);
    trackEvent('tengu_mcp_oauth_flow_error', {});
    throw error;
  }
}

/**
 * Start OAuth server for callback
 * Original: part of lines 30000-30050
 */
function startOAuthCallbackServer(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        if (error) {
          res.end(`<h1>Authentication Error</h1><p>${error}: ${errorDescription}</p><p>You can close this window.</p>`);
          server.close();
          reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
          return;
        }

        if (code) {
          res.end('<h1>Authentication Successful</h1><p>You can close this window. Return to Claude Code.</p>');
          server.close();
          resolve({ code, state });
        }
      }
    });

    server.listen(port, () => {
      console.log(`OAuth callback server listening on port ${port}`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout'));
    }, 300000);
  });
}

// Helper functions - would need to be imported
function getOAuthStorage() { return {}; }
function saveOAuthStorage(data) { }
function getOAuthKey(serverName, serverConfig) { return `${serverName}_${serverConfig.url}`; }
function openBrowser(url) { return Promise.resolve(true); }
function discoverOAuthMetadata(url) { return Promise.resolve({}); }
function performTokenRefresh(opts) { return Promise.resolve(null); }
function completeAuthFlow(provider, opts) { return Promise.resolve('AUTHORIZED'); }
function trackEvent(name, data) { console.log(`Event: ${name}`, data); }

export {
  OAuthProvider,
  handleOAuthCallback,
  startOAuthCallbackServer,
  DEFAULT_REDIRECT_URI
};