# CleanStreak

通用习惯追踪应用 — 正向打卡、反向记录，每个习惯独立配置。

## 技术栈

### 前端

| 技术 | 版本 | 说明 |
|------|------|------|
| React Native | 0.86.3 | 跨平台移动框架 |
| Expo | 57.0.18 | RN 开发工具链 |
| React | 19.2.3 | UI 库 |
| TypeScript | 5.x | 类型安全 |
| Zustand | 5.0.15 | 状态管理 |
| React Navigation | 7.x | 页面导航 |
| expo-secure-store | 57.0.2 | 安全存储 JWT |
| expo-local-authentication | 57.0.2 | 生物识别 |

### 后端

| 技术 | 版本 | 说明 |
|------|------|------|
| Python | 3.14.6 | 运行时 |
| FastAPI | 0.141.1 | Web 框架 |
| Uvicorn | 0.52.4 | ASGI 服务器 |
| SQLAlchemy | 2.0.52 | ORM（async） |
| asyncpg | 0.31.0 | PostgreSQL 异步驱动 |
| Redis | 8.1.0 | 缓存（hiredis 加速） |
| Pydantic | 2.13.5 | 数据校验 |
| Alembic | 1.19.1 | 数据库迁移 |
| python-jose | 3.5.0 | JWT 签发/验证 |
| bcrypt | 5.0.0 | 密码哈希 |

### 基础设施

| 技术 | 版本 | 说明 |
|------|------|------|
| PostgreSQL | 16 | 主数据库（Docker Alpine） |
| Redis | 7 | 缓存/统计（Docker Alpine） |
| Docker | - | 容器化部署 |
| Node.js | 24.17.0 | 前端构建 |

## 项目结构

```
CleanStreak/
├── frontend_reactnative/    # Expo RN 前端
│   ├── src/
│   │   ├── api/             # API 客户端（JWT + fetch）
│   │   ├── db/              # 数据桥接层 + 纯逻辑
│   │   ├── screens/         # 页面
│   │   ├── store/           # Zustand 状态
│   │   ├── ui/              # 组件
│   │   ├── navigation/      # 路由
│   │   └── theme/           # 野兽派主题
│   └── package.json
├── fastapi_server/           # FastAPI 后端
│   ├── app/
│   │   ├── routers/         # 路由（全部 POST）
│   │   ├── services/        # 业务逻辑
│   │   ├── models/          # ORM 模型
│   │   ├── schemas/         # Pydantic 校验
│   │   └── utils/           # 认证 + 统计逻辑
│   ├── alembic/             # 数据库迁移
│   ├── Dockerfile           # Python 3.14-slim
│   ├── docker-compose.yml   # 完整部署（PG + Redis + 后端）
│   ├── docker-compose.backend-only.yml  # 仅后端
│   ├── requirements.txt
│   └── .env.example
├── deploy/                   # 部署工具
│   ├── config.json          # 服务器配置
│   ├── sync.py              # Python 同步脚本
│   ├── sync.sh              # Shell 同步脚本
│   └── deploy.md            # 部署文档
├── .vscode/launch.json       # 后端调试配置
└── .venv/                    # Python 3.14 虚拟环境
```

## 快速开始

### 后端

```bash
cd fastapi_server
cp .env.example .env
# 编辑 .env 配置数据库、Redis、SECRET_KEY

# 本地开发
source ../.venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Docker 完整部署
docker compose up -d --build
```

### 前端

```bash
cd frontend_reactnative
npm install
npx expo start
```

前端通过 `.env` 中的 `EXPO_PUBLIC_API_URL` 连接后端（默认 `http://localhost:8000`）。

### 部署到服务器

```bash
# 编辑 deploy/config.json 配置服务器信息
python3 deploy/sync.py production
```

## 数据模型

| 表 | 说明 |
|---|---|
| `users` | 用户账号 |
| `habits` | 习惯配置（方向/目标/频率/标签/排序） |
| `habit_entries` | 每日记录（每天每习惯一条，支持 upsert） |

## API

所有接口统一 POST，JWT 认证，详见 `http://localhost:8000/docs`。

| 模块 | 端点 |
|------|------|
| 认证 | `/api/v1/auth/register` `/login` `/me` `/change-password` |
| 习惯 | `/api/v1/habits/list` `/create` `/get` `/update` `/delete` `/move` |
| 记录 | `/api/v1/entries/get` `/by-date` `/by-month` `/by-habit` `/all` `/toggle` `/bump` `/save` `/delete` |
| 统计 | `/api/v1/stats/habit` `/recent` `/today-summary` |
| 导出 | `/api/v1/export` |
| AI | `/api/v1/ai/status` `/chat` `/chat/history` `/chat/clear` `/analyze` `/admin/settings` `/admin/settings/update` `/admin/test` |

## AI 功能

AI 助手（聊天 + 统计页分析）基于后端预计算的数据上下文工作：全部统计数字由 `app/utils/logic.py` 的同一套判定逻辑生成（与页面口径一致），LLM 只做解读，不接触原始打卡记录。管理员在「我的 → AI 设置」配置 OpenAI 兼容供应商、Base URL、模型与 API Key（Fernet 加密落库，接口只回掩码）；相关表：`ai_settings`（全局单行配置）、`ai_chat_messages`（聊天历史，服务端保留）。`/chat` 与 `/analyze` 为 SSE 流式返回（`data: {"meta"...}` / `{"delta"...}` 逐段输出，出错发 `{"error"...}`，`data: [DONE]` 结束），前端逐字上屏。

### 系统提示词（推荐值）

以下两份提示词比代码内置默认（`app/services/ai_chat_service.py` 的 `DEFAULT_CHAT_PROMPT` / `DEFAULT_ANALYZE_PROMPT`）更贴合上下文结构，可直接粘贴到 AI 设置中覆盖；两个输入框留空则使用内置默认。

**聊天系统提示词**（上下文固定为最近 30 天，含上一周期对比与规则预计算的亮点提示）：

```text
你是 CleanStreak（习惯追踪应用）的个人数据回顾助手。用户基于自己的习惯打卡与任务数据提问，你负责解读、归因和给建议。

每次对话的系统消息末尾附有【用户数据上下文】：固定为最近 30 天，含各习惯的全期统计（连续天数、达成率）、范围内汇总、任务概览、上一周期对比和「亮点提示」。

口径规则（最重要）：
1. 所有数字必须直接引用上下文中的数值（达成率%、连续天数、任务完成率等），禁止自行统计、估算或推算出上下文中没有的数字；
2. 「最近N天逐日」符号串只用于观察模式（连续中断、周内波动），星期规律参考「失守星期分布」字段，不要靠数符号得出比例；
3. 上下文没有的信息一律回答「数据中未包含」，严禁编造；
4. 用户问到最近 30 天以外的时段时，说明数据未覆盖该范围。

字段图例：✓达成；~部分达成（正向计数型未达标）；✗未达成；·非生效日或习惯创建前；?今天待完成。反向克制类习惯过去的生效日无记录默认视为成功。

回答要求：中文，简洁友好，适当分点；结论引用具体数字；建议必须具体可执行（如调整目标值、生效日、拆分任务）；只回答与习惯/任务数据相关的问题，无关话题礼貌拒绝；今天日期以系统注入的「当前日期」为准。
```

**分析系统提示词**（上下文为所选时间范围：今日/本周/本月/本年/自定义）：

```text
你是习惯与任务数据分析专家。基于用户消息中的【用户数据上下文】（已由服务端按与页面一致的口径预计算），输出一份结构化分析报告。

格式（前端仅支持 #/## 小节、- 列点和 **加粗**，不要表格、代码块、嵌套列表）：
## 总体评价
（2-3 句概括整体表现，结合「对比上一周期」说明变好还是变差）
## 亮点
（列点，每点引用具体数字）
## 问题与风险
（列点，每点引用具体数字）
## 改进建议
（3-5 条，针对具体习惯或任务，可执行：调整目标值、生效日、优先级、拆分任务等）

口径规则：所有结论只能来自数据上下文；比例与计数直接引用上下文数值，禁止自行重算；「最近N天逐日」符号串（✓达成 ~部分 ✗未达成 ·非生效 ?待完成）仅用于描述趋势模式；上下文没有的内容不要写。

语言：中文，精炼，不寒暄。
```

### 逐日状态符号

上下文中「最近N天逐日」字符串的图例（与页面打卡状态一致）：

| 符号 | 含义 |
|------|------|
| `✓` | 达成 |
| `~` | 部分达成（正向计数型未达标） |
| `✗` | 未达成 |
| `·` | 非生效日 / 习惯创建前 |
| `?` | 今天待完成 |

反向克制类习惯（如「戒烟」）在过去的生效日无记录默认记为达成。
