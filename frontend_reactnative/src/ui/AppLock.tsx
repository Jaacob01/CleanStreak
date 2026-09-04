/**
 * 生物识别应用锁
 * 开启后：冷启动 / 切后台返回时要求 Face ID / 指纹验证
 */
import React, { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { T } from './components';
import { useAuthStore } from '../store/auth';
import { useSettingsStore } from '../store/settings';

export default function AppLock({ children }: { children: React.ReactNode }) {
  const colors = useTheme();
  const user = useAuthStore(s => s.user);
  const biometricEnabled = useSettingsStore(s => s.biometricEnabled);
  const [capable, setCapable] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 仅在硬件支持且已录入时启用
  const armed = biometricEnabled && !!user && capable;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [has, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (alive) setCapable(has && enrolled);
      } catch {
        if (alive) setCapable(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // 冷启动上锁
  useEffect(() => {
    if (armed) setLocked(true);
  }, [armed]);

  // 切后台自动上锁
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'background' && armed) setLocked(true);
    });
    return () => sub.remove();
  }, [armed]);

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: '解锁 CleanStreak' });
      if (res.success) {
        setLocked(false);
        return;
      }
      const code = (res as { error?: string }).error;
      if (code && code !== 'user_cancel' && code !== 'system_cancel' && code !== 'app_cancel') {
        setError('验证失败，请重试');
      }
    } catch {
      setError('验证失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  if (!armed || !locked) return <>{children}</>;

  return (
    <View style={[styles.lock, { backgroundColor: colors.background }]}>
      <Pressable style={styles.lockInner} disabled={busy} onPress={() => void unlock()}>
        <View style={styles.lockBoxWrap}>
          <View pointerEvents="none" style={[styles.lockShadow, { backgroundColor: colors.ink }]} />
          <View style={[styles.lockBox, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
            <Ionicons name="finger-print" size={44} color={colors.ink} />
          </View>
        </View>
        <T variant="title" style={styles.lockTitle}>应用已锁定</T>
        <T variant="cap" style={styles.lockHint}>{busy ? '等待验证…' : '点击进行生物识别解锁'}</T>
        {error ? <T variant="body" color={colors.danger} style={styles.lockError}>{error}</T> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lock: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lockInner: { alignItems: 'center', paddingHorizontal: 24 },
  lockBoxWrap: { paddingRight: 5, paddingBottom: 5 },
  lockShadow: { position: 'absolute', top: 5, left: 5, right: 0, bottom: 0 },
  lockBox: { width: 96, height: 96, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  lockTitle: { marginTop: 24 },
  lockHint: { marginTop: 8 },
  lockError: { marginTop: 12 },
});
