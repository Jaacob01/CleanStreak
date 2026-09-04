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
