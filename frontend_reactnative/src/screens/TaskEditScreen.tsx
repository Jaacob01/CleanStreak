/**
 * 新建/编辑任务
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  Screen, Header, T, Input, PickerField, PrimaryButton, GhostButton,
} from '../ui/components';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../ui/toast';
import { api_createTask, api_updateTask, api_listTasks } from '../api/tasks';
import { api_listProjects } from '../api/projects';
import { api_listGroups } from '../api/groups';
import type { Project, TaskGroup } from '../db/types';
import type { RootParamList } from '../navigation/types';

const PRI_OPTIONS = [
  { label: 'P0 紧急', value: '0' },
  { label: 'P1 高', value: '1' },
  { label: 'P2 中', value: '2' },
  { label: 'P3 低', value: '3' },
];

export default function TaskEditScreen() {
  const colors = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootParamList, 'TaskEdit'>>();
  const toast = useToast();
  const taskId = route.params?.taskId;
  const [title, setTitle] = useState(route.params?.title ?? '');
  const [description, setDescription] = useState('');
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [project, setProject] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [priority, setPriority] = useState('2');
  const [loading, setLoading] = useState(false);

  // 分组 / 项目列表（选择器选项）
  React.useEffect(() => {
    (async () => {
      try {
        const [grps, projs] = await Promise.all([api_listGroups(), api_listProjects()]);
        setGroups(grps);
        setProjects(projs);
        setGroup(prev => prev || (grps[0]?.name ?? ''));
      } catch {}
    })();
  }, []);

  // 编辑模式：加载现有数据
  React.useEffect(() => {
    if (!taskId) return;
    (async () => {
      try {
        const tasks = await api_listTasks({});
        const t = tasks.find(x => x.id === taskId);
        if (t) {
          setTitle(t.title);
          setDescription(t.description ?? '');
          setGroup(t.group);
          setProject(t.project ?? '');
          setPriority(String(t.priority));
        }
      } catch {}
    })();
  }, [taskId]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.show('标题不能为空', 'error');
      return;
    }
    setLoading(true);
    try {
      if (taskId) {
        await api_updateTask(taskId, {
          title: title.trim(),
          description: description.trim() || undefined,
          group: group || '默认',
          project: project.trim() || undefined,
          priority: Number(priority),
        });
        toast.show('已更新', 'success');
      } else {
        await api_createTask({
          title: title.trim(),
          description: description.trim() || undefined,
          group: group || '默认',
          project: project.trim() || undefined,
          priority: Number(priority),
        });
        toast.show('已创建', 'success');
      }
      navigation.goBack();
    } catch (e: any) {
      toast.show(e?.message || '保存失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const PROJECT_OPTIONS = [
    { label: '无项目', value: '' },
    ...projects.map(p => ({ label: p.name, value: p.name })),
  ];

  const GROUP_OPTIONS = groups.map(g => ({ label: g.name, value: g.name }));

  return (
    <Screen>
      <Header title={taskId ? '编辑任务' : '新建任务'} />
      <ScrollView style={styles.flex1} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Input label="标题" value={title} onChangeText={setTitle} placeholder="任务标题" required />
        <Input label="描述" value={description} onChangeText={setDescription} placeholder="可选描述" multiline />
        <PickerField label="项目" value={project} options={PROJECT_OPTIONS} onChange={setProject} />
        <PickerField label="分组" value={group} options={GROUP_OPTIONS} onChange={setGroup} />
        <PickerField label="优先级" value={priority} options={PRI_OPTIONS} onChange={setPriority} />
        <View style={styles.btnRow}>
          <PrimaryButton title={taskId ? '保存' : '创建'} onPress={() => void handleSave()} loading={loading} />
        </View>
        <View style={styles.cancelWrap}>
          <GhostButton title="取消" onPress={() => navigation.goBack()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  btnRow: { marginTop: 28, marginBottom: 12 },
  cancelWrap: { marginTop: 4 },
});
