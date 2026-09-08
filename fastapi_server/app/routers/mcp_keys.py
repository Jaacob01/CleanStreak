"""MCP 密钥路由：用户自助管理外部 AI 客户端接入 /mcp 的长期密钥（登录用户）"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.mcp import (
    McpKeyCreateRequest, McpKeyIdRequest, McpKeyListResponse, McpKeyResponse,
)
from app.services import mcp_key_service

router = APIRouter(prefix="/api/v1/mcp-keys", tags=["MCP 密钥"])


@router.post("/list", response_model=McpKeyListResponse)
async def list_keys(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"keys": [McpKeyResponse(**k) for k in await mcp_key_service.list_keys(db, user.id)]}


@router.post("/create", response_model=McpKeyResponse)
async def create_key(
    body: McpKeyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = await mcp_key_service.create_key(db, user.id, body.label)
    return McpKeyResponse(**key)


@router.post("/delete")
async def delete_key(
    body: McpKeyIdRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await mcp_key_service.delete_key(db, user.id, body.id)
    return {"ok": True}
