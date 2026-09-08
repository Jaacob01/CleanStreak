"""AI 聊天与分析编排：构建上下文 → 组装消息 → 调 LLM → 落库

chat 为 agent loop：模型可调用 ai_tools 注册表中的工具（查询/增删改查业务数据），
工具执行结果回灌对话继续推理，直到产出最终文本回复。历史只落 user/assistant 文本，
工具调用的中间过程仅存在于本轮内存中，但每次调用都在 ai_tool_calls 审计表留痕。
"""
import json
from collections.abc import AsyncIterator
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AIChatMessage, User
from app.services import ai_client, ai_config_service, ai_tools
from app.services.ai_context_service import (
    WEEKDAY_NAMES, build_context, context_to_json, resolve_range, today_cn,
)

HISTORY_TURNS = 10          # 带入对话的最近消息条数
HISTORY_MAX_CHARS = 8000    # 历史拼接字符上限
MAX_TOOL_ROUNDS = 6         # 单轮对话最多的工具调用轮数

DEFAULT_CHAT_PROMPT = (
    "你是 CleanStreak（习惯追踪应用）的个人助理，既能基于用户数据做分析答疑，"
    "也能直接替用户执行操作（创建/完成任务、习惯打卡与计数、创建修改习惯、分组项目管理、删除等）。\n"
    "工具使用规则：\n"
    "1. 操作前必须先查询拿到目标 id（list_tasks / list_habits / list_groups 等），严禁凭空猜测 id；\n"
    "2. 日期一律用 YYYY-MM-DD，「今天」以下方系统提供的当前日期为准；\n"
    "3. 删除类操作不可恢复：必须先向用户复述目标并获得明确同意，才能带 confirm=true 调用；"
    "未确认时先询问，不要替用户做主；\n"
    "4. 每次操作后用一句话向用户确认结果；只做用户要求的事，不要顺手改动其他数据；\n"
    "5. 分析类问题基于【用户数据上下文】回答并引用具体数字；需要更细/更早的数据时用工具查询；\n"
    "6. 数据中没有的信息明确说明，严禁编造；与习惯/任务无关的请求礼貌拒绝；\n"
    "7. 用中文回答，语言简洁友好，适当分点。"
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


async def chat_stream(db: AsyncSession, user: User, message: str) -> AsyncIterator[tuple[str, dict]]:
    """聊天（agent loop）：产出 ("delta", 文本片段) 与 ("tool", 工具执行事件)；流结束后把本轮问答落库"""
    row = await ai_config_service.get_settings_row(db)
    _ensure_ready(row)

    today = today_cn()
    context = await build_context(db, user.id, today - timedelta(days=29), today)
    system = row.system_prompt_chat or DEFAULT_CHAT_PROMPT
    weekday = WEEKDAY_NAMES[(today.weekday() + 1) % 7]
    system += (
        f"\n\n当前日期：{today.isoformat()}（{weekday}）\n\n"
        f"【用户数据上下文】（最近 30 天概览，更细/更早数据请用工具查询）\n{context_to_json(context)}"
    )

    messages: list[dict] = [{"role": "system", "content": system}]
    messages.extend(await _load_history(db, user.id, HISTORY_TURNS))
    messages.append({"role": "user", "content": message})

    final_reply = ""
    for rnd in range(MAX_TOOL_ROUNDS):
        # 最后一轮不再提供工具，强制模型基于已获取的信息作答，保证收敛
        tools = ai_tools.openai_schemas() if rnd < MAX_TOOL_ROUNDS - 1 else None

        parts: list[str] = []
        tool_calls: list[dict] = []
        async for kind, payload in ai_client.stream_completion(row, messages, tools=tools):
            if kind == "delta":
                parts.append(payload)
                yield "delta", payload
            else:
                tool_calls = payload
        final_reply = "".join(parts)

        if not tool_calls:
            break

        # 把本轮带工具请求的 assistant 消息与各工具结果回灌，继续推理
        messages.append({
            "role": "assistant",
            "content": final_reply or None,
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": json.dumps(tc["arguments"], ensure_ascii=False)},
                }
                for tc in tool_calls
            ],
        })
        for tc in tool_calls:
            result, ok = await ai_tools.execute_tool(db, user.id, tc["name"], tc["arguments"])
            td = ai_tools.TOOLS.get(tc["name"])
            yield "tool", {
                "name": tc["name"],
                "label": td.label if td else tc["name"],
                "ok": ok,
                "detail": ai_tools.brief_result(result) if ok else str(result.get("error", ""))[:100],
            }
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

    if final_reply:
        db.add(AIChatMessage(user_id=user.id, role="user", content=message))
        db.add(AIChatMessage(user_id=user.id, role="assistant", content=final_reply))
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
