/** 日历视图：整月所有习惯的聚合状态网格
 *  点击非选中日期 → 高亮选中；再次点击 → 打卡弹窗
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card, Badge, BadgeTone, GhostButton, EmptyState, SectionHeader } from './components';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/auth';
import { TabBarSpacer } from './TabBarSpacer';
import { EntryCard } from './EntryCard';
import { getEntriesByMonth, getHabits } from '../db';
import { DayState, Habit, HabitEntry } from '../db/types';
import { dayState, todayString, WEEKDAY_NAMES } from '../db/logic';
import { habitColor } from '../theme';
import type { RootNav } from '../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function friendlyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${Number(m[2])}月${Number(m[3])}日 周${WEEKDAY_NAMES[dt.getDay()]}`;
}

function stateBadge(habit: Habit, entry: HabitEntry | null, date: string, today: string): { text: string; tone: BadgeTone } {
  const st: DayState = dayState(habit, entry, date, today);
  if (st === 'success') return habit.direction === 'positive' ? { text: '已达成', tone: 'green' } : { text: '保持住', tone: 'green' };
  if (st === 'partial') return { text: '进行中', tone: 'yellow' };
  if (st === 'fail') return habit.direction === 'positive' ? { text: '未完成', tone: 'red' } : { text: habit.goal_type === 'count' ? '超限' : '已失守', tone: 'red' };
  if (st === 'pending') return habit.direction === 'positive' ? { text: '待打卡', tone: 'gray' } : { text: '保持中', tone: 'gray' };
  return { text: '未安排', tone: 'gray' };
}

interface Props {
  active?: boolean;
}

export function HabitMonthCalendar({ active = false }: Props) {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const user = useAuthStore(s => s.user);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [selectedHabitId, setSelectedHabitId] = useState<number | null>(null);
  const today = todayString();

  const load = useCallback(async () => {
    if (!user) return;
    setHabits(await getHabits(user.id));
    setEntries(await getEntriesByMonth(user.id, year, month));
  }, [user, year, month]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const prevActive = useRef(active);
  useEffect(() => {
    if (active && !prevActive.current) void load();
    prevActive.current = active;
  }, [active]);

  const byDate = useMemo(() => {
    const m = new Map<string, HabitEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [entries]);

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const entryFor = (h: Habit, date: string): HabitEntry | null =>
    (byDate.get(date) ?? []).find(e => e.habit_id === h.id) ?? null;

  const aggregate = (date: string): 'future' | 'calm' | 'success' | 'partial' | 'fail' => {
    if (date > today) return 'future';
    if (habits.length === 0) return 'calm';
    const list = byDate.get(date) ?? [];
    let s = 0, f = 0, p = 0;
    for (const h of habits) {
      const st = dayState(h, list.find(e => e.habit_id === h.id), date, today);
      if (st === 'success') s++;
      else if (st === 'fail') f++;
      else if (st === 'partial') p++;
    }
    if (f > 0) return 'fail';
    if (p > 0) return 'partial';
    if (s > 0) return 'success';
    return 'calm';
  };

  const kindVisual = (kind: 'future' | 'calm' | 'success' | 'partial' | 'fail'): { bg: string; icon: IconName | null } => {
    switch (kind) {
      case 'success': return { bg: colors.success, icon: 'checkmark-sharp' };
      case 'partial': return { bg: colors.accent, icon: 'remove-sharp' };
      case 'fail': return { bg: colors.danger, icon: 'close-sharp' };
      default: return { bg: colors.surfaceAlt, icon: null };
    }
  };

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };
  const jumpToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); };

  /** 点击日期：非选中→选中；已选中→打开弹窗 */
  const handlePressDate = (date: string) => {
    if (focusedDate === date) {
      setModalDate(date);
      setSelectedHabitId(null);
    } else {
      setFocusedDate(date);
    }
  };

  if (habits.length === 0) {
    return (
      <View style={styles.flex1}>
        <EmptyState
          icon="calendar-sharp"
          title="还没有习惯"
          sub="点右上角 + 创建后，这里会显示整月打卡日历"
        />
      </View>
    );
  }

  const selectedHabit = selectedHabitId != null ? habits.find(h => h.id === selectedHabitId) ?? null : null;
  const md = modalDate;

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {/* 月份导航 */}
      <View style={styles.monthNav}>
        <NavBtn name="chevron-back" onPress={prevMonth} />
        <T variant="h2">{year}年 {MONTH_NAMES[month - 1]}</T>
        <View style={styles.monthNavRight}>
          {!isCurrentMonth && <NavBtn name="today-outline" accent onPress={jumpToday} />}
          <NavBtn name="chevron-forward" onPress={nextMonth} />
        </View>
      </View>

      <Card>
        <View style={styles.weekRow}>
          {WEEKDAY_NAMES.map((w, i) => (
            <T key={w} variant="cap" color={i === 0 ? colors.danger : i === 6 ? colors.info : colors.subtext} style={styles.weekCell}>
              {w}
            </T>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) {
              return <View key={`e${i}`} style={[styles.cell, styles.cellEmpty, { borderColor: colors.borderLight }]} />;
            }
            const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
            const kind = aggregate(date);
            const vis = kindVisual(kind);
            const isFuture = date > today;
            const isToday = date === today;
            const isFocused = date === focusedDate;
            return (
              <Pressable
                key={date}
                disabled={isFuture}
                onPress={() => handlePressDate(date)}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    backgroundColor: vis.bg,
                    borderColor: isFocused ? colors.primary : isToday ? colors.info : colors.ink,
                    borderWidth: isFocused ? 3 : isToday ? 2 : 1,
                  },
                  isFuture && { opacity: 0.4 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <T variant="cap" style={[styles.cellDay, isFocused ? { fontWeight: '800' as const } : {}]}>{day}</T>
                {vis.icon ? <Ionicons name={vis.icon} size={9} color={colors.ink} /> : <View style={styles.cellSpacer} />}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <LegendDot bg={colors.success} icon="checkmark-sharp" label="全部达成" />
          <LegendDot bg={colors.accent} icon="remove-sharp" label="有进行中" />
          <LegendDot bg={colors.danger} icon="close-sharp" label="有失守" />
          <LegendDot bg={colors.surfaceAlt} icon={null} label="平静" />
        </View>
      </Card>

      <T variant="cap" color={colors.subtext} style={styles.hint}>
        {focusedDate ? `已选 ${friendlyDate(focusedDate)}，再次点击打开打卡` : '点击日期选中，再次点击打卡'}
      </T>

      <TabBarSpacer />

      {/* 打卡弹窗 */}
      <Modal visible={md !== null} transparent animationType="fade" onRequestClose={() => setModalDate(null)}>
        {md && (
          <Pressable style={[styles.mask, { backgroundColor: colors.scrim }]} onPress={() => setModalDate(null)}>
            <View style={styles.modalWrap}>
              <View pointerEvents="none" style={[styles.modalShadow, { backgroundColor: colors.ink }]} />
              <Pressable
                style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.ink }]}
                onPress={() => undefined}
              >
                {selectedHabit ? (
                  <>
                    <View style={styles.modalHeader}>
                      <Pressable hitSlop={8} onPress={() => setSelectedHabitId(null)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                        <Ionicons name="arrow-back-sharp" size={20} color={colors.text} />
                      </Pressable>
                      <View style={[styles.habitEmoji, { backgroundColor: habitColor(selectedHabit.color).bg, borderColor: colors.ink }]}>
                        <T variant="body" style={styles.habitEmojiText}>{selectedHabit.emoji}</T>
                      </View>
                      <T variant="title" numberOfLines={1} style={styles.modalTitle}>{selectedHabit.name}</T>
                      <T variant="cap">{friendlyDate(md)}</T>
                    </View>
                    <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                      <EntryCard
                        habit={selectedHabit}
                        date={md}
                        entry={entryFor(selectedHabit, md)}
                        onChanged={() => void load()}
                      />
                      <GhostButton
                        title="打开完整日期页"
                        icon="open-outline"
                        onPress={() => {
                          const d = md;
                          setModalDate(null);
                          navigation.navigate('Day', { date: d });
                        }}
                      />
                    </ScrollView>
                  </>
                ) : (
                  <>
                    <View style={styles.modalHeader}>
                      <View style={styles.modalHeaderTexts}>
                        <T variant="title">{friendlyDate(md)}</T>
                        <T variant="cap" style={styles.modalSub}>选择要打卡的习惯</T>
                      </View>
                      <Pressable hitSlop={8} onPress={() => setModalDate(null)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                        <Ionicons name="close-sharp" size={20} color={colors.text} />
                      </Pressable>
                    </View>
                    <ScrollView style={styles.modalScroll}>
                      {habits.map(h => {
                        const b = stateBadge(h, entryFor(h, md), md, today);
                        const st = dayState(h, entryFor(h, md), md, today);
                        const emojiBg = st === 'fail' ? colors.danger : st === 'success' ? habitColor(h.color).bg : habitColor(h.color).dim;
                        return (
                          <Pressable
                            key={h.id}
                            onPress={() => setSelectedHabitId(h.id)}
                            style={({ pressed }) => [styles.habitRow, { borderColor: colors.ink }, pressed && { opacity: 0.7 }]}
                          >
                            <View style={[styles.habitEmoji, { backgroundColor: emojiBg, borderColor: colors.ink }]}>
                              <T variant="body" style={styles.habitEmojiText}>{h.emoji}</T>
                            </View>
                            <View style={styles.habitTexts}>
                              <T variant="title" numberOfLines={1}>{h.name}</T>
                              <T variant="cap" style={styles.habitGoal}>{friendlyDate(md)}</T>
                            </View>
                            <Badge text={b.text} tone={b.tone} />
                            <Ionicons name="chevron-forward" size={14} color={colors.subtext} />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        )}
      </Modal>
    </ScrollView>
  );
}

function LegendDot({ bg, icon, label }: { bg: string; icon: IconName | null; label: string }) {
  const colors = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: bg, borderColor: colors.ink }]}>
        {icon ? <Ionicons name={icon} size={7} color={colors.ink} /> : null}
      </View>
      <T variant="cap" style={styles.legendText}>{label}</T>
    </View>
  );
}

function NavBtn({ name, onPress, accent }: { name: IconName; onPress: () => void; accent?: boolean }) {
  const colors = useTheme();
  return (
    <View style={styles.navWrap}>
      <View pointerEvents="none" style={[styles.navShadow, { backgroundColor: colors.ink }]} />
      <Pressable
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [
          styles.navBtn,
          { backgroundColor: accent ? colors.accent : colors.surface, borderColor: colors.ink },
          pressed && styles.navSink,
        ]}
      >
        <Ionicons name={name} size={16} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  monthNavRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navWrap: { paddingRight: 2, paddingBottom: 2 },
  navShadow: { position: 'absolute', top: 2, left: 2, right: 0, bottom: 0 },
  navBtn: { width: 30, height: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  navSink: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  weekRow: { flexDirection: 'row', marginTop: 2 },
  weekCell: { flex: 1, textAlign: 'center', fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cell: {
    width: '14.28%', aspectRatio: 0.95,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  cellEmpty: { backgroundColor: 'transparent', borderWidth: 1 },
  cellDay: { fontSize: 11, letterSpacing: 0, textTransform: 'none' },
  cellSpacer: { height: 9 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 14, height: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  legendText: { fontSize: 10, letterSpacing: 0, textTransform: 'none' },
  hint: { marginTop: 10, textTransform: 'none', letterSpacing: 0 },
  mask: { flex: 1, justifyContent: 'flex-end' },
  modalWrap: { paddingRight: 0, paddingBottom: 0 },
  modalShadow: { display: 'none' },
  modalCard: { borderWidth: 2, padding: 16, height: '85%', borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  modalHeaderTexts: { flex: 1 },
  modalSub: { marginTop: 2, textTransform: 'none', letterSpacing: 0 },
  modalTitle: { flex: 1 },
  modalScroll: { flex: 1 },
  habitEmoji: {
    width: 38, height: 38, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  habitEmojiText: { fontSize: 17, lineHeight: 21 },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, padding: 10, marginBottom: 10 },
  habitTexts: { flex: 1 },
  habitGoal: { marginTop: 2, textTransform: 'none', letterSpacing: 0 },
});
