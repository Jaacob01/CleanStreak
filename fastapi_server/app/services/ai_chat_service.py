"""AI 聊天与分析编排：构建上下文 → 组装消息 → 调 LLM（流式）→ 落库"""
from collections.abc import AsyncIterator
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AIChatMessage, User
from app.services import ai_client, ai_config_service
from app.services.ai_context_service import (
    build_context, context_to_json, resolve_range, today_cn,
)

HISTORY_TURNS = 10          # 带入对话的最近消息条数
HISTORY_MAX_CHARS = 8000    # 历史拼接字符上限

DEFAULT_CHAT_PROMPT = (
    "你是 CleanStreak（习惯追踪应用）的个人数据分析助手，帮助用户回顾和分析自己的习惯打卡与任务完成情况。\n"
    "规则：\n"
    "1. 只基于提供的【用户数据上下文】回答，结论必须引用其中的具体数字；\n"
    "2. 数据中没有的信息，明确说明「数据中未包含」，严禁编造；\n"
    "3. 用中文回答，语言简洁友好，适当分点；\n"
    "4. 只回答与用户习惯/任务数据相关的问题，无关话题礼貌拒绝；\n"
    "5. 给建议时要具体、可执行，不要空泛。"
)

DEFAULT_ANALYZE_PROMPT = (
    "你是习惯与任务数据分析专家。请基于提供的【用户数据上下文】，输出一份结构化分析报告，使用以下 Markdown 小节：\n"
    "## 总体评价\n（2-3 句概括该时间段的整体表现）\n"
    "## 亮点\n（列点，引用具体数字）\n"
    "## 问题与风险\n（列点，引用具体数字）\n"
    "## 改进建议\n（3-5 条，具体可执行）\n"
    "要求：所有结论必须来自数据上下文，不得编造；语言精炼；中文。"
)


def _ensure_ready(row) -> None:
    if not ai_config_service.is_ready(row):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI 功能未启用或配置不完整，请联系管理员在「AI 设置」中配置供应商、Base URL 和模型",
        )


async def _load_history(db: AsyncSession, user_id: int, turns: int) -> list[dict]:
    result = await db.execute(
        select(AIChatMessage)
        .where(AIChatMessage.user_id == user_id)
        .order_by(AIChatMessage.id.desc())
        .limit(turns)
    )
    msgs = list(reversed(result.scalars().all()))
    # 超长时从最旧的开始丢弃
    total = 0
    kept: list[dict] = []
    for m in reversed(msgs):
        total += len(m.content)
        if total > HISTORY_MAX_CHARS:
            break
        kept.append({"role": m.role, "content": m.content})
    return list(reversed(kept))


async def chat_stream(db: AsyncSession, user: User, message: str) -> AsyncIterator[str]:
    """聊天：流式产出回复片段；流结束后把本轮问答落库（失败则不落库，便于重试）"""
    row = await ai_config_service.get_settings_row(db)
    _ensure_ready(row)

    today = today_cn()
    context = await build_context(db, user.id, today - timedelta(days=29), today)
    system = row.system_prompt_chat or DEFAULT_CHAT_PROMPT
    system += f"\n\n当前日期：{today.isoformat()}\n\n【用户数据上下文】\n{context_to_json(context)}"

    messages: list[dict] = [{"role": "system", "content": system}]
    messages.extend(await _load_history(db, user.id, HISTORY_TURNS))
    messages.append({"role": "user", "content": message})

    reply_parts: list[str] = []
    async for delta in ai_client.chat_completion_stream(row, messages):
        reply_parts.append(delta)
        yield delta

    reply = "".join(reply_parts)
    db.add(AIChatMessage(user_id=user.id, role="user", content=message))
    db.add(AIChatMessage(user_id=user.id, role="assistant", content=reply))
    await db.flush()


async def analyze_stream(
    db: AsyncSession, user: User, preset: str, date_from: str | None, date_to: str | None
) -> AsyncIterator[tuple[str, dict]]:
    """分析：先产出 ("meta", 元信息) 再产出 ("delta", 文本片段)"""
    row = await ai_config_service.get_settings_row(db)
    _ensure_ready(row)

    date_from_d, date_to_d, label = resolve_range(preset, date_from, date_to)
    context = await build_context(db, user.id, date_from_d, date_to_d)
    system = row.system_prompt_analyze or DEFAULT_ANALYZE_PROMPT

    messages = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": (
                f"请分析用户在「{label}」的数据表现。\n\n"
                f"【用户数据上下文】\n{context_to_json(context)}"
            ),
        },
    ]

    yield "meta", {
        "preset": preset,
        "label": label,
        "date_from": date_from_d.isoformat(),
        "date_to": date_to_d.isoformat(),
    }
    async for delta in ai_client.chat_completion_stream(row, messages):
        yield "delta", delta


async def history(db: AsyncSession, user_id: int, limit: int = 100) -> list[dict]:
    result = await db.execute(
        select(AIChatMessage)
        .where(AIChatMessage.user_id == user_id)
        .order_by(AIChatMessage.id.desc())
        .limit(limit)
    )
    msgs = list(reversed(result.scalars().all()))
    return [
        {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at}
        for m in msgs
    ]


async def clear_history(db: AsyncSession, user_id: int) -> None:
    await db.execute(delete(AIChatMessage).where(AIChatMessage.user_id == user_id))
    await db.flush()
