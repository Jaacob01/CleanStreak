from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class ProjectRename(BaseModel):
    id: int
    name: str = Field(..., min_length=1, max_length=50)


class ProjectIdRequest(BaseModel):
    id: int


class ProjectResponse(BaseModel):
    id: int
    user_id: int
    name: str
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True
