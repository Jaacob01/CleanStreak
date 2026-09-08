/** 数据模型定义 — 通用习惯追踪 */

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin' | string;  // 管理员由数据库手动授予
  created_at: string;
}

/** 习惯方向：正向=做到了才打卡（运动/阅读…）；反向=犯了才记录（抽烟/刷手机…） */
export type HabitDirection = 'positive' | 'negative';

/** 目标类型：check=简单打卡；count=数量目标（配合 target_value / unit） */
export type HabitGoalType = 'check' | 'count';

/** 习惯配置（全部可配置项） */
export interface HabitConfig {
  name: string;
  emoji: string;
  color: string;              // HABIT_COLORS 的 key
  direction: HabitDirection;
  goal_type: HabitGoalType;
  target_value: number;       // count 类型的每日目标/上限；check 恒为 1
  unit: string;               // 数量单位：杯 / 分钟 / 支…
  weekdays: number[];         // 生效星期（0=周日 … 6=周六）；空数组=每天
  enable_notes: boolean;      // 记录是否带备注
  enable_tags: boolean;       // 记录是否带标签
  tags: string[];             // 该习惯的自定义标签集
  archived: boolean;
}

export interface Habit extends HabitConfig {
  id: number;
  user_id: number;
  sort_order: number;
  created_at: string;
}

/** 单次打卡明细：一天可打卡多次，每次独立携带时刻、数量、标签与备注 */
export interface HabitEntryDetail {
  value: number;
  time: string | null; // 打卡时刻（ISO-8601，存 UTC，展示转本地时间）
  tags: string[];
  notes: string | null;
}

/** 某天某习惯的一条记录（每天最多一条，值为可修改的累计数） */
export interface HabitEntry {
  id: number;
  user_id: number;
  habit_id: number;
  date: string;      // YYYY-MM-DD
  value: number;     // check=1；count=当天数量（=各次 value 之和）
  details: HabitEntryDetail[]; // 每次打卡的独立明细；旧数据为 []，按整条记录视为一次
  tags: string[];    // 各次标签汇总（并集），兼容展示用
  notes: string | null; // 各次备注汇总（拼接），兼容展示用
  created_at: string;
}

/** 单日判定：达成 / 部分达成 / 失守 / 未安排（中性）/ 今日待定 */
export type DayState = 'success' | 'partial' | 'fail' | 'neutral' | 'pending';

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  totalSuccess: number;   // 历史达成天数（正向）/ 保持达标天数（反向）
  totalFail: number;      // 历史未达成（正向）/ 失守天数（反向）
  totalEntries: number;   // 记录条数
  successRate: number;    // 0-100，按生效日计
  weekday: number[];      // 正向=达成按星期分布；反向=失守按星期分布
}

// ---- 任务 ----

export type TaskStatus = 'pending' | 'done' | 'shelved';

export interface ProgressLogEntry {
  time: string;  // HH:MM
  text: string;
}

export interface Task {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  date: string;             // YYYY-MM-DD
  created_at: string;
  group: string;            // 分组名字符串（按用户隔离，见 TaskGroup）
  project: string | null;
  priority: number;         // 0=P0 1=P1 2=P2 3=P3
  status: TaskStatus;
  completed: boolean;
  completed_at: string | null;
  progress_log: ProgressLogEntry[];
  blocked_reason: string | null;
  sort_order: number;
  source: string;           // manual / carry
  habit_id: number | null;
}

/** 任务分组（按用户隔离；Task.group 存的是分组名字符串） */
export interface TaskGroup {
  id: number;
  user_id: number;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

/** 任务项目（任务.project 存的是项目名字符串） */
export interface Project {
  id: number;
  user_id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface TaskStats {
  total: number;
  completed: number;
  pending: number;
  blocked: number;
  completion_rate: number;
  max_age_days: number;
  by_group: Record<string, { total: number; done: number; pending: number }>;
  by_priority: Record<string, number>;
}

export interface TaskReport {
  date: string;
  completed_today: Task[];
  pending: Task[];
  blocked: Task[];
  by_group: Record<string, { pending: number; completed: number; blocked: number }>;
}
