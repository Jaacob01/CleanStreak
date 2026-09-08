from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # 数据库
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_NAME: str = "cleanstreak"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""

    # JWT
    SECRET_KEY: str = "change-me-to-a-random-secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7

    # AI：api_key 加密密钥（留空则从 SECRET_KEY 派生）
    AI_SECRET_KEY: str = ""

    # MCP：静态访问密钥（可选），格式 "密钥:用户名"，逗号分隔多个。
    # 供外部 AI 客户端（hermes 等）长期访问 /mcp，免 JWT 7 天过期，例如：
    #   MCP_API_KEYS="cs_xxxx:zhangsan"
    MCP_API_KEYS: str = ""

    # CORS
    CORS_ORIGINS: str = '["http://localhost:3000","http://localhost:8080"]'

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def redis_url(self) -> str:
        pwd = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"redis://{pwd}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)

    @property
    def mcp_api_keys(self) -> dict:
        """解析 MCP_API_KEYS 为 {密钥: 用户名}"""
        out = {}
        for part in self.MCP_API_KEYS.split(","):
            part = part.strip()
            if ":" in part:
                key, username = part.split(":", 1)
                key, username = key.strip(), username.strip()
                if key and username:
                    out[key] = username
        return out

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
