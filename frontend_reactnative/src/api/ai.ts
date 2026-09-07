/**
 * AI API — 聊天 / 分析 / 状态 / 管理端配置
 * 聊天与分析为 SSE 流式：data: {"delta"...} / {"meta"...} / {"error"...}，data: [DONE] 结束
 */
import { fetch as streamFetch } from 'expo/fetch';
import { request, BASE_URL, getToken } from './client';

export interface AIChatMsg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface AISettings {
  enabled: boolean;
  provider: string;
  base_url: string;
  api_key_masked: string;
  has_api_key: boolean;
  model_name: string;
  system_prompt_chat: string;
  system_prompt_analyze: string;
  temperature: number;
  max_tokens: number;
  provider_presets: Record<string, string>;
  updated_at: string | null;
}

export type AIPreset = 'day' | 'week' | 'month' | 'year' | 'custom';

/** SSE 流内事件（delta=文本片段 meta=分析元信息 error=业务错误） */
interface SSEEvent {
  delta?: string;
  error?: string;
  meta?: { preset?: string; label: string; date_from: string; date_to: string };
}

/** 解析单行 SSE；非 data 行、[DONE]、坏 JSON 返回 null */
function parseSSELine(line: string): SSEEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload) as SSEEvent;
  } catch {
    return null;
  }
}

/** 中止读取：把任意中止异常统一为 name='AbortError' */
function abortError(): Error {
  const e = new Error('已停止生成');
  e.name = 'AbortError';
  return e;
}

/** POST 并逐行读取 SSE 流；每个事件回调一次；HTTP 错误抛出；signal 中止时抛 AbortError */
async function streamSSE(
  path: string,
  body: unknown,
  onEvent: (ev: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  if (signal?.aborted) throw abortError();

  const res = await streamFetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
    } catch {}
    throw new Error(msg);
  }

  const handleLine = (l: string) => {
    const ev = parseSSELine(l);
    if (ev) onEvent(ev);
  };

  if (!res.body) {
    // 兜底：环境不支持流式读取时整包读完再派发
    const text = await res.text();
    if (signal?.aborted) throw abortError();
    text.split('\n').forEach(handleLine);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        handleLine(buf.slice(0, idx).replace(/\r$/, ''));
        buf = buf.slice(idx + 1);
      }
    }
    if (signal?.aborted) throw abortError();
    if (buf.trim()) handleLine(buf);
  } catch (e) {
    // 中止后上游读可能以任意异常形态结束，统一按中止处理
    if (signal?.aborted) throw abortError();
    throw e;
  } finally {
    void reader.cancel().catch(() => {});
  }
}

/** 流式聊天：每个回复片段回调一次 onDelta；出错抛异常（含流内 error 事件）；signal 可中止 */
export async function api_aiChatStream(
  message: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  await streamSSE('/api/v1/ai/chat', { message }, ev => {
    if (typeof ev.delta === 'string') onDelta(ev.delta);
    else if (ev.error) throw new Error(ev.error);
  }, signal);
}

/** 流式分析：先回调 onMeta（范围信息），再逐段回调 onDelta */
export async function api_aiAnalyzeStream(
  preset: AIPreset,
  date_from: string | undefined,
  date_to: string | undefined,
  onMeta: (meta: { label: string; date_from: string; date_to: string }) => void,
  onDelta: (delta: string) => void,
): Promise<void> {
  await streamSSE('/api/v1/ai/analyze', { preset, date_from, date_to }, ev => {
    if (ev.meta) onMeta(ev.meta);
    else if (typeof ev.delta === 'string') onDelta(ev.delta);
    else if (ev.error) throw new Error(ev.error);
  });
}

/** AI 是否已启用且配置完整 */
export async function api_aiStatus(): Promise<{ enabled: boolean }> {
  return request('/api/v1/ai/status');
}

export async function api_aiChatHistory(): Promise<{ messages: AIChatMsg[] }> {
  return request('/api/v1/ai/chat/history');
}

export async function api_aiChatClear(): Promise<void> {
  await request('/api/v1/ai/chat/clear');
}

export async function api_aiGetSettings(): Promise<AISettings> {
  return request('/api/v1/ai/admin/settings');
}

export async function api_aiUpdateSettings(patch: Partial<{
  enabled: boolean; provider: string; base_url: string; api_key: string;
  model_name: string; system_prompt_chat: string; system_prompt_analyze: string;
  temperature: number; max_tokens: number;
}>): Promise<AISettings> {
  return request('/api/v1/ai/admin/settings/update', patch);
}

export async function api_aiTestConnection(body: {
  base_url?: string; api_key?: string; model_name?: string;
}): Promise<{ ok: boolean; message: string }> {
  return request('/api/v1/ai/admin/test', body);
}
