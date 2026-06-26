# VLM MCP Server

[中文文档](README.zh-CN.md) | **English**

![VLM MCP Server hero](assets/vlm-mcp-server-hero.png)

A Model Context Protocol (MCP) server providing vision & video analysis tools, **configurable with any model provider**.

This is a reverse-engineered and extended reimplementation of `@z_ai/mcp-server` (Apache-2.0, credit to Chao Gong, Lei Yuan / Z.AI). It introduces a **provider abstraction layer** so the same set of tools can run against any of three API families:

- **Chat Completions** — OpenAI-compatible `POST {base}/chat/completions` (OpenAI, Z.AI, Zhipu, OpenRouter, Together, Groq, DeepSeek, Moonshot, local Ollama / LM Studio, …)
- **Responses** — OpenAI `POST {base}/responses` (gpt-4o, o-series reasoning models)
- **Anthropic Messages** — `POST {base}/v1/messages` (Claude, and Anthropic-compatible gateways)

## Quick Start

```shell
npx -y @syntx-ai/vlm-mcp-server
```

That's it for the server side — it speaks MCP over stdio. You need to configure it in your MCP client. Pick your provider and set three environment variables:

| Provider | Environment variables |
|----------|----------------------|
| Chat Completions | `OPENAI_CHAT_COMPLETIONS_API_KEY` · `OPENAI_CHAT_COMPLETIONS_BASE_URL` · `OPENAI_CHAT_COMPLETIONS_MODEL` |
| Responses | `OPENAI_RESPONSES_API_KEY` · `OPENAI_RESPONSES_BASE_URL` · `OPENAI_RESPONSES_MODEL` |
| Anthropic | `OPENAI_ANTHROPIC_API_KEY` · `OPENAI_ANTHROPIC_BASE_URL` · `OPENAI_ANTHROPIC_MODEL` |

**Claude Code one-liner** (Chat Completions example — replace with your values):

```shell
claude mcp add -s user vlm-mcp-server \
  --env OPENAI_CHAT_COMPLETIONS_API_KEY=sk-... \
       OPENAI_CHAT_COMPLETIONS_BASE_URL=https://api.openai.com/v1/ \
       OPENAI_CHAT_COMPLETIONS_MODEL=gpt-4o \
  -- npx -y @syntx-ai/vlm-mcp-server
```

For other clients (Cline, OpenCode, Crush, Roo Code, …), see [Client Configuration](docs/clients.md).

## Available Tools

### Image Analysis

| Tool | Description |
|------|-------------|
| `ui_to_artifact` | Convert UI screenshots to code, prompts, specs, or descriptions |
| `extract_text_from_screenshot` | OCR — extract code, terminal output, or text from screenshots |
| `diagnose_error_screenshot` | Analyze error messages and stack traces, suggest fixes |
| `understand_technical_diagram` | Analyze architecture, flowchart, UML, ER, and sequence diagrams |
| `analyze_data_visualization` | Extract insights, trends, and anomalies from charts |
| `ui_diff_check` | Visual regression — compare expected vs actual UI, prioritize issues |
| `analyze_image` | General-purpose image analysis (fallback) |

### Video Analysis

| Tool | Description |
|------|-------------|
| `analyze_video` | Video content analysis (local files or URLs, ≤8MB, MP4/MOV/M4V) |

## Configuration

The server loads variables from a `.env` file at startup (real environment variables take precedence). Three layers are supported; precedence is **per-provider groups > generic > legacy**.

### Per-provider groups

Configure each API family independently. `auto` picks the first group with both a key and a base URL set.

| Variable group | API family |
|----------------|------------|
| `OPENAI_CHAT_COMPLETIONS_API_KEY` / `_BASE_URL` / `_MODEL` | Chat Completions |
| `OPENAI_RESPONSES_API_KEY` / `_BASE_URL` / `_MODEL` | Responses |
| `OPENAI_ANTHROPIC_API_KEY` / `_BASE_URL` / `_MODEL` | Anthropic Messages |

### Generic variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VLM_API_KEY` | API key | *(required)* |
| `VLM_BASE_URL` | Provider API root | Zhipu default |
| `VLM_VISION_MODEL` | Model name | `glm-4.6v` |
| `VLM_PROVIDER` | Provider family: `auto` / `chat-completions` / `responses` / `anthropic` | `auto` |
| `VLM_VISION_MODEL_TEMPERATURE` | Sampling temperature | `0.8` |
| `VLM_VISION_MODEL_TOP_P` | Top-p | `0.6` |
| `VLM_VISION_MODEL_MAX_TOKENS` | Max output tokens | `32768` |
| `VLM_TIMEOUT` | Request timeout (ms) | `300000` |
| `VLM_RETRY_COUNT` | Retry attempts | `1` |
| `VLM_ANTHROPIC_VERSION` | `anthropic-version` header (Anthropic only) | `2023-06-01` |
| `VLM_LOG_PATH` | Custom log file path | `~/.vlm/vlm-mcp-YYYY-MM-DD.log` |

### Provider auto-detection

In `auto` mode (when no `OPENAI_*` group is set), the provider is inferred as follows:

- Base URL contains `anthropic`, or key starts with `sk-ant` → `anthropic`
- Otherwise → `chat-completions` (the most broadly compatible default)

## Usage Examples

Once the server is installed in your client, you can use it through conversation. For example, in Claude Code, type `describe this demo.png` — the MCP Server will process the image and return a description (the image must exist in the current directory).

> Outside Claude Code, pasting an image directly into the client will NOT invoke this MCP Server — the client encodes the image and calls the model API itself. **Best practice**: place images in a local directory and refer to them by name or path in conversation, e.g. `What does demo.png describe?`

## Troubleshooting

Run the server directly from the command line to verify it starts, isolating environment / permission issues:

```bash
# Linux / macOS
OPENAI_CHAT_COMPLETIONS_API_KEY=sk-... \
OPENAI_CHAT_COMPLETIONS_BASE_URL=https://api.openai.com/v1/ \
OPENAI_CHAT_COMPLETIONS_MODEL=gpt-4o \
npx -y @syntx-ai/vlm-mcp-server

# Windows CMD
set OPENAI_CHAT_COMPLETIONS_API_KEY=sk-... && set OPENAI_CHAT_COMPLETIONS_BASE_URL=https://api.openai.com/v1/ && set OPENAI_CHAT_COMPLETIONS_MODEL=gpt-4o && npx -y @syntx-ai/vlm-mcp-server

# Windows PowerShell
$env:OPENAI_CHAT_COMPLETIONS_API_KEY="sk-..."; $env:OPENAI_CHAT_COMPLETIONS_BASE_URL="https://api.openai.com/v1/"; $env:OPENAI_CHAT_COMPLETIONS_MODEL="gpt-4o"; npx -y @syntx-ai/vlm-mcp-server
```

- If it starts successfully, the environment is correct — the issue is likely in the client's MCP config; double-check it.
- If it fails, investigate the error message (pasting it to an LLM for analysis is recommended).

### Common issues

**Connection failure**
1. Ensure Node.js 18 or newer is installed.
2. Run `node -v` and `npx -v` to confirm the runtime is available.
3. Verify the environment variables (`OPENAI_*` triple or `VLM_*`) are set correctly.

**Invalid API Key**
1. Confirm the API Key was copied correctly.
2. Check that the API Key is activated.
3. Ensure the selected provider family matches the API Key (Chat Completions / Responses / Anthropic).
4. Check that the API Key has sufficient balance.

**Connection timeout**
1. Check your network connection.
2. Check firewall settings.
3. Try switching to a different provider family or base URL.
4. Increase the timeout (`VLM_TIMEOUT`, default 300000ms).

## Architecture

```
src/
├── index.ts                  # Entry point: starts the MCP server, registers all tools
├── types/                    # Error types (McpError, ApiError, ValidationError, …)
├── core/
│   ├── environment.ts        # Env config (VLM_* + OPENAI_* groups), URL resolution
│   ├── chat-service.ts       # Delegates to the active VisionProvider
│   ├── file-service.ts       # File validation + base64 encoding (image/video)
│   ├── base-image-service.ts # Shared image-processing logic for all image tools
│   ├── api-common.ts         # Message builders, response helpers, retry wrapper
│   ├── error-handler.ts      # Error hierarchy + handling/recovery strategies
│   └── logger.ts            # stderr + file logger (keeps stdout JSON-clean)
├── providers/                # Pluggable model-provider abstraction
│   ├── types.ts              # VisionProvider interface, ChatMessage, postJson helper
│   ├── chat-completions.ts   # OpenAI-compatible Chat Completions
│   ├── responses.ts          # OpenAI Responses API
│   ├── anthropic.ts          # Anthropic Messages API
│   └── index.ts              # Provider selection (VLM_PROVIDER / auto-infer)
├── prompts/                  # System prompts for each specialized tool
└── tools/                    # 8 tool registrations (7 image + 1 video)
```

The **provider layer** (`src/providers/`) is the key extension. Each provider implements a `VisionProvider` interface that takes normalized `ChatMessage[]` (the OpenAI Chat Completions content-part format as internal lingua franca) and translates it to the provider's wire format. `chat-service.ts` simply delegates to the resolved provider, so none of the tool code needed to change.

## License

Apache-2.0
