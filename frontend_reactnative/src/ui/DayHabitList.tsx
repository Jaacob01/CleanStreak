/**
 * 某天的习惯打卡列表（HomeScreen 今日 / DayScreen 任意日期 共用）
 * 可选顶部「今日总览」横幅；未生效日习惯归入末尾「今日未安排」区
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { T, EmptyState, PrimaryButton, SectionHeader } from './components';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/auth';
import { TabBarSpacer } from './TabBarSpacer';
import { EntryCard } from './EntryCard';
import { getAllEntries, getEntriesByDate, getHabits } from '../db';
import { Habit, HabitEntry } from '../db/types';
import { computeStats, dayState, isScheduledDay, todayString } from '../db/logic';
import type { RootNav } from '../navigation/types';

interface Props {
  date: string;
  showHero?: boolean;
  /** 在 Tab 页内使用时按悬浮 tab 栏留白；栈内页面（如日期页）用小留白 */
  inTabs?: boolean;
  /** 所在 pager 页是否处于停靠激活态；从非激活→激活时重载数据 */
  active?: boolean;
}

export function DayHabitList({ date, showHero = false, inTabs = false, active = true }: Props) {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const user = useAuthStore(s => s.user);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [streaks, setStreaks] = useState<Map<number, number>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const hs = await getHabits(user.id);
      const es = await getEntriesByDate(user.id, date);
      const all = await getAllEntries(user.id);
      const byHabit = new Map<number, HabitEntry[]>();
      for (const e of all) {
        const arr = byHabit.get(e.habit_id) ?? [];
        arr.push(e);
        byHabit.set(e.habit_id, arr);
      }
      const today = todayString();
      const s = new Map<number, number>();
      for (const h of hs) {
        s.set(h.id, computeStats(h, byHabit.get(h.id) ?? [], today).currentStreak);
      }
      setHabits(hs);
      setEntries(es);
      setStreaks(s);
    } catch (e) {
      console.error('[CleanStreak] 加载失败:', e);
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, [user, date]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const prevActive = useRef(active);
  useEffect(() => {
    if (active && !prevActive.current) void load();
    prevActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (loaded && loadError) {
    return (
      <View style={styles.empty}>
        <EmptyState icon="cloud-offline-outline" title="加载失败" sub="数据库似乎没有响应，可以重试" />
        <View style={styles.emptyBtn}>
          <PrimaryButton title="重试" icon="refresh-sharp" onPress={() => { setLoadError(false); setLoaded(false); void load(); }} />
        </View>
      </View>
    );
  }

  if (loaded && habits.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState
          icon="add-circle-sharp"
          title="还没有习惯"
          sub="点右上角 + 创建第一个习惯"
        />
      </View>
    );
  }

  const entryOf = (h: Habit): HabitEntry | null => entries.find(e => e.habit_id === h.id) ?? null;
  const today = todayString();
  const scheduled = habits.filter(h => isScheduledDay(h, date));
  const unscheduled = habits.filter(h => !isScheduledDay(h, date));

  // 今日总览
  let success = 0;
  let fail = 0;
  let pending = 0;
  for (const h of scheduled) {
    const st = dayState(h, entryOf(h) ?? undefined, date, today);
    if (st === 'success') success++;
    else if (st === 'fail') fail++;
    else if (st === 'pending') pending++;
    else if (st === 'partial') pending++;
  }

  const renderHabit = (h: Habit) => (
    <EntryCard
      key={h.id}
      habit={h}
      date={date}
      entry={entryOf(h)}
      streak={streaks.get(h.id)}
      onChanged={() => void load()}
    />
  );

  return (
    <ScrollView
      style={styles.flex1}
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {showHero && scheduled.length > 0 && (
        <View style={styles.heroWrap}>
          <View pointerEvents="none" style={[styles.heroShadow, { backgroundColor: colors.ink }]} />
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
            <View style={[styles.heroIconBox, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
              <Ionicons name="today-sharp" size={22} color={colors.ink} />
            </View>
            <View style={styles.heroMain}>
              <T variant="cap" color={colors.subtext}>今日进度</T>
              <View style={styles.heroNumRow}>
                <T variant="mono" style={[styles.heroNum, { color: colors.primary }]}>{success}</T>
                <T variant="cap" color={colors.subtext}>/ {scheduled.length} 个习惯达标</T>
              </View>
            </View>
          </View>
          <View style={[styles.heroBar, { borderColor: colors.ink, backgroundColor: colors.surfaceAlt }]}>
            {success > 0 && <View style={{ flex: success, backgroundColor: colors.success }} />}
            {fail > 0 && <View style={{ flex: fail, backgroundColor: colors.danger }} />}
            {pending > 0 && <View style={{ flex: pending, backgroundColor: colors.accent }} />}
            {success + fail + pending === 0 && <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }} />}
          </View>
          <T variant="cap" color={colors.subtext} style={styles.heroFoot}>
            {fail > 0
              ? `失守 ${fail} 个 · 重新开始也没关系`
              : pending === 0 && scheduled.length > 0
                ? '今日全部达标，漂亮！'
                : `还剩 ${pending} 个待完成`}
          </T>
        </View>
      )}

      {scheduled.map(renderHabit)}

      {unscheduled.length > 0 && (
        <View style={styles.unschedWrap}>
          <SectionHeader
            icon="moon-outline"
            text={date === today ? '今日未安排' : '当天未安排'}
          />
          {unscheduled.map(renderHabit)}
        </View>
      )}

      {/* 底部垫片：native 由系统测量真实 tab 栏遮挡；非 Tab 页固定小留白 */}
      {inTabs ? <TabBarSpacer /> : <View style={styles.dayPad} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  empty: { flex: 1, justifyContent: 'center', padding: 16 },
  emptyBtn: { marginTop: 16 },
  // 今日总览
  heroWrap: { marginBottom: 14 },
  heroShadow: { position: 'absolute', top: 4, left: 4, right: 0, bottom: 20 },
  heroCard: {
    borderWidth: 2, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
  },
  heroIconBox: {
    width: 42, height: 42, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  heroMain: { flex: 1 },
  heroNumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 2 },
  heroNum: { fontSize: 32, lineHeight: 36, fontWeight: '900', letterSpacing: -1.5 },
  heroBar: {
    height: 14, borderWidth: 2, borderTopWidth: 0, flexDirection: 'row', overflow: 'hidden',
  },
  heroFoot: { marginTop: 6, textTransform: 'none', letterSpacing: 0 },
  unschedWrap: { marginTop: 6 },
  dayPad: { height: 32 },
});
