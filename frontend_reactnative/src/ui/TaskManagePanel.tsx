/**
 * 管理页任务面板 — 项目管理、全部任务、筛选排序
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { T, EmptyState, PrimaryButton, SectionHeader, IconButton } from './components';
import { confirmAsync } from './confirm';
import { useTheme } from '../hooks/useTheme';
import { useToast } from './toast';
import { TaskCard } from './TaskCard';
import { TabBarSpacer } from './TabBarSpacer';
import { api_listTasks, api_completeTask } from '../api/tasks';
import {
  api_listProjects, api_createProject, api_renameProject, api_deleteProject,
} from '../api/projects';
import {
  api_listGroups, api_createGroup, api_renameGroup, api_deleteGroup,
} from '../api/groups';
import type { Project, Task, TaskGroup } from '../db/types';
import type { RootNav } from '../navigation/types';

const PRI_OPTIONS = ['全部', 'P0', 'P1', 'P2', 'P3'] as const;

export function TaskManagePanel({ active }: { active?: boolean }) {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [newProject, setNewProject] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [renamingGroupId, setRenamingGroupId] = useState<number | null>(null);
  const [groupRenameDraft, setGroupRenameDraft] = useState('');
  const [groupFilterName, setGroupFilterName] = useState('');
  const [priFilter, setPriFilter] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, projs, grps] = await Promise.all([
        api_listTasks({}), api_listProjects(), api_listGroups(),
      ]);
      setTasks(list);
      setProjects(projs);
      setGroups(grps);
    } catch {}
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => {
    if (active !== false) void load();
  }, [load, active]));

  const filtered = tasks.filter(t => {
    if (groupFilterName && t.group !== groupFilterName) return false;
    if (priFilter > 0 && t.priority !== priFilter - 1) return false;
    return true;
  });

  const pending = filtered.filter(t => !t.completed);
  const done = filtered.filter(t => t.completed);

  const handleToggle = async (task: Task) => {
    try {
      await api_completeTask(task.id, !task.completed);
      void load();
    } catch {}
  };

  // ---- 分组管理 ----

  const countOfGroup = (name: string) => tasks.filter(t => t.group === name).length;

  const doAddGroup = async () => {
    const name = newGroup.trim();
    if (!name) return;
    try {
      await api_createGroup(name);
      setNewGroup('');
      toast.show('分组已添加', 'success');
      void load();
    } catch (e: any) {
      toast.show(e?.message || '添加失败', 'error');
    }
  };

  const startRenameGroup = (g: TaskGroup) => {
    setRenamingGroupId(g.id);
    setGroupRenameDraft(g.name);
  };

  const doRenameGroup = async () => {
    const id = renamingGroupId;
    const name = groupRenameDraft.trim();
    setRenamingGroupId(null);
    if (!id || !name) return;
    try {
      await api_renameGroup(id, name);
      toast.show('已重命名，相关任务已同步', 'success');
      void load();
    } catch (e: any) {
      toast.show(e?.message || '重命名失败', 'error');
    }
  };

  const doDeleteGroup = async (g: TaskGroup) => {
    const others = groups.filter(x => x.id !== g.id);
    if (others.length === 0) {
      toast.show('最后一个分组不能删除', 'error');
      return;
    }
    const n = countOfGroup(g.name);
    const ok = await confirmAsync(
      '删除分组',
      n > 0
        ? `「${g.name}」将被删除，组内 ${n} 个任务将移动到「${others[0].name}」。`
        : `「${g.name}」将被删除。`,
      '删除',
    );
    if (!ok) return;
    try {
      await api_deleteGroup(g.id);
      if (groupFilterName === g.name) setGroupFilterName('');
      toast.show('已删除', 'info');
      void load();
    } catch (e: any) {
      toast.show(e?.message || '删除失败', 'error');
    }
  };

  // ---- 项目管理 ----

  const countOfProject = (name: string) => tasks.filter(t => t.project === name).length;

  const doAddProject = async () => {
    const name = newProject.trim();
    if (!name) return;
    try {
      await api_createProject(name);
      setNewProject('');
      toast.show('项目已添加', 'success');
      void load();
    } catch (e: any) {
      toast.show(e?.message || '添加失败', 'error');
    }
  };

  const startRename = (p: Project) => {
    setRenamingId(p.id);
    setRenameDraft(p.name);
  };

  const doRename = async () => {
    const id = renamingId;
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!id || !name) return;
    try {
      await api_renameProject(id, name);
      toast.show('已重命名，相关任务已同步', 'success');
      void load();
    } catch (e: any) {
      toast.show(e?.message || '重命名失败', 'error');
    }
  };

  const doDeleteProject = async (p: Project) => {
    const ok = await confirmAsync(
      '删除项目',
      `「${p.name}」将被删除，项目下的任务会变为「无项目」。`,
      '删除',
    );
    if (!ok) return;
    try {
      await api_deleteProject(p.id);
      toast.show('已删除', 'info');
      void load();
    } catch (e: any) {
      toast.show(e?.message || '删除失败', 'error');
    }
  };

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {/* 分组管理 */}
      <View style={styles.projSection}>
        <SectionHeader icon="folder-sharp" text={`分组 (${groups.length})`} />
        {loaded && groups.length === 0 && (
          <T variant="cap" style={styles.projEmpty}>暂无分组，在下方输入框添加</T>
        )}
        {groups.map(g =>
          renamingGroupId === g.id ? (
            <View key={g.id} style={styles.rowShadowWrap}>
              <View pointerEvents="none" style={[styles.rowShadow, { backgroundColor: colors.ink }]} />
              <View style={[styles.projEditRow, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
                <TextInput
                  value={groupRenameDraft}
                  onChangeText={setGroupRenameDraft}
                  autoFocus
                  placeholder="分组名称"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.projEditInput, { color: colors.text }]}
                  onSubmitEditing={() => void doRenameGroup()}
                  returnKeyType="done"
                />
                <Pressable
                  hitSlop={6}
                  onPress={() => void doRenameGroup()}
                  style={({ pressed }) => [styles.projEditBtn, { borderLeftColor: colors.ink }, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="checkmark-sharp" size={18} color={colors.primary} />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  onPress={() => setRenamingGroupId(null)}
                  style={({ pressed }) => [styles.projEditBtn, { borderLeftColor: colors.ink }, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="close-sharp" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View key={g.id} style={styles.rowShadowWrap}>
              <View pointerEvents="none" style={[styles.rowShadow, { backgroundColor: colors.ink }]} />
              <View style={[styles.projRow, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
                <View style={[styles.groupColorBox, { backgroundColor: g.color, borderColor: colors.ink }]} />
                <View style={styles.projMain}>
                  <T variant="title" numberOfLines={1}>{g.name}</T>
                  <T variant="cap" style={styles.projCount}>{countOfGroup(g.name)} 个任务</T>
                </View>
                <IconButton name="create-outline" onPress={() => startRenameGroup(g)} />
                <IconButton name="trash-outline" danger onPress={() => void doDeleteGroup(g)} />
              </View>
            </View>
          )
        )}
        {/* 新增分组 */}
        <View style={[styles.projAddRow, { borderColor: colors.ink, backgroundColor: colors.surface }]}>
          <TextInput
            value={newGroup}
            onChangeText={setNewGroup}
            placeholder="新分组名称..."
            placeholderTextColor={colors.placeholder}
            style={[styles.projAddInput, { color: colors.text }]}
            onSubmitEditing={() => void doAddGroup()}
            returnKeyType="done"
          />
          <Pressable
            onPress={() => void doAddGroup()}
            style={({ pressed }) => [styles.projAddBtn, { borderLeftColor: colors.ink }, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add-sharp" size={18} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {/* 项目管理 */}
      <View style={styles.projSection}>
        <SectionHeader icon="layers-outline" text={`项目 (${projects.length})`} />
        {loaded && projects.length === 0 && (
          <T variant="cap" style={styles.projEmpty}>暂无项目，在下方输入框添加</T>
        )}
        {projects.map(p =>
          renamingId === p.id ? (
            <View key={p.id} style={styles.rowShadowWrap}>
              <View pointerEvents="none" style={[styles.rowShadow, { backgroundColor: colors.ink }]} />
              <View style={[styles.projEditRow, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
                <TextInput
                  value={renameDraft}
                  onChangeText={setRenameDraft}
                  autoFocus
                  placeholder="项目名称"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.projEditInput, { color: colors.text }]}
                  onSubmitEditing={() => void doRename()}
                  returnKeyType="done"
                />
                <Pressable
                  hitSlop={6}
                  onPress={() => void doRename()}
                  style={({ pressed }) => [styles.projEditBtn, { borderLeftColor: colors.ink }, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="checkmark-sharp" size={18} color={colors.primary} />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  onPress={() => setRenamingId(null)}
                  style={({ pressed }) => [styles.projEditBtn, { borderLeftColor: colors.ink }, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="close-sharp" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View key={p.id} style={styles.rowShadowWrap}>
              <View pointerEvents="none" style={[styles.rowShadow, { backgroundColor: colors.ink }]} />
              <View style={[styles.projRow, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
                <View style={[styles.projBox, { backgroundColor: colors.accentDim, borderColor: colors.ink }]}>
                  <Ionicons name="layers-outline" size={15} color={colors.ink} />
                </View>
                <View style={styles.projMain}>
                  <T variant="title" numberOfLines={1}>{p.name}</T>
                  <T variant="cap" style={styles.projCount}>{countOfProject(p.name)} 个任务</T>
                </View>
                <IconButton name="create-outline" onPress={() => startRename(p)} />
                <IconButton name="trash-outline" danger onPress={() => void doDeleteProject(p)} />
              </View>
            </View>
          )
        )}
        {/* 新增项目 */}
        <View style={[styles.projAddRow, { borderColor: colors.ink, backgroundColor: colors.surface }]}>
          <TextInput
            value={newProject}
            onChangeText={setNewProject}
            placeholder="新项目名称..."
            placeholderTextColor={colors.placeholder}
            style={[styles.projAddInput, { color: colors.text }]}
            onSubmitEditing={() => void doAddProject()}
            returnKeyType="done"
          />
          <Pressable
            onPress={() => void doAddProject()}
            style={({ pressed }) => [styles.projAddBtn, { borderLeftColor: colors.ink }, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add-sharp" size={18} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {/* 筛选 */}
      <View style={styles.filterSection}>
        <T variant="cap" color={colors.subtext}>分组</T>
        <View style={styles.filterRow}>
          {['全部', ...groups.map(g => g.name)].map((g, i) => (
            <Pressable
              key={g}
              onPress={() => setGroupFilterName(i === 0 ? '' : g)}
              style={({ pressed }) => [
                styles.filterBtn,
                { backgroundColor: (i === 0 ? groupFilterName === '' : groupFilterName === g) ? colors.accent : colors.surface, borderColor: colors.ink },
                pressed && { opacity: 0.7 },
              ]}
            >
              <T variant="cap" color={colors.ink}>{g}</T>
            </Pressable>
          ))}
        </View>

        <T variant="cap" color={colors.subtext} style={{ marginTop: 8 }}>优先级</T>
        <View style={styles.filterRow}>
          {PRI_OPTIONS.map((p, i) => (
            <Pressable
              key={p}
              onPress={() => setPriFilter(i)}
              style={({ pressed }) => [
                styles.filterBtn,
                { backgroundColor: priFilter === i ? colors.accent : colors.surface, borderColor: colors.ink },
                pressed && { opacity: 0.7 },
              ]}
            >
              <T variant="cap" color={colors.ink}>{p}</T>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 任务列表 */}
      {loaded && pending.length === 0 && done.length === 0 && (
        <EmptyState icon="clipboard-outline" title="暂无任务" sub="点击下方按钮创建" />
      )}

      {pending.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          onToggle={() => void handleToggle(task)}
          onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
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
              onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
            />
          ))}
        </View>
      )}

      <PrimaryButton
        title="新建任务"
        icon="add-sharp"
        onPress={() => navigation.navigate('TaskEdit', {})}
      />

      <TabBarSpacer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  // 项目管理
  projSection: { marginBottom: 18 },
  projEmpty: { textTransform: 'none', letterSpacing: 0, marginBottom: 8 },
  rowShadowWrap: { paddingRight: 4, paddingBottom: 4, marginBottom: 10 },
  rowShadow: { position: 'absolute', top: 4, left: 4, right: 0, bottom: 0 },
  projRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 2, padding: 10,
  },
  groupColorBox: {
    width: 34, height: 12, borderWidth: 2,
  },
  projBox: {
    width: 34, height: 34, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  projMain: { flex: 1 },
  projCount: { marginTop: 1, textTransform: 'none', letterSpacing: 0 },
  projEditRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 2,
  },
  projEditInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600' },
  projEditBtn: { paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: 2 },
  projAddRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 2, marginTop: 4,
  },
  projAddInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600' },
  projAddBtn: { paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: 2 },
  filterSection: { marginBottom: 14 },
  filterRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2 },
  doneSection: { marginTop: 12, opacity: 0.7 },
});
