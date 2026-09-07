/**
 * 任务分组 API
 */
import { request } from './client';
import type { TaskGroup } from '../db/types';

export async function api_listGroups(): Promise<TaskGroup[]> {
  return request<TaskGroup[]>('/api/v1/groups/list', {});
}

export async function api_createGroup(name: string, color?: string): Promise<TaskGroup> {
  return request<TaskGroup>('/api/v1/groups/create', { name, color });
}

export async function api_renameGroup(id: number, name: string): Promise<TaskGroup> {
  return request<TaskGroup>('/api/v1/groups/rename', { id, name });
}

export async function api_deleteGroup(id: number): Promise<void> {
  await request('/api/v1/groups/delete', { id });
}
