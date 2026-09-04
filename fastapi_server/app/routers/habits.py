"""习惯路由"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.habit import HabitCreate, HabitUpdate, HabitResponse, MoveRequest, HabitListRequest
from app.services import habit_service

router = APIRouter(prefix="/api/v1/habits", tags=["习惯"])


@router.post("/list", response_model=List[HabitResponse])
async def list_habits(
    body: HabitListRequest = HabitListRequest(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await habit_service.get_habits(db, user.id, body.include_archived)


@router.post("/create", response_model=HabitResponse)
async def create_habit(
    body: HabitCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await habit_service.create_habit(db, user.id, body)


@router.post("/get", response_model=HabitResponse)
async def get_habit(
    body: HabitUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 用 body.id 获取
    return await habit_service.get_habit(db, body.id, user.id)


@router.post("/update", response_model=HabitResponse)
async def update_habit(
    body: HabitUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await habit_service.update_habit(db, body.id, user.id, body)


@router.post("/delete")
async def delete_habit(
    body: MoveRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await habit_service.delete_habit(db, body.habit_id, user.id)
    return {"ok": True}


@router.post("/move")
async def move_habit(
    body: MoveRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await habit_service.move_habit(db, body.habit_id, user.id, body.direction)
    return {"ok": True}
