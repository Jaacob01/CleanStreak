"""AI 全局配置服务：读写 ai_settings 单行配置，api_key 加密存储、脱敏返回"""
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.models import AISettings, User
from app.utils import crypto


PROVIDER_PRESETS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "moonshot": "https://api.moonshot.cn/v1",
    "zhipu": "https://open.bigmodel.cn/api/paas/v4",
    "ollama": "http://localhost:11434/v1",
    "custom": "",
}


async def get_settings_row(db: AsyncSession, create: bool = False) -> AISettings | None:
    """全局单行配置；create=True 时（管理端）缺省自动建行"""
    result = await db.execute(select(AISettings).order_by(AISettings.id).limit(1))
    row = result.scalar_one_or_none()
    if not row and create:
        row = AISettings()
        db.add(row)
        await db.flush()
    return row


def mask_api_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:3]}****{key[-4:]}"


def to_public_dict(row: AISettings) -> dict:
    """返回给前端的形态：api_key 只给掩码"""
    key = crypto.decrypt(row.api_key_encrypted) if row.api_key_encrypted else ""
    return {
        "enabled": row.enabled,
        "provider": row.provider,
        "base_url": row.base_url,
        "api_key_masked": mask_api_key(key),
        "has_api_key": bool(key),
        "model_name": row.model_name,
        "system_prompt_chat": row.system_prompt_chat or "",
        "system_prompt_analyze": row.system_prompt_analyze or "",
        "temperature": row.temperature,
        "max_tokens": row.max_tokens,
        "provider_presets": PROVIDER_PRESETS,
        "updated_at": row.updated_at,
    }


def is_ready(row: AISettings | None) -> bool:
    """启用且三要素齐全（key 允许为空，兼容 Ollama 等本地服务）"""
    return bool(row and row.enabled and row.base_url and row.model_name)


async def apply_update(db: AsyncSession, row: AISettings, data: dict, admin: User) -> AISettings:
    """应用管理端更新；api_key 为空字符串/None 时不动，传 '****' 掩码原样时也不覆盖"""
    if "enabled" in data and data["enabled"] is not None:
        row.enabled = bool(data["enabled"])
    if data.get("provider"):
        row.provider = data["provider"]
    if data.get("base_url") is not None:
        row.base_url = data["base_url"].strip()
    if "model_name" in data and data.get("model_name"):
        row.model_name = data["model_name"].strip()
    key = (data.get("api_key") or "").strip()
    if key and "*" not in key:
        row.api_key_encrypted = crypto.encrypt(key)
    if "system_prompt_chat" in data and data["system_prompt_chat"] is not None:
        row.system_prompt_chat = data["system_prompt_chat"] or None
    if "system_prompt_analyze" in data and data["system_prompt_analyze"] is not None:
        row.system_prompt_analyze = data["system_prompt_analyze"] or None
    if data.get("temperature") is not None:
        temp = float(data["temperature"])
        if not 0 <= temp <= 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="temperature 取值 0-2")
        row.temperature = temp
    if data.get("max_tokens") is not None:
        mt = int(data["max_tokens"])
        if not 128 <= mt <= 32768:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="max_tokens 取值 128-32768")
        row.max_tokens = mt
    row.updated_by = admin.id
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return row
