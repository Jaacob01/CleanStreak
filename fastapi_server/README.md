# CleanStreak FastAPI Backend

习惯追踪后端服务。

## 本地开发

```bash
# 创建虚拟环境
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 配置
cp .env.example .env  # 编辑数据库等配置

# 启动
uvicorn app.main:app --reload --port 8000
```

## Docker 部署

### 完整部署（PG + Redis + 后端一键启动）

```bash
cp .env.example .env
# 编辑 .env，确保：
#   DB_HOST=db
#   REDIS_HOST=redis
#   设置强密码和 SECRET_KEY

docker compose up -d --build
```

### 仅后端（外部已有 PG/Redis）

```bash
cp .env.example .env
# 编辑 .env，指向外部 PG/Redis 地址

docker compose -f docker-compose.backend-only.yml up -d --build
```

### 停止

```bash
docker compose down           # 完整部署
# 或
docker compose -f docker-compose.backend-only.yml down  # 仅后端
```

## API 文档

启动后访问 http://localhost:8000/docs 查看 Swagger 文档。
