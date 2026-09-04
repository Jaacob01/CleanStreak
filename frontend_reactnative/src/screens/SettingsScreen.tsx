/**
 * 设置页：安全设置（生物识别）+ 修改密码
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, T, Card, Input, PrimaryButton, BodyScroll, Divider } from '../ui/components';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/auth';
import { useSettingsStore } from '../store/settings';
import { useToast } from '../ui/toast';
import { changePassword } from '../db';

export default function SettingsScreen() {
  const colors = useTheme();
  const user = useAuthStore(s => s.user);
  const toast = useToast();
  const biometricEnabled = useSettingsStore(s => s.biometricEnabled);
  const setBiometric = useSettingsStore(s => s.setBiometric);

  const [canBiometric, setCanBiometric] = useState(false);
  const [bioLabel, setBioLabel] = useState('生物识别');
  const [saving, setSaving] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [has, enrolled, types] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);
        if (!alive) return;
        setCanBiometric(has && enrolled);
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) setBioLabel('Face ID');
        else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) setBioLabel('指纹');
        else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) setBioLabel('虹膜');
      } catch {
        // 不支持则隐藏开关
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleChangePwd = async () => {
    if (!user || saving) return;
    if (!oldPwd || !newPwd || !confirmPwd) { toast.show('请填写完整', 'error'); return; }
    if (newPwd.length < 6) { toast.show('新密码至少 6 位', 'error'); return; }
    if (newPwd === oldPwd) { toast.show('新密码不能与原密码相同', 'error'); return; }
    if (newPwd !== confirmPwd) { toast.show('两次新密码不一致', 'error'); return; }
    setSaving(true);
    try {
      const ok = await changePassword(user.id, oldPwd, newPwd);
      if (ok) {
        toast.show('密码已修改', 'success');
        setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      } else {
        toast.show('原密码错误', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header title="设置" />
      <BodyScroll>
        {/* 安全 */}
        <View style={styles.sectionTitle}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.ink} />
          </View>
          <T variant="title">安全</T>
        </View>

        {canBiometric && (
          <Card style={styles.bioCard}>
            <View style={[styles.bioIcon, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
              <Ionicons name="finger-print" size={18} color={colors.ink} />
            </View>
            <View style={styles.bioTexts}>
              <T variant="title">启动时验证{bioLabel}</T>
              <T variant="cap" style={{ marginTop: 2 }}>离开应用后返回需要验证身份</T>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometric}
              trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
              thumbColor={colors.ink}
            />
          </Card>
        )}

        <Divider />

        {/* 修改密码 */}
        <View style={styles.sectionTitle}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.info, borderColor: colors.ink }]}>
            <Ionicons name="key" size={12} color={colors.ink} />
          </View>
          <T variant="title">修改密码</T>
        </View>
        <Input label="原密码" value={oldPwd} onChangeText={setOldPwd} secure placeholder="输入原密码" />
        <Input label="新密码" value={newPwd} onChangeText={setNewPwd} secure placeholder="至少 6 位" />
        <Input label="确认新密码" value={confirmPwd} onChangeText={setConfirmPwd} secure placeholder="再次输入" />
        <PrimaryButton title="修 改" icon="save-outline" loading={saving} onPress={() => void handleChangePwd()} />
      </BodyScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionIcon: { width: 22, height: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  bioCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bioIcon: { width: 40, height: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  bioTexts: { flex: 1 },
});
