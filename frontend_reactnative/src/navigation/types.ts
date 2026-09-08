/** 导航参数类型定义 */

export type RootParamList = {
  Tabs: undefined;
  HabitEdit: { habitId?: number } | undefined;
  Day: { date: string } | undefined;
  Settings: undefined;
  Manage: undefined;
  TaskEdit: { taskId?: number; title?: string } | undefined;
  TaskDetail: { taskId: number };
  AISettings: undefined;
  McpKeys: undefined;
};

export type TabParamList = {
  TodayTab: undefined;
  StatsTab: undefined;
  AITab: undefined;
  ProfileTab: undefined;
};

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
export type RootNav = NativeStackNavigationProp<RootParamList>;
