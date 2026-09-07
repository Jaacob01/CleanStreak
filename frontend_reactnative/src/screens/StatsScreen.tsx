/**
 * 统计页：习惯统计 + 任务统计 + AI 分析，分段切换
 * streak 指标 / 月度热力图 / 星期分布 / 最近记录 / AI 智能分析
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen, Header, T, Card, Divider, SectionHeader, EmptyState,
} from '../ui/components';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/auth';
import { TabBarSpacer } from '../ui/TabBarSpacer';
import { TaskStatsPanel } from '../ui/TaskStatsPanel';
import { AIAnalysisPanel } from '../ui/AIAnalysisPanel';
import { getAllEntries, getHabits } from '../db';
import { Habit, HabitEntry } from '../db/types';
import {
  computeStats, dayState, describeGoal, habitStartDate, isScheduledDay,
  recentDayStates, todayString, weekdayOf, WEEKDAY_NAMES,
} from '../db/logic';
import { habitColor } from '../theme';
import type { RootNav } from '../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;
type StateColor = { bg: string; icon: IconName | null; iconColor: string };

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

type StatsTab = 'habits' | 'tasks' | 'ai';

export default function StatsScreen() {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState<StatsTab>('habits');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entriesByHabit, setEntriesByHabit] = useState<Map<number, HabitEntry[]>>(new Map());
  const [selected, setSelected] = useState<number | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [hs, es] = await Promise.all([getHabits(user.id, true), getAllEntries(user.id)]);
    const byHabit = new Map<number, HabitEntry[]>();
    for (const e of es) {
      const arr = byHabit.get(e.habit_id) ?? [];
      arr.push(e);
      byHabit.set(e.habit_id, arr);
    }
    setHabits(hs);
    setEntriesByHabit(byHabit);
    setLoaded(true);
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const activeHabits = habits.filter(h => !h.archived);
  const habit = selected != null ? habits.find(h => h.id === selected) ?? null : null;

  const statsOf = useCallback((h: Habit) =>
    computeStats(h, entriesByHabit.get(h.id) ?? [], todayString()), [entriesByHabit]);

  return (
    <Screen>
      <Header title="统计分析" back={false} />

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
            <Ionicons name="flame-sharp" size={13} color={colors.ink} />
            <T variant="cap" color={colors.ink} style={tabsStyles.segText}>习惯</T>
          </Pressable>
          <Pressable
            onPress={() => setTab('tasks')}
            style={({ pressed }) => [
              tabsStyles.seg,
              tabsStyles.segDivider,
              tab === 'tasks' && { backgroundColor: colors.accent },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="checkbox-outline" size={13} color={colors.ink} />
            <T variant="cap" color={colors.ink} style={tabsStyles.segText}>任务</T>
          </Pressable>
          <Pressable
            onPress={() => setTab('ai')}
            style={({ pressed }) => [
              tabsStyles.seg,
              tab === 'ai' && { backgroundColor: colors.accent },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="sparkles" size={13} color={colors.ink} />
            <T variant="cap" color={colors.ink} style={tabsStyles.segText}>AI</T>
          </Pressable>
        </View>
      </View>

      {tab === 'tasks' ? (
        <TaskStatsPanel active={tab === 'tasks'} />
      ) : tab === 'ai' ? (
        <AIAnalysisPanel active={tab === 'ai'} />
      ) : (
        <HabitStatsContent
          habits={habits}
          activeHabits={activeHabits}
          entriesByHabit={entriesByHabit}
          selected={selected}
          setSelected={setSelected}
          habit={habit}
          statsOf={statsOf}
          loaded={loaded}
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
          navigation={navigation}
        />
      )}
    </Screen>
  );
}

/** 习惯统计内容 */
function HabitStatsContent({
  habits, activeHabits, entriesByHabit, selected, setSelected, habit, statsOf,
  loaded, year, month, setYear, setMonth, navigation,
}: any) {
  const colors = useTheme();
  const now = new Date();
  const today = todayString();

  if (loaded && habits.length === 0) {
    return <EmptyState icon="stats-chart-sharp" title="暂无数据" sub="先去「管理」页创建一个习惯吧" />;
  }

  return (
    <>
      {/* 习惯选择 chips */}
      <View style={[styles.chipBar, { borderBottomColor: colors.ink }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="总览" active={selected === null} onPress={() => setSelected(null)} />
          {activeHabits.map((h: Habit) => (
            <Chip
              key={h.id}
              label={`${h.emoji} ${h.name}`}
              active={selected === h.id}
              onPress={() => setSelected(h.id)}
            />
          ))}
        </ScrollView>
      </View>

      {habit ? (
        <HabitDetail
          key={habit.id}
          habit={habit}
          entries={entriesByHabit.get(habit.id) ?? []}
          stats={statsOf(habit)}
          year={year}
          month={month}
          onPrevMonth={() => { if (month === 1) { setYear((y: number) => y - 1); setMonth(12); } else setMonth((m: number) => m - 1); }}
          onNextMonth={() => { if (month === 12) { setYear((y: number) => y + 1); setMonth(1); } else setMonth((m: number) => m + 1); }}
          onJumpToday={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
          onOpenDay={(date: string) => navigation.navigate('Day', { date })}
        />
      ) : (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {activeHabits.map((h: Habit) => {
            const st = statsOf(h);
            const recent = recentDayStates(h, entriesByHabit.get(h.id) ?? [], 7, today);
            return (
              <Card key={h.id} onPress={() => setSelected(h.id)} style={styles.overviewRow}>
                <View style={styles.overviewMain}>
                  <View style={[styles.overviewEmoji, { backgroundColor: habitColor(h.color).bg, borderColor: colors.ink }]}>
                    <T variant="body" style={styles.overviewEmojiText}>{h.emoji}</T>
                  </View>
                  <View style={styles.overviewTexts}>
                    <T variant="title" numberOfLines={1}>{h.name}</T>
                    <T variant="cap" style={styles.overviewSub}>{describeGoal(h)}</T>
                  </View>
                  <View style={styles.overviewStreak}>
                    <Ionicons name="flame" size={14} color={colors.primary} />
                    <T variant="mono" style={styles.overviewStreakNum}>{st.currentStreak}</T>
                  </View>
                </View>
                <View style={styles.dotsRow}>
                  {recent.map((r: any) => {
                    const sc = stateColor(r.state, colors);
                    return (
                      <View
                        key={r.date}
                        style={[styles.dot, { backgroundColor: sc.bg, borderColor: colors.ink }, sc.icon && styles.dotMarked]}
                      >
                        {sc.icon ? <Ionicons name={sc.icon} size={8} color={sc.iconColor} /> : null}
                      </View>
                    );
                  })}
                  <T variant="cap" style={styles.overviewRate}>{st.successRate}%</T>
                </View>
              </Card>
            );
          })}
          <TabBarSpacer />
        </ScrollView>
      )}
    </>
  );
}

/** 判定结果 → 格子配色 */
function stateColor(state: string, colors: ReturnType<typeof useTheme>): StateColor {
  switch (state) {
    case 'success': return { bg: colors.success, icon: 'checkmark-sharp', iconColor: colors.ink };
    case 'partial': return { bg: colors.accent, icon: 'remove-sharp', iconColor: colors.ink };
    case 'fail': return { bg: colors.danger, icon: 'close-sharp', iconColor: colors.ink };
    default: return { bg: colors.surfaceAlt, icon: null, iconColor: colors.subtext };
  }
}

/** 单习惯深视图 */
function HabitDetail({ habit, entries, stats, year, month, onPrevMonth, onNextMonth, onJumpToday, onOpenDay }: {
  habit: Habit;
  entries: HabitEntry[];
  stats: ReturnType<typeof computeStats>;
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onJumpToday: () => void;
  onOpenDay: (date: string) => void;
}) {
  const colors = useTheme();
  const today = todayString();
  const c = habitColor(habit.color);
  const now = new Date();

  const byDate = useMemo(() => new Map(entries.map(e => [e.date, e])), [entries]);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  let monthSuccess = 0;
  let monthFail = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    if (date > today) break;
    const st = dayState(habit, byDate.get(date), date, today);
    if (st === 'success') monthSuccess++;
    else if (st === 'fail' || st === 'partial') monthFail++;
  }

  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const maxWeekday = Math.max(...stats.weekday, 1);

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {/* streak 主卡 */}
      <View style={styles.heroWrap}>
        <View pointerEvents="none" style={[styles.heroShadow, { backgroundColor: colors.ink }]} />
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
          <View style={[styles.heroIconBox, { backgroundColor: c.bg, borderColor: colors.ink }]}>
            <T variant="body" style={styles.heroEmoji}>{habit.emoji}</T>
          </View>
          <View style={styles.heroMain}>
            <T variant="cap" color={colors.subtext} numberOfLines={1}>
              {habit.name} · 当前连续{habit.direction === 'negative' ? '保持' : '达成'}
            </T>
            <View style={styles.heroNumRow}>
              <T variant="mono" style={[styles.heroNum, { color: colors.primary }]}>{stats.currentStreak}</T>
              <T variant="cap" color={colors.subtext}>天（历史最长 {stats.longestStreak} 天）</T>
            </View>
          </View>
        </View>
      </View>

      {/* 指标行 */}
      <View style={styles.metricsRow}>
        <MetricCard label="历史达成" value={`${stats.totalSuccess}天`} bg={colors.success} />
        <MetricCard label={habit.direction === 'negative' ? '失守' : '未达成'} value={`${stats.totalFail}天`} bg={stats.totalFail > 0 ? colors.danger : colors.surface} />
        <MetricCard label="达成率" value={`${stats.successRate}%`} bg={colors.info} />
      </View>

      <Divider />

      {/* 月度热力图 */}
      <View style={styles.monthNav}>
        <NavBtn name="chevron-back" onPress={onPrevMonth} />
        <T variant="h2">{year}年 {MONTH_NAMES[month - 1]}</T>
        <View style={styles.monthNavRight}>
          {!isCurrentMonth && <NavBtn name="today-outline" accent onPress={onJumpToday} />}
          <NavBtn name="chevron-forward" onPress={onNextMonth} />
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
            const isFuture = date > today;
            const st = dayState(habit, byDate.get(date), date, today);
            const sc = stateColor(st, colors);
            const isToday = date === today;
            const notApplicable = isFuture || !isScheduledDay(habit, date) || date < habitStartDate(habit);
            return (
              <Pressable
                key={date}
                disabled={isFuture}
                onPress={() => onOpenDay(date)}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    backgroundColor: notApplicable ? colors.surface : sc.bg,
                    borderColor: isToday ? colors.primary : colors.ink,
                    borderWidth: isToday ? 2 : 1,
                    opacity: notApplicable ? 0.55 : 1,
                  },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <T variant="cap" style={styles.cellDay}>{day}</T>
                {!notApplicable && sc.icon ? (
                  <Ionicons name={sc.icon} size={10} color={sc.iconColor} />
                ) : (
                  <View style={styles.cellSpacer} />
                )}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <LegendDot bg={colors.success} icon="checkmark-sharp" label="达成" />
          <LegendDot bg={colors.accent} icon="remove-sharp" label="部分" />
          <LegendDot bg={colors.danger} icon="close-sharp" label={habit.direction === 'negative' ? '失守' : '未达成'} />
          <LegendDot bg={colors.surfaceAlt} icon={null} label="未安排" />
          <T variant="cap" style={styles.legendMonth}>本月达成 {monthSuccess} · 未达 {monthFail}</T>
        </View>
      </Card>

      <Divider />

      {/* 星期分布 */}
      <SectionHeader icon="calendar-outline" text={habit.direction === 'negative' ? '失守星期分布' : '达成星期分布'} />
      <Card>
        {WEEKDAY_NAMES.map((w, i) => {
          const count = stats.weekday[i] ?? 0;
          return (
            <View key={w} style={styles.barRow}>
              <T variant="mono" style={styles.barLabel}>周{w}</T>
              <View style={[styles.barBg, { borderColor: colors.ink }]}>
                <View style={{
                  width: `${(count / maxWeekday) * 100}%`,
                  height: '100%',
                  backgroundColor: habit.direction === 'negative' ? colors.danger : colors.success,
                }} />
              </View>
              <T variant="mono" color={colors.subtext} style={styles.barNum}>{count}</T>
            </View>
          );
        })}
      </Card>

      <Divider />

      {/* 最近记录 */}
      <SectionHeader icon="time-outline" text="最近记录" />
      {recent.length === 0 ? (
        <Card><T variant="body" color={colors.subtext}>暂无记录</T></Card>
      ) : (
        recent.map(e => {
          const meta = [
            habit.enable_tags && e.tags.length > 0 ? e.tags.join(' · ') : null,
            e.notes,
          ].filter(Boolean).join(' | ');
          return (
            <Card key={e.id} onPress={() => onOpenDay(e.date)} style={styles.recentRow}>
              <T variant="mono" style={styles.recentDate}>{e.date.slice(5)} 周{WEEKDAY_NAMES[weekdayOf(e.date)]}</T>
              <View style={styles.recentRight}>
                <T variant="mono" color={colors.subtext}>
                  {habit.goal_type === 'check'
                    ? (habit.direction === 'positive' ? '打卡' : '记录')
                    : `${e.value}${habit.unit ? ` ${habit.unit}` : ''}`}
                </T>
                <Ionicons name="chevron-forward" size={14} color={colors.subtext} />
              </View>
              {meta ? <T variant="cap" style={styles.recentMeta} numberOfLines={1}>{meta}</T> : null}
            </Card>
          );
        })
      )}
      <TabBarSpacer />
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

function MetricCard({ label, value, bg }: { label: string; value: string; bg: string }) {
  const colors = useTheme();
  return (
    <View style={styles.metricWrap}>
      <View pointerEvents="none" style={[styles.metricShadow, { backgroundColor: colors.ink }]} />
      <View style={[styles.metricCard, { backgroundColor: bg, borderColor: colors.ink }]}>
        <T variant="cap" color={colors.subtext}>{label}</T>
        <T variant="h2" style={styles.metricValue}>{value}</T>
      </View>
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

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? colors.accent : colors.surface, borderColor: colors.ink },
        pressed && { opacity: 0.7 },
      ]}
    >
      <T variant="cap" color={colors.ink} style={styles.chipText}>{label}</T>
    </Pressable>
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

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  // chips
  chipBar: { borderBottomWidth: 2 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 2 },
  chipText: { letterSpacing: 0.5, textTransform: 'none', fontSize: 12 },
  // 总览行
  overviewRow: { marginBottom: 10 },
  overviewMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  overviewEmoji: { width: 38, height: 38, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  overviewEmojiText: { fontSize: 17, lineHeight: 21 },
  overviewTexts: { flex: 1 },
  overviewSub: { marginTop: 2, textTransform: 'none', letterSpacing: 0 },
  overviewStreak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  overviewStreakNum: { fontSize: 18, fontWeight: '900' },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  dot: { width: 18, height: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dotMarked: { borderWidth: 1 },
  overviewRate: { marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 },
  // hero
  heroWrap: { paddingRight: 4, paddingBottom: 4, marginBottom: 12 },
  heroShadow: { position: 'absolute', top: 4, left: 4, right: 0, bottom: 0 },
  heroCard: { borderWidth: 2, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  heroIconBox: { width: 44, height: 44, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 20, lineHeight: 24 },
  heroMain: { flex: 1 },
  heroNumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  heroNum: { fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -2 },
  // 指标
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricWrap: { flex: 1, paddingRight: 3, paddingBottom: 3 },
  metricShadow: { position: 'absolute', top: 3, left: 3, right: 0, bottom: 0 },
  metricCard: {
    flex: 1, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center',
  },
  metricValue: { fontSize: 16, marginTop: 4 },
  // 月份导航 + 网格
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
  cellDay: { fontSize: 10, letterSpacing: 0, textTransform: 'none' },
  cellSpacer: { height: 10 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 14, height: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  legendText: { fontSize: 10, letterSpacing: 0, textTransform: 'none' },
  legendMonth: { marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 },
  // 条形图
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { width: 34 },
  barBg: { flex: 1, height: 16, borderWidth: 1, backgroundColor: '#FFFFFF' },
  barNum: { width: 28, textAlign: 'right' },
  // 最近记录
  recentRow: { marginBottom: 8 },
  recentDate: { fontSize: 13 },
  recentRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  recentMeta: { marginTop: 4, textTransform: 'none', letterSpacing: 0 },
});
