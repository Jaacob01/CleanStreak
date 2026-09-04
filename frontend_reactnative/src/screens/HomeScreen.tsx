/**
 * 今日页：顶部双 tab（今日 / 日历），左右滑动切换
 * navbar：标题右侧日期，右上角新建习惯按钮
 *
 * 防抖动设计：滑动过程中不触发任何 JS 渲染，页码与数据刷新都延迟到
 * pager 停靠（onMomentumScrollEnd）后；只有新激活的子页会重载数据。
 */
import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, T } from '../ui/components';
import { useTheme } from '../hooks/useTheme';
import { DayHabitList } from '../ui/DayHabitList';
import { HabitMonthCalendar } from '../ui/HabitMonthCalendar';
import { todayString } from '../db/logic';
import type { RootNav } from '../navigation/types';

const TAB_LABELS = ['今日', '日历'] as const;

export default function HomeScreen() {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);            // 视觉页：tab 高亮 + 标题
  const [activePage, setActivePage] = useState(0); // 停靠页：触发子页数据重载
  const activeRef = useRef(0);
  const pagerRef = useRef<ScrollView>(null);
  const today = todayString();

  const markActive = (idx: number) => {
    if (activeRef.current !== idx) {
      activeRef.current = idx;
      setActivePage(idx);
    }
  };

  const changePage = (p: number) => {
    setPage(p);
    pagerRef.current?.scrollTo({ x: p * width, animated: true });
    // web 上 scrollTo 的滚动事件不可靠，直接标记停靠
    if (Platform.OS === 'web') markActive(p);
  };

  const handleSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const idx = Math.max(0, Math.min(1, Math.round(e.nativeEvent.contentOffset.x / width)));
    setPage(idx);
    markActive(idx);
  };

  return (
    <Screen>
      <Header
        title={page === 0 ? '今日打卡' : '日历'}
        back={false}
        titleExtra={<T variant="cap">{today}</T>}
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

      <PageTabs page={page} onChange={changePage} />

      {/* 左右滑动 pager：仅在停靠时回调，滑动中零 JS 渲染 */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.flex1}
        {...(Platform.OS === 'web'
          ? { onScroll: handleSettle, scrollEventThrottle: 100 }
          : { onMomentumScrollEnd: handleSettle })}
      >
        <View style={[styles.page, { width }]}>
          <DayHabitList date={today} showHero inTabs active={activePage === 0} />
        </View>
        <View style={[styles.page, { width }]}>
          <HabitMonthCalendar active={activePage === 1} />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** 分段 tab：墨框容器 + 硬阴影，选中段黄底 */
function PageTabs({ page, onChange }: { page: number; onChange: (p: number) => void }) {
  const colors = useTheme();
  return (
    <View style={tabsStyles.wrap}>
      <View pointerEvents="none" style={[tabsStyles.shadow, { backgroundColor: colors.ink }]} />
      <View style={[tabsStyles.row, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
        {TAB_LABELS.map((label, i) => {
          const active = page === i;
          return (
            <Pressable
              key={label}
              onPress={() => onChange(i)}
              style={({ pressed }) => [
                tabsStyles.seg,
                i === 0 && tabsStyles.segDivider,
                active && { backgroundColor: colors.accent },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name={i === 0 ? 'flame-sharp' : 'calendar-sharp'}
                size={13}
                color={colors.ink}
              />
              <T variant="cap" color={colors.ink} style={tabsStyles.segText}>{label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  page: { flex: 1 },
});

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
