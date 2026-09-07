/**
 * 习惯管理：列表、排序、归档、删除
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen, Header, T, Card, SectionHeader, EmptyState, IconButton, PrimaryButton,
} from '../ui/components';
import { confirmAsync } from '../ui/confirm';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../ui/toast';
import { useAuthStore } from '../store/auth';
import { TabBarSpacer } from '../ui/TabBarSpacer';
import { deleteHabit, getHabits, moveHabit, updateHabit } from '../db';
import { Habit } from '../db/types';
import { describeFrequency, describeGoal } from '../db/logic';
import { habitColor } from '../theme';
import type { RootNav } from '../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;

export default function HabitsScreen({ embedded }: { embedded?: boolean }) {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const user = useAuthStore(s => s.user);
  const toast = useToast();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setHabits(await getHabits(user.id, true));
    setLoaded(true);
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const active = habits.filter(h => !h.archived);
  const archived = habits.filter(h => h.archived);

  const doArchive = async (h: Habit) => {
    await updateHabit(h.id, { ...h, archived: !h.archived });
    toast.show(h.archived ? '已恢复' : '已归档', 'success');
    void load();
  };

  const doDelete = async (h: Habit) => {
    const ok = await confirmAsync(
      '删除习惯',
      `「${h.name}」及其全部打卡记录将被删除，且无法恢复。`,
      '删除',
    );
    if (!ok) return;
    void HapticsMedium();
    await deleteHabit(h.id);
    toast.show('已删除', 'info');
    void load();
  };

  const doMove = async (h: Habit, dir: -1 | 1) => {
    if (!user) return;
    await moveHabit(user.id, h.id, dir);
    void load();
  };

  return (
    <>
      {!embedded && (
        <Header
          title="习惯管理"
          back={false}
          right={
            <Pressable
              hitSlop={8}
              onPress={() => navigation.navigate('HabitEdit', {})}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            >
              <Ionicons name="add-circle-sharp" size={26} color={colors.primary} />
            </Pressable>
          }
        />
      )}
      <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loaded && habits.length === 0 && (
          <View style={styles.emptyWrap}>
            <EmptyState icon="add-circle-sharp" title="还没有习惯" sub="点击右上角 + 创建第一个习惯" />
          </View>
        )}

        {active.map((h, idx) => (
          <HabitRow
            key={h.id}
            habit={h}
            onEdit={() => navigation.navigate('HabitEdit', { habitId: h.id })}
            onArchive={() => void doArchive(h)}
            onMoveUp={idx > 0 ? () => void doMove(h, -1) : undefined}
            onMoveDown={idx < active.length - 1 ? () => void doMove(h, 1) : undefined}
          />
        ))}

        {archived.length > 0 && (
          <View style={styles.archivedWrap}>
            <SectionHeader icon="archive-outline" text="已归档" />
            {archived.map(h => (
              <View key={h.id} style={styles.archivedRow}>
                <Card style={styles.archivedCard}>
                  <View style={styles.rowMain}>
                    <View style={[styles.emojiBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.ink }]}>
                      <T variant="body" style={styles.emoji}>{h.emoji}</T>
                    </View>
                    <View style={styles.titleCol}>
                      <T variant="title">{h.name}</T>
                      <T variant="cap" style={styles.goalLine}>{describeGoal(h)} · {describeFrequency(h)}</T>
                    </View>
                    <IconButton name="create-outline" onPress={() => navigation.navigate('HabitEdit', { habitId: h.id })} />
                  </View>
                  <View style={styles.archivedActions}>
                    <View style={styles.archivedBtn}>
                      <PrimaryButton title="恢复" icon="arrow-undo-sharp" onPress={() => void doArchive(h)} />
                    </View>
                    <View style={styles.archivedBtn}>
                      <PrimaryButton title="删除" icon="trash-outline" danger onPress={() => void doDelete(h)} />
                    </View>
                  </View>
                </Card>
              </View>
            ))}
          </View>
        )}
        <TabBarSpacer />
      </ScrollView>
    </>
  );
}

async function HapticsMedium() {
  const Haptics = await import('expo-haptics');
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function HabitRow({ habit, onEdit, onArchive, onMoveUp, onMoveDown }: {
  habit: Habit;
  onEdit: () => void;
  onArchive: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const colors = useTheme();
  const c = habitColor(habit.color);
  return (
    <Card onPress={onEdit} style={styles.rowWrap}>
      <View style={[styles.emojiBox, { backgroundColor: c.bg, borderColor: colors.ink }]}>
        <T variant="body" style={styles.emoji}>{habit.emoji}</T>
      </View>
      <View style={styles.titleCol}>
        <T variant="title" numberOfLines={1}>{habit.name}</T>
        <T variant="cap" style={styles.goalLine}>{describeGoal(habit)} · {describeFrequency(habit)}</T>
      </View>
      <View style={styles.actions}>
        {onMoveUp && <IconButton name="arrow-up-sharp" onPress={onMoveUp} />}
        {onMoveDown && <IconButton name="arrow-down-sharp" onPress={onMoveDown} />}
        <IconButton name="archive-outline" onPress={onArchive} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  emojiBox: { width: 40, height: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 18, lineHeight: 22 },
  titleCol: { flex: 1 },
  goalLine: { marginTop: 2, textTransform: 'none', letterSpacing: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  archivedWrap: { marginTop: 18 },
  archivedRow: { paddingRight: 4, paddingBottom: 4, marginBottom: 10 },
  archivedCard: { opacity: 0.85 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  archivedActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  archivedBtn: { flex: 1 },
});
