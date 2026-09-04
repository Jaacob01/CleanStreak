from pydantic import BaseModel, Field
from typing import List, Optional


class HabitStatsResponse(BaseModel):
    current_streak: int
    longest_streak: int
    total_success: int
    total_fail: int
    total_entries: int
    success_rate: int
    weekday: List[int]


class DayStateItem(BaseModel):
    date: str
    state: str
    value: Optional[float]


class RecentStatesResponse(BaseModel):
    habit_id: int
    days: List[DayStateItem]


class TodayHabitSummary(BaseModel):
    habit_id: int
    name: str
    emoji: str
    state: str
    current_streak: int


class TodaySummaryResponse(BaseModel):
    date: str
    scheduled: int
    success: int
    fail: int
    partial: int
    pending: int
    neutral: int
    habits: List[TodayHabitSummary]


class RecentRequest(BaseModel):
    habit_id: int
    days: int = Field(default=7, ge=1, le=365)
