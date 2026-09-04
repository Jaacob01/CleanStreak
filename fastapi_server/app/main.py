from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.redis import init_redis, close_redis
from app.routers import auth, habits, entries, stats, export


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化数据库和 Redis
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await init_redis()
    yield
    # 关闭时清理
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title="CleanStreak API",
    description="习惯追踪后端服务",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router)
app.include_router(habits.router)
app.include_router(entries.router)
app.include_router(stats.router)
app.include_router(export.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
