"""LLM 调用封装：统一走 OpenAI Chat Completions 兼容协议

DeepSeek / 通义千问 / Kimi / 智谱 / SiliconFlow / Ollama / vLLM 等均兼容该协议，
"供应商"本质只是 base_url + model 的差异。
"""
import json
from collections.abc import AsyncIterator

import httpx
from fastapi import HTTPException, status

from app.models.models import AISettings

REQUEST_TIMEOUT = 120.0
TEST_TIMEOUT = 30.0


def normalize_base_url(base_url: str) -> str:
    """归一化：去尾斜杠；已带 /chat/completions 则原样保留"""
    url = (base_url or "").strip().rstrip("/")
    if url.endswith("/chat/completions"):
        return url
    return f"{url}/chat/completions"


def _prepare_request(
    ai: AISettings,
    messages: list[dict],
    *,
    api_key_override: str | None,
    max_tokens_override: int | None,
    stream: bool,
) -> tuple[str, dict, dict]:
    """组装 URL / 请求头 / 请求体；api_key 只在服务端解密使用"""
    url = normalize_base_url(ai.base_url)
    headers = {"Content-Type": "application/json"}
    key = api_key_override
    if key is None and ai.api_key_encrypted:
        from app.utils import crypto
        key = crypto.decrypt(ai.api_key_encrypted)
    if key:
        headers["Authorization"] = f"Bearer {key}"

    payload = {
        "model": ai.model_name,
        "messages": messages,
        "temperature": ai.temperature,
        "max_tokens": max_tokens_override or ai.max_tokens,
        "stream": stream,
    }
    return url, headers, payload


def _wrap_connect_error(e: Exception) -> HTTPException:
    """httpx 连接期异常 → 友好提示（流式路径复用）"""
    if isinstance(e, httpx.TimeoutException):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 服务响应超时，请稍后重试或检查供应商状态",
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"无法连接 AI 服务：{type(e).__name__}，请检查 Base URL 是否正确",
    )


async def chat_completion(
    ai: AISettings,
    messages: list[dict],
    *,
    api_key_override: str | None = None,
    timeout: float = REQUEST_TIMEOUT,
    max_tokens_override: int | None = None,
) -> str:
    """非流式补全；失败统一抛带友好信息的 HTTPException(502)"""
    url, headers, payload = _prepare_request(
        ai, messages, api_key_override=api_key_override,
        max_tokens_override=max_tokens_override, stream=False,
    )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 服务响应超时，请稍后重试或检查供应商状态",
        )
    except httpx.HTTPError as e:
        raise _wrap_connect_error(e)

    if resp.status_code != 200:
        detail = _friendly_http_error(resp.status_code, resp)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 服务返回格式异常，请确认接口为 OpenAI 兼容协议",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 返回内容为空（可能触发了内容过滤），请换个问法",
        )
    return content


async def chat_completion_stream(
    ai: AISettings,
    messages: list[dict],
    *,
    api_key_override: str | None = None,
    timeout: float = REQUEST_TIMEOUT,
    max_tokens_override: int | None = None,
) -> AsyncIterator[str]:
    """流式补全：逐段产出文本 delta；连接/HTTP 错误抛带友好信息的 HTTPException(502)"""
    url, headers, payload = _prepare_request(
        ai, messages, api_key_override=api_key_override,
        max_tokens_override=max_tokens_override, stream=True,
    )

    got_any = False
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    await resp.aread()
                    detail = _friendly_http_error(resp.status_code, resp)
                    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                    except ValueError:
                        continue
                    # 部分供应商把错误放在流内
                    if chunk.get("error"):
                        msg = chunk["error"].get("message") or "AI 服务流式返回错误"
                        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)
                    delta = (chunk.get("choices") or [{}])[0].get("delta", {}).get("content")
                    if delta:
                        got_any = True
                        yield delta
    except (httpx.TimeoutException, httpx.HTTPError) as e:
        raise _wrap_connect_error(e)

    if not got_any:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 返回内容为空（可能触发了内容过滤），请换个问法",
        )


def _friendly_http_error(code: int, resp: httpx.Response) -> str:
    body = ""
    try:
        err = resp.json()
        body = err.get("error", {}).get("message") or err.get("message") or ""
    except ValueError:
        body = resp.text[:200]
    mapping = {
        401: "API Key 无效或已过期",
        403: "API Key 无权访问该模型",
        404: "接口地址或模型名不存在，请检查 Base URL 与模型名",
        429: "请求频率或额度超限，请稍后重试",
    }
    base = mapping.get(code, f"AI 服务返回错误 (HTTP {code})")
    return f"{base}：{body}" if body else base
