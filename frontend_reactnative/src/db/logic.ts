/**
 * 习惯判定纯逻辑（无 DB / UI 依赖）
 * 正向习惯：有记录且达到目标 = 达成；未达目标 = 部分达成；生效日无记录（已过）= 未达成
 * 反向习惯：无记录 = 保持；记录未超上限 = 保持；记录超上限或简单打卡有记录 = 失守
 * 未生效日为中性：不计入也不打断 streak
 */
import { DayState, Habit, HabitEntry, HabitStats } from './types';

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 按本地时区解析 YYYY-MM-DD（new Date('YYYY-MM-DD') 会按 UTC 解析，产生跨时区偏差） */
export function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

export function todayString(): string {
  return formatDate(new Date());
}

export function addDays(dateStr: string, delta: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

export const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayOf(dateStr: string): number {
  return parseDate(dateStr).getDay();
}

/** 习惯追踪起始日（创建日） */
export function habitStartDate(habit: Habit): string {
  return habit.created_at.slice(0, 10);
}

/** 某天是否为习惯生效日 */
export function isScheduledDay(habit: Habit, dateStr: string): boolean {
  if (habit.weekdays.length === 0) return true;
  return habit.weekdays.includes(weekdayOf(dateStr));
}

/** 给定数量是否达成目标（正向：≥目标；反向：≤上限） */
export function meetsGoal(habit: Habit, value: number): boolean {
  return habit.direction === 'positive' ? value >= habit.target_value : value <= habit.target_value;
}

/** 仅对已有记录做判定；无记录返回 null */
export function judgeEntry(habit: Habit, entry: HabitEntry | undefined | null): 'success' | 'partial' | 'fail' | null {
  if (!entry) return null;
  if (habit.goal_type === 'check') {
    return habit.direction === 'positive' ? 'success' : 'fail';
  }
  if (habit.direction === 'positive') {
    return entry.value >= habit.target_value ? 'success' : 'partial';
  }
  return entry.value > habit.target_value ? 'fail' : 'success';
}

/** 某天完整判定 */
export function dayState(
  habit: Habit,
  entry: HabitEntry | undefined | null,
  dateStr: string,
  todayStr: string,
): DayState {
  if (dateStr < habitStartDate(habit)) return 'neutral';
  const judged = judgeEntry(habit, entry);
  if (judged) return judged;                       // 有记录：按记录本身判定
  if (!isScheduledDay(habit, dateStr)) return 'neutral';
  if (dateStr === todayStr) return 'pending';      // 今天还没记录：待定，不影响 streak
  return habit.direction === 'positive' ? 'fail' : 'success';
}

/** 习惯整体统计 */
export function computeStats(habit: Habit, entries: HabitEntry[], todayStr: string): HabitStats {
  const byDate = new Map(entries.map(e => [e.date, e]));
  const start = habitStartDate(habit);
  const weekday = [0, 0, 0, 0, 0, 0, 0];

  let totalSuccess = 0;
  let totalFail = 0;
  let scheduledDays = 0;
  let longest = 0;
  let run = 0;

  if (start <= todayStr) {
    for (let cur = start; cur <= todayStr; cur = addDays(cur, 1)) {
      if (!isScheduledDay(habit, cur)) continue;
      scheduledDays++;
      const st = dayState(habit, byDate.get(cur), cur, todayStr);
      if (st === 'success') {
        run++;
        if (run > longest) longest = run;
        totalSuccess++;
        if (habit.direction === 'positive') weekday[weekdayOf(cur)]++;
      } else if (st === 'fail') {
        run = 0;
        totalFail++;
        if (habit.direction === 'negative') weekday[weekdayOf(cur)]++;
      } else if (st === 'partial') {
        run = 0;
      }
      // neutral / pending：跳过
    }
  }

  // 当前 streak：从今天往回走
  let current = 0;
  if (start <= todayStr) {
    for (let cur = todayStr; cur >= start; cur = addDays(cur, -1)) {
      const st = dayState(habit, byDate.get(cur), cur, todayStr);
      if (st === 'success') { current++; continue; }
      if (st === 'neutral' || st === 'pending') continue;
      if (st === 'partial' && cur === todayStr) continue; // 今天进行中：不中断也不计入
      break; // fail / 过去的 partial 中断
    }
  }

  return {
    currentStreak: current,
    longestStreak: longest,
    totalSuccess,
    totalFail,
    totalEntries: entries.length,
    successRate: scheduledDays > 0 ? Math.round((totalSuccess / scheduledDays) * 100) : 0,
    weekday,
  };
}

/** 最近 N 天（含 todayStr）各天的判定，用于迷你进度条 */
export function recentDayStates(
  habit: Habit,
  entries: HabitEntry[],
  days: number,
  todayStr: string,
): { date: string; state: DayState }[] {
  const byDate = new Map(entries.map(e => [e.date, e]));
  const out: { date: string; state: DayState }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(todayStr, -i);
    out.push({ date, state: dayState(habit, byDate.get(date), date, todayStr) });
  }
  return out;
}

/** 目标描述：正向「每天目标 8 杯」/ 反向「每天上限 5 支」… */
export function describeGoal(habit: Habit): string {
  if (habit.goal_type === 'check') {
    return habit.direction === 'positive' ? '每日打卡' : '犯了就记一次';
  }
  const unit = habit.unit || '次';
  return habit.direction === 'positive'
    ? `每天目标 ${trimNum(habit.target_value)} ${unit}`
    : `每天上限 ${trimNum(habit.target_value)} ${unit}`;
}

/** 频率描述：每天 / 周一·三·五 / 周末 */
export function describeFrequency(habit: Habit): string {
  if (habit.weekdays.length === 0) return '每天';
  const sorted = [...habit.weekdays].sort((a, b) => a - b);
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return '周末';
  if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') return '工作日';
  return `每周${sorted.map(w => WEEKDAY_NAMES[w] ?? '').join('·')}`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
