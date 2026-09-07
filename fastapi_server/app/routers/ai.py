"""AI 路由：聊天 / 分析 / 状态（登录用户）+ 配置管理（管理员）

chat 与 analyze 为 SSE 流式返回（text/event-stream）：
    data: {"meta": {...}}   仅 analyze，元信息先行
    data: {"delta": "..."}  文本片段，多次
    data: {"error": "..."}  出错时替代后续内容
    data: [DONE]            结束标记
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models.models import User
from app.schemas.ai import (
    AIAnalyzeRequest, AIChatRequest,
    AIHistoryItem, AIHistoryResponse,
    AISettingsResponse, AISettingsUpdateRequest,
    AIStatusResponse, AITestRequest, AITestResponse,
)
from app.services import ai_chat_service, ai_client, ai_config_service
from app.utils import crypto

router = APIRouter(prefix="/api/v1/ai", tags=["AI"])

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _sse_wrapper(gen) -> StreamingResponse:
    """把服务层的异步生成器包装为 SSE 流；业务异常转为 error 事件（头已发出，无法再改状态码）"""

    async def event_gen():
        try:
            async for event in gen:
                kind, payload = event
                yield _sse({kind: payload})
            yield "data: [DONE]\n\n"
        except HTTPException as e:
            yield _sse({"error": e.detail})

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers=SSE_HEADERS)


# ---- 登录用户 ----

@router.post("/status", response_model=AIStatusResponse)
async def status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await ai_config_service.get_settings_row(db)
    return {"enabled": ai_config_service.is_ready(row)}


@router.post("/chat")
async def chat(body: AIChatRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async def gen():
        async for delta in ai_chat_service.chat_stream(db, user, body.message.strip()):
            yield "delta", delta

    return _sse_wrapper(gen())


@router.post("/chat/history", response_model=AIHistoryResponse)
async def chat_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    msgs = await ai_chat_service.history(db, user.id)
    return {"messages": [AIHistoryItem(**m) for m in msgs]}


@router.post("/chat/clear")
async def chat_clear(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await ai_chat_service.clear_history(db, user.id)
    return {"ok": True}


@router.post("/analyze")
async def analyze(body: AIAnalyzeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return _sse_wrapper(ai_chat_service.analyze_stream(db, user, body.preset, body.date_from, body.date_to))


# ---- 管理员 ----

@router.post("/admin/settings", response_model=AISettingsResponse)
async def get_settings(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    row = await ai_config_service.get_settings_row(db, create=True)
    return ai_config_service.to_public_dict(row)


@router.post("/admin/settings/update", response_model=AISettingsResponse)
async def update_settings(
    body: AISettingsUpdateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await ai_config_service.get_settings_row(db, create=True)
    await ai_config_service.apply_update(db, row, body.model_dump(), admin)
    return ai_config_service.to_public_dict(row)


@router.post("/admin/test", response_model=AITestResponse)
async def test_connection(body: AITestRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """用当前表单值或已保存配置发一条试聊，验证连通性"""
    row = await ai_config_service.get_settings_row(db, create=True)

    # 表单临时值优先（保存前就能验证）；api_key 掩码原样 → 用已存密钥
    key = body.api_key if (body.api_key and "*" not in body.api_key) else None
    if key is None and row.api_key_encrypted:
        key = crypto.decrypt(row.api_key_encrypted)

    probe = type(row)(
        base_url=body.base_url if body.base_url else row.base_url,
        api_key_encrypted=None,
        model_name=body.model_name if body.model_name else row.model_name,
        temperature=row.temperature,
        max_tokens=64,
    )
    try:
        reply = await ai_client.chat_completion(
            probe,
            [{"role": "user", "content": "请回复：连接成功"}],
            api_key_override=key,
            timeout=ai_client.TEST_TIMEOUT,
            max_tokens_override=64,
        )
        return {"ok": True, "message": f"连接成功，模型回复：{reply[:80]}"}
    except Exception as e:
        detail = getattr(e, "detail", None) or str(e)
        return {"ok": False, "message": f"连接失败：{detail}"}
