/**
 * 全局 Toast：色块 + 墨黑边框 + 硬阴影 + 状态图标
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { metrics } from '../theme';

export type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; kind: ToastKind; }
interface ToastApi { show: (message: string, kind?: ToastKind) => void; }

const ToastContext = createContext<ToastApi>({ show: () => undefined });

const KIND_ICONS: Record<ToastKind, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-sharp',
  error: 'close-sharp',
  info: 'information-circle-sharp',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const colors = useTheme();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++seq.current;
    setToasts(prev => [...prev.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="none" style={styles.host}>
        {toasts.map(t => {
          const solid = t.kind !== 'info';
          const accent = t.kind === 'success' ? colors.success : colors.danger;
          return (
            <View key={t.id} style={styles.toastWrap}>
              <View
                pointerEvents="none"
                style={{ position: 'absolute', top: 3, left: 3, right: 0, bottom: 0, backgroundColor: colors.ink }}
              />
              <View
                style={[
                  styles.toast,
                  {
                    backgroundColor: solid ? accent : colors.surface,
                    borderColor: colors.ink,
                  },
                ]}
              >
                <Ionicons
                  name={KIND_ICONS[t.kind]}
                  size={15}
                  color={colors.ink}
                />
                <Text style={[styles.text, { color: colors.ink }]}>
                  {t.message}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi { return useContext(ToastContext); }

const styles = StyleSheet.create({
  host: { position: 'absolute', top: 72, left: 0, right: 0, alignItems: 'center', zIndex: 9999, elevation: 9999 },
  toastWrap: { paddingRight: 3, paddingBottom: 3, marginBottom: 6 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '86%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: metrics.borderWidth,
  },
  text: { fontSize: 14, fontWeight: '800' },
});
