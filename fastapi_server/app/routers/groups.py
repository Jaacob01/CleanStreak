"""任务分组路由"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.group import (
    GroupCreate, GroupRename, GroupIdRequest, GroupResponse,
)
from app.services import group_service

router = APIRouter(prefix="/api/v1/groups", tags=["分组"])


@router.post("/list", response_model=List[GroupResponse])
async def list_groups(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await group_service.list_groups(db, user.id)


@router.post("/create", response_model=GroupResponse)
async def create_group(
    body: GroupCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await group_service.create_group(db, user.id, body)


@router.post("/rename", response_model=GroupResponse)
async def rename_group(
    body: GroupRename,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await group_service.rename_group(db, user.id, body)


@router.post("/delete")
async def delete_group(
    body: GroupIdRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await group_service.delete_group(db, body.id, user.id)
    return {"ok": True}
