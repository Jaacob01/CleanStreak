/**
 * 项目 API
 */
import { request } from './client';
import type { Project } from '../db/types';

export async function api_listProjects(): Promise<Project[]> {
  return request<Project[]>('/api/v1/projects/list', {});
}

export async function api_createProject(name: string): Promise<Project> {
  return request<Project>('/api/v1/projects/create', { name });
}

export async function api_renameProject(id: number, name: string): Promise<Project> {
  return request<Project>('/api/v1/projects/rename', { id, name });
}

export async function api_deleteProject(id: number): Promise<void> {
  await request('/api/v1/projects/delete', { id });
}
