/**
 * API 客户端 — 统一 fetch 封装，JWT 自动注入
 */

// 后端地址，可通过环境变量覆盖
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

let _token: string | null = null;

/** 设置 JWT token（登录后调用） */
export function setToken(token: string | null) {
  _token = token;
}

/** 获取当前 token */
export function getToken(): string | null {
  return _token;
}

/** 统一请求封装 */
async function request<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
    } catch {}
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

export { request };
