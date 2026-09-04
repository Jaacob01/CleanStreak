/** 导航参数类型定义 */

export type RootParamList = {
  Tabs: undefined;
  HabitEdit: { habitId?: number } | undefined;
  Day: { date: string } | undefined;
  Settings: undefined;
};

export type TabParamList = {
  TodayTab: undefined;
  HabitsTab: undefined;
  StatsTab: undefined;
  ProfileTab: undefined;
};

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
export type RootNav = NativeStackNavigationProp<RootParamList>;
