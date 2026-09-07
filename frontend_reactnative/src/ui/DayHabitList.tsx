/**
 * 某天的习惯打卡列表（HomeScreen 今日 / DayScreen 任意日期 共用）
 * 可选顶部分组标题：左侧名称 + 右侧当日统计；未生效日习惯归入末尾「今日未安排」区
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { T, EmptyState, PrimaryButton, SectionHeader } from './components';
import { useAuthStore } from '../store/auth';
import { TabBarSpacer } from './TabBarSpacer';
import { EntryCard } from './EntryCard';
import { getAllEntries, getEntriesByDate, getHabits } from '../db';
import { Habit, HabitEntry } from '../db/types';
import { computeStats, dayState, isScheduledDay, todayString } from '../db/logic';
import type { RootNav } from '../navigation/types';

interface Props {
  date: string;
  /** 顶部分组标题（左侧名称 + 右侧统计）；标题随日期自适应（今日 / M月D日） */
  showHeader?: boolean;
  /** 不带自带边距：外层容器已提供 16 边距时使用 */
  flush?: boolean;
  /** 在 Tab 页内使用：边距由外层容器负责，并按悬浮 tab 栏留白；栈内页面（如日期页）自带 16 边距 */
  inTabs?: boolean;
  /** 变化时重新加载（外层界面数据刷新后同步列表） */
  refreshKey?: number;
  /** 所在 pager 页是否处于停靠激活态；从非激活→激活时重载数据 */
  active?: boolean;
}

export function DayHabitList({
  date, showHeader = false, flush = false, inTabs = false, refreshKey = 0, active = true,
}: Props) {
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
  const prevRefresh = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== prevRefresh.current) void load();
    prevRefresh.current = refreshKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

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
  const isTodayDate = date === today;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const dateLabel = dm ? `${Number(dm[2])}月${Number(dm[3])}日` : date;
  const scheduled = habits.filter(h => isScheduledDay(h, date));
  const unscheduled = habits.filter(h => !isScheduledDay(h, date));

  // 当日统计（供分组标题右侧展示）
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
      contentContainerStyle={flush || inTabs ? styles.bodyFlush : styles.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {showHeader && scheduled.length > 0 && (
        <View style={styles.groupHeaderRow}>
          <SectionHeader icon="flame-sharp" text={`${isTodayDate ? '今日' : dateLabel}习惯 (${scheduled.length})`} />
          <T variant="cap" style={styles.groupStats}>
            {fail > 0
              ? `${success}/${scheduled.length} 达标 · 失守 ${fail} 个`
              : isTodayDate && pending === 0
                ? `${success}/${scheduled.length} 达标 · 全部完成`
                : isTodayDate
                  ? `${success}/${scheduled.length} 达标 · 剩 ${pending} 个`
                  : `${success}/${scheduled.length} 达标`}
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
  // inTabs：外层 todayScroll 已提供 16 边距，这里不再叠加；顶部间距由待办区的 marginBottom 给出
  bodyFlush: {},
  empty: { flex: 1, justifyContent: 'center', padding: 16 },
  emptyBtn: { marginTop: 16 },
  // 分组标题（今日 tab）：左名称 + 右统计
  groupHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  groupStats: { textTransform: 'none', letterSpacing: 0, marginRight: 16 },
  unschedWrap: { marginTop: 6 },
  dayPad: { height: 32 },
});
