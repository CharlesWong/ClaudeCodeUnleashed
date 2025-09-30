/**
 * Web Fetch Tool
 * Fetches content from URLs and processes it with AI
 */

import { URL } from 'url';
import fetch from 'node-fetch';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';

// Approved domains for fast access
const APPROVED_DOMAINS = [
  'docs.claude.com',
  'github.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'nodejs.org',
  'npmjs.com',
  'anthropic.com'
];

// Input schema for WebFetch
const webFetchSchema = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
      description: 'The URL to fetch content from'
    },
    prompt: {
      type: 'string',
      description: 'The prompt to run on the fetched content'
    }
  },
  required: ['url', 'prompt']
};

/**
 * Fetch content from a web URL
 */
async function fetchWebContent(url, abortController) {
  try {
    const response = await fetch(url, {
      signal: abortController?.signal,
      headers: {
        'User-Agent': 'Claude-Code-CLI/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'manual',
      timeout: 30000
    });

    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      const redirectUrl = response.headers.get('location');
      const originalUrl = new URL(url);
      const redirectParsed = new URL(redirectUrl, url);

      // Check if redirecting to different host
      if (originalUrl.hostname !== redirectParsed.hostname) {
        return {
          type: 'redirect',
          originalUrl: url,
          redirectUrl: redirectParsed.href,
          statusCode: response.status
        };
      }

      // Follow same-host redirect
      return fetchWebContent(redirectParsed.href, abortController);
    }

    const html = await response.text();
    const bytes = Buffer.byteLength(html);

    return {
      content: html,
      bytes,
      code: response.status,
      codeText: response.statusText
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request aborted');
    }
    throw new Error(`Failed to fetch URL: ${error.message}`);
  }
}

/**
 * Process web content with AI
 */
async function processWebContent(prompt, content, signal, isNonInteractive) {
  try {
    // Convert HTML to markdown
    const $ = cheerio.load(content);

    // Remove script and style tags
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();

    // Get main content
    const mainContent = $('main').html() || $('article').html() || $('body').html();

    // Convert to markdown
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });

    const markdown = turndown.turndown(mainContent);

    // Truncate if too long
    const maxLength = 50000;
    const truncated = markdown.length > maxLength ?
      markdown.substring(0, maxLength) + '\n\n[Content truncated]' :
      markdown;

    // Format result with prompt context
    return `Web page content fetched successfully.

Prompt: ${prompt}

Content:
${truncated}`;

  } catch (error) {
    return `Error processing content: ${error.message}`;
  }
}

/**
 * WebFetch tool definition
 */
const WebFetchTool = {
  name: 'WebFetch',
  description: 'Fetches content from a URL and processes it with a prompt',
  inputSchema: webFetchSchema,

  async validateInput({ url, prompt }) {
    if (!url) {
      return {
        result: false,
        errorMessage: 'URL is required'
      };
    }

    if (!prompt) {
      return {
        result: false,
        errorMessage: 'Prompt is required'
      };
    }

    try {
      new URL(url);
    } catch {
      return {
        result: false,
        errorMessage: 'Invalid URL format'
      };
    }

    return { result: true };
  },

  async checkPermissions(input, context) {
    try {
      const { url } = input;
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;
      const pathname = parsedUrl.pathname;

      // Check against approved domains
      for (const approvedDomain of APPROVED_DOMAINS) {
        if (approvedDomain.includes('/')) {
          const [host, ...pathParts] = approvedDomain.split('/');
          const approvedPath = '/' + pathParts.join('/');
          if (hostname === host && pathname.startsWith(approvedPath)) {
            return {
              behavior: 'allow',
              updatedInput: input,
              decisionReason: {
                type: 'other',
                reason: 'Preapproved host and path'
              }
            };
          }
        } else if (hostname === approvedDomain) {
          return {
            behavior: 'allow',
            updatedInput: input,
            decisionReason: {
              type: 'other',
              reason: 'Preapproved host'
            }
          };
        }
      }
    } catch {}

    // Default to permission check
    return {
      behavior: 'ask',
      updatedInput: input
    };
  },

  async *call({ url, prompt }, context) {
    const startTime = Date.now();
    const content = await fetchWebContent(url, context.abortController);

    if ('type' in content && content.type === 'redirect') {
      const statusText = content.statusCode === 301 ? 'Moved Permanently' :
                        content.statusCode === 308 ? 'Permanent Redirect' :
                        content.statusCode === 307 ? 'Temporary Redirect' : 'Found';

      const redirectMessage = `REDIRECT DETECTED: The URL redirects to a different host.

Original URL: ${content.originalUrl}
Redirect URL: ${content.redirectUrl}
Status: ${content.statusCode} ${statusText}

To fetch the redirect URL, use:
- url: "${content.redirectUrl}"
- prompt: "${prompt}"`;

      yield {
        type: 'result',
        data: {
          bytes: Buffer.byteLength(redirectMessage),
          code: content.statusCode,
          codeText: statusText,
          result: redirectMessage,
          durationMs: Date.now() - startTime,
          url: url
        }
      };
      return;
    }

    const { content: pageContent, bytes, code, codeText } = content;
    const processedContent = await processWebContent(
      prompt,
      pageContent,
      context.abortController?.signal,
      context.options?.isNonInteractiveSession
    );

    yield {
      type: 'result',
      data: {
        bytes: bytes,
        code: code,
        codeText: codeText,
        result: processedContent,
        durationMs: Date.now() - startTime,
        url: url
      }
    };
  },

  mapToolResultToToolResultBlockParam({ result }, toolUseId) {
    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: result
    };
  },

  userFacingName() {
    return 'Fetch';
  },

  isEnabled() {
    return true;
  },

  isConcurrencySafe() {
    return true;
  },

  isReadOnly() {
    return true;
  }
};

export {
  WebFetchTool,
  fetchWebContent,
  processWebContent,
  APPROVED_DOMAINS
};