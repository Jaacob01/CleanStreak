"""MCP (Model Context Protocol) 端点：把 ai_tools 工具注册表暴露给外部 AI 客户端（hermes 等）

实现为无状态 Streamable HTTP：客户端 POST JSON-RPC 2.0，服务端以 application/json 应答
（协议允许，无需维护 SSE 会话）。支持 initialize / ping / tools/list / tools/call。

鉴权（Authorization: Bearer <token>）按序尝试：
    1. 登录接口签发的 JWT（7 天过期，适合临时使用）
    2. 用户级密钥：「我的 → MCP 密钥」自助生成，存 mcp_api_keys 表（推荐，长期有效）
    3. 服务端 MCP_API_KEYS 静态密钥（"密钥:用户名"，管理员兜底配置）

所有工具调用与 App 内聊天共用 ai_tools.execute_tool：用户级数据隔离、危险操作 confirm
二次确认、ai_tool_calls 审计落库（source="mcp"）。
"""
import json

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.models import User
from app.services import ai_tools, mcp_key_service
from app.utils.security import decode_access_token

router = APIRouter(tags=["MCP"])

# 支持的协议版本（日期制）；客户端带其他版本时回退到最新支持版
SUPPORTED_VERSIONS = {"2025-06-18", "2025-03-26", "2024-11-05"}
LATEST_VERSION = "2025-06-18"

SERVER_INFO = {"name": "cleanstreak", "version": "1.0.0"}
SERVER_INSTRUCTIONS = (
    "CleanStreak 习惯追踪与任务管理工具集：可查询/创建/修改/删除用户的任务、习惯、打卡记录、"
    "分组与项目，并可查询统计、生成日报/周报。所有数据按 token 所属用户隔离。"
)


def _rpc_ok(req_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _rpc_err(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _json_response(payload: dict, status_code: int = 200) -> Response:
    return Response(
        content=json.dumps(payload, ensure_ascii=False),
        media_type="application/json",
        status_code=status_code,
    )


async def _resolve_user(db: AsyncSession, request: Request) -> User | None:
    """Bearer token → 用户：JWT → 用户级密钥 → 服务端静态密钥"""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None

    try:
        user_id = decode_access_token(token)
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()
    except Exception:
        pass

    return await mcp_key_service.resolve_user(db, token) or await _env_key_user(db, token)


async def _env_key_user(db: AsyncSession, token: str) -> User | None:
    """管理员 MCP_API_KEYS 兜底（密钥:用户名）"""
    username = settings.mcp_api_keys.get(token)
    if not username:
        return None
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


@router.post("/mcp")
async def mcp(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        return _json_response(_rpc_err(None, -32700, "Parse error"), 400)
    if not isinstance(body, dict):
        return _json_response(_rpc_err(None, -32600, "Invalid Request"), 400)

    method = body.get("method")
    req_id = body.get("id")
    params = body.get("params") or {}

    # 无 id 的通知/客户端应答：无需回包
    if method is None or method.startswith("notifications/"):
        return Response(status_code=202)

    if method == "initialize":
        client_ver = params.get("protocolVersion")
        version = client_ver if client_ver in SUPPORTED_VERSIONS else LATEST_VERSION
        return _rpc_ok(req_id, {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
            "instructions": SERVER_INSTRUCTIONS,
        })

    if method == "ping":
        return _rpc_ok(req_id, {})

    if method == "tools/list":
        return _rpc_ok(req_id, {"tools": ai_tools.mcp_manifest()})

    if method == "tools/call":
        user = await _resolve_user(db, request)
        if user is None:
            return _json_response(
                _rpc_err(req_id, -32001,
                         "未授权：需有效 Bearer Token（登录 JWT，或在 App「我的 → MCP 密钥」生成的密钥）"),
                401,
            )
        name = params.get("name")
        arguments = params.get("arguments")
        if not name:
            return _json_response(_rpc_err(req_id, -32602, "缺少工具名 name"), 400)
        result, ok = await ai_tools.execute_tool(db, user.id, name, arguments, source="mcp")
        return _rpc_ok(req_id, {
            "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, default=str)}],
            "isError": not ok,
        })

    return _rpc_err(req_id, -32601, f"未知方法：{method}")
