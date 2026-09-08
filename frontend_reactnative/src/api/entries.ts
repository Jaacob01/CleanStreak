/**
 * 打卡记录 API
 */
import { request } from './client';
import type { HabitEntry, HabitEntryDetail } from '../db/types';

interface EntryPatch {
  value?: number;
  tags?: string[];
  notes?: string | null;
  details?: HabitEntryDetail[];
}

export async function api_getEntry(habit_id: number, date: string): Promise<HabitEntry | null> {
  return request<HabitEntry | null>('/api/v1/entries/get', { habit_id, date });
}

export async function api_getEntriesByDate(date: string): Promise<HabitEntry[]> {
  return request<HabitEntry[]>('/api/v1/entries/by-date', { date });
}

export async function api_getEntriesByMonth(year: number, month: number, habit_id?: number): Promise<HabitEntry[]> {
  return request<HabitEntry[]>('/api/v1/entries/by-month', { year, month, habit_id });
}

export async function api_getAllEntriesForHabit(habit_id: number): Promise<HabitEntry[]> {
  return request<HabitEntry[]>('/api/v1/entries/by-habit', { habit_id });
}

export async function api_getAllEntries(): Promise<HabitEntry[]> {
  return request<HabitEntry[]>('/api/v1/entries/all');
}

export async function api_saveEntry(habit_id: number, date: string, patch: EntryPatch = {}): Promise<HabitEntry> {
  return request<HabitEntry>('/api/v1/entries/save', { habit_id, date, ...patch });
}

export async function api_deleteEntry(habit_id: number, date: string): Promise<void> {
  await request<{ ok: boolean }>('/api/v1/entries/delete', { habit_id, date });
}

export async function api_toggleCheckEntry(habit_id: number, date: string): Promise<boolean> {
  const res = await request<{ toggled: boolean }>('/api/v1/entries/toggle', { habit_id, date });
  return res.toggled;
}

export async function api_bumpEntryValue(habit_id: number, date: string, delta: number): Promise<number> {
  const res = await request<{ new_value: number }>('/api/v1/entries/bump', { habit_id, date, delta });
  return res.new_value;
}
