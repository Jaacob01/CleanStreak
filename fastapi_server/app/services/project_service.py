"""项目服务层

项目是任务的可选归属；Task.project 以名字字符串存储，
因此重命名会同步刷新该用户名下引用旧名字的任务，
删除项目则把相关任务的 project 置空（变为「无项目」）。
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from fastapi import HTTPException, status
from typing import List

from app.models.models import Project, Task
from app.schemas.project import ProjectCreate, ProjectRename


async def get_project(db: AsyncSession, project_id: int, user_id: int) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    return project


async def _check_duplicate(db: AsyncSession, user_id: int, name: str, exclude_id: int = 0):
    stmt = select(Project).where(
        Project.user_id == user_id,
        Project.name == name,
        Project.id != exclude_id,
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="项目已存在")


async def list_projects(db: AsyncSession, user_id: int) -> List[Project]:
    result = await db.execute(
        select(Project)
        .where(Project.user_id == user_id)
        .order_by(Project.sort_order, Project.id)
    )
    return list(result.scalars().all())


async def create_project(db: AsyncSession, user_id: int, data: ProjectCreate) -> Project:
    name = data.name.strip()
    await _check_duplicate(db, user_id, name)

    max_result = await db.execute(
        select(func.coalesce(func.max(Project.sort_order), -1)).where(Project.user_id == user_id)
    )
    project = Project(
        user_id=user_id,
        name=name,
        sort_order=max_result.scalar() + 1,
    )
    db.add(project)
    await db.flush()
    return project


async def rename_project(db: AsyncSession, user_id: int, data: ProjectRename) -> Project:
    project = await get_project(db, data.id, user_id)
    name = data.name.strip()
    await _check_duplicate(db, user_id, name, exclude_id=project.id)

    old = project.name
    project.name = name
    if old != name:
        # 同步刷新引用旧名字的任务
        await db.execute(
            update(Task)
            .where(Task.user_id == user_id, Task.project == old)
            .values(project=name)
        )
    await db.flush()
    return project


async def delete_project(db: AsyncSession, project_id: int, user_id: int) -> None:
    project = await get_project(db, project_id, user_id)
    # 项目下的任务变为「无项目」
    await db.execute(
        update(Task)
        .where(Task.user_id == user_id, Task.project == project.name)
        .values(project=None)
    )
    await db.delete(project)
    await db.flush()
