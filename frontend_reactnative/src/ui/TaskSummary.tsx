/**
 * 任务概要 — 今日模式：前3条待办，超过可跳待办页；
 * 指定日期模式（日历 tab 选中日）：该日期全部任务，已完成折叠在后
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { T, SectionHeader, Card } from './components';
import { useTheme } from '../hooks/useTheme';
import { TaskCard } from './TaskCard';
import { api_listTasks, api_completeTask } from '../api/tasks';
import { todayString } from '../db/logic';
import type { Task } from '../db/types';

export function TaskSummary({
  date,
  onViewAll,
  onTaskPress,
  active,
}: {
  /** 不传 = 今日模式；传具体日期 = 该日期全量模式 */
  date?: string;
  onViewAll?: () => void;
  onTaskPress?: (task: Task) => void;
  active?: boolean;
}) {
  const colors = useTheme();
  const targetDate = date ?? todayString();
  const todayMode = !date;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api_listTasks({ date: targetDate });
      setTasks(list);
    } catch {}
    setLoaded(true);
  }, [targetDate]);

  useFocusEffect(useCallback(() => {
    if (active !== false) void load();
  }, [load, active]));

  const handleToggle = async (task: Task) => {
    try {
      await api_completeTask(task.id, !task.completed);
      void load();
    } catch {}
  };

  if (!loaded) return null;

  const pending = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <SectionHeader icon="checkbox-outline" text={`待办 (${pending.length})`} />
        {todayMode && pending.length > 3 && onViewAll && (
          <Pressable onPress={onViewAll} hitSlop={6}>
            <T variant="cap" color={colors.info} style={styles.viewAll}>
              查看全部 →
            </T>
          </Pressable>
        )}
      </View>

      {todayMode ? (
        pending.length === 0 ? (
          <Card style={styles.emptyCard}>
            <T variant="cap" color={colors.subtext}>暂无待办 🎉</T>
          </Card>
        ) : (
          pending.slice(0, 3).map(task => (
            <TaskCard
              key={task.id}
              task={task}
              compact
              onToggle={() => void handleToggle(task)}
              onPress={() => onTaskPress?.(task)}
            />
          ))
        )
      ) : tasks.length === 0 ? (
        <Card style={styles.emptyCard}>
          <T variant="cap" color={colors.subtext}>当日无任务 🎉</T>
        </Card>
      ) : (
        <>
          {pending.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={() => void handleToggle(task)}
              onPress={() => onTaskPress?.(task)}
            />
          ))}
          {done.length > 0 && (
            <View style={styles.doneSection}>
              <T variant="cap" color={colors.subtext}>已完成 ({done.length})</T>
              {done.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  compact
                  onToggle={() => void handleToggle(task)}
                  onPress={() => onTaskPress?.(task)}
                />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  viewAll: { letterSpacing: 0, textTransform: 'none', marginRight: 16 },
  emptyCard: { paddingVertical: 16, alignItems: 'center' },
  doneSection: { marginTop: 8, opacity: 0.7 },
});
