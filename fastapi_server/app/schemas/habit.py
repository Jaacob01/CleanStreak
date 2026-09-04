from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class HabitCreate(BaseModel):
    name: str = Field(..., max_length=100)
    emoji: str = Field(default="🎯", max_length=10)
    color: str = Field(default="green")
    direction: str = Field(default="positive")
    goal_type: str = Field(default="check")
    target_value: float = Field(default=1, ge=0)
    unit: str = Field(default="", max_length=20)
    weekdays: List[int] = Field(default_factory=list)
    enable_notes: bool = True
    enable_tags: bool = False
    tags: List[str] = Field(default_factory=list)
    archived: bool = False
    sort_order: Optional[int] = None


class HabitUpdate(BaseModel):
    id: int
    name: Optional[str] = Field(None, max_length=100)
    emoji: Optional[str] = Field(None, max_length=10)
    color: Optional[str] = None
    direction: Optional[str] = None
    goal_type: Optional[str] = None
    target_value: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=20)
    weekdays: Optional[List[int]] = None
    enable_notes: Optional[bool] = None
    enable_tags: Optional[bool] = None
    tags: Optional[List[str]] = None
    archived: Optional[bool] = None
    sort_order: Optional[int] = None


class HabitResponse(BaseModel):
    id: int
    user_id: int
    name: str
    emoji: str
    color: str
    direction: str
    goal_type: str
    target_value: float
    unit: str
    weekdays: List[int]
    enable_notes: bool
    enable_tags: bool
    tags: List[str]
    archived: bool
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True


class MoveRequest(BaseModel):
    habit_id: int
    direction: int = Field(..., ge=-1, le=1)


class HabitListRequest(BaseModel):
    include_archived: bool = False
