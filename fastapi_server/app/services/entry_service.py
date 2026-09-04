"""打卡记录服务层"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from fastapi import HTTPException, status
from typing import List, Optional
from app.models.models import HabitEntry, Habit
from app.schemas.entry import EntrySave
from app.redis import invalidate_user_cache


async def get_entry(db: AsyncSession, user_id: int, habit_id: int, date: str) -> Optional[HabitEntry]:
    """查询单条记录，不存在返回 None"""
    result = await db.execute(
        select(HabitEntry).where(
            HabitEntry.user_id == user_id,
            HabitEntry.habit_id == habit_id,
            HabitEntry.date == date,
        )
    )
    return result.scalar_one_or_none()


async def get_entries_by_date(db: AsyncSession, user_id: int, date: str) -> List[HabitEntry]:
    result = await db.execute(
        select(HabitEntry).where(HabitEntry.user_id == user_id, HabitEntry.date == date)
    )
    return list(result.scalars().all())


async def get_entries_by_month(db: AsyncSession, user_id: int, year: int, month: int, habit_id: Optional[int] = None) -> List[HabitEntry]:
    prefix = f"{year:04d}-{month:02d}"
    stmt = select(HabitEntry).where(
        HabitEntry.user_id == user_id,
        HabitEntry.date.like(f"{prefix}%")
    )
    if habit_id is not None:
        stmt = stmt.where(HabitEntry.habit_id == habit_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_entries_by_habit(db: AsyncSession, user_id: int, habit_id: int) -> List[HabitEntry]:
    result = await db.execute(
        select(HabitEntry).where(
            HabitEntry.user_id == user_id,
            HabitEntry.habit_id == habit_id
        ).order_by(HabitEntry.date)
    )
    return list(result.scalars().all())


async def get_all_entries(db: AsyncSession, user_id: int) -> List[HabitEntry]:
    result = await db.execute(
        select(HabitEntry).where(HabitEntry.user_id == user_id).order_by(HabitEntry.date)
    )
    return list(result.scalars().all())


async def _upsert_entry(
    db: AsyncSession, user_id: int, habit_id: int, date: str,
    value: Optional[float] = None, tags: Optional[list] = None, notes: Optional[str] = None,
) -> HabitEntry:
    """插入或更新打卡记录，支持 partial patch（前端 merge 语义）"""
    result = await db.execute(
        select(HabitEntry).where(
            HabitEntry.habit_id == habit_id,
            HabitEntry.date == date
        )
    )
    entry = result.scalar_one_or_none()

    if entry:
        # merge 语义：只覆盖显式传入的字段
        if value is not None:
            entry.value = value
        if tags is not None:
            entry.tags = tags
        if notes is not None:
            entry.notes = notes
    else:
        entry = HabitEntry(
            user_id=user_id,
            habit_id=habit_id,
            date=date,
            value=value if value is not None else 1,
            tags=tags if tags is not None else [],
            notes=notes,
        )
        db.add(entry)

    await db.flush()
    await invalidate_user_cache(user_id)
    return entry


async def save_entry(db: AsyncSession, user_id: int, data: EntrySave) -> HabitEntry:
    # 验证习惯存在且属于当前用户
    habit_result = await db.execute(
        select(Habit).where(Habit.id == data.habit_id, Habit.user_id == user_id)
    )
    if not habit_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="习惯不存在")

    return await _upsert_entry(
        db, user_id, data.habit_id, data.date, data.value, data.tags, data.notes
    )


async def toggle_entry(db: AsyncSession, user_id: int, habit_id: int, date: str) -> bool:
    """切换打卡状态：有记录则删除，无记录则创建。习惯不存在返回 False"""
    habit_result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == user_id)
    )
    if not habit_result.scalar_one_or_none():
        return False

    result = await db.execute(
        select(HabitEntry).where(
            HabitEntry.habit_id == habit_id,
            HabitEntry.date == date
        )
    )
    entry = result.scalar_one_or_none()

    if entry:
        await db.delete(entry)
        await db.flush()
        await invalidate_user_cache(user_id)
        return False  # 已取消
    else:
        entry = HabitEntry(
            user_id=user_id, habit_id=habit_id, date=date, value=1, tags=[], notes=None
        )
        db.add(entry)
        await db.flush()
        await invalidate_user_cache(user_id)
        return True  # 已打卡


async def bump_entry(db: AsyncSession, user_id: int, habit_id: int, date: str, delta: float) -> float:
    """增减计数。习惯不存在返回 0"""
    habit_result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == user_id)
    )
    if not habit_result.scalar_one_or_none():
        return 0.0

    result = await db.execute(
        select(HabitEntry).where(
            HabitEntry.habit_id == habit_id,
            HabitEntry.date == date
        )
    )
    entry = result.scalar_one_or_none()

    if entry:
        new_value = max(0, entry.value + delta)
        if new_value <= 0:
            await db.delete(entry)
            await db.flush()
            await invalidate_user_cache(user_id)
            return 0.0
        entry.value = new_value
    else:
        new_value = max(0, delta)
        if new_value <= 0:
            return 0.0
        entry = HabitEntry(
            user_id=user_id, habit_id=habit_id, date=date,
            value=new_value, tags=[], notes=None
        )
        db.add(entry)

    await db.flush()
    await invalidate_user_cache(user_id)
    return new_value


async def delete_entry(db: AsyncSession, user_id: int, habit_id: int, date: str):
    """删除记录，不存在时静默返回"""
    result = await db.execute(
        select(HabitEntry).where(
            HabitEntry.user_id == user_id,
            HabitEntry.habit_id == habit_id,
            HabitEntry.date == date
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return
    await db.delete(entry)
    await db.flush()
    await invalidate_user_cache(user_id)
