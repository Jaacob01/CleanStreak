from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class EntryDetail(BaseModel):
    """单次打卡明细：每次打卡独立携带自己的时刻、数量、标签与备注"""
    value: float = Field(default=1, ge=0)
    time: Optional[str] = None  # 打卡时刻（ISO-8601 含时区）；缺省由服务端补当前时刻
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class EntrySave(BaseModel):
    habit_id: int
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    value: Optional[float] = Field(None, ge=0)
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    details: Optional[List[EntryDetail]] = None


class ToggleRequest(BaseModel):
    habit_id: int
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class BumpRequest(BaseModel):
    habit_id: int
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    delta: float = Field(default=1)


class EntryResponse(BaseModel):
    id: int
    user_id: int
    habit_id: int
    date: str
    value: float
    details: List[EntryDetail] = Field(default_factory=list)
    tags: List[str]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ToggleResponse(BaseModel):
    toggled: bool


class BumpResponse(BaseModel):
    new_value: float


class EntryByDateRequest(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class EntryByMonthRequest(BaseModel):
    year: int
    month: int = Field(..., ge=1, le=12)
    habit_id: Optional[int] = None


class EntryByHabitRequest(BaseModel):
    habit_id: int


class EntryDeleteRequest(BaseModel):
    habit_id: int
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class EntryGetRequest(BaseModel):
    habit_id: int
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
