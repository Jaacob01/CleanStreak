from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from datetime import datetime


# ---- 状态 ----

class AIStatusResponse(BaseModel):
    enabled: bool          # 已启用且配置完整，可以调用


# ---- 聊天 ----

class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class AIHistoryItem(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime


class AIHistoryResponse(BaseModel):
    messages: List[AIHistoryItem]


# ---- 分析 ----

class AIAnalyzeRequest(BaseModel):
    preset: Literal["day", "week", "month", "year", "custom"] = "week"
    date_from: Optional[str] = None
    date_to: Optional[str] = None


# ---- 管理端 ----

class AISettingsResponse(BaseModel):
    enabled: bool
    provider: str
    base_url: str
    api_key_masked: str
    has_api_key: bool
    model_name: str
    system_prompt_chat: str
    system_prompt_analyze: str
    temperature: float
    max_tokens: int
    provider_presets: dict
    updated_at: Optional[datetime] = None


class AISettingsUpdateRequest(BaseModel):
    enabled: Optional[bool] = None
    provider: Optional[str] = None
    base_url: Optional[str] = Field(default=None, max_length=255)
    api_key: Optional[str] = Field(default=None, max_length=500)
    model_name: Optional[str] = Field(default=None, max_length=100)
    system_prompt_chat: Optional[str] = None
    system_prompt_analyze: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


class AITestRequest(BaseModel):
    """不传则用已保存配置测试；传了则测表单当前值（保存前验证）"""
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None


class AITestResponse(BaseModel):
    ok: bool
    message: str
