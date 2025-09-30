/**
 * Web Search Tool
 * Search the web using AI-powered search
 */

// Input schema for WebSearch
const webSearchSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The search query'
    },
    allowed_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only include search results from these domains'
    },
    blocked_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Never include search results from these domains'
    }
  },
  required: ['query']
};

/**
 * Check if network is restricted
 */
function isNetworkRestricted() {
  // Check environment variables or settings
  return process.env.CLAUDE_NO_NETWORK === 'true' ||
         process.env.NETWORK_RESTRICTED === 'true';
}

/**
 * Build search configuration
 */
function buildSearchConfig(input) {
  const config = {
    query: input.query,
    maxResults: 10
  };

  if (input.allowed_domains) {
    config.allowedDomains = input.allowed_domains;
  }

  if (input.blocked_domains) {
    config.blockedDomains = input.blocked_domains;
  }

  return config;
}

/**
 * Stream web search results
 */
async function* streamWebSearch(query, maxTokens, signal, options) {
  // This would integrate with the actual search API
  // For now, return a mock stream
  const mockResults = [
    {
      type: 'content_block_start',
      event: {
        content_block: {
          type: 'server_tool_use',
          id: 'search_1'
        }
      }
    },
    {
      type: 'content_block_delta',
      event: {
        delta: {
          type: 'input_json_delta',
          partial_json: '{"query": "' + query + '"}'
        }
      }
    },
    {
      type: 'message_stop'
    }
  ];

  for (const event of mockResults) {
    if (signal?.aborted) break;
    yield event;
  }
}

/**
 * Get search model
 */
function getSearchModel() {
  return process.env.CLAUDE_SEARCH_MODEL || 'claude-3-haiku-20240307';
}

/**
 * Process search results
 */
function processSearchResults(results, query, durationSeconds) {
  // Format results for display
  const formattedResults = results.map(result => {
    if (typeof result === 'string') {
      return result;
    }
    return {
      title: result.title || 'Untitled',
      url: result.url,
      snippet: result.snippet || ''
    };
  });

  return {
    query,
    results: formattedResults,
    durationSeconds,
    resultCount: formattedResults.length
  };
}

/**
 * WebSearch tool definition
 */
const WebSearchTool = {
  name: 'WebSearch',
  description: 'Search the web for information',
  inputSchema: webSearchSchema,

  async validateInput({ query, allowed_domains, blocked_domains }) {
    if (!query) {
      return {
        result: false,
        errorMessage: 'Query is required'
      };
    }

    if (allowed_domains && blocked_domains) {
      return {
        result: false,
        errorCode: 2,
        errorMessage: 'Cannot specify both allowed_domains and blocked_domains'
      };
    }

    return { result: true };
  },

  async checkPermissions(input) {
    if (isNetworkRestricted()) {
      return {
        behavior: 'ask',
        decisionReason: {
          type: 'other',
          reason: 'WebSearch is disabled due to network restrictions'
        }
      };
    }
    return {
      behavior: 'allow',
      updatedInput: input
    };
  },

  async *call(input, context) {
    const startTime = performance.now();
    const { query } = input;
    const searchConfig = buildSearchConfig(input);

    const searchStream = streamWebSearch(
      query,
      context.options?.maxThinkingTokens,
      context.abortController?.signal,
      {
        getToolPermissionContext: async () => {
          return (await context.getAppState()).toolPermissionContext;
        },
        model: getSearchModel(),
        prependCLISysprompt: true,
        toolChoice: undefined,
        isNonInteractiveSession: context.options?.isNonInteractiveSession,
        extraToolSchemas: [searchConfig]
      }
    );

    const results = [];
    let currentToolUseId = null;
    let currentJson = '';
    const queryUpdates = new Map();

    for await (const event of searchStream) {
      if (event.type === 'content_block_start') {
        const contentBlock = event.event.content_block;
        if (contentBlock && contentBlock.type === 'server_tool_use') {
          currentToolUseId = contentBlock.id;
          currentJson = '';
          continue;
        }
      }

      if (event.type === 'content_block_delta') {
        const delta = event.event.delta;
        if (delta?.type === 'input_json_delta' && delta.partial_json) {
          currentJson += delta.partial_json;

          try {
            const queryMatch = currentJson.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (queryMatch && queryMatch[1]) {
              const extractedQuery = queryMatch[1];
              if (!queryUpdates.has(currentToolUseId) ||
                  queryUpdates.get(currentToolUseId) !== extractedQuery) {
                queryUpdates.set(currentToolUseId, extractedQuery);

                yield {
                  type: 'progress',
                  data: { type: 'query_update', query: extractedQuery }
                };
              }
            }
          } catch {}
        }
      }

      if (event.type === 'message_stop') {
        break;
      }
    }

    // Process search results
    const durationSeconds = (performance.now() - startTime) / 1000;
    const processedResults = processSearchResults(results, query, durationSeconds);

    yield {
      type: 'result',
      data: processedResults
    };
  },

  mapToolResultToToolResultBlockParam(data, toolUseId) {
    const resultLines = [];

    if (data.query) {
      resultLines.push(`Search query: "${data.query}"`);
    }

    if (data.results && data.results.length > 0) {
      resultLines.push('Search results:');
      for (const result of data.results) {
        if (typeof result === 'string') {
          resultLines.push(result);
        } else if (result.url) {
          resultLines.push(`- ${result.title}: ${result.url}`);
          if (result.snippet) {
            resultLines.push(`  ${result.snippet}`);
          }
        }
      }
    } else {
      resultLines.push('No results found');
    }

    if (data.durationSeconds) {
      const duration = data.durationSeconds >= 1
        ? `${Math.round(data.durationSeconds)}s`
        : `${Math.round(data.durationSeconds * 1000)}ms`;
      resultLines.push(`Search completed in ${duration}`);
    }

    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: resultLines.join('\n')
    };
  },

  userFacingName() {
    return 'Web Search';
  },

  isEnabled() {
    return !isNetworkRestricted();
  },

  isConcurrencySafe() {
    return true;
  },

  isReadOnly() {
    return true;
  }
};

export {
  WebSearchTool,
  isNetworkRestricted,
  buildSearchConfig,
  streamWebSearch,
  processSearchResults
};