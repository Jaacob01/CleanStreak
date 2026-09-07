"""项目路由"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.project import (
    ProjectCreate, ProjectRename, ProjectIdRequest, ProjectResponse,
)
from app.services import project_service

router = APIRouter(prefix="/api/v1/projects", tags=["项目"])


@router.post("/list", response_model=List[ProjectResponse])
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.list_projects(db, user.id)


@router.post("/create", response_model=ProjectResponse)
async def create_project(
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.create_project(db, user.id, body)


@router.post("/rename", response_model=ProjectResponse)
async def rename_project(
    body: ProjectRename,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.rename_project(db, user.id, body)


@router.post("/delete")
async def delete_project(
    body: ProjectIdRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await project_service.delete_project(db, body.id, user.id)
    return {"ok": True}
