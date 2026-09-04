/**
 * 根导航：登录门控 + 4 Tab + 全局栈
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
import HabitsScreen from '../screens/HabitsScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import DayScreen from '../screens/DayScreen';
import HabitEditScreen from '../screens/HabitEditScreen';
import SettingsScreen from '../screens/SettingsScreen';

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
      <WebTab.Screen name="HabitsTab" component={HabitsScreen} options={{ title: '习惯', tabBarIcon: ({ color }) => <TabIcon name="apps" color={color} /> }} />
      <WebTab.Screen name="StatsTab" component={StatsScreen} options={{ title: '统计', tabBarIcon: ({ color }) => <TabIcon name="stats-chart" color={color} /> }} />
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
        // iOS 18 及以下直接指定底色；iOS 26+ 的外观由全局 setColorScheme('light') 锁定
        tabBarStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tab.Screen name="TodayTab" component={HomeScreen} options={{ title: '今日', tabBarIcon: () => ({ type: 'sfSymbol', name: 'flame' }) }} />
      <Tab.Screen name="HabitsTab" component={HabitsScreen} options={{ title: '习惯', tabBarIcon: () => ({ type: 'sfSymbol', name: 'square.grid.2x2' }) }} />
      <Tab.Screen name="StatsTab" component={StatsScreen} options={{ title: '统计', tabBarIcon: () => ({ type: 'sfSymbol', name: 'chart.bar' }) }} />
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
