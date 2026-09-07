from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class TaskCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    date: Optional[str] = None  # 默认今天
    group: str = Field(default="Work", max_length=20)
    project: Optional[str] = Field(None, max_length=50)
    priority: int = Field(default=2, ge=0, le=3)
    habit_id: Optional[int] = None


class TaskUpdate(BaseModel):
    id: int
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    date: Optional[str] = None
    group: Optional[str] = Field(None, max_length=20)
    project: Optional[str] = Field(None, max_length=50)
    priority: Optional[int] = Field(None, ge=0, le=3)
    status: Optional[str] = None
    sort_order: Optional[int] = None
    habit_id: Optional[int] = None


class TaskListRequest(BaseModel):
    date: Optional[str] = None
    group: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    project: Optional[str] = None


class TaskIdRequest(BaseModel):
    id: int


class TaskCompleteRequest(BaseModel):
    id: int
    completed: bool = True


class TaskProgressRequest(BaseModel):
    id: int
    text: str


class TaskBlockRequest(BaseModel):
    id: int
    reason: str


class TaskCarryRequest(BaseModel):
    date: str


class TaskMoveRequest(BaseModel):
    id: int
    direction: int = Field(..., ge=-1, le=1)


class TaskStatsRequest(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    group: Optional[str] = None


class TaskReportRequest(BaseModel):
    date: Optional[str] = None


class TaskResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str]
    date: str
    created_at: datetime
    group: str
    project: Optional[str]
    priority: int
    status: str
    completed: bool
    completed_at: Optional[datetime]
    progress_log: List[Dict[str, Any]]
    blocked_reason: Optional[str]
    sort_order: int
    source: str
    habit_id: Optional[int]

    class Config:
        from_attributes = True
