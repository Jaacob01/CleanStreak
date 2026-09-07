/**
 * 任务 API
 */
import { request } from './client';
import type { Task, TaskStats, TaskReport } from '../db/types';

export async function api_listTasks(filters: {
  date?: string; group?: string; status?: string;
  priority?: number; project?: string;
} = {}): Promise<Task[]> {
  return request<Task[]>('/api/v1/tasks/list', filters);
}

export async function api_createTask(data: {
  title: string; group?: string; project?: string;
  priority?: number; date?: string; description?: string; habit_id?: number;
}): Promise<Task> {
  return request<Task>('/api/v1/tasks/create', data);
}

export async function api_updateTask(id: number, patch: Partial<{
  title: string; description: string; date: string; group: string;
  project: string; priority: number; status: string; sort_order: number;
  habit_id: number;
}>): Promise<Task> {
  return request<Task>('/api/v1/tasks/update', { id, ...patch });
}

export async function api_deleteTask(id: number): Promise<void> {
  await request('/api/v1/tasks/delete', { id });
}

export async function api_completeTask(id: number, completed = true): Promise<Task> {
  return request<Task>('/api/v1/tasks/complete', { id, completed });
}

export async function api_appendProgress(id: number, text: string): Promise<Task> {
  return request<Task>('/api/v1/tasks/progress', { id, text });
}

export async function api_blockTask(id: number, reason: string): Promise<Task> {
  return request<Task>('/api/v1/tasks/block', { id, reason });
}

export async function api_carryTasks(date: string): Promise<{
  carried: number; tasks: Task[];
  summary: { total_pending: number; by_group: Record<string, number>; by_priority: Record<string, number> };
}> {
  return request('/api/v1/tasks/carry', { date });
}

export async function api_moveTask(id: number, direction: -1 | 1): Promise<void> {
  await request('/api/v1/tasks/move', { id, direction });
}

export async function api_taskStats(filters: {
  date_from?: string; date_to?: string; group?: string;
} = {}): Promise<TaskStats> {
  return request<TaskStats>('/api/v1/tasks/stats', filters);
}

export async function api_taskReport(date?: string): Promise<TaskReport> {
  return request<TaskReport>('/api/v1/tasks/report', date ? { date } : {});
}
