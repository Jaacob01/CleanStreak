"""习惯服务层"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from fastapi import HTTPException, status
from typing import List, Optional
from app.models.models import Habit, HabitEntry, User
from app.schemas.habit import HabitCreate, HabitUpdate
from app.redis import invalidate_user_cache


async def get_habits(db: AsyncSession, user_id: int, include_archived: bool = False) -> List[Habit]:
    stmt = select(Habit).where(Habit.user_id == user_id)
    if not include_archived:
        stmt = stmt.where(Habit.archived == False)
    stmt = stmt.order_by(Habit.sort_order)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_habit(db: AsyncSession, habit_id: int, user_id: int) -> Habit:
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == user_id)
    )
    habit = result.scalar_one_or_none()
    if not habit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="习惯不存在")
    return habit


async def create_habit(db: AsyncSession, user_id: int, data: HabitCreate) -> Habit:
    # 获取最大 sort_order
    result = await db.execute(
        select(func.coalesce(func.max(Habit.sort_order), -1)).where(Habit.user_id == user_id)
    )
    max_order = result.scalar()
    sort_order = data.sort_order if data.sort_order is not None else max_order + 1

    habit = Habit(
        user_id=user_id,
        name=data.name,
        emoji=data.emoji,
        color=data.color,
        direction=data.direction,
        goal_type=data.goal_type,
        target_value=data.target_value,
        unit=data.unit,
        weekdays=data.weekdays,
        enable_notes=data.enable_notes,
        enable_tags=data.enable_tags,
        tags=data.tags,
        archived=data.archived,
        sort_order=sort_order,
    )
    db.add(habit)
    await db.flush()
    await invalidate_user_cache(user_id)
    return habit


async def update_habit(db: AsyncSession, habit_id: int, user_id: int, data: HabitUpdate) -> Habit:
    habit = await get_habit(db, habit_id, user_id)
    update_data = data.model_dump(exclude_unset=True, exclude={"id"})
    for key, value in update_data.items():
        setattr(habit, key, value)
    await db.flush()
    await invalidate_user_cache(user_id)
    return habit


async def delete_habit(db: AsyncSession, habit_id: int, user_id: int):
    habit = await get_habit(db, habit_id, user_id)
    await db.delete(habit)
    await db.flush()
    await invalidate_user_cache(user_id)


async def move_habit(db: AsyncSession, habit_id: int, user_id: int, direction: int):
    """移动习惯排序：direction -1=前移, 1=后移"""
    habit = await get_habit(db, habit_id, user_id)

    if direction == -1:
        # 找前一个
        result = await db.execute(
            select(Habit)
            .where(Habit.user_id == user_id, Habit.sort_order < habit.sort_order)
            .order_by(Habit.sort_order.desc())
            .limit(1)
        )
    else:
        # 找后一个
        result = await db.execute(
            select(Habit)
            .where(Habit.user_id == user_id, Habit.sort_order > habit.sort_order)
            .order_by(Habit.sort_order.asc())
            .limit(1)
        )

    other = result.scalar_one_or_none()
    if not other:
        return  # 已在边界，无需移动

    habit.sort_order, other.sort_order = other.sort_order, habit.sort_order
    await db.flush()
    await invalidate_user_cache(user_id)
