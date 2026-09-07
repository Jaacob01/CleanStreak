from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=20)
    color: Optional[str] = Field(None, max_length=20)


class GroupRename(BaseModel):
    id: int
    name: str = Field(..., min_length=1, max_length=20)


class GroupIdRequest(BaseModel):
    id: int


class GroupResponse(BaseModel):
    id: int
    user_id: int
    name: str
    color: str
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True
