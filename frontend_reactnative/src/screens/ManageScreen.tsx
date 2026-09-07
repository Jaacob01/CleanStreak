/**
 * 管理页：习惯管理 + 任务管理，分段切换
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen, Header, T } from '../ui/components';
import { useTheme } from '../hooks/useTheme';
import HabitsScreen from './HabitsScreen';
import { TaskManagePanel } from '../ui/TaskManagePanel';
import type { RootNav } from '../navigation/types';

type TabType = 'habits' | 'tasks';

export default function ManageScreen() {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const [tab, setTab] = useState<TabType>('habits');

  return (
    <Screen>
      <Header
        title="管理"
        back
        right={
          tab === 'habits' ? (
            <Pressable
              hitSlop={8}
              onPress={() => navigation.navigate('HabitEdit', {})}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            >
              <Ionicons name="add-circle-sharp" size={26} color={colors.primary} />
            </Pressable>
          ) : undefined
        }
      />

      {/* 分段切换 */}
      <View style={tabsStyles.wrap}>
        <View pointerEvents="none" style={[tabsStyles.shadow, { backgroundColor: colors.ink }]} />
        <View style={[tabsStyles.row, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
          <Pressable
            onPress={() => setTab('habits')}
            style={({ pressed }) => [
              tabsStyles.seg,
              tabsStyles.segDivider,
              tab === 'habits' && { backgroundColor: colors.accent },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="grid-outline" size={13} color={colors.ink} />
            <T variant="cap" color={colors.ink} style={tabsStyles.segText}>习惯管理</T>
          </Pressable>
          <Pressable
            onPress={() => setTab('tasks')}
            style={({ pressed }) => [
              tabsStyles.seg,
              tab === 'tasks' && { backgroundColor: colors.accent },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="clipboard-outline" size={13} color={colors.ink} />
            <T variant="cap" color={colors.ink} style={tabsStyles.segText}>任务管理</T>
          </Pressable>
        </View>
      </View>

      {/* 内容区 */}
      {tab === 'habits' ? <HabitsScreen embedded /> : <TaskManagePanel active={tab === 'tasks'} />}
    </Screen>
  );
}

const tabsStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    paddingRight: 20,
  },
  shadow: { position: 'absolute', top: 14, left: 20, right: 4, bottom: 8 },
  row: { flexDirection: 'row', borderWidth: 2 },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  segDivider: { borderRightWidth: 2, borderRightColor: '#141414' },
  segText: { letterSpacing: 1 },
});
