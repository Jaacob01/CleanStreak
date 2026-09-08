from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.deps import get_current_user
from app.models.models import User, Habit, HabitEntry

router = APIRouter(prefix="/api/v1/export", tags=["导出"])


@router.post("/")
async def export_all(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    habits_result = await db.execute(
        select(Habit).where(Habit.user_id == user.id).order_by(Habit.sort_order)
    )
    habits = habits_result.scalars().all()

    entries_result = await db.execute(
        select(HabitEntry).where(HabitEntry.user_id == user.id).order_by(HabitEntry.date)
    )
    entries = entries_result.scalars().all()

    return {
        "user": {"id": user.id, "username": user.username, "created_at": str(user.created_at)},
        "habits": [
            {
                "id": h.id, "name": h.name, "emoji": h.emoji, "color": h.color,
                "direction": h.direction, "goal_type": h.goal_type,
                "target_value": h.target_value, "unit": h.unit,
                "weekdays": h.weekdays, "enable_notes": h.enable_notes,
                "enable_tags": h.enable_tags, "tags": h.tags,
                "archived": h.archived, "sort_order": h.sort_order,
                "created_at": str(h.created_at),
            }
            for h in habits
        ],
        "entries": [
            {
                "id": e.id, "habit_id": e.habit_id, "date": e.date,
                "value": e.value, "tags": e.tags, "notes": e.notes,
                "details": e.details or [], "created_at": str(e.created_at),
            }
            for e in entries
        ],
    }
