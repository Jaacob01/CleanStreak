# CleanStreak 后端部署指南

## 目录结构

```
deploy/
├── config.json   # 服务器配置
├── sync.sh       # Shell 同步脚本
├── sync.py       # Python 同步脚本（零依赖）
└── deploy.md     # 本文档
```

## 一、服务器配置

编辑 `config.json`：

```json
{
  "servers": [
    {
      "name": "production",
      "host": "192.168.1.100",
      "port": 22,
      "user": "root",
      "auth": {
        "type": "key",
        "key_path": "~/.ssh/id_rsa"
      },
      "remote_dir": "/opt/cleanstreak",
      "exclude": [".env", ".venv", "__pycache__", "*.pyc", ".git"]
    }
  ]
}
```

### 认证方式

| type | 说明 | 前置条件 |
|------|------|---------|
| `key` | SSH 免密登录 | 服务器已添加公钥 |
| `password` | 密码登录 | 安装 sshpass：`brew install sshpass` |

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 服务器标识，同步时指定 |
| `host` | ✅ | IP 或域名 |
| `port` | ❌ | SSH 端口，默认 22 |
| `user` | ✅ | 登录用户 |
| `auth.type` | ✅ | `key` 或 `password` |
| `auth.key_path` | key 时必填 | 私钥路径，支持 `~` |
| `auth.password` | password 时必填 | 登录密码 |
| `remote_dir` | ✅ | 服务器上的项目目录 |
| `exclude` | ❌ | rsync 排除规则 |

## 二、同步代码

### Shell 版

```bash
chmod +x deploy/sync.sh

./deploy/sync.sh              # 同步到第一个服务器
./deploy/sync.sh production   # 指定服务器
./deploy/sync.sh --dry-run    # 预览变更
```

### Python 版（推荐，零依赖）

```bash
python3 deploy/sync.py              # 多服务器时交互选择
python3 deploy/sync.py production   # 指定服务器
python3 deploy/sync.py --dry-run    # 预览变更
```

## 三、完整部署流程

### 1. 首次部署

```bash
# 1. 同步代码
python3 deploy/sync.py production

# 2. SSH 登录服务器
ssh root@192.168.1.100

# 3. 进入目录，配置 .env
cd /opt/cleanstreak
cp .env.example .env
vi .env   # 修改密码、SECRET_KEY、DB_HOST=db、REDIS_HOST=redis

# 4. Docker 完整部署
docker compose up -d --build

# 5. 验证
curl http://localhost:8000/health
```

### 2. 日常更新

```bash
# 本地改完代码后一行命令同步
python3 deploy/sync.py production

# 服务器上重启容器
ssh root@192.168.1.100 "cd /opt/cleanstreak && docker compose restart backend"
```

### 3. 仅更新后端（外部 PG/Redis）

```bash
python3 deploy/sync.py production
ssh root@192.168.1.100 "cd /opt/cleanstreak && docker compose -f docker-compose.backend-only.yml up -d --build"
```

## 四、传输性能

- **rsync 增量传输**：只同步变化的文件
- **压缩传输**：`--compress-level=9` 最高压缩
- **校验模式**：`--checksum` 按内容而非时间判断变化
- **自动排除**：`.venv`、`__pycache__`、`.env` 等不传输

## 五、多服务器

config.json 支持多个 server，同步时指定 name：

```json
{
  "servers": [
    { "name": "staging",    "host": "10.0.0.1", ... },
    { "name": "production", "host": "10.0.0.2", ... }
  ]
}
```

```bash
python3 deploy/sync.py staging
python3 deploy/sync.py production
```
