/**
 * 根导航：登录门控 + 4 Tab（今日/统计/AI/我的） + 全局栈
 * 管理页在「我的 → 习惯与任务管理」进入（栈内页面）；AI 设置仅管理员可见
 * Native 用原生 UITabBarController（App.tsx 里 Appearance.setColorScheme('light') 全局锁定浅色外观）
 * Web 用 JS 版 BottomTab（避免污染 web bundle）
 */
import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { RootParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import ManageScreen from '../screens/ManageScreen';
import StatsScreen from '../screens/StatsScreen';
import AIScreen from '../screens/AIScreen';
import AISettingsScreen from '../screens/AISettingsScreen';
import McpKeysScreen from '../screens/McpKeysScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import DayScreen from '../screens/DayScreen';
import HabitEditScreen from '../screens/HabitEditScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TaskEditScreen from '../screens/TaskEditScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';

const Stack = createNativeStackNavigator<RootParamList>();
const WebTab = createBottomTabNavigator();

function TabIcon({ name, color }: { name: keyof typeof Ionicons.glyphMap; color: string }) {
  return <Ionicons name={name} size={22} color={color} />;
}

function WebTabs() {
  const colors = useTheme();
  return (
    <WebTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.ink,
          borderTopWidth: 2,
        },
      }}
    >
      <WebTab.Screen name="TodayTab" component={HomeScreen} options={{ title: '今日', tabBarIcon: ({ color }) => <TabIcon name="flame" color={color} /> }} />
      <WebTab.Screen name="StatsTab" component={StatsScreen} options={{ title: '统计', tabBarIcon: ({ color }) => <TabIcon name="stats-chart" color={color} /> }} />
      <WebTab.Screen name="AITab" component={AIScreen} options={{ title: 'AI', tabBarIcon: ({ color }) => <TabIcon name="sparkles" color={color} /> }} />
      <WebTab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: '我的', tabBarIcon: ({ color }) => <TabIcon name="person-circle" color={color} /> }} />
    </WebTab.Navigator>
  );
}

function NativeTabs() {
  const colors = useTheme();
  // 懒加载原生 tab，避免 web bundle 报错
  const { createNativeBottomTabNavigator } = require('@react-navigation/bottom-tabs/unstable');
  const Tab = useMemo(() => createNativeBottomTabNavigator(), []);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
        tabBarLabelVisibilityMode: 'labeled',
        tabBarStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tab.Screen name="TodayTab" component={HomeScreen} options={{ title: '今日', tabBarIcon: () => ({ type: 'sfSymbol', name: 'flame' }) }} />
      <Tab.Screen name="StatsTab" component={StatsScreen} options={{ title: '统计', tabBarIcon: () => ({ type: 'sfSymbol', name: 'chart.bar' }) }} />
      <Tab.Screen name="AITab" component={AIScreen} options={{ title: 'AI', tabBarIcon: () => ({ type: 'sfSymbol', name: 'sparkles' }) }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: '我的', tabBarIcon: () => ({ type: 'sfSymbol', name: 'person.crop.circle' }) }} />
    </Tab.Navigator>
  );
}

function MainTabs() {
  return Platform.OS === 'web' ? <WebTabs /> : <NativeTabs />;
}

function InnerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="HabitEdit" component={HabitEditScreen} />
      <Stack.Screen name="Day" component={DayScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Manage" component={ManageScreen} />
      <Stack.Screen name="TaskEdit" component={TaskEditScreen} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
      <Stack.Screen name="AISettings" component={AISettingsScreen} />
      <Stack.Screen name="McpKeys" component={McpKeysScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator({ loggedIn }: { loggedIn: boolean }) {
  const colors = useTheme();
  return (
    <NavigationContainer
      theme={{
        dark: false,
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '900' },
        },
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
      }}
    >
      {loggedIn ? <InnerNavigator /> : <LoginScreen />}
    </NavigationContainer>
  );
}
