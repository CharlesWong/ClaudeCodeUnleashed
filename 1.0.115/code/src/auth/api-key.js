/**
 * API Key Management Module
 * Handles API key validation and storage
 */

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

const API_KEY_PATTERN = /^sk-ant-api\d{2}-[a-zA-Z0-9_-]{86,95}-[a-zA-Z]{2}$/;
const CONFIG_DIR = path.join(homedir(), '.claude');
const API_KEY_FILE = path.join(CONFIG_DIR, 'api_key');

/**
 * Validate API key format
 */
function validateAPIKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  return API_KEY_PATTERN.test(key);
}

/**
 * Extract API key from various sources
 */
function extractAPIKey(input) {
  if (!input) return null;

  // Direct API key
  if (validateAPIKey(input)) {
    return input;
  }

  // Environment variable style
  const envMatch = input.match(/ANTHROPIC_API_KEY=["']?([^"'\s]+)["']?/);
  if (envMatch && validateAPIKey(envMatch[1])) {
    return envMatch[1];
  }

  // Export statement
  const exportMatch = input.match(/export\s+ANTHROPIC_API_KEY=["']?([^"'\s]+)["']?/);
  if (exportMatch && validateAPIKey(exportMatch[1])) {
    return exportMatch[1];
  }

  // Plain text with extra content
  const keyMatch = input.match(/(sk-ant-api\d{2}-[a-zA-Z0-9_-]{86,95}-[a-zA-Z]{2})/);
  if (keyMatch && validateAPIKey(keyMatch[1])) {
    return keyMatch[1];
  }

  return null;
}

/**
 * Get API key from environment or config
 */
function getAPIKey(silent = false) {
  // Check environment variable
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && validateAPIKey(envKey)) {
    return {
      key: envKey,
      source: 'Environment variable ANTHROPIC_API_KEY'
    };
  }

  // Check config file
  try {
    if (fs.existsSync(API_KEY_FILE)) {
      const fileContent = fs.readFileSync(API_KEY_FILE, 'utf8').trim();
      const extractedKey = extractAPIKey(fileContent);

      if (extractedKey) {
        return {
          key: extractedKey,
          source: 'Config file'
        };
      }
    }
  } catch (error) {
    if (!silent) {
      console.error('Error reading API key file:', error.message);
    }
  }

  return {
    key: null,
    source: null
  };
}

/**
 * Save API key to config file
 */
function saveAPIKey(key) {
  const extractedKey = extractAPIKey(key);

  if (!extractedKey) {
    throw new Error('Invalid API key format');
  }

  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Save key to file
  fs.writeFileSync(API_KEY_FILE, extractedKey, { mode: 0o600 });

  return extractedKey;
}

/**
 * Remove stored API key
 */
function removeAPIKey() {
  if (fs.existsSync(API_KEY_FILE)) {
    fs.unlinkSync(API_KEY_FILE);
    return true;
  }
  return false;
}

/**
 * Validate API key with Anthropic API
 */
async function validateAPIKeyWithAPI(apiKey) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    // 401 means invalid key, other errors might be rate limits, etc.
    if (response.status === 401) {
      return {
        valid: false,
        error: 'Invalid API key'
      };
    }

    return {
      valid: true
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Get API key info for display
 */
function getAPIKeyInfo(apiKey) {
  if (!apiKey) return 'No API key';

  // Mask most of the key for security
  const prefix = apiKey.substring(0, 12);
  const suffix = apiKey.substring(apiKey.length - 4);
  const masked = `${prefix}...${suffix}`;

  return masked;
}

export {
  validateAPIKey,
  extractAPIKey,
  getAPIKey,
  saveAPIKey,
  removeAPIKey,
  validateAPIKeyWithAPI,
  getAPIKeyInfo,
  API_KEY_PATTERN
};