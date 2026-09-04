/**
 * 跨平台弹窗工具
 * react-native-web 的 Alert.alert 是空实现，web 端改用浏览器原生 confirm/alert
 */
import { Alert, Platform } from 'react-native';

/** 确认弹窗，resolve(true) 表示用户确认 */
export function confirmAsync(title: string, message?: string, confirmLabel = '确定'): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(message ? `${title}\n${message}` : title);
    return Promise.resolve(ok);
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** 信息提示弹窗 */
export function alertMessage(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
