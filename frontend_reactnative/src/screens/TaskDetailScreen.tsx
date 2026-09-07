/**
 * 任务详情 — 进展追加、阻塞、完成
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen, Header, T, Card, Divider, PrimaryButton, GhostButton,
} from '../ui/components';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../ui/toast';
import { confirmAsync } from '../ui/confirm';
import {
  api_listTasks, api_completeTask, api_appendProgress,
  api_blockTask, api_deleteTask,
} from '../api/tasks';
import type { Task, ProgressLogEntry } from '../db/types';
import type { RootParamList, RootNav } from '../navigation/types';

const PRIORITY_LABELS = ['P0 紧急', 'P1 高', 'P2 中', 'P3 低'];
const PRIORITY_COLORS: Record<number, string> = {
  0: '#FF4D4D', 1: '#FFD02E', 2: '#4D7CFE', 3: '#A8A093',
};

export default function TaskDetailScreen() {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootParamList, 'TaskDetail'>>();
  const toast = useToast();
  const taskId = route.params?.taskId;
  const [task, setTask] = useState<Task | null>(null);
  const [progressText, setProgressText] = useState('');
  const [blockText, setBlockText] = useState('');
  const [showBlock, setShowBlock] = useState(false);

  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      const tasks = await api_listTasks({});
      setTask(tasks.find(t => t.id === taskId) ?? null);
    } catch {}
  }, [taskId]);

  React.useEffect(() => { void load(); }, [load]);

  const handleToggle = async () => {
    if (!task) return;
    try {
      await api_completeTask(task.id, !task.completed);
      void load();
      toast.show(task.completed ? '已撤销完成' : '已完成 🎉', 'success');
    } catch {}
  };

  const handleProgress = async () => {
    if (!task || !progressText.trim()) return;
    try {
      await api_appendProgress(task.id, progressText.trim());
      setProgressText('');
      void load();
    } catch {}
  };

  const handleBlock = async () => {
    if (!task || !blockText.trim()) return;
    try {
      await api_blockTask(task.id, blockText.trim());
      setBlockText('');
      setShowBlock(false);
      void load();
      toast.show('已标记阻塞', 'info');
    } catch {}
  };

  const handleDelete = async () => {
    if (!task) return;
    const ok = await confirmAsync('删除任务', `「${task.title}」将被删除，无法恢复。`, '删除');
    if (!ok) return;
    try {
      await api_deleteTask(task.id);
      toast.show('已删除', 'info');
      navigation.goBack();
    } catch {}
  };

  if (!task) return null;

  const pColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[2];
  const ageDays = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000);

  return (
    <Screen>
      <Header
        title="任务详情"
        right={
          <Pressable hitSlop={8} onPress={() => navigation.navigate('TaskEdit', { taskId: task.id })}>
            <Ionicons name="create-outline" size={22} color={colors.subtext} />
          </Pressable>
        }
      />
      <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* 标题区 */}
        <View style={styles.titleSection}>
          <View style={[styles.priBar, { backgroundColor: pColor }]} />
          <View style={styles.titleContent}>
            <T variant="h2" style={task.completed ? styles.doneText : undefined}>
              {task.title}
            </T>
            <View style={styles.metaRow}>
              <T variant="cap" color={pColor}>{PRIORITY_LABELS[task.priority]}</T>
              <T variant="cap" color={colors.subtext}>{task.group}</T>
              {task.project && <T variant="cap" color={colors.subtext}>{task.project}</T>}
              <T variant="cap" color={ageDays > 7 ? colors.danger : colors.subtext}>
                存活 {ageDays}天
              </T>
            </View>
            {task.description && (
              <T variant="body" color={colors.subtext} style={styles.desc}>{task.description}</T>
            )}
          </View>
        </View>

        <Divider />

        {/* 操作按钮 */}
        <View style={styles.actionRow}>
          <View style={styles.actionBtn}>
            <PrimaryButton
              title={task.completed ? '撤销完成' : '标记完成'}
              icon={task.completed ? 'arrow-undo-sharp' : 'checkmark-sharp'}
              onPress={() => void handleToggle()}
            />
          </View>
          {task.status !== 'shelved' && (
            <View style={styles.actionBtn}>
              <GhostButton
                title="阻塞"
                icon="alert-circle-outline"
                danger
                onPress={() => setShowBlock(!showBlock)}
              />
            </View>
          )}
        </View>

        {/* 阻塞输入 */}
        {showBlock && (
          <View style={styles.blockSection}>
            <TextInput
              value={blockText}
              onChangeText={setBlockText}
              placeholder="阻塞原因..."
              placeholderTextColor={colors.placeholder}
              style={[styles.blockInput, { borderColor: colors.ink, color: colors.text }]}
            />
            <PrimaryButton title="记录阻塞" danger onPress={() => void handleBlock()} />
          </View>
        )}

        {task.blocked_reason && (
          <Card style={styles.blockCard}>
            <T variant="cap" color={colors.danger}>🚫 阻塞: {task.blocked_reason}</T>
          </Card>
        )}

        <Divider />

        {/* 进展记录 */}
        <T variant="title" style={styles.sectionTitle}>进展记录</T>
        {task.progress_log?.length > 0 ? (
          task.progress_log.map((log, i) => (
            <View key={i} style={styles.logRow}>
              <T variant="mono" color={colors.subtext} style={styles.logTime}>{log.time}</T>
              <T variant="body" style={styles.logText}>{log.text}</T>
            </View>
          ))
        ) : (
          <T variant="cap" color={colors.subtext}>暂无进展记录</T>
        )}

        {/* 追加进展 */}
        <View style={styles.progressRow}>
          <TextInput
            value={progressText}
            onChangeText={setProgressText}
            placeholder="追加进展..."
            placeholderTextColor={colors.placeholder}
            style={[styles.progressInput, { borderColor: colors.ink, color: colors.text }]}
            onSubmitEditing={() => void handleProgress()}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => void handleProgress()}
            style={({ pressed }) => [
              styles.progressBtn,
              { backgroundColor: colors.primary, borderColor: colors.ink },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="add-sharp" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <Divider />

        {/* 底部信息 */}
        <View style={styles.infoSection}>
          <T variant="cap" color={colors.subtext}>
            创建于 {task.created_at?.slice(0, 16)?.replace('T', ' ')}
          </T>
          {task.completed_at && (
            <T variant="cap" color={colors.subtext}>
              完成于 {task.completed_at?.slice(0, 16)?.replace('T', ' ')}
            </T>
          )}
          <T variant="cap" color={colors.subtext}>来源: {task.source}</T>
        </View>

        <GhostButton title="删除任务" danger icon="trash-outline" onPress={() => void handleDelete()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  titleSection: { flexDirection: 'row', gap: 12 },
  priBar: { width: 6 },
  titleContent: { flex: 1 },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  desc: { marginTop: 8 },
  doneText: { textDecorationLine: 'line-through', opacity: 0.5 },
  actionRow: { flexDirection: 'row', gap: 10, marginVertical: 10 },
  actionBtn: { flex: 1 },
  blockSection: { gap: 10, marginBottom: 12 },
  blockInput: { borderWidth: 2, padding: 10, fontSize: 14, fontWeight: '600' },
  blockCard: { marginBottom: 12 },
  sectionTitle: { marginBottom: 10 },
  logRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' },
  logTime: { width: 44, fontSize: 12 },
  logText: { flex: 1 },
  progressRow: { flexDirection: 'row', marginTop: 10, gap: 0 },
  progressInput: {
    flex: 1, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontWeight: '600',
  },
  progressBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderLeftWidth: 0,
    justifyContent: 'center',
  },
  infoSection: { gap: 4, marginBottom: 16 },
});
