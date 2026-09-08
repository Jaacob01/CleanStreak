"""用户级 MCP 密钥服务：生成 / 列表 / 吊销；/mcp 鉴权时按前缀检索后解密比对

密钥格式 cs_<40 位 hex>，仅生成时明文可见；库里存 Fernet 密文 + 明文前缀，
列表接口把明文回给本人（JWT 保护下用户随时可复制重配客户端）。
"""
import secrets
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.models import McpApiKey, User
from app.utils import crypto

KEY_PREFIX = "cs_"
PREFIX_LEN = 12  # cs_ + 8 位 hex
MAX_KEYS_PER_USER = 10


def _to_dict(row: McpApiKey) -> dict:
    return {
        "id": row.id,
        "label": row.label,
        "key": crypto.decrypt(row.key_encrypted),
        "prefix": row.prefix,
        "created_at": row.created_at,
        "last_used_at": row.last_used_at,
    }


async def list_keys(db: AsyncSession, user_id: int) -> list[dict]:
    result = await db.execute(
        select(McpApiKey)
        .where(McpApiKey.user_id == user_id)
        .order_by(McpApiKey.id.desc())
    )
    return [_to_dict(k) for k in result.scalars().all()]


async def create_key(db: AsyncSession, user_id: int, label: str | None) -> dict:
    count = (
        await db.execute(
            select(func.count()).select_from(McpApiKey).where(McpApiKey.user_id == user_id)
        )
    ).scalar() or 0
    if count >= MAX_KEYS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"最多保存 {MAX_KEYS_PER_USER} 个密钥，请先删除不用的",
        )
    key = KEY_PREFIX + secrets.token_hex(20)
    prefix = key[:PREFIX_LEN]
    row = McpApiKey(
        user_id=user_id,
        label=(label or "默认密钥").strip()[:50] or "默认密钥",
        prefix=prefix,
        key_encrypted=crypto.encrypt(key),
    )
    db.add(row)
    await db.flush()
    return _to_dict(row)


async def delete_key(db: AsyncSession, user_id: int, key_id: int) -> None:
    result = await db.execute(
        select(McpApiKey).where(McpApiKey.id == key_id, McpApiKey.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="密钥不存在")
    await db.delete(row)
    await db.flush()


async def resolve_user(db: AsyncSession, token: str) -> User | None:
    """/mcp 鉴权：按前缀检索候选密钥，解密比对命中则返回所属用户并刷新 last_used_at"""
    result = await db.execute(
        select(McpApiKey).where(McpApiKey.prefix == token[:PREFIX_LEN])
    )
    for row in result.scalars().all():
        if crypto.decrypt(row.key_encrypted) == token:
            row.last_used_at = datetime.now(timezone.utc)
            await db.flush()
            user_result = await db.execute(select(User).where(User.id == row.user_id))
            return user_result.scalar_one_or_none()
    return None
