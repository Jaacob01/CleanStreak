/**
 * 认证 API
 */
import { request } from './client';
import type { User } from '../db/types';

interface AuthResponse extends User {
  token: string;
}

export async function api_register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/v1/auth/register', { username, password });
}

export async function api_login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/v1/auth/login', { username, password });
}

export async function api_me(): Promise<User> {
  return request<User>('/api/v1/auth/me');
}

export async function api_changePassword(old_password: string, new_password: string): Promise<void> {
  await request<{ ok: boolean }>('/api/v1/auth/change-password', { old_password, new_password });
}
