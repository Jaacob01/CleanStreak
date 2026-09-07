/**
 * 任务统计面板 — 统计页任务 tab
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  T, Card, Divider, SectionHeader, EmptyState,
} from './components';
import { useTheme } from '../hooks/useTheme';
import { TabBarSpacer } from './TabBarSpacer';
import { api_taskStats } from '../api/tasks';
import type { TaskStats } from '../db/types';

const GROUP_COLORS: Record<string, string> = {
  Work: '#4D7CFE', Jac: '#FFD02E', Outsource: '#00C16A',
};

export function TaskStatsPanel({ active }: { active?: boolean }) {
  const colors = useTheme();
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api_taskStats();
      setStats(s);
    } catch {}
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => {
    if (active !== false) void load();
  }, [load, active]));

  if (!loaded) return null;

  if (!stats || stats.total === 0) {
    return (
      <EmptyState icon="bar-chart-outline" title="暂无任务数据" sub="创建任务后可查看统计" />
    );
  }

  const maxGroup = Math.max(...Object.values(stats.by_group).map(g => g.total), 1);
  const maxPri = Math.max(...Object.values(stats.by_priority), 1);
  const PRI_COLORS: Record<string, string> = {
    P0: '#FF4D4D', P1: '#FFD02E', P2: '#4D7CFE', P3: '#A8A093',
  };

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {/* 概览 */}
      <SectionHeader icon="stats-chart-outline" text="概览" />
      <View style={styles.metricsRow}>
        <MetricCard label="本周完成" value={String(stats.completed)} bg={colors.success} />
        <MetricCard label="待完成" value={String(stats.pending)} bg={colors.info} />
        <MetricCard label="完成率" value={`${stats.completion_rate}%`} bg={colors.accent} />
      </View>

      <Divider />

      {/* 按分组 */}
      <SectionHeader icon="folder-outline" text="按分组" />
      <Card>
        {Object.entries(stats.by_group).map(([group, data]) => (
          <View key={group} style={styles.barRow}>
            <T variant="mono" style={styles.barLabel}>{group}</T>
            <View style={[styles.barBg, { borderColor: colors.ink }]}>
              <View style={{
                width: `${(data.total / maxGroup) * 100}%`,
                height: '100%',
                backgroundColor: GROUP_COLORS[group] ?? colors.info,
              }} />
            </View>
            <T variant="mono" color={colors.subtext} style={styles.barNum}>{data.total}</T>
          </View>
        ))}
      </Card>

      <Divider />

      {/* 按优先级 */}
      <SectionHeader icon="flag-outline" text="按优先级" />
      <Card>
        {['P0', 'P1', 'P2', 'P3'].map(pri => {
          const count = stats.by_priority[pri] ?? 0;
          return (
            <View key={pri} style={styles.barRow}>
              <T variant="mono" style={styles.barLabel}>{pri}</T>
              <View style={[styles.barBg, { borderColor: colors.ink }]}>
                <View style={{
                  width: `${(count / maxPri) * 100}%`,
                  height: '100%',
                  backgroundColor: PRI_COLORS[pri] ?? colors.info,
                }} />
              </View>
              <T variant="mono" color={colors.subtext} style={styles.barNum}>{count}</T>
            </View>
          );
        })}
      </Card>

      {/* 存活提醒 */}
      {stats.max_age_days > 7 && (
        <>
          <Divider />
          <Card>
            <T variant="body" color={colors.danger}>
              ⚠️ 最长存活任务已达 {stats.max_age_days} 天，建议检查是否阻塞
            </T>
          </Card>
        </>
      )}

      <TabBarSpacer />
    </ScrollView>
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

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricWrap: { flex: 1, paddingRight: 3, paddingBottom: 3 },
  metricShadow: { position: 'absolute', top: 3, left: 3, right: 0, bottom: 0 },
  metricCard: {
    flex: 1, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center',
  },
  metricValue: { fontSize: 16, marginTop: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { width: 60 },
  barBg: { flex: 1, height: 16, borderWidth: 1, backgroundColor: '#FFFFFF' },
  barNum: { width: 28, textAlign: 'right' },
});
