"""打卡记录路由"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.entry import (
    EntrySave, EntryResponse, ToggleRequest, ToggleResponse,
    BumpRequest, BumpResponse, EntryByDateRequest, EntryByMonthRequest,
    EntryByHabitRequest, EntryDeleteRequest, EntryGetRequest,
)
from app.services import entry_service

router = APIRouter(prefix="/api/v1/entries", tags=["打卡记录"])


@router.post("/get", response_model=EntryResponse | None)
async def get_entry(
    body: EntryGetRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await entry_service.get_entry(db, user.id, body.habit_id, body.date)


@router.post("/by-date", response_model=List[EntryResponse])
async def entries_by_date(
    body: EntryByDateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await entry_service.get_entries_by_date(db, user.id, body.date)


@router.post("/by-month", response_model=List[EntryResponse])
async def entries_by_month(
    body: EntryByMonthRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await entry_service.get_entries_by_month(db, user.id, body.year, body.month, body.habit_id)


@router.post("/by-habit", response_model=List[EntryResponse])
async def entries_by_habit(
    body: EntryByHabitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await entry_service.get_entries_by_habit(db, user.id, body.habit_id)


@router.post("/all", response_model=List[EntryResponse])
async def all_entries(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await entry_service.get_all_entries(db, user.id)


@router.post("/toggle", response_model=ToggleResponse)
async def toggle(
    body: ToggleRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    toggled = await entry_service.toggle_entry(db, user.id, body.habit_id, body.date)
    return {"toggled": toggled}


@router.post("/bump", response_model=BumpResponse)
async def bump(
    body: BumpRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_value = await entry_service.bump_entry(db, user.id, body.habit_id, body.date, body.delta)
    return {"new_value": new_value}


@router.post("/save", response_model=EntryResponse)
async def save_entry(
    body: EntrySave,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await entry_service.save_entry(db, user.id, body)


@router.post("/delete")
async def delete_entry(
    body: EntryDeleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await entry_service.delete_entry(db, user.id, body.habit_id, body.date)
    return {"ok": True}
