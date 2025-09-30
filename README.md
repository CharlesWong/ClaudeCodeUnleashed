# 🔓 Claude Code Unleashed - Deobfuscated v1.0.115

> **The fully reverse-engineered and deobfuscated source code of Claude Code CLI**

[![Version](https://img.shields.io/badge/Version-1.0.115-blue)](https://github.com/anthropics/claude-code)
[![Status](https://img.shields.io/badge/Status-Research%20Project-yellow)](https://github.com/anthropics/claude-code)
[![Deobfuscation](https://img.shields.io/badge/Deobfuscation-96.4%25%20Complete-green)](./1.0.115/code/)
[![Architecture](https://img.shields.io/badge/Docs-Comprehensive-purple)](./1.0.115/docs/)

## ⚠️ Important Notice

**This is a reverse-engineered, deobfuscated version of Claude Code CLI v1.0.115.**

This repository contains:
- 🔬 **Fully deobfuscated source code** extracted from the original webpack bundle
- 📚 **Comprehensive documentation** detailing the internal architecture
- 🗺️ **Complete module mapping** showing how 50,360 lines were reorganized into readable modules
- 🏗️ **Architectural analysis** of the event-driven, streaming-first design

### Legal Disclaimer

This project is provided for **educational and research purposes only**. The original Claude Code is property of Anthropic. Users should:
- Respect Anthropic's intellectual property rights
- Use this for learning and understanding, not for commercial purposes
- Comply with all applicable laws and Anthropic's terms of service
- Understand that this is NOT an official release

---

## 🎯 What is This Repository?

This repository contains the complete deobfuscation of Claude Code CLI v1.0.115, transforming:

| Original | Deobfuscated |
|----------|--------------|
| 50,360 lines of webpack-bundled code | 6,409 lines of clean, organized Claude code |
| Minified, obfuscated variables | Meaningful function and variable names |
| Single massive file | 71 organized modules across logical directories |
| No documentation | Comprehensive architectural documentation |
| Unreadable control flow | Clear, understandable program structure |

### 🔍 Deobfuscation Methodology

1. **Static Analysis**: Parsed the webpack bundle to identify module boundaries
2. **Variable Recovery**: Restored ~10,000+ mangled variable names using contextual analysis
3. **Function Extraction**: Identified and separated ~500+ individual functions
4. **Module Reconstruction**: Rebuilt the original ES6 module structure
5. **Type Inference**: Reconstructed TypeScript-like interfaces from usage patterns
6. **Documentation Generation**: Created comprehensive docs from code analysis

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Unix-like terminal (macOS, Linux, WSL for Windows)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ClaudeCodeUnleashed.git
cd ClaudeCodeUnleashed

# Navigate to the code directory
cd 1.0.115/code

# Install dependencies
npm install

# Make the CLI executable
chmod +x src/main.js

# Optional: Create global symlink
npm link
```

### Authentication

#### Option 1: OAuth (Claude.ai Account)
```bash
# Login with your Claude.ai account
node src/main.js login

# This will open your browser for authentication
```

#### Option 2: API Key (Anthropic API)
```bash
# Login with Anthropic API key
node src/main.js login --api-key

# Or set environment variable
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### Basic Usage

```bash
# Start a conversation with default model
node src/main.js

# Use a specific model
node src/main.js -m claude-3-opus-20240229

# Check authentication status
node src/main.js status

# Logout
node src/main.js logout
```

---

## 📁 Project Structure

```
ClaudeCodeUnleashed/
├── 📄 README.md                    # This file
├── 📄 CLAUDE.md                    # Quick reference for Claude instances
│
└── 📂 1.0.115/
    ├── 📂 code/                    # Deobfuscated source code
    │   ├── 📄 package.json         # Node.js configuration
    │   ├── 📄 README.md            # Code-specific documentation
    │   │
    │   └── 📂 src/
    │       ├── 📄 main.js          # CLI entry point
    │       ├── 📄 index.js         # Module exports
    │       │
    │       ├── 📂 auth/            # Authentication system
    │       │   ├── oauth.js        # OAuth PKCE flow
    │       │   └── api-key.js      # API key management
    │       │
    │       ├── 📂 tools/           # Tool implementations
    │       │   ├── bash.js         # Shell execution
    │       │   ├── read.js         # File reading
    │       │   ├── write.js        # File writing
    │       │   ├── edit.js         # File editing
    │       │   ├── grep.js         # Pattern search
    │       │   ├── web-fetch.js    # Web content fetching
    │       │   ├── web-search.js   # Web searching
    │       │   ├── task.js         # Agent tasks
    │       │   └── ...             # More tools
    │       │
    │       ├── 📂 conversation/    # Core conversation engine
    │       │   ├── loop.js         # Main REPL loop
    │       │   ├── tool-execution.js
    │       │   ├── token-management.js
    │       │   └── microcompaction.js
    │       │
    │       ├── 📂 ui/              # Terminal interface
    │       │   ├── terminal.js     # React-based UI
    │       │   └── components/     # UI components
    │       │
    │       ├── 📂 mcp/             # Model Context Protocol
    │       │   ├── server.js       # MCP server
    │       │   └── protocol.js     # Protocol handlers
    │       │
    │       ├── 📂 network/         # Networking layer
    │       │   ├── client.js       # HTTP client
    │       │   └── streaming.js    # SSE/WebSocket
    │       │
    │       └── 📂 utils/           # Utilities
    │           └── ...             # Helper functions
    │
    └── 📂 docs/                    # Documentation
        ├── 📂 en-US/               # English documentation
        │   ├── 📄 README.md
        │   ├── part-01-architecture/
        │   ├── part-02-runtime/
        │   ├── part-03-conversation/
        │   ├── part-04-tools/
        │   ├── part-05-agents/
        │   ├── part-06-api/
        │   ├── part-07-ui/
        │   ├── part-08-performance/
        │   ├── part-09-development/
        │   ├── part-10-security/
        │   └── part-11-extensibility/
        │
        └── 📂 zh-CN/               # Chinese documentation
            └── ...                 # (同上)
```

---

## 🛠️ Features & Capabilities

### Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| **🔐 Authentication** | OAuth 2.0 PKCE flow & API key support | ✅ Complete |
| **💬 Conversation Engine** | Streaming responses with token management | ✅ Complete |
| **🧰 Tool System** | Extensible tool architecture | ✅ Complete |
| **📝 File Operations** | Read, write, edit with permission control | ✅ Complete |
| **🖥️ Terminal UI** | React-based terminal interface using Ink | ✅ Complete |
| **🔄 Background Tasks** | Async task execution with monitoring | ✅ Complete |
| **🎣 Hook System** | Pre/post execution hooks | ✅ Complete |
| **🤖 Agent System** | Multi-agent task delegation | ✅ Complete |
| **🔍 Search Tools** | Web search and content fetching | ✅ Complete |
| **📊 Token Management** | Usage tracking and auto-compaction | ✅ Complete |

### Available Tools

- **`Bash`** - Execute shell commands with timeout control
- **`Read`** - Read files (text, images, PDFs, notebooks)
- **`Write`** - Create or overwrite files
- **`Edit`** - Find and replace text in files
- **`Grep`** - Pattern search using ripgrep
- **`WebFetch`** - Fetch and analyze web content
- **`WebSearch`** - Search the web
- **`NotebookEdit`** - Edit Jupyter notebooks
- **`Task`** - Launch specialized agents
- **`BashOutput`** - Monitor background shell output
- **`KillShell`** - Terminate background shells

---

## 🏗️ Architecture Highlights

### Event-Driven Design
```javascript
// Everything is event-based
conversationLoop.on('stream:delta', handleDelta);
conversationLoop.on('tool:execute', handleToolExecution);
conversationLoop.on('message:complete', handleComplete);
```

### Streaming-First Approach
- Server-Sent Events (SSE) for real-time responses
- WebSocket fallback for bidirectional communication
- Chunked processing for large outputs

### Token Management
- **Max conversation**: 200,000 tokens
- **Auto-compaction**: Triggers at 150,000 tokens
- **Microcompaction**: Preserves context while reducing size

### Permission System
- Granular file access control
- Allow/deny rules per directory
- Hook-based permission checks

---

## 📚 Documentation

Comprehensive documentation is available in the [`1.0.115/docs/`](./1.0.115/docs/) directory:

### English Documentation ([`en-US`](./1.0.115/docs/en-US/))
- **Part 1**: [Architecture Overview](./1.0.115/docs/en-US/part-01-architecture/)
- **Part 2**: [Runtime System](./1.0.115/docs/en-US/part-02-runtime/)
- **Part 3**: [Conversation Engine](./1.0.115/docs/en-US/part-03-conversation/)
- **Part 4**: [Tool System](./1.0.115/docs/en-US/part-04-tools/)
- **Part 5**: [Agent System](./1.0.115/docs/en-US/part-05-agents/)
- **Part 6**: [API Integration](./1.0.115/docs/en-US/part-06-api/)
- **Part 7**: [UI Components](./1.0.115/docs/en-US/part-07-ui/)
- **Part 8**: [Performance](./1.0.115/docs/en-US/part-08-performance/)
- **Part 9**: [Development](./1.0.115/docs/en-US/part-09-development/)
- **Part 10**: [Security](./1.0.115/docs/en-US/part-10-security/)
- **Part 11**: [Extensibility](./1.0.115/docs/en-US/part-11-extensibility/)

### 中文文档 ([`zh-CN`](./1.0.115/docs/zh-CN/))
- 完整的中文版本文档，包含所有上述内容

---

## 🔬 Technical Details

### Deobfuscation Statistics

| Metric | Value |
|--------|-------|
| Original bundle size | 50,360 lines |
| Actual Claude code | 6,409 lines |
| Library/bundler code | 43,951 lines |
| Extraction coverage | 96.4% |
| Modules identified | 71 |
| Functions recovered | ~500 |
| Variables renamed | ~10,000 |

### Technology Stack

- **Runtime**: Node.js 18+ with ES6 modules
- **UI Framework**: React + Ink (terminal UI)
- **HTTP Client**: Axios + native fetch
- **Streaming**: EventSource (SSE) + WebSocket
- **File System**: Native fs with permission layer
- **Authentication**: OAuth 2.0 PKCE + API keys
- **State Management**: Event-driven with EventEmitter

### Performance Characteristics

- Startup time: ~200ms
- First response: <1s (with warm connection)
- Token processing: ~1000 tokens/second
- Memory usage: ~50-100MB baseline
- Background task limit: Configurable (default 10)

---

## 🚧 Known Limitations

### Current Status
- ✅ **Core functionality**: Fully operational
- ⚠️ **MCP connections**: Partially implemented
- ⚠️ **Hook system**: Configuration UI incomplete
- ⚠️ **Update system**: Not fully extracted
- ❌ **Tests**: No test suite recovered

### Technical Limitations
1. Some internal APIs may have subtle differences from original
2. Error messages might differ from official version
3. Performance optimizations may be missing
4. Some edge cases might not be handled identically

---

## 🤝 Contributing

While this is primarily a research/educational project, contributions are welcome for:

1. **Documentation improvements**: Clarifying explanations, fixing errors
2. **Code organization**: Better module structure, cleaner interfaces
3. **Missing features**: Identifying and documenting unextracted functionality
4. **Analysis tools**: Scripts for further deobfuscation or analysis

Please note:
- This is NOT intended to be a maintained fork
- No feature additions beyond what exists in v1.0.115
- Focus on understanding and documenting, not extending

---

## 📜 License & Legal

**Educational Purpose Disclaimer**: This repository is provided solely for educational and research purposes to understand the architecture and implementation of Claude Code.

- The original Claude Code is property of Anthropic, PBC
- This deobfuscation is not endorsed or authorized by Anthropic
- Users must comply with Anthropic's terms of service
- No warranty or support is provided
- Use at your own risk

For official Claude Code, please visit: https://claude.ai/code

---

## 🙏 Acknowledgments

- **Anthropic** for creating Claude and Claude Code
- The reverse engineering community for deobfuscation techniques
- Open source tools used in the analysis process

---

## 📞 Contact & Resources

- **Original Claude Code**: https://claude.ai/code
- **Anthropic**: https://www.anthropic.com
- **Issues**: Please report via GitHub Issues
- **Documentation**: See [`1.0.115/docs/`](./1.0.115/docs/)

---

*Last updated: September 2024 | Version 1.0.115 | Research Project*