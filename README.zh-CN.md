# VLM MCP Server

**中文文档** | [English](README.md)

![VLM MCP Server 横幅图](assets/vlm-mcp-server-hero.png)

一个模型上下文协议（MCP）服务器，提供图像与视频分析工具，**可配置任意模型提供商**。

这是 `@z_ai/mcp-server` 的逆向工程并扩展的重新实现（Apache-2.0，感谢 Chao Gong、Lei Yuan / Z.AI）。本项目引入了**提供商抽象层**，使同一套工具可以运行在三种 API 族上：

- **Chat Completions** — 兼容 OpenAI 的 `POST {base}/chat/completions`（OpenAI、Z.AI、智谱、OpenRouter、Together、Groq、DeepSeek、Moonshot、本地 Ollama / LM Studio 等）
- **Responses** — OpenAI `POST {base}/responses`（gpt-4o、o 系列推理模型）
- **Anthropic Messages** — `POST {base}/v1/messages`（Claude 及兼容 Anthropic 的网关）

## 快速开始

```shell
npx -y @syntx-ai/vlm-mcp-server
```

服务器端就是这么简单 —— 通过 stdio 使用 MCP 协议。你需要在 MCP 客户端中配置它。选择你的提供商并设置三个环境变量：

| 提供商 | 环境变量 |
|--------|----------|
| Chat Completions | `OPENAI_CHAT_COMPLETIONS_API_KEY` · `OPENAI_CHAT_COMPLETIONS_BASE_URL` · `OPENAI_CHAT_COMPLETIONS_MODEL` |
| Responses | `OPENAI_RESPONSES_API_KEY` · `OPENAI_RESPONSES_BASE_URL` · `OPENAI_RESPONSES_MODEL` |
| Anthropic | `OPENAI_ANTHROPIC_API_KEY` · `OPENAI_ANTHROPIC_BASE_URL` · `OPENAI_ANTHROPIC_MODEL` |

**Claude Code 一键安装**（以 Chat Completions 为例 —— 替换为你的值）：

```shell
claude mcp add -s user vlm-mcp-server \
  --env OPENAI_CHAT_COMPLETIONS_API_KEY=sk-... \
       OPENAI_CHAT_COMPLETIONS_BASE_URL=https://api.openai.com/v1/ \
       OPENAI_CHAT_COMPLETIONS_MODEL=gpt-4o \
  -- npx -y @syntx-ai/vlm-mcp-server
```

其他客户端（Cline、OpenCode、Crush、Roo Code 等）请参考[客户端配置](docs/clients.zh-CN.md)。

## 支持的工具

### 图像分析

| 工具 | 说明 |
|------|------|
| `ui_to_artifact` | 将 UI 截图转换为代码、提示词、设计规范或描述 |
| `extract_text_from_screenshot` | OCR —— 从截图提取代码、终端输出或文字 |
| `diagnose_error_screenshot` | 分析错误信息与堆栈跟踪，提供修复建议 |
| `understand_technical_diagram` | 分析架构图、流程图、UML、ER 图、时序图 |
| `analyze_data_visualization` | 从图表中提取洞察、趋势与异常 |
| `ui_diff_check` | 视觉回归 —— 对比预期与实际 UI，按严重程度排列问题 |
| `analyze_image` | 通用图像分析（兜底） |

### 视频分析

| 工具 | 说明 |
|------|------|
| `analyze_video` | 视频内容分析（本地文件或 URL，≤8MB，MP4/MOV/M4V） |

## 配置

服务器启动时会从工作目录的 `.env` 文件加载变量（真实环境变量优先）。支持三层配置；优先级为 **按提供商分组 > 通用 > 旧版**。

### 按提供商分组

独立配置每个 API 族。`auto` 选择首个同时配置了 key 和 base URL 的组。

| 变量组 | API 族 |
|--------|--------|
| `OPENAI_CHAT_COMPLETIONS_API_KEY` / `_BASE_URL` / `_MODEL` | Chat Completions |
| `OPENAI_RESPONSES_API_KEY` / `_BASE_URL` / `_MODEL` | Responses |
| `OPENAI_ANTHROPIC_API_KEY` / `_BASE_URL` / `_MODEL` | Anthropic Messages |

### 通用变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VLM_API_KEY` | API Key | *(必填)* |
| `VLM_BASE_URL` | 提供商 API 根地址 | 智谱默认 |
| `VLM_VISION_MODEL` | 模型名 | `glm-4.6v` |
| `VLM_PROVIDER` | 提供商族：`auto` / `chat-completions` / `responses` / `anthropic` | `auto` |
| `VLM_VISION_MODEL_TEMPERATURE` | 采样温度 | `0.8` |
| `VLM_VISION_MODEL_TOP_P` | Top-p | `0.6` |
| `VLM_VISION_MODEL_MAX_TOKENS` | 最大输出 token | `32768` |
| `VLM_TIMEOUT` | 请求超时（毫秒） | `300000` |
| `VLM_RETRY_COUNT` | 重试次数 | `1` |
| `VLM_ANTHROPIC_VERSION` | `anthropic-version` 头（仅 Anthropic） | `2023-06-01` |
| `VLM_LOG_PATH` | 自定义日志文件路径 | `~/.vlm/vlm-mcp-YYYY-MM-DD.log` |

### 提供商自动检测

在 `auto` 模式下（未设置任何 `OPENAI_*` 组时），提供商按以下规则推断：

- Base URL 包含 `anthropic`，或 Key 以 `sk-ant` 开头 → `anthropic`
- 否则 → `chat-completions`（兼容性最广的默认值）

## 使用示例

将视觉 MCP 服务器安装到客户端后，即可在 Coding 客户端通过对话直接使用。例如在 Claude Code 中，对话输入 `describe this demo.png`，MCP Server 会处理图片并返回描述结果（前置条件是当前目录下有该图片）。

> 除了 Claude Code 之外，直接在客户端粘贴图片不会调用此 MCP Server —— 客户端默认会将图片转码后直接调用模型接口。**最佳实践**是将图片放到本地目录，通过对话指定图片名称或路径来调用 MCP Server，例如：`What does demo.png describe?`

## 故障排除

在本地命令行直接执行下面的命令，验证服务器是否能正常启动，用于排查环境、权限等问题：

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

- 若启动成功，则表示环境正确，问题可能在客户端配置上，请检查客户端的 MCP 配置。
- 若启动失败，请根据错误信息排查，建议将错误信息粘贴给大模型分析。

### 常见问题

**连接失败**
1. 检查本地是否存在 Node.js 18 或更新版本。
2. 执行 `node -v` 和 `npx -v` 查看是否拥有执行环境。
3. 确认环境变量（`OPENAI_*` 三元组或 `VLM_*`）是否正确配置。

**API Key 无效**
1. 确认 API Key 是否正确复制。
2. 检查 API Key 是否已激活。
3. 确认所选 provider 族与 API Key 匹配（Chat Completions / Responses / Anthropic）。
4. 检查 API Key 是否有足够余额。

**连接超时**
1. 检查网络连接。
2. 确认防火墙设置。
3. 尝试切换到不同的 provider 族或 base URL。
4. 增加超时时间设置（`VLM_TIMEOUT`，默认 300000ms）。

## 架构

```
src/
├── index.ts                  # 入口：启动 MCP 服务器，注册所有工具
├── types/                    # 错误类型（McpError、ApiError、ValidationError 等）
├── core/
│   ├── environment.ts        # 环境配置（VLM_* + OPENAI_* 组）、URL 解析
│   ├── chat-service.ts       # 委托给当前 VisionProvider
│   ├── file-service.ts       # 文件校验 + base64 编码（图像/视频）
│   ├── base-image-service.ts # 所有图像工具共享的图像处理逻辑
│   ├── api-common.ts         # 消息构造、响应辅助、重试封装
│   ├── error-handler.ts      # 错误层级 + 处理/恢复策略
│   └── logger.ts             # stderr + 文件日志（保持 stdout 的 JSON 纯净）
├── providers/                # 可插拔的模型提供商抽象
│   ├── types.ts              # VisionProvider 接口、ChatMessage、postJson 辅助
│   ├── chat-completions.ts   # 兼容 OpenAI 的 Chat Completions
│   ├── responses.ts          # OpenAI Responses API
│   ├── anthropic.ts          # Anthropic Messages API
│   └── index.ts              # 提供商选择（VLM_PROVIDER / 自动推断）
├── prompts/                  # 各专项工具的系统提示词
└── tools/                    # 8 个工具注册（7 个图像 + 1 个视频）
```

**提供商层**（`src/providers/`）是关键扩展。每个 provider 实现 `VisionProvider` 接口，接收规范化的 `ChatMessage[]`（以 OpenAI Chat Completions 的 content-part 格式作为内部通用格式）并转换为各 provider 的传输格式。`chat-service.ts` 仅委托给解析出的 provider，因此所有工具代码无需改动。

## 许可证

Apache-2.0
