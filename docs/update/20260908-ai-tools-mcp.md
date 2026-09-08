# AI 聊天管理与 MCP 接入

日期：2026-09-08

## 概述

AI 从「只读分析助手」升级为「可执行操作的助理」，新增两个入口：

1. **App 内 AI 助手页**：聊天走 agent loop，模型可调用 29 个工具直接完成业务的增删改查（建任务、完成、打卡、计数、建习惯、分组项目管理、删除等）；
2. **MCP 端点 `/mcp`**：把同一套工具注册表以 MCP（Model Context Protocol）Streamable HTTP 形式暴露，hermes 等外部 AI 客户端可长期接入管理整个系统。

两个入口共用同一工具层（`app/services/ai_tools.py`），业务逻辑零重复；所有调用按用户隔离、落审计表。
MCP 密钥支持用户自助管理：App「我的 → MCP 密钥」生成/复制/吊销（`mcp_api_keys` 表，
`/api/v1/mcp-keys/list|create|delete`），服务端 `MCP_API_KEYS` 仅作管理员兜底。

## 架构

```
                    ┌─ App AI 页面 ──→ /api/v1/ai/chat ──→ agent loop（ai_chat_service）
用户 ──→ 业务数据 ──┤                                          │
                    └─ 外部客户端 ──→ /mcp (JSON-RPC) ──→ ai_tools.execute_tool
                                                         │  （confirm 确认、审计）
                                                         └→ service 层（task/habit/entry/group/project）
```

关键文件：

| 文件 | 职责 |
|---|---|
| `app/services/ai_tools.py` | 工具注册表：29 个工具 = 描述 + JSON Schema + 执行函数（对 service 薄封装）；`execute_tool` 统一做异常转义、危险操作确认、审计 |
| `app/services/ai_client.py` | `stream_completion`：流式补全，支持 OpenAI 兼容 `tools` 参数与流内 `tool_calls` 分片累积 |
| `app/services/ai_chat_service.py` | agent loop：LLM ↔ 工具最多 6 轮，最后一轮强制去工具收敛；历史只落 user/assistant 文本 |
| `app/routers/mcp.py` | 无状态 MCP Streamable HTTP：initialize / ping / tools/list / tools/call |
| `app/models/models.py` | `ai_tool_calls` 审计表（谁、何时、调了什么、参数、结果、来源 chat/mcp） |

## 安全设计

- **数据隔离**：所有工具执行都绑定当前用户 id（JWT 或 MCP 密钥解析），与 REST API 同一套 service 层校验；
- **删除确认**：`delete_task / delete_habit / delete_entry / delete_group / delete_project` 标记为 danger，不带 `confirm=true` 只返回「需要确认 + 目标详情」，LLM 被系统提示词要求先向用户复述、获明确同意后才能带 `confirm=true` 执行；
- **审计**：每次工具调用（含失败与待确认）都写 `ai_tool_calls`，result 超长截断到 4000 字符；
- **收敛**：单条消息最多 6 轮工具调用，最后一轮不提供工具，防止死循环。

## App 内聊天协议变化

`/api/v1/ai/chat` 的 SSE 流新增事件（对旧客户端向后兼容，未知字段忽略即可）：

```
data: {"tool": {"name": "create_task", "label": "创建任务", "ok": true, "detail": "已创建任务「xxx」"}}
```

前端（`AIScreen.tsx`）在回复气泡内以小徽标展示本轮执行过的工具。

## MCP 接入指南

### 端点

`POST https://<服务器>/mcp`，JSON-RPC 2.0，无状态（每请求独立，application/json 应答）。

支持方法：`initialize`、`notifications/initialized`、`ping`、`tools/list`、`tools/call`。
协议版本支持 `2025-06-18` / `2025-03-26` / `2024-11-05`。

### 鉴权（按序尝试）

1. **JWT**：登录接口的 `token`，放 `Authorization: Bearer <token>`；7 天过期，适合临时使用；
2. **用户级密钥（推荐）**：App「我的 → MCP 密钥」自助生成/复制/吊销，长期有效，存 `mcp_api_keys` 表
   （Fernet 加密落库，鉴权后刷新 `last_used_at`），每个用户最多 10 个，数据即该用户自己的；
3. **服务端 MCP_API_KEYS 静态密钥（管理员兜底）**：服务端 `.env` 配置：

```bash
# 格式 "密钥:用户名"，逗号分隔可配多个；该用户名的数据即密钥的操作范围
MCP_API_KEYS="cs_一串随机密钥:zhangsan"
```

### 客户端接入配置

通用三要素（所有支持远程 MCP 的客户端都一样）：

- 类型/传输：**Streamable HTTP**（有的客户端叫「远程 MCP」「HTTP」「URL 类型」，不要选 stdio/命令行类型）
- URL：`https://<服务器>/mcp`
- Header：`Authorization: Bearer <密钥>`（JWT 或「我的 → MCP 密钥」生成的密钥）

**ZCode**（`~/.zcode/cli/config.json` 个人全局，或 `<repo>/.zcode/config.json` 项目级；也可在 设置 → MCP 页面添加）：

```json
{
  "mcp": {
    "servers": {
      "cleanstreak": {
        "type": "http",
        "url": "https://your-server.com/mcp",
        "headers": { "Authorization": "Bearer cs_xxx" }
      }
    }
  }
}
```

**Claude Code**（命令行）：

```bash
claude mcp add --transport http cleanstreak https://your-server.com/mcp \
  --header "Authorization: Bearer cs_xxx"
```

**Claude Desktop**：设置 → Connectors / 连接器 → 添加自定义连接器，填远程 MCP URL 与 Header；旧版本不支持远程连接时用 `npx mcp-remote https://your-server.com/mcp --header "Authorization: Bearer cs_xxx"` 作为 stdio 桥接。

**Cursor / Cline / Roo Code / Cherry Studio 等**：MCP 设置里添加服务器，类型选 `HTTP (streamable)` 或「远程」，URL 与 Header 同上。只支持 stdio 的客户端，用 `mcp-remote` 桥接（command: `npx`, args: `["mcp-remote", "https://your-server.com/mcp", "--header", "Authorization: Bearer cs_xxx"]`）。

**自建 agent（如 hermes 是自己的项目）**两种接法：

1. 用 MCP 客户端 SDK（Python `mcp` / `fastmcp`，TS `@modelcontextprotocol/sdk`）连 `https://服务器/mcp`，拿到的工具列表直接转成 LLM 的 function calling 参数；
2. 本服务是无状态 JSON-RPC，不用 SDK 直接 POST 即可：

```python
import httpx, json

BASE, HEADERS = "https://your-server.com/mcp", {"Authorization": "Bearer cs_xxx"}

def rpc(method, params=None, id_=1):
    r = httpx.post(BASE, json={"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}},
                   headers={**HEADERS, "Content-Type": "application/json"})
    return r.json().get("result")

tools = rpc("tools/list")["tools"]          # → 转成 OpenAI tools 参数喂给模型
res = rpc("tools/call", {"name": "create_task",
                         "arguments": {"title": "写周报", "priority": 1}})
print(res["content"][0]["text"])            # JSON 文本结果；res["isError"]=True 表示业务失败
```

**裸协议手测**：

```bash
# 列出工具
curl -s $BASE/mcp -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 调用工具
curl -s $BASE/mcp -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_task","arguments":{"title":"写周报","date":"2026-09-09","priority":1}}}'
```

`tools/call` 业务失败不回 JSON-RPC error，而是 `isError: true` + 错误文本（LLM 可读并自行调整）；协议级错误（未授权 401、未知方法 -32601）才走 JSON-RPC error。

### 工具清单（31 个）

- 任务：`list_tasks` `create_task` `update_task` `delete_task`* `complete_task` `add_task_progress` `block_task` `carry_overdue_tasks` `get_task_stats` `get_day_report`
- 日报/周报：`generate_daily_report` `generate_weekly_report`
- 习惯：`list_habits` `get_habit_stats` `create_habit` `update_habit` `delete_habit`* `toggle_habit_checkin` `bump_habit_count` `save_entry` `delete_entry`* `get_day_entries`
- 数据总览：`get_data_overview`（与 AI 分析页同一统计口径）
- 分组：`list_groups` `create_group` `rename_group` `delete_group`*
- 项目：`list_projects` `create_project` `rename_project` `delete_project`*

带 `*` 为危险操作，需 `confirm: true` 二次确认。

### 日报/周报示例

**生成日报**（默认今天，Obsidian 分组格式）：

```bash
curl -s $BASE/mcp -H "Authorization: Bearer ***" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"generate_daily_report","arguments":{}}}'
```

指定日期：

```json
{"name": "generate_daily_report", "arguments": {"date": "2026-09-08"}}
```

返回示例：

```
📋 每日工作简报 - 2026-09-08

【WORK】

今日完成：
1. 【HRP】供应商入库统计报表

今日计划：
1. 测试验证 库存调价单

阻塞 / 需要支持：
无

【JAC】
...
```

**生成周报**（默认本周，含完成率统计 + 逐日明细）：

```bash
curl -s $BASE/mcp -H "Authorization: Bearer ***" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"generate_weekly_report","arguments":{}}}'
```

## 供应商兼容性

agent loop 依赖 OpenAI 兼容协议的 function calling（流式 `tool_calls`）。DeepSeek / 通义千问 / Kimi / 智谱 / mimo 等官方兼容接口均支持；本地 Ollama 小模型不一定支持 tools，若模型不支持会在无工具情况下正常纯文本回复（可能表示无法执行操作），建议为「聊天管理」场景配置支持 function calling 的模型。

## 测试记录（2026-09-08，真实供应商 mimo-v2.5-pro）

- 聊天建任务：模型自动调 `create_task` → 返回任务 id，流式回复正常；
- 两轮删除确认：第一轮模型复述目标征求同意（未调工具），第二轮用户同意后带 `confirm=true` 删除；
- 打卡流：`toggle_habit_checkin` / `bump_habit_count`（+2/-1 累计正确）/ `get_day_entries` / `get_habit_stats`；
- 隔离：跨用户 id 访问一律「不存在」；静态密钥鉴权 401/200 正常；审计表 chat/mcp 来源均正确落库。
