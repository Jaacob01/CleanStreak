/**
 * 完整待办列表 — HomeScreen 第三页
 * 按分组折叠、筛选、底部快速添加（含项目/分组/优先级）
 */
import React, { useCallback, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { T, SectionHeader, EmptyState, PickerSheet } from './components';
import { useTheme } from '../hooks/useTheme';
import { TaskCard } from './TaskCard';
import { TabBarSpacer } from './TabBarSpacer';
import {
  api_listTasks, api_createTask, api_completeTask, api_carryTasks,
} from '../api/tasks';
import { api_listProjects } from '../api/projects';
import { api_listGroups } from '../api/groups';
import { todayString } from '../db/logic';
import type { Project, Task, TaskGroup } from '../db/types';
import type { RootNav } from '../navigation/types';

const FILTERS = ['全部', '今天', '本周', '已完成'] as const;

export function TaskListPanel({ active }: { active?: boolean }) {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [filter, setFilter] = useState(0);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickGroup, setQuickGroup] = useState('');
  const [quickProject, setQuickProject] = useState('');
  const [projSheetOpen, setProjSheetOpen] = useState(false);
  const [quickPriority, setQuickPriority] = useState(2);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      // 触发 carry-over
      await api_carryTasks(todayString());
      const [list, projs, grps] = await Promise.all([
        api_listTasks({}), api_listProjects(), api_listGroups(),
      ]);
      setTasks(list);
      setProjects(projs);
      setGroups(grps);
      // 快速添加当前分组失效时回退到第一个分组
      setQuickGroup(prev =>
        grps.some(g => g.name === prev) ? prev : (grps[0]?.name ?? ''),
      );
    } catch {}
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => {
    if (active !== false) void load();
  }, [load, active]));

  const today = todayString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const filtered = tasks.filter(t => {
    switch (filter) {
      case 1: return t.date === today && !t.completed;
      case 2: return t.date >= weekAgo && !t.completed;
      case 3: return t.completed;
      default: return !t.completed;
    }
  });

  // 按用户自己的分组聚合（隐藏空分组）
  const grouped = groups.map(g => ({
    group: g,
    tasks: filtered.filter(t => t.group === g.name),
  })).filter(x => x.tasks.length > 0);

  // 快速添加的分组色块
  const quickGroupColor = groups.find(g => g.name === quickGroup)?.color ?? colors.surface;

  const doneTasks = filter === 3 ? [] : tasks.filter(t => t.completed).slice(0, 10);

  const PROJECT_OPTIONS = [
    { label: '无项目', value: '' },
    ...projects.map(p => ({ label: p.name, value: p.name })),
  ];

  const handleToggle = async (task: Task) => {
    try {
      await api_completeTask(task.id, !task.completed);
      void load();
    } catch {}
  };

  const handleQuickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    try {
      await api_createTask({
        title, group: quickGroup || '默认', priority: quickPriority, date: today,
        project: quickProject || undefined,
      });
      setQuickTitle('');
      void load();
    } catch {}
  };

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {/* 筛选栏 */}
      <View style={styles.filterRow}>
        {FILTERS.map((f, i) => (
          <Pressable
            key={f}
            onPress={() => setFilter(i)}
            style={({ pressed }) => [
              styles.filterBtn,
              { backgroundColor: filter === i ? colors.accent : colors.surface, borderColor: colors.ink },
              pressed && { opacity: 0.7 },
            ]}
          >
            <T variant="cap" color={colors.ink} style={styles.filterText}>{f}</T>
          </Pressable>
        ))}
      </View>

      {/* 分组展示 */}
      {loaded && grouped.length === 0 && filter < 3 && (
        <EmptyState icon="checkbox-outline" title="暂无待办" sub="在下方快速添加任务" />
      )}

      {grouped.map(({ group, tasks: gTasks }) => (
        <View key={group.id} style={styles.groupSection}>
          <View style={styles.groupHeader}>
            <View style={[styles.groupDot, { backgroundColor: group.color }]} />
            <T variant="title">{group.name} ({gTasks.length})</T>
          </View>
          {gTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={() => void handleToggle(task)}
              onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
            />
          ))}
        </View>
      ))}

      {/* 已完成 */}
      {filter < 3 && doneTasks.length > 0 && (
        <View style={styles.doneSection}>
          <T variant="cap" color={colors.subtext}>
            已完成 ({doneTasks.length})
          </T>
          {doneTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              compact
              onToggle={() => void handleToggle(task)}
              onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
            />
          ))}
        </View>
      )}

      {/* 快速添加 */}
      <View style={styles.quickWrap}>
        <View style={[styles.quickRow, { borderColor: colors.ink, backgroundColor: colors.surface }]}>
          <TextInput
            value={quickTitle}
            onChangeText={setQuickTitle}
            placeholder="快速添加任务..."
            placeholderTextColor={colors.placeholder}
            style={[styles.quickInput, { color: colors.text }]}
            onSubmitEditing={() => void handleQuickAdd()}
            returnKeyType="done"
          />
          <Pressable
            onPress={() => setProjSheetOpen(true)}
            style={({ pressed }) => [
              styles.quickProjBtn,
              { borderColor: colors.ink },
              pressed && { opacity: 0.7 },
            ]}
          >
            <T variant="cap" color={colors.ink} numberOfLines={1}>{quickProject || '项目'}</T>
          </Pressable>
          <Pressable
            onPress={() => {
              if (groups.length === 0) return;
              const idx = groups.findIndex(g => g.name === quickGroup);
              setQuickGroup(groups[(idx + 1) % groups.length].name);
            }}
            style={[styles.quickGroupBtn, { backgroundColor: quickGroupColor, borderColor: colors.ink }]}
          >
            <T variant="cap" color={colors.ink} numberOfLines={1}>{quickGroup || '分组'}</T>
          </Pressable>
          <Pressable
            onPress={() => setQuickPriority(p => (p + 1) % 4)}
            style={[styles.quickPriBtn, { borderColor: colors.ink }]}
          >
            <T variant="cap" color={colors.ink}>P{quickPriority}</T>
          </Pressable>
          <Pressable
            onPress={() => void handleQuickAdd()}
            style={({ pressed }) => [
              styles.quickAddBtn,
              { backgroundColor: colors.primary, borderColor: colors.ink },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="add-sharp" size={18} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <PickerSheet
        visible={projSheetOpen}
        title="选择项目"
        options={PROJECT_OPTIONS}
        value={quickProject}
        onSelect={(v) => { setQuickProject(v); setProjSheetOpen(false); }}
        onClose={() => setProjSheetOpen(false)}
      />

      <TabBarSpacer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 2 },
  filterText: { letterSpacing: 0.5, textTransform: 'none', fontSize: 11 },
  groupSection: { marginBottom: 14 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  groupDot: { width: 10, height: 10 },
  doneSection: { marginTop: 8, opacity: 0.7 },
  quickWrap: { marginTop: 12 },
  quickRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 2, gap: 0,
  },
  quickInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600' },
  quickGroupBtn: {
    paddingHorizontal: 10, paddingVertical: 10, borderLeftWidth: 2,
  },
  quickProjBtn: {
    maxWidth: 92, paddingHorizontal: 10, paddingVertical: 10, borderLeftWidth: 2,
  },
  quickPriBtn: {
    paddingHorizontal: 10, paddingVertical: 10, borderLeftWidth: 2,
  },
  quickAddBtn: {
    paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: 2,
  },
});
