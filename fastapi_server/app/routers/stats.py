from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.stats import HabitStatsResponse, RecentStatesResponse, TodaySummaryResponse, RecentRequest
from app.services import stats_service

router = APIRouter(prefix="/api/v1/stats", tags=["统计"])


@router.post("/habit", response_model=HabitStatsResponse)
async def habit_stats(
    body: RecentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await stats_service.get_habit_stats(db, user.id, body.habit_id)


@router.post("/recent", response_model=RecentStatesResponse)
async def recent_states(
    body: RecentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    day_list = await stats_service.get_recent(db, user.id, body.habit_id, body.days)
    return {"habit_id": body.habit_id, "days": day_list}


@router.post("/today-summary", response_model=TodaySummaryResponse)
async def today_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await stats_service.get_today_summary(db, user.id)
