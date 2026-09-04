/**
 * 打卡卡片：某习惯在某天的记录展示与快捷操作
 * 正向/反向 × 简单打卡/数量目标 四种形态共用
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  T, Badge, BadgeTone, PrimaryButton, GhostButton, Input, MultiSelect,
} from './components';
import { useTheme } from '../hooks/useTheme';
import { useToast } from './toast';
import { confirmAsync } from './confirm';
import { habitColor } from '../theme';
import { Habit, HabitEntry } from '../db/types';
import { bumpEntryValue, deleteEntry, saveEntry, toggleCheckEntry } from '../db';
import {
  dayState, describeFrequency, describeGoal, isScheduledDay, todayString,
} from '../db/logic';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  habit: Habit;
  date: string;
  entry: HabitEntry | null;
  streak?: number;
  onChanged: () => void;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function EntryCard({ habit, date, entry, streak, onChanged }: Props) {
  const colors = useTheme();
  const toast = useToast();
  const c = habitColor(habit.color);
  const scheduled = isScheduledDay(habit, date);
  const st = dayState(habit, entry ?? undefined, date, todayString());
  const canDetail = (habit.enable_tags && habit.tags.length > 0) || habit.enable_notes;
  const showExpand = canDetail || habit.goal_type === 'count';
  const isRelapseForm = habit.direction === 'negative' && habit.goal_type === 'check' && !entry;

  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [valueText, setValueText] = useState('0');
  const [busy, setBusy] = useState(false);

  const metaKey = `${entry?.id ?? 0}|${entry?.value ?? 0}|${entry?.notes ?? ''}|${(entry?.tags ?? []).join('|')}`;
  useEffect(() => {
    setNotes(entry?.notes ?? '');
    setTags(entry?.tags ?? []);
    setValueText(entry ? String(entry.value) : '0');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaKey]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const doToggle = () => void run(async () => {
    const nowDone = await toggleCheckEntry(habit, date);
    void Haptics.notificationAsync(
      nowDone ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    );
    toast.show(nowDone ? '已打卡' : '已撤销打卡', nowDone ? 'success' : 'info');
    onChanged();
  });

  const doRecord = () => {
    if (canDetail) { setExpanded(true); return; }
    void run(async () => {
      await saveEntry(habit.user_id, habit.id, date, { value: 1 });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('已记录', 'info');
      onChanged();
    });
  };

  const doUndo = () => void run(async () => {
    const ok = await confirmAsync('撤销记录', '确定撤销这条记录？', '撤销');
    if (!ok) return;
    await deleteEntry(habit.id, date);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toast.show('已撤销', 'info');
    onChanged();
  });

  const doBump = (delta: number) => void run(async () => {
    await bumpEntryValue(habit, date, delta);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChanged();
  });

  const doSaveMeta = () => void run(async () => {
    if (habit.goal_type === 'count') {
      const v = parseFloat(valueText);
      if (Number.isNaN(v) || v <= 0) {
        if (entry) await deleteEntry(habit.id, date);
      } else {
        await saveEntry(habit.user_id, habit.id, date, { value: v, tags, notes });
      }
    } else {
      await saveEntry(habit.user_id, habit.id, date, { value: 1, tags, notes });
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.show('已保存', 'success');
    setExpanded(false);
    onChanged();
  });

  // ---- 视觉状态 ----

  const badge = (): { text: string; tone: BadgeTone } => {
    if (st === 'success') {
      return habit.direction === 'positive'
        ? { text: '已达成', tone: 'green' }
        : { text: '保持住', tone: 'green' };
    }
    if (st === 'partial') {
      return { text: `进行中 ${fmtNum(entry?.value ?? 0)}/${fmtNum(habit.target_value)}`, tone: 'yellow' };
    }
    if (st === 'fail') {
      return habit.direction === 'positive'
        ? { text: '未完成', tone: 'red' }
        : { text: habit.goal_type === 'count' ? '超限' : '已失守', tone: 'red' };
    }
    if (st === 'pending') {
      return habit.direction === 'positive' ? { text: '待打卡', tone: 'gray' } : { text: '保持中', tone: 'gray' };
    }
    return { text: '未安排', tone: 'gray' };
  };

  const b = badge();
  const emojiBg = st === 'fail' ? colors.danger : st === 'success' ? c.bg : c.dim;

  // 数量目标进度条
  const showProgress = habit.goal_type === 'count';
  const progress = showProgress ? (() => {
    const cur = entry?.value ?? 0;
    const pct = Math.min(100, Math.round((cur / Math.max(habit.target_value, 0.01)) * 100));
    const fill = habit.direction === 'positive'
      ? (cur >= habit.target_value ? colors.success : colors.accent)
      : (cur > habit.target_value ? colors.danger : colors.success);
    return { pct, fill };
  })() : null;

  const hasMetaSummary = !!entry && ((entry.tags.length > 0 && habit.enable_tags) || !!entry.notes);

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={[styles.shadow, { backgroundColor: colors.ink }]} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.ink }, !scheduled && { opacity: 0.75 }]}>
        {/* 头部 */}
        <View style={styles.header}>
          <View style={[styles.emojiBox, { backgroundColor: emojiBg, borderColor: colors.ink }]}>
            <T variant="body" style={styles.emoji}>{habit.emoji}</T>
          </View>
          <View style={styles.titleCol}>
            <T variant="title" numberOfLines={1}>{habit.name}</T>
            <T variant="cap" style={styles.goalLine}>{describeGoal(habit)} · {describeFrequency(habit)}</T>
          </View>
          <View style={styles.rightCol}>
            {streak !== undefined && streak > 0 && (
              <View style={[styles.streakChip, { borderColor: colors.ink }]}>
                <Ionicons name="flame" size={11} color={colors.primary} />
                <T variant="cap" style={styles.streakText}>{streak}天</T>
              </View>
            )}
            {showExpand && (
              <Pressable
                hitSlop={6}
                onPress={() => setExpanded(e => !e)}
                style={({ pressed }) => [
                  styles.expandBtn,
                  { borderColor: colors.ink },
                  expanded && { backgroundColor: colors.accent },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name={expanded ? 'chevron-up' : 'create-outline'} size={14} color={colors.ink} />
              </Pressable>
            )}
          </View>
        </View>

        {/* 状态行 */}
        <View style={styles.statusRow}>
          <Badge text={b.text} tone={b.tone} />
        </View>

        {progress && (
          <View style={[styles.progressBg, { borderColor: colors.ink, backgroundColor: colors.surfaceAlt }]}>
            <View style={{ width: `${progress.pct}%`, backgroundColor: progress.fill, height: '100%' }} />
          </View>
        )}

        {/* 操作区 */}
        {habit.goal_type === 'check' ? (
          habit.direction === 'positive' ? (
            entry ? (
              <View style={styles.actionRow}>
                <GhostButton title="已完成 · 点击撤销" icon="checkmark-sharp" onPress={doToggle} />
              </View>
            ) : (
              <PrimaryButton title="完成打卡" icon="checkmark-sharp" onPress={doToggle} loading={busy} />
            )
          ) : entry ? (
            <View style={styles.actionRow}>
              <View style={styles.grow}>
                <GhostButton title="撤销记录" icon="arrow-undo-sharp" onPress={doUndo} />
              </View>
            </View>
          ) : (
            <PrimaryButton title="记录一次" icon="warning-sharp" danger onPress={doRecord} loading={busy} />
          )
        ) : (
          <View style={styles.counterRow}>
            <StepBtn icon="remove" disabled={(entry?.value ?? 0) <= 0 || busy} onPress={() => doBump(-1)} />
            <Pressable
              onPress={() => showExpand && setExpanded(true)}
              style={[styles.counterBox, { borderColor: colors.ink, backgroundColor: colors.surface }]}
            >
              <T variant="mono" style={styles.counterNum}>
                {fmtNum(entry?.value ?? 0)} / {fmtNum(habit.target_value)}{habit.unit ? ` ${habit.unit}` : ''}
              </T>
            </Pressable>
            <StepBtn icon="add" accent={habit.direction === 'negative'} disabled={busy} onPress={() => doBump(1)} />
          </View>
        )}

        {/* 记录详情摘要 */}
        {hasMetaSummary && !expanded && (
          <T variant="cap" style={styles.metaSummary} numberOfLines={2}>
            {[
              habit.enable_tags && entry!.tags.length > 0 ? entry!.tags.join(' · ') : null,
              entry!.notes,
            ].filter(Boolean).join(' | ')}
          </T>
        )}

        {/* 编辑详情 */}
        {expanded && (
          <View style={[styles.metaForm, { borderTopColor: colors.borderLight }]}>
            {habit.goal_type === 'count' && (
              <Input
                label={`数量${habit.unit ? `（${habit.unit}）` : ''}`}
                value={valueText}
                onChangeText={setValueText}
                keyboardType="numeric"
              />
            )}
            {habit.enable_tags && habit.tags.length > 0 && (
              <MultiSelect
                label="标签"
                values={tags}
                options={habit.tags.map(t => ({ label: t, value: t }))}
                onChange={setTags}
              />
            )}
            {habit.enable_notes && (
              <Input label="备注" value={notes} onChangeText={setNotes} placeholder="可选" multiline />
            )}
            <PrimaryButton
              title={isRelapseForm ? '确认记录' : '保 存'}
              icon="checkmark-sharp"
              danger={isRelapseForm}
              loading={busy}
              onPress={() => void doSaveMeta()}
            />
          </View>
        )}
      </View>
    </View>
  );
}

/** 计数步进按钮：墨框方块 + 硬阴影 + 按压下沉 */
function StepBtn({ icon, onPress, disabled, accent }: {
  icon: IconName; onPress: () => void; disabled?: boolean; accent?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.stepWrap, disabled && { opacity: 0.4 }]}>
      <View pointerEvents="none" style={[styles.stepShadow, { backgroundColor: colors.ink }]} />
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.stepBtn,
          {
            backgroundColor: accent ? colors.danger : colors.surface,
            borderColor: colors.ink,
          },
          pressed && styles.stepSink,
        ]}
      >
        <Ionicons name={icon} size={20} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingRight: 4, paddingBottom: 4, marginBottom: 10 },
  shadow: { position: 'absolute', top: 4, left: 4, right: 0, bottom: 0 },
  card: { borderWidth: 2, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emojiBox: {
    width: 42, height: 42, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 20, lineHeight: 24 },
  titleCol: { flex: 1 },
  goalLine: { marginTop: 2, textTransform: 'none', letterSpacing: 0 },
  rightCol: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3,
  },
  streakText: { fontSize: 10, letterSpacing: 0, textTransform: 'none' },
  expandBtn: { width: 26, height: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', marginTop: 10 },
  progressBg: { height: 14, borderWidth: 2, marginTop: 8, overflow: 'hidden' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  grow: { flex: 1 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  counterBox: {
    flex: 1, height: 44, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  counterNum: { fontSize: 16 },
  metaSummary: { marginTop: 8, textTransform: 'none', letterSpacing: 0 },
  metaForm: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  stepWrap: { paddingRight: 2, paddingBottom: 2 },
  stepShadow: { position: 'absolute', top: 2, left: 2, right: 0, bottom: 0 },
  stepBtn: {
    width: 44, height: 44, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepSink: { transform: [{ translateX: 2 }, { translateY: 2 }] },
});
