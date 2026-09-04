/**
 * 登录/注册页：野兽派风格
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type KeyboardEvent as RNKeyboardEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T, Input, PrimaryButton, GhostButton } from '../ui/components';
import { useAuthStore } from '../store/auth';
import { useToast } from '../ui/toast';
import { useTheme } from '../hooks/useTheme';

export default function LoginScreen() {
  const colors = useTheme();
  const signIn = useAuthStore(s => s.signIn);
  const signUp = useAuthStore(s => s.signUp);
  const loggingIn = useAuthStore(s => s.loggingIn);
  const loginError = useAuthStore(s => s.loginError);
  const clearError = useAuthStore(s => s.clearError);
  const toast = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const insets = useSafeAreaInsets();
  // 键盘避让：用原生驱动的 Animated 按键盘自身时长/曲线逐帧移动，替代
  // KeyboardAvoidingView(LayoutAnimation)。后者走 JS 事件回路，首次弹出时
  // 动画起步比键盘慢若干帧，产生跳帧闪烁。SafeAreaView 排除 bottom 边，
  // 底部间距由本动画值统一管理，避免两套补偿互相打架。
  // Android API 30+ edge-to-edge 下系统窗口不再随键盘 resize（adjustResize
  // 被忽略），靠 Did 事件短促上滑；API < 30 系统 resize 正常生效，不再叠加。
  const padBottom = useRef(new Animated.Value(insets.bottom)).current;

  useEffect(() => {
    if (Platform.OS === 'android' && Number(Platform.Version) < 30) return;

    const keyboardEasing = (name?: string) =>
      name === 'easeIn' ? Easing.in(Easing.ease)
        : name === 'easeOut' ? Easing.out(Easing.ease)
        : name === 'linear' ? Easing.linear
        : Easing.inOut(Easing.ease);

    const animate = (e: RNKeyboardEvent, target: number) => {
      Animated.timing(padBottom, {
        toValue: target,
        duration: e.duration > 0 ? e.duration : 250,
        easing: keyboardEasing(e.easing),
        useNativeDriver: true,
      }).start();
    };

    const listeners = [
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        (e: RNKeyboardEvent) =>
          animate(
            e,
            // Android 事件高度已扣除底部系统栏 inset，容器却从屏幕真实底部起算，需加回；
            // iOS 键盘 frame 本身含 home indicator 区域，直接取满高度
            Platform.OS === 'ios'
              ? Math.max(e.endCoordinates.height, insets.bottom)
              : e.endCoordinates.height + insets.bottom,
          ),
      ),
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        (e: RNKeyboardEvent) => animate(e, insets.bottom),
      ),
    ];
    return () => listeners.forEach(l => l.remove());
  }, [insets.bottom, padBottom]);

  const canSubmit = !!username.trim() && !!password && !loggingIn;

  const toggleMode = () => {
    setMode(m => (m === 'login' ? 'register' : 'login'));
    clearError();
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (mode === 'register' && password !== confirm) {
      toast.show('两次密码不一致', 'error');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      toast.show('密码至少 6 位', 'error');
      return;
    }
    const ok = mode === 'login'
      ? await signIn(username.trim(), password)
      : await signUp(username.trim(), password);
    if (ok) toast.show(mode === 'login' ? '登录成功' : '注册成功', 'success');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.flex1, { paddingBottom: padBottom }]}>
        <View style={styles.body}>
          {/* 品牌区:logo 图形 + 硬阴影 */}
          <View style={styles.brand}>
            <View style={styles.brandBoxWrap}>
              <View pointerEvents="none" style={[styles.brandShadow, { backgroundColor: colors.ink }]} />
              <View style={[styles.brandBox, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
                <Image
                  source={require('../../assets/logo-icon.png')}
                  style={styles.brandLogo}
                  resizeMode="contain"
                />
              </View>
            </View>
            <View>
              <T variant="h1" color={colors.primary}>CLEAN</T>
              <T variant="h1" color={colors.danger}>STREAK</T>
            </View>
          </View>
          <T variant="cap" style={styles.slogan}>记录 · 坚持 · 突破</T>

          {/* 表单 */}
          <View style={styles.form}>
            <Input label="用户名" value={username} onChangeText={setUsername} placeholder="输入用户名" required />
            <Input label="密码" value={password} onChangeText={setPassword} placeholder="输入密码" secure required />
            {mode === 'register' && (
              <Input label="确认密码" value={confirm} onChangeText={setConfirm} placeholder="再次输入密码" secure required />
            )}
            {loginError ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-sharp" size={14} color={colors.danger} />
                <T variant="body" color={colors.danger}>{loginError}</T>
              </View>
            ) : null}
            <PrimaryButton
              title={mode === 'login' ? '登 录' : '注 册'}
              icon={mode === 'login' ? 'log-in-outline' : 'person-add-outline'}
              loading={loggingIn}
              disabled={!canSubmit}
              onPress={() => void submit()}
            />
            <View style={styles.switchWrap}>
              <GhostButton
                title={mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
                icon={mode === 'login' ? 'person-add-outline' : 'log-in-outline'}
                onPress={toggleMode}
              />
            </View>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex1: { flex: 1 },
  body: { flex: 1, padding: 26, justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brandBoxWrap: { paddingRight: 4, paddingBottom: 4 },
  brandShadow: { position: 'absolute', top: 4, left: 4, right: 0, bottom: 0 },
  brandBox: { width: 64, height: 64, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  brandLogo: { width: 46, height: 46 },
  slogan: { marginTop: 10, marginBottom: 36, letterSpacing: 4 },
  form: { gap: 4 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  switchWrap: { marginTop: 8, alignItems: 'center' },
});
