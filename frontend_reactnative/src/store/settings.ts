/**
 * 设置状态（Zustand）— AsyncStorage 持久化
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cleanstreak_settings_biometric';

interface SettingsState {
  biometricEnabled: boolean;
  hydrated: boolean;
  setBiometric: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  biometricEnabled: false,
  hydrated: false,
  setBiometric: (v) => {
    set({ biometricEnabled: v });
    void AsyncStorage.setItem(KEY, v ? '1' : '0');
  },
}));

void (async () => {
  try {
    const v = await AsyncStorage.getItem(KEY);
    useSettingsStore.setState({ biometricEnabled: v === '1', hydrated: true });
  } catch {
    useSettingsStore.setState({ hydrated: true });
  }
})();
