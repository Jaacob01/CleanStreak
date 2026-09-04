/**
 * 导出 API
 */
import { request } from './client';

export interface ExportData {
  user: { id: number; username: string; created_at: string };
  habits: Record<string, unknown>[];
  entries: Record<string, unknown>[];
}

export async function api_exportAll(): Promise<ExportData> {
  return request<ExportData>('/api/v1/export');
}
