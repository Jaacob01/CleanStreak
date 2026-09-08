"""任务服务层"""
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete, and_
from fastapi import HTTPException, status
from typing import List, Optional, Dict, Any
from app.models.models import Task, TaskGroup
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskListRequest, TaskStatsRequest,
)

GROUP_PALETTE = ["#4D7CFE", "#FFD02E", "#00C16A", "#FF4D4D", "#A8A093"]


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now_hhmm() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M")


async def get_task(db: AsyncSession, task_id: int, user_id: int) -> Task:
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    return task


async def ensure_user_task_groups(db: AsyncSession, user_id: int) -> None:
    """分组自愈：任务里出现但 task_groups 未登记的分组名自动补登。

    老数据（分组功能上线前默认 group='Work'）或异常路径会产生未登记分组，
    导致待办页按已登记分组聚合时这些任务被静默丢弃；读路径顺手补登保证自包含。
    """
    rows = await db.execute(
        select(Task.group).where(Task.user_id == user_id).distinct()
    )
    for (name,) in rows.all():
        await _ensure_group(db, user_id, name)


async def list_tasks(db: AsyncSession, user_id: int, filters: TaskListRequest) -> List[Task]:
    await ensure_user_task_groups(db, user_id)
    stmt = select(Task).where(Task.user_id == user_id)
    if filters.date:
        stmt = stmt.where(Task.date == filters.date)
    if filters.group:
        stmt = stmt.where(Task.group == filters.group)
    if filters.status:
        stmt = stmt.where(Task.status == filters.status)
    if filters.priority is not None:
        stmt = stmt.where(Task.priority == filters.priority)
    if filters.project:
        stmt = stmt.where(Task.project == filters.project)
    stmt = stmt.order_by(Task.completed, Task.priority, Task.sort_order, Task.id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _ensure_group(db: AsyncSession, user_id: int, name: str) -> None:
    """任务引用了用户还不存在的分组时自动登记，保证分组按用户自包含"""
    if not name:
        return
    exists = await db.execute(
        select(TaskGroup).where(TaskGroup.user_id == user_id, TaskGroup.name == name)
    )
    if exists.scalar_one_or_none():
        return
    count_result = await db.execute(
        select(func.count()).select_from(TaskGroup).where(TaskGroup.user_id == user_id)
    )
    count = count_result.scalar() or 0
    db.add(TaskGroup(user_id=user_id, name=name, color=GROUP_PALETTE[count % len(GROUP_PALETTE)]))
    await db.flush()


async def create_task(db: AsyncSession, user_id: int, data: TaskCreate) -> Task:
    await _ensure_group(db, user_id, data.group)
    max_result = await db.execute(
        select(func.coalesce(func.max(Task.sort_order), -1)).where(Task.user_id == user_id)
    )
    max_order = max_result.scalar()

    task = Task(
        user_id=user_id,
        title=data.title,
        description=data.description,
        date=data.date or _today_str(),
        group=data.group,
        project=data.project,
        priority=data.priority,
        status="pending",
        completed=False,
        progress_log=[],
        sort_order=max_order + 1,
        source="manual",
        habit_id=data.habit_id,
    )
    db.add(task)
    await db.flush()
    return task


async def update_task(db: AsyncSession, user_id: int, data: TaskUpdate) -> Task:
    task = await get_task(db, data.id, user_id)
    update_data = data.model_dump(exclude_unset=True, exclude={"id"})
    if "group" in update_data:
        await _ensure_group(db, user_id, update_data["group"])
    for key, value in update_data.items():
        setattr(task, key, value)
    await db.flush()
    return task


async def delete_task(db: AsyncSession, task_id: int, user_id: int):
    task = await get_task(db, task_id, user_id)
    await db.delete(task)
    await db.flush()


async def complete_task(db: AsyncSession, task_id: int, user_id: int, completed: bool) -> Task:
    task = await get_task(db, task_id, user_id)
    if task.completed == completed:
        return task
    task.completed = completed
    task.completed_at = datetime.now(timezone.utc) if completed else None
    task.status = "done" if completed else "pending"
    log = list(task.progress_log or [])
    if completed:
        log.append({"time": _now_hhmm(), "text": "✅ 已完成"})
    else:
        # 撤销完成时移除最近一条完成记录，保证完成/取消成对，不重复累积
        for i in range(len(log) - 1, -1, -1):
            if log[i].get("text") == "✅ 已完成":
                log.pop(i)
                break
    task.progress_log = log
    await db.flush()
    return task


async def append_progress(db: AsyncSession, task_id: int, user_id: int, text: str) -> Task:
    task = await get_task(db, task_id, user_id)
    log = list(task.progress_log or [])
    log.append({"time": _now_hhmm(), "text": text})
    task.progress_log = log
    await db.flush()
    return task


async def block_task(db: AsyncSession, task_id: int, user_id: int, reason: str) -> Task:
    task = await get_task(db, task_id, user_id)
    task.blocked_reason = reason
    task.status = "shelved"
    log = list(task.progress_log or [])
    log.append({"time": _now_hhmm(), "text": f"🚫 阻塞: {reason}"})
    task.progress_log = log
    await db.flush()
    return task


async def carry_tasks(db: AsyncSession, user_id: int, date: str) -> dict:
    """carry-over：把过去日期的未完成任务批量刷为传入日期（未来预约的任务不动）"""
    await ensure_user_task_groups(db, user_id)
    stmt = select(Task).where(
        Task.user_id == user_id,
        Task.status != "done",
        Task.date < date,
    )
    result = await db.execute(stmt)
    tasks = list(result.scalars().all())

    for t in tasks:
        t.date = date
        t.source = "carry"

    await db.flush()

    # 统计
    pending_stmt = select(Task).where(
        Task.user_id == user_id, Task.date == date, Task.status != "done"
    )
    pending_result = await db.execute(pending_stmt)
    pending_tasks = list(pending_result.scalars().all())

    by_group: Dict[str, int] = {}
    by_priority: Dict[str, int] = {}
    p_labels = {0: "P0", 1: "P1", 2: "P2", 3: "P3"}
    for t in pending_tasks:
        by_group[t.group] = by_group.get(t.group, 0) + 1
        lbl = p_labels.get(t.priority, "P2")
        by_priority[lbl] = by_priority.get(lbl, 0) + 1

    return {
        "carried": len(tasks),
        "tasks": [TaskResponse.model_validate(t) for t in tasks],
        "summary": {
            "total_pending": len(pending_tasks),
            "by_group": by_group,
            "by_priority": by_priority,
        },
    }


async def move_task(db: AsyncSession, task_id: int, user_id: int, direction: int):
    task = await get_task(db, task_id, user_id)
    if direction == -1:
        result = await db.execute(
            select(Task)
            .where(Task.user_id == user_id, Task.sort_order < task.sort_order)
            .order_by(Task.sort_order.desc())
            .limit(1)
        )
    else:
        result = await db.execute(
            select(Task)
            .where(Task.user_id == user_id, Task.sort_order > task.sort_order)
            .order_by(Task.sort_order.asc())
            .limit(1)
        )
    other = result.scalar_one_or_none()
    if not other:
        return
    task.sort_order, other.sort_order = other.sort_order, task.sort_order
    await db.flush()


async def get_stats(db: AsyncSession, user_id: int, filters: TaskStatsRequest) -> dict:
    stmt = select(Task).where(Task.user_id == user_id)
    if filters.date_from:
        stmt = stmt.where(Task.date >= filters.date_from)
    if filters.date_to:
        stmt = stmt.where(Task.date <= filters.date_to)
    if filters.group:
        stmt = stmt.where(Task.group == filters.group)
    result = await db.execute(stmt)
    tasks = list(result.scalars().all())

    total = len(tasks)
    done = sum(1 for t in tasks if t.completed)
    pending = sum(1 for t in tasks if t.status == "pending")
    blocked = sum(1 for t in tasks if t.status == "shelved")
    rate = round(done / total * 100) if total > 0 else 0

    by_group: Dict[str, Dict[str, int]] = {}
    by_priority: Dict[str, int] = {}
    p_labels = {0: "P0", 1: "P1", 2: "P2", 3: "P3"}

    for t in tasks:
        g = by_group.setdefault(t.group, {"total": 0, "done": 0, "pending": 0})
        g["total"] += 1
        if t.completed:
            g["done"] += 1
        elif t.status == "pending":
            g["pending"] += 1
        lbl = p_labels.get(t.priority, "P2")
        by_priority[lbl] = by_priority.get(lbl, 0) + 1

    max_age = 0
    now = datetime.now(timezone.utc)
    for t in tasks:
        if t.created_at:
            age = (now - t.created_at).days
            if age > max_age:
                max_age = age

    return {
        "total": total,
        "completed": done,
        "pending": pending,
        "blocked": blocked,
        "completion_rate": rate,
        "max_age_days": max_age,
        "by_group": by_group,
        "by_priority": by_priority,
    }


async def get_report(db: AsyncSession, user_id: int, date: str) -> dict:
    all_stmt = select(Task).where(Task.user_id == user_id, Task.date == date)
    result = await db.execute(all_stmt)
    tasks = list(result.scalars().all())

    completed = [t for t in tasks if t.completed]
    pending = [t for t in tasks if t.status == "pending"]
    blocked = [t for t in tasks if t.status == "shelved"]

    groups = set(t.group for t in tasks)
    by_group: Dict[str, Dict[str, int]] = {}
    for g in groups:
        gt = [t for t in tasks if t.group == g]
        by_group[g] = {
            "pending": sum(1 for t in gt if t.status == "pending"),
            "completed": sum(1 for t in gt if t.completed),
            "blocked": sum(1 for t in gt if t.status == "shelved"),
        }

    return {
        "date": date,
        "completed_today": [TaskResponse.model_validate(t) for t in completed],
        "pending": [TaskResponse.model_validate(t) for t in pending],
        "blocked": [TaskResponse.model_validate(t) for t in blocked],
        "by_group": by_group,
    }


# 延迟导入避免循环
from app.schemas.task import TaskResponse
