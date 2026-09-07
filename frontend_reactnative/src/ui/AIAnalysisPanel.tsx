/**
 * AI 智能分析面板 — 统计页第三个分段
 * 时间范围：今日/本周/本月/本年/自定义(YYYY-MM-DD)；分析由后端构建数据上下文并调用 LLM
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card, PrimaryButton, Divider } from './components';
import { MiniMarkdown } from './MiniMarkdown';
import { useTheme } from '../hooks/useTheme';
import { useToast } from './toast';
import { TabBarSpacer } from './TabBarSpacer';
import { api_aiAnalyzeStream, api_aiStatus } from '../api/ai';
import type { AIPreset } from '../api/ai';

type IconName = keyof typeof Ionicons.glyphMap;

const PRESETS: { key: AIPreset; label: string; icon: IconName }[] = [
  { key: 'day', label: '今日', icon: 'today-outline' },
  { key: 'week', label: '本周', icon: 'calendar-outline' },
  { key: 'month', label: '本月', icon: 'calendar-clear-outline' },
  { key: 'year', label: '本年', icon: 'trending-up-outline' },
  { key: 'custom', label: '自定义', icon: 'options-outline' },
];

export function AIAnalysisPanel({ active }: { active?: boolean }) {
  const colors = useTheme();
  const toast = useToast();
  const [preset, setPreset] = useState<AIPreset>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [result, setResult] = useState<{ label: string; date_from: string; date_to: string; content: string } | null>(null);

  const checkEnabled = async () => {
    try {
      const s = await api_aiStatus();
      setEnabled(s.enabled);
      return s.enabled;
    } catch {
      setEnabled(false);
      return false;
    }
  };

  const run = async () => {
    if (loading) return;
    if (enabled === null && !(await checkEnabled())) return;
    if (enabled === false) return;
    if (preset === 'custom') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        toast.show('请输入 YYYY-MM-DD 格式的起止日期', 'error');
        return;
      }
    }
    setLoading(true);
    try {
      await api_aiAnalyzeStream(
        preset,
        preset === 'custom' ? from : undefined,
        preset === 'custom' ? to : undefined,
        meta => setResult({ ...meta, content: '' }),
        delta => setResult(r => (r ? { ...r, content: r.content + delta } : r)),
      );
    } catch (e: any) {
      // 流式失败：还没有内容时清掉占位结果
      setResult(r => (r && r.content ? r : null));
      toast.show(e?.message ?? 'AI 分析失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 惰性检查启用状态（仅一次）
  useEffect(() => {
    if (enabled === null) void checkEnabled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (enabled === false) {
    return (
      <View style={styles.emptyWrap}>
        <Card>
          <View style={styles.disabledRow}>
            <Ionicons name="sparkles" size={16} color={colors.ink} />
            <T variant="body"> AI 分析未开放</T>
          </View>
          <T variant="cap" style={styles.disabledSub}>
            需要管理员在「我的 → AI 设置」中启用并配置 AI 服务
          </T>
        </Card>
        <TabBarSpacer />
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {/* 时间范围 */}
      <View style={styles.chipRow}>
        {PRESETS.map(p => {
          const isActive = preset === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPreset(p.key)}
              style={({ pressed }) => [
                styles.presetChip,
                { backgroundColor: isActive ? colors.accent : colors.surface, borderColor: colors.ink },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name={p.icon} size={12} color={colors.ink} />
              <T variant="cap" color={colors.ink} style={styles.presetText}>{p.label}</T>
            </Pressable>
          );
        })}
      </View>

      {preset === 'custom' && (
        <View style={styles.customRow}>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="2026-01-01"
            placeholderTextColor={colors.placeholder}
            style={[styles.dateInput, { backgroundColor: colors.surface, borderColor: colors.ink, color: colors.text }]}
          />
          <T variant="cap">至</T>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="2026-09-07"
            placeholderTextColor={colors.placeholder}
            style={[styles.dateInput, { backgroundColor: colors.surface, borderColor: colors.ink, color: colors.text }]}
          />
        </View>
      )}

      <PrimaryButton
        title={loading ? '分析中…' : result ? '重新分析' : '开始 AI 分析'}
        icon="sparkles"
        loading={loading}
        onPress={() => void run()}
      />

      {result && (
        <>
          <Divider />
          <View style={styles.resultHeader}>
            <View style={[styles.resultIcon, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
              <Ionicons name="sparkles" size={14} color={colors.ink} />
            </View>
            <View style={styles.resultMeta}>
              <T variant="title">AI 分析报告</T>
              <T variant="cap" style={{ marginTop: 2 }}>
                {result.date_from} ~ {result.date_to}
              </T>
            </View>
          </View>
          <Card>
            <MiniMarkdown text={result.content} />
          </Card>
        </>
      )}
      {!result && !loading && (
        <T variant="cap" style={styles.hint}>
          AI 将基于你选定时间范围内的习惯打卡与任务数据生成结构化分析报告
        </T>
      )}
      <TabBarSpacer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16 },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: 16 },
  disabledRow: { flexDirection: 'row', alignItems: 'center' },
  disabledSub: { marginTop: 8, textTransform: 'none', letterSpacing: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  presetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8,
  },
  presetText: { textTransform: 'none', letterSpacing: 0, fontSize: 12 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  dateInput: { flex: 1, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '700' },
  hint: { marginTop: 14, textAlign: 'center', textTransform: 'none', letterSpacing: 0 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  resultIcon: { width: 30, height: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  resultMeta: { flex: 1 },
});
