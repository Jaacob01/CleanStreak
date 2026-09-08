/**
 * MCP 密钥 API — 用户自助管理外部 AI 客户端接入 /mcp 的长期密钥
 */
import { request } from './client';

export interface McpKey {
  id: number;
  label: string;
  /** 明文密钥（仅本人可见），用于配置外部客户端 */
  key: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export async function api_mcpKeyList(): Promise<{ keys: McpKey[] }> {
  return request('/api/v1/mcp-keys/list');
}

export async function api_mcpKeyCreate(label?: string): Promise<McpKey> {
  return request('/api/v1/mcp-keys/create', { label });
}

export async function api_mcpKeyDelete(id: number): Promise<void> {
  await request('/api/v1/mcp-keys/delete', { id });
}
