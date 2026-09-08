from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class McpKeyCreateRequest(BaseModel):
    label: Optional[str] = Field(None, max_length=50)


class McpKeyResponse(BaseModel):
    id: int
    label: str
    key: str  # 明文仅回给本人（JWT 保护），便于随时复制重配客户端
    prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None


class McpKeyListResponse(BaseModel):
    keys: List[McpKeyResponse]


class McpKeyIdRequest(BaseModel):
    id: int
