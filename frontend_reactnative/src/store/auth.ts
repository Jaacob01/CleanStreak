/**
 * 认证状态（Zustand）— JWT + API
 */
import { create } from 'zustand';
import { Platform } from 'react-native';
import { createUser, authenticateUser, getUserById, initDB } from '../db';
import { setToken, api_login, api_register } from '../api';
import { User } from '../db/types';

const TOKEN_KEY = 'cleanstreak_token';

// SecureStore web fallback
async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
  const SecureStore = await import('expo-secure-store');
  return SecureStore.setItemAsync(key, value);
}
async function secureDel(key: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
  const SecureStore = await import('expo-secure-store');
  return SecureStore.deleteItemAsync(key);
}

// 带超时的 Promise
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms)
    ),
  ]);
}

interface AuthState {
  user: User | null;
  hydrated: boolean;
  loggingIn: boolean;
  loginError: string | null;
  initError: string | null;
  signIn: (username: string, password: string) => Promise<boolean>;
  signUp: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  load: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hydrated: false,
  loggingIn: false,
  loginError: null,
  initError: null,

  signIn: async (username, password) => {
    set({ loggingIn: true, loginError: null });
    try {
      const res = await api_login(username, password);
      await secureSet(TOKEN_KEY, res.token);
      setToken(res.token);
      set({ user: { id: res.id, username: res.username, created_at: res.created_at }, loggingIn: false });
      return true;
    } catch (e: any) {
      console.error('[CleanStreak] 登录失败:', e);
      set({ loginError: e?.message ?? '登录失败', loggingIn: false });
      return false;
    }
  },

  signUp: async (username, password) => {
    set({ loggingIn: true, loginError: null });
    try {
      const res = await api_register(username, password);
      await secureSet(TOKEN_KEY, res.token);
      setToken(res.token);
      set({ user: { id: res.id, username: res.username, created_at: res.created_at }, loggingIn: false });
      return true;
    } catch (e: any) {
      console.error('[CleanStreak] 注册失败:', e);
      set({ loginError: e?.message ?? '注册失败', loggingIn: false });
      return false;
    }
  },

  logout: () => {
    void secureDel(TOKEN_KEY);
    setToken(null);
    set({ user: null });
  },

  clearError: () => set({ loginError: null }),

  load: async () => {
    try {
      console.log('[CleanStreak] 初始化...');
      await withTimeout(initDB(), 10000, '初始化');

      const token = await secureGet(TOKEN_KEY);
      if (token) {
        setToken(token);
        try {
          const user = await getUserById(0); // 0 is ignored, uses JWT
          console.log('[CleanStreak] 恢复登录态:', user?.username ?? '无');
          set({ user, hydrated: true });
        } catch {
          // token 过期或无效
          await secureDel(TOKEN_KEY);
          setToken(null);
          set({ hydrated: true });
        }
      } else {
        console.log('[CleanStreak] 无登录态，进入登录页');
        set({ hydrated: true });
      }
    } catch (e: any) {
      console.error('[CleanStreak] 初始化失败:', e);
      set({ hydrated: true, initError: `初始化失败: ${e?.message ?? '未知错误'}` });
    }
  },
}));
