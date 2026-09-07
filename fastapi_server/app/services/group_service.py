"""任务分组服务层

分组按用户隔离；Task.group 存分组名字符串。
重命名同步刷新该用户引用旧名字的任务；
删除时把组内任务移动到剩余的第一个分组（最后一个分组不可删）。
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from fastapi import HTTPException, status
from typing import List

from app.models.models import TaskGroup, Task
from app.schemas.group import GroupCreate, GroupRename
from app.services.task_service import GROUP_PALETTE


async def get_group(db: AsyncSession, group_id: int, user_id: int) -> TaskGroup:
    result = await db.execute(
        select(TaskGroup).where(TaskGroup.id == group_id, TaskGroup.user_id == user_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分组不存在")
    return group


async def _check_duplicate(db: AsyncSession, user_id: int, name: str, exclude_id: int = 0):
    result = await db.execute(
        select(TaskGroup).where(
            TaskGroup.user_id == user_id,
            TaskGroup.name == name,
            TaskGroup.id != exclude_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="分组已存在")


async def list_groups(db: AsyncSession, user_id: int) -> List[TaskGroup]:
    result = await db.execute(
        select(TaskGroup)
        .where(TaskGroup.user_id == user_id)
        .order_by(TaskGroup.sort_order, TaskGroup.id)
    )
    return list(result.scalars().all())


async def create_group(db: AsyncSession, user_id: int, data: GroupCreate) -> TaskGroup:
    name = data.name.strip()
    await _check_duplicate(db, user_id, name)

    count_result = await db.execute(
        select(func.count()).select_from(TaskGroup).where(TaskGroup.user_id == user_id)
    )
    count = count_result.scalar() or 0
    group = TaskGroup(
        user_id=user_id,
        name=name,
        color=data.color or GROUP_PALETTE[count % len(GROUP_PALETTE)],
        sort_order=count,
    )
    db.add(group)
    await db.flush()
    return group


async def rename_group(db: AsyncSession, user_id: int, data: GroupRename) -> TaskGroup:
    group = await get_group(db, data.id, user_id)
    name = data.name.strip()
    await _check_duplicate(db, user_id, name, exclude_id=group.id)

    old = group.name
    group.name = name
    if old != name:
        await db.execute(
            update(Task)
            .where(Task.user_id == user_id, Task.group == old)
            .values(group=name)
        )
    await db.flush()
    return group


async def delete_group(db: AsyncSession, group_id: int, user_id: int) -> None:
    group = await get_group(db, group_id, user_id)
    result = await db.execute(
        select(TaskGroup)
        .where(TaskGroup.user_id == user_id, TaskGroup.id != group.id)
        .order_by(TaskGroup.sort_order, TaskGroup.id)
        .limit(1)
    )
    fallback = result.scalar_one_or_none()
    if not fallback:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="最后一个分组不能删除"
        )
    # 组内任务移动到剩余的第一个分组
    await db.execute(
        update(Task)
        .where(Task.user_id == user_id, Task.group == group.name)
        .values(group=fallback.name)
    )
    await db.delete(group)
    await db.flush()
