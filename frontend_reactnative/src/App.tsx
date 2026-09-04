/**
 * App 入口：初始化 + 主题 + 应用锁 + Toast + 导航
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, Appearance, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './hooks/useTheme';
import { colors } from './theme';
import { ToastProvider } from './ui/toast';
import AppLock from './ui/AppLock';
import { useAuthStore } from './store/auth';
import { useSettingsStore } from './store/settings';
import RootNavigator from './navigation';
import { T } from './ui/components';

export default function App() {
  const load = useAuthStore(s => s.load);
  const hydrated = useAuthStore(s => s.hydrated);
  const user = useAuthStore(s => s.user);
  const initError = useAuthStore(s => s.initError);
  const settingsHydrated = useSettingsStore(s => s.hydrated);

  useEffect(() => { void load(); }, [load]);

  // 全局锁定浅色外观（写入 window 的 overrideUserInterfaceStyle）
  // 原生 UITabBar 等系统组件会继承，杜绝 iOS 26 Liquid Glass 随内容深浅漂移
  useEffect(() => { Appearance.setColorScheme('light'); }, []);

  if (!hydrated || !settingsHydrated) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={[styles.loading, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <T variant="cap" color={colors.subtext} style={{ marginTop: 12 }}>INITIALIZING...</T>
        </View>
      </SafeAreaProvider>
    );
  }

  if (initError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={[styles.loading, { backgroundColor: colors.background, padding: 24 }]}>
          <T variant="h2" color={colors.danger}>初始化失败</T>
          <T variant="mono" color={colors.subtext} style={{ marginTop: 12, textAlign: 'center' }}>{initError}</T>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ThemeProvider value={colors}>
        <AppLock>
          <ToastProvider>
            <RootNavigator loggedIn={!!user} />
          </ToastProvider>
        </AppLock>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
