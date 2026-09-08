/**
 * 数据库桥接层 — 所有函数签名保持不变，底层调用 API
 * 前端其他文件无需修改，直接 import from '../db' 即可
 */
import type { Habit, HabitConfig, HabitEntry, HabitEntryDetail, User } from './types';
import {
  api_register, api_login, api_me, api_changePassword,
  api_getHabits, api_getHabit, api_createHabit, api_updateHabit,
  api_deleteHabit, api_moveHabit,
  api_getEntry, api_getEntriesByDate, api_getEntriesByMonth,
  api_getAllEntriesForHabit, api_getAllEntries,
  api_saveEntry, api_deleteEntry, api_toggleCheckEntry, api_bumpEntryValue,
} from '../api';

// ---- 用户 ----

export async function createUser(username: string, password: string): Promise<User> {
  const res = await api_register(username, password);
  return { id: res.id, username: res.username, role: res.role, created_at: res.created_at };
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  try {
    const res = await api_login(username, password);
    return { id: res.id, username: res.username, role: res.role, created_at: res.created_at };
  } catch {
    return null;
  }
}

export async function getUserById(_id: number): Promise<User | null> {
  try {
    return await api_me();
  } catch {
    return null;
  }
}

export async function changePassword(_userId: number, oldPwd: string, newPwd: string): Promise<boolean> {
  try {
    await api_changePassword(oldPwd, newPwd);
    return true;
  } catch {
    return false;
  }
}

/** 初始化：不再需要本地 DB，直接返回 */
export async function initDB(): Promise<void> {
  // no-op: 后端已初始化
}

// ---- 习惯 ----

export async function getHabits(_userId: number, includeArchived = false): Promise<Habit[]> {
  return api_getHabits(includeArchived);
}

export async function getHabit(habitId: number): Promise<Habit | null> {
  try {
    return await api_getHabit(habitId);
  } catch {
    return null;
  }
}

export async function createHabit(_userId: number, cfg: HabitConfig): Promise<Habit> {
  return api_createHabit(cfg);
}

export async function updateHabit(habitId: number, cfg: HabitConfig): Promise<void> {
  await api_updateHabit(habitId, cfg);
}

export async function deleteHabit(habitId: number): Promise<void> {
  await api_deleteHabit(habitId);
}

export async function moveHabit(_userId: number, habitId: number, dir: -1 | 1): Promise<void> {
  await api_moveHabit(habitId, dir);
}

// ---- 记录 ----

export async function getEntry(habitId: number, date: string): Promise<HabitEntry | null> {
  return api_getEntry(habitId, date);
}

export async function getEntriesByDate(_userId: number, date: string): Promise<HabitEntry[]> {
  return api_getEntriesByDate(date);
}

export async function getEntriesByMonth(
  _userId: number, year: number, month: number, habitId?: number
): Promise<HabitEntry[]> {
  return api_getEntriesByMonth(year, month, habitId);
}

export async function getAllEntriesForHabit(habitId: number): Promise<HabitEntry[]> {
  return api_getAllEntriesForHabit(habitId);
}

export async function getAllEntries(_userId: number): Promise<HabitEntry[]> {
  return api_getAllEntries();
}

export interface EntryPatch {
  value?: number;
  tags?: string[];
  notes?: string | null;
  details?: HabitEntryDetail[];
}

export async function saveEntry(
  _userId: number, habitId: number, date: string, patch: EntryPatch
): Promise<HabitEntry> {
  return api_saveEntry(habitId, date, patch);
}

export async function deleteEntry(habitId: number, date: string): Promise<void> {
  await api_deleteEntry(habitId, date);
}

export async function toggleCheckEntry(habit: { id: number }, date: string): Promise<boolean> {
  return api_toggleCheckEntry(habit.id, date);
}

export async function bumpEntryValue(habit: { id: number }, date: string, delta: number): Promise<number> {
  return api_bumpEntryValue(habit.id, date, delta);
}

// ---- 工具函数 ----
export { todayString } from './logic';
