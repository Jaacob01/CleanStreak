"""任务路由"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskListRequest, TaskIdRequest,
    TaskCompleteRequest, TaskProgressRequest, TaskBlockRequest,
    TaskCarryRequest, TaskMoveRequest, TaskStatsRequest, TaskReportRequest,
    TaskResponse,
)
from app.services import task_service

router = APIRouter(prefix="/api/v1/tasks", tags=["任务"])


@router.post("/list", response_model=List[TaskResponse])
async def list_tasks(
    body: TaskListRequest = TaskListRequest(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.list_tasks(db, user.id, body)


@router.post("/create", response_model=TaskResponse)
async def create_task(
    body: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.create_task(db, user.id, body)


@router.post("/update", response_model=TaskResponse)
async def update_task(
    body: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.update_task(db, user.id, body)


@router.post("/delete")
async def delete_task(
    body: TaskIdRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await task_service.delete_task(db, body.id, user.id)
    return {"ok": True}


@router.post("/complete", response_model=TaskResponse)
async def complete_task(
    body: TaskCompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.complete_task(db, body.id, user.id, body.completed)


@router.post("/progress", response_model=TaskResponse)
async def append_progress(
    body: TaskProgressRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.append_progress(db, body.id, user.id, body.text)


@router.post("/block", response_model=TaskResponse)
async def block_task(
    body: TaskBlockRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.block_task(db, body.id, user.id, body.reason)


@router.post("/carry")
async def carry_tasks(
    body: TaskCarryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.carry_tasks(db, user.id, body.date)


@router.post("/move")
async def move_task(
    body: TaskMoveRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await task_service.move_task(db, body.id, user.id, body.direction)
    return {"ok": True}


@router.post("/stats")
async def get_stats(
    body: TaskStatsRequest = TaskStatsRequest(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.get_stats(db, user.id, body)


@router.post("/report")
async def get_report(
    body: TaskReportRequest = TaskReportRequest(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    date = body.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return await task_service.get_report(db, user.id, date)
