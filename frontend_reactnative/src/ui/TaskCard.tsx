/**
 * 任务卡片 — 野兽派风格
 * 左侧色条=优先级，可勾选完成，显示最近进展预览
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card } from './components';
import { useTheme } from '../hooks/useTheme';
import type { Task } from '../db/types';

const PRIORITY_COLORS: Record<number, string> = {
  0: '#FF4D4D',  // P0 红
  1: '#FFD02E',  // P1 黄
  2: '#4D7CFE',  // P2 蓝
  3: '#A8A093',  // P3 灰
};

const PRIORITY_LABELS: Record<number, string> = {
  0: 'P0', 1: 'P1', 2: 'P2', 3: 'P3',
};

export function TaskCard({
  task,
  onToggle,
  onPress,
  compact,
}: {
  task: Task;
  onToggle?: () => void;
  onPress?: () => void;
  compact?: boolean;
}) {
  const colors = useTheme();
  const pColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[2];
  const lastLog = task.progress_log?.length > 0
    ? task.progress_log[task.progress_log.length - 1]
    : null;

  const ageDays = Math.floor(
    (Date.now() - new Date(task.created_at).getTime()) / 86400000
  );

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        {/* 优先级色条 */}
        <View style={[styles.bar, { backgroundColor: pColor }]} />

        {/* 勾选 */}
        <Pressable
          hitSlop={6}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.check,
            { borderColor: colors.ink },
            task.completed && { backgroundColor: colors.success },
            pressed && { opacity: 0.6 },
          ]}
        >
          {task.completed && (
            <Ionicons name="checkmark-sharp" size={14} color={colors.ink} />
          )}
        </Pressable>

        {/* 内容 */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <T
              variant="cap"
              color={pColor}
              style={styles.pBadge}
            >
              {PRIORITY_LABELS[task.priority]}
            </T>
            <T
              variant="body"
              numberOfLines={compact ? 1 : 2}
              style={{
                ...(task.completed ? styles.doneText : {}),
                ...(task.status === 'shelved' ? { color: colors.subtext } : {}),
              }}
            >
              {task.title}
            </T>
          </View>

          {!compact && (
            <View style={styles.metaRow}>
              {task.project && (
                <T variant="cap" color={colors.subtext} style={styles.metaItem}>
                  {task.project}
                </T>
              )}
              <T variant="cap" color={ageDays > 7 ? colors.danger : colors.subtext}>
                存活 {ageDays}天
              </T>
              {task.status === 'shelved' && (
                <T variant="cap" color={colors.danger}>
                  阻塞
                </T>
              )}
            </View>
          )}

          {!compact && lastLog && (
            <T variant="cap" color={colors.subtext} numberOfLines={1} style={styles.logPreview}>
              {lastLog.time} {lastLog.text}
            </T>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bar: { width: 4, alignSelf: 'stretch' },
  check: {
    width: 22, height: 22, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pBadge: { fontSize: 10, letterSpacing: 0, minWidth: 22 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  metaItem: { textTransform: 'none', letterSpacing: 0 },
  logPreview: { marginTop: 4, textTransform: 'none', letterSpacing: 0 },
  doneText: { textDecorationLine: 'line-through', opacity: 0.5 },
});
