/**
 * 个人页：账号信息、设置、数据导出、关于
 */
import React, { useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, T, Card, Divider, PrimaryButton } from '../ui/components';
import { alertMessage, confirmAsync } from '../ui/confirm';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../ui/toast';
import { useAuthStore } from '../store/auth';
import { TabBarSpacer } from '../ui/TabBarSpacer';
import { getAllEntries, getHabits, todayString } from '../db';
import type { RootNav } from '../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;

export default function ProfileScreen() {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const toast = useToast();

  const [exportOpen, setExportOpen] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [exportCount, setExportCount] = useState(0);

  const doExport = async () => {
    if (!user) return;
    try {
      const [habits, entries] = await Promise.all([
        getHabits(user.id, true),
        getAllEntries(user.id),
      ]);
      setExportJson(JSON.stringify({
        app: 'CleanStreak',
        version: '2.0.0',
        exported_at: new Date().toISOString(),
        user: user.username,
        habit_count: habits.length,
        entry_count: entries.length,
        habits,
        entries,
      }, null, 2));
      setExportCount(entries.length);
      setExportOpen(true);
    } catch {
      toast.show('导出失败', 'error');
    }
  };

  const shareOrCopy = async () => {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(exportJson);
        toast.show('已复制到剪贴板', 'success');
      } catch {
        toast.show('复制失败，请手动选择文本', 'error');
      }
      return;
    }
    try {
      await Share.share({ message: exportJson });
    } catch {
      // 用户取消分享
    }
  };

  const downloadFile = () => {
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleanstreak-${todayString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show('已下载', 'success');
  };

  const showAbout = () => {
    alertMessage(
      '关于 CleanStreak',
      'v2.0.0 · 通用习惯追踪\n\n正向打卡、反向记录，每个习惯独立配置。\n所有数据仅保存在本机，不上传任何服务器。',
    );
  };

  const confirmLogout = async () => {
    const ok = await confirmAsync('退出登录', '确定退出当前账号？', '退出');
    if (ok) logout();
  };

  return (
    <Screen>
      <Header title="我的" back={false} />
      <ScrollView style={styles.flex1} contentContainerStyle={styles.body}>
        {/* 账号卡片 */}
        <Card>
          <View style={styles.userRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
              <Ionicons name="person" size={22} color={colors.ink} />
            </View>
            <View style={styles.userTexts}>
              <T variant="title">{user?.username ?? '—'}</T>
              <T variant="cap" style={{ marginTop: 3 }}>注册于 {user?.created_at?.slice(0, 10) ?? '—'}</T>
            </View>
          </View>
        </Card>

        <Divider />

        <MenuRow
          icon="settings-outline"
          iconBg={colors.info}
          title="设置"
          sub="修改密码、生物识别解锁"
          onPress={() => navigation.navigate('Settings')}
        />
        <MenuRow
          icon="download-outline"
          iconBg={colors.success}
          title="数据导出"
          sub="导出全部习惯与记录为 JSON"
          onPress={() => void doExport()}
        />
        <MenuRow
          icon="information-circle-outline"
          iconBg={colors.accent}
          title="关于 CleanStreak"
          sub="v2.0.0 · 通用习惯追踪"
          onPress={showAbout}
        />

        <View style={styles.logoutWrap}>
          <PrimaryButton title="退出登录" icon="log-out-outline" danger onPress={() => void confirmLogout()} />
        </View>
        <TabBarSpacer />
      </ScrollView>

      {/* 数据导出弹窗 */}
      <Modal visible={exportOpen} transparent animationType="fade" onRequestClose={() => setExportOpen(false)}>
        <Pressable style={[styles.modalMask, { backgroundColor: colors.scrim }]} onPress={() => setExportOpen(false)}>
          <View style={styles.modalShadowWrap}>
            <View pointerEvents="none" style={[styles.modalShadowRect, { backgroundColor: colors.ink }]} />
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.ink }]}
              onPress={() => undefined}
            >
              <View style={styles.modalHeader}>
                <T variant="title">数据导出</T>
                <T variant="cap">{exportCount} 条记录</T>
              </View>
              <TextInput
                value={exportJson}
                editable={false}
                multiline
                style={[
                  styles.exportText,
                  { borderColor: colors.ink, backgroundColor: colors.surfaceAlt, color: colors.text },
                ]}
              />
              <View style={styles.modalActions}>
                <View style={styles.modalBtn}>
                  <PrimaryButton
                    title={Platform.OS === 'web' ? '复制' : '分享'}
                    icon={Platform.OS === 'web' ? 'copy-outline' : 'share-social-outline'}
                    onPress={() => void shareOrCopy()}
                  />
                </View>
                {Platform.OS === 'web' && (
                  <View style={styles.modalBtn}>
                    <PrimaryButton title="下载" icon="download-outline" onPress={downloadFile} />
                  </View>
                )}
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function MenuRow({ icon, iconBg, title, sub, onPress }: {
  icon: IconName; iconBg: string; title: string; sub: string; onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Card onPress={onPress} style={styles.menuCard}>
      <View style={[styles.menuIcon, { backgroundColor: iconBg, borderColor: colors.ink }]}>
        <Ionicons name={icon} size={18} color={colors.ink} />
      </View>
      <View style={styles.menuTexts}>
        <T variant="title">{title}</T>
        <T variant="cap" style={{ marginTop: 2 }}>{sub}</T>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  userTexts: { flex: 1 },
  menuCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIcon: { width: 40, height: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  menuTexts: { flex: 1 },
  logoutWrap: { marginTop: 24 },
  modalMask: { flex: 1, justifyContent: 'center', padding: 24 },
  modalShadowWrap: { paddingRight: 6, paddingBottom: 6 },
  modalShadowRect: { position: 'absolute', top: 6, left: 6, right: 0, bottom: 0 },
  modalCard: { borderWidth: 2, padding: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  exportText: {
    borderWidth: 2,
    padding: 10,
    height: 260,
    fontSize: 11,
    lineHeight: 16,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1 },
});
