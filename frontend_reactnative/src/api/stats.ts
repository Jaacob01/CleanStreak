/**
 * 统计 API
 */
import { request } from './client';
import type { HabitStats } from '../db/types';

export async function api_getHabitStats(habit_id: number): Promise<HabitStats> {
  return request<HabitStats>('/api/v1/stats/habit', { habit_id });
}

interface DayStateItem {
  date: string;
  state: string;
  value: number | null;
}

export async function api_getRecentStates(habit_id: number, days = 7): Promise<DayStateItem[]> {
  const res = await request<{ habit_id: number; days: DayStateItem[] }>('/api/v1/stats/recent', { habit_id, days });
  return res.days;
}

interface TodayHabitSummary {
  habit_id: number;
  name: string;
  emoji: string;
  state: string;
  current_streak: number;
}

export interface TodaySummary {
  date: string;
  scheduled: number;
  success: number;
  fail: number;
  partial: number;
  pending: number;
  neutral: number;
  habits: TodayHabitSummary[];
}

export async function api_getTodaySummary(): Promise<TodaySummary> {
  return request<TodaySummary>('/api/v1/stats/today-summary');
}
