/**
 * 习惯 API
 */
import { request } from './client';
import type { Habit, HabitConfig } from '../db/types';

export async function api_getHabits(includeArchived = false): Promise<Habit[]> {
  return request<Habit[]>('/api/v1/habits/list', { include_archived: includeArchived });
}

export async function api_getHabit(id: number): Promise<Habit> {
  return request<Habit>('/api/v1/habits/get', { id });
}

export async function api_createHabit(cfg: HabitConfig): Promise<Habit> {
  return request<Habit>('/api/v1/habits/create', cfg);
}

export async function api_updateHabit(id: number, cfg: Partial<HabitConfig>): Promise<Habit> {
  return request<Habit>('/api/v1/habits/update', { id, ...cfg });
}

export async function api_deleteHabit(habit_id: number): Promise<void> {
  await request<{ ok: boolean }>('/api/v1/habits/delete', { habit_id, direction: 0 });
}

export async function api_moveHabit(habit_id: number, direction: -1 | 1): Promise<void> {
  await request<{ ok: boolean }>('/api/v1/habits/move', { habit_id, direction });
}
