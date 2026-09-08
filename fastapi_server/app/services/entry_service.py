"""打卡记录服务层"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from fastapi import HTTPException, status
from typing import List, Optional
from app.models.models import HabitEntry, Habit, utcnow
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


def _now_iso() -> str:
    return utcnow().isoformat()


def _normalize_details(raw: list) -> list:
    """规范化按次明细：剔除无效次（value<=0），统一字段结构（含打卡时刻）"""
    out = []
    for d in raw or []:
        try:
            value = float(d.get("value") or 0)
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue
        t = d.get("time")
        out.append({
            "value": value,
            "time": t if isinstance(t, str) and t else None,
            "tags": list(d.get("tags") or []),
            "notes": d.get("notes") or None,
        })
    return out


def _fill_missing_times(details: list, existing: list) -> None:
    """补齐缺失的打卡时刻：优先沿用原有同位置的旧值（旧客户端整单重存时不丢时刻），否则记当前时刻"""
    for i, d in enumerate(details):
        if not d.get("time"):
            old = existing[i] if i < len(existing) else None
            d["time"] = (old or {}).get("time") or _now_iso()


def _details_total(details: list) -> float:
    return float(sum(d.get("value") or 0 for d in details))


def _summary_from_details(details: list):
    """按次汇总：标签取并集（保持首次出现顺序），备注用「 / 」拼接"""
    tags = []
    for d in details:
        for t in d.get("tags") or []:
            if t not in tags:
                tags.append(t)
    note_parts = [d.get("notes") for d in details if d.get("notes")]
    return tags, (" / ".join(note_parts) if note_parts else None)


async def _upsert_entry(
    db: AsyncSession, user_id: int, habit_id: int, date: str,
    value: Optional[float] = None, tags: Optional[list] = None, notes: Optional[str] = None,
    details: Optional[list] = None,
) -> HabitEntry:
    """插入或更新打卡记录，支持 partial patch（前端 merge 语义）

    details 非空时按「每次打卡明细」保存：value 与顶层 tags/notes 由明细推导
    （value=各次之和、tags=并集、notes=拼接），保证单日累计与按次记录一致。
    """
    result = await db.execute(
        select(HabitEntry).where(
            HabitEntry.habit_id == habit_id,
            HabitEntry.date == date
        )
    )
    entry = result.scalar_one_or_none()

    if details is not None:
        norm = _normalize_details(details)
        if not norm:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="至少保留一次有效打卡")
        _fill_missing_times(norm, list((entry.details if entry else None) or []))
        sum_tags, sum_notes = _summary_from_details(norm)
        total = round(_details_total(norm), 6)
        if entry:
            entry.details = norm
            entry.value = total
            entry.tags = sum_tags
            entry.notes = sum_notes
        else:
            entry = HabitEntry(
                user_id=user_id,
                habit_id=habit_id,
                date=date,
                value=total,
                details=norm,
                tags=sum_tags,
                notes=sum_notes,
            )
            db.add(entry)
    elif entry:
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
            details=[{
                "value": value if value is not None else 1,
                "time": _now_iso(),
                "tags": tags if tags is not None else [],
                "notes": notes,
            }],
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
        db, user_id, data.habit_id, data.date, data.value, data.tags, data.notes,
        details=[d.model_dump() for d in data.details] if data.details is not None else None,
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
            user_id=user_id, habit_id=habit_id, date=date, value=1,
            details=[{"value": 1, "time": _now_iso(), "tags": [], "notes": None}],
            tags=[], notes=None
        )
        db.add(entry)
        await db.flush()
        await invalidate_user_cache(user_id)
        return True  # 已打卡


async def bump_entry(db: AsyncSession, user_id: int, habit_id: int, date: str, delta: float) -> float:
    """增减计数。正向 delta 追加一次新明细；负向从最近一次开始扣减。习惯不存在返回 0"""
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
        details = list(entry.details or [])
        if not details:
            # 旧数据：当天只有天级汇总，先折算成单次明细再增减
            details = [{
                "value": entry.value,
                "time": entry.created_at.isoformat() if entry.created_at else _now_iso(),
                "tags": entry.tags or [],
                "notes": entry.notes,
            }]
        if delta >= 0:
            details.append({"value": delta, "time": _now_iso(), "tags": [], "notes": None})
        else:
            remain = -delta
            while remain > 0 and details:
                last = details[-1]
                take = min(remain, last["value"])
                last["value"] = round(last["value"] - take, 6)
                remain -= take
                if last["value"] <= 0:
                    details.pop()
        total = round(_details_total(details), 6)
        if total <= 0:
            await db.delete(entry)
            await db.flush()
            await invalidate_user_cache(user_id)
            return 0.0
        entry.details = details
        entry.value = total
        entry.tags, entry.notes = _summary_from_details(details)
        new_value = total
    else:
        new_value = max(0, delta)
        if new_value <= 0:
            return 0.0
        entry = HabitEntry(
            user_id=user_id, habit_id=habit_id, date=date,
            value=new_value,
            details=[{"value": new_value, "time": _now_iso(), "tags": [], "notes": None}],
            tags=[], notes=None
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
