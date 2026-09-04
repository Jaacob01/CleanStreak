"""统计服务层，含 Redis 缓存"""
import json
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from app.models.models import Habit, HabitEntry
from app.services.habit_service import get_habit, get_habits
from app.services.entry_service import get_entries_by_habit
from app.utils.logic import (
    HabitLike, compute_stats, recent_day_states, day_state, parse_date
)
from app.redis import get_redis

TTL = 60  # 缓存秒数
TZ_CN = timezone(timedelta(hours=8))


def _today_str() -> str:
    return datetime.now(TZ_CN).strftime("%Y-%m-%d")


async def _entries_map(db: AsyncSession, user_id: int, habit_id: int) -> dict[str, float]:
    entries = await get_entries_by_habit(db, user_id, habit_id)
    return {e.date: e.value for e in entries}


async def get_habit_stats(db: AsyncSession, user_id: int, habit_id: int) -> dict:
    redis = await get_redis()
    cache_key = f"stats:{user_id}:{habit_id}"

    if redis:
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

    habit = await get_habit(db, habit_id, user_id)
    entries_map = await _entries_map(db, user_id, habit_id)
    today_str = _today_str()
    hl = HabitLike.from_obj(habit)
    stats = compute_stats(hl, entries_map, today_str)

    result = {
        "current_streak": stats.current_streak,
        "longest_streak": stats.longest_streak,
        "total_success": stats.total_success,
        "total_fail": stats.total_fail,
        "total_entries": stats.total_entries,
        "success_rate": int(stats.success_rate),
        "weekday": stats.weekday,
    }

    if redis:
        await redis.setex(cache_key, TTL, json.dumps(result))

    return result


async def get_recent(db: AsyncSession, user_id: int, habit_id: int, days: int) -> list:
    habit = await get_habit(db, habit_id, user_id)
    entries_map = await _entries_map(db, user_id, habit_id)
    today_str = _today_str()
    hl = HabitLike.from_obj(habit)
    return recent_day_states(hl, entries_map, days, today_str)


async def get_today_summary(db: AsyncSession, user_id: int) -> dict:
    today_str = _today_str()
    habits = await get_habits(db, user_id, include_archived=False)

    # 批量加载所有记录，避免 N+1 查询
    result = await db.execute(
        select(HabitEntry).where(HabitEntry.user_id == user_id)
    )
    all_entries = result.scalars().all()
    # 按 habit_id 分组
    entries_by_habit: dict[int, dict[str, float]] = {}
    for e in all_entries:
        if e.habit_id not in entries_by_habit:
            entries_by_habit[e.habit_id] = {}
        entries_by_habit[e.habit_id][e.date] = e.value

    scheduled = success = fail = partial = pending = neutral = 0
    habit_summaries = []

    for h in habits:
        emap = entries_by_habit.get(h.id, {})
        hl = HabitLike.from_obj(h)
        st = day_state(hl, emap.get(today_str), today_str, today_str)

        if st != "neutral":
            scheduled += 1
        if st == "success":
            success += 1
        elif st == "fail":
            fail += 1
        elif st == "partial":
            partial += 1
        elif st == "pending":
            pending += 1
        elif st == "neutral":
            neutral += 1

        stats = compute_stats(hl, emap, today_str)

        habit_summaries.append({
            "habit_id": h.id,
            "name": h.name,
            "emoji": h.emoji,
            "state": st,
            "current_streak": stats.current_streak,
        })

    return {
        "date": today_str,
        "scheduled": scheduled,
        "success": success,
        "fail": fail,
        "partial": partial,
        "pending": pending,
        "neutral": neutral,
        "habits": habit_summaries,
    }
