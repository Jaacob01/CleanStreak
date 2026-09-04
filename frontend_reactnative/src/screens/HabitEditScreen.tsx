/**
 * 习惯编辑：新建 / 全量配置
 * 名称、图标、颜色、记录方向、目标类型、目标值、单位、生效日、标签集、备注开关、归档
 */
import React, { useEffect, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Switch, View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen, Header, BodyScroll, T, Input, PrimaryButton, GhostButton, SectionHeader, Divider,
} from '../ui/components';
import { confirmAsync } from '../ui/confirm';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../ui/toast';
import { useAuthStore } from '../store/auth';
import { createHabit, deleteHabit, getHabit, updateHabit } from '../db';
import { HabitConfig, HabitDirection, HabitGoalType } from '../db/types';
import { WEEKDAY_NAMES } from '../db/logic';
import { HABIT_COLORS } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

const EMOJIS = [
  '🎯', '✅', '💪', '🏃', '🚴', '🏊', '⚽', '🏀', '🤸', '🧘', '🛏️', '☀️',
  '📚', '📝', '💻', '🎸', '🎨', '🎧', '🧠', '💰', '🦷', '🚿', '⏰', '🌱',
  '🙏', '🍎', '🥗', '💊', '💧', '🍵', '☕', '❤️', '🚭', '🚱', '🍺', '📵',
  '🎮', '🀄', '🛒', '🧹', '🐶', '🔥', '🌙', '🌊', '✍️', '😴', '🥤', '🛡️',
];

interface Template {
  label: string;
  emoji: string;
  color: string;
  name: string;
  direction: HabitDirection;
  goal_type: HabitGoalType;
  targetText: string;
  unit: string;
  tags: string[];
}

const TEMPLATES: Template[] = [
  { label: '💧 喝水', emoji: '💧', color: 'blue', name: '喝水', direction: 'positive', goal_type: 'count', targetText: '8', unit: '杯', tags: ['起床', '运动后', '睡前'] },
  { label: '📚 阅读', emoji: '📚', color: 'teal', name: '阅读', direction: 'positive', goal_type: 'count', targetText: '30', unit: '分钟', tags: [] },
  { label: '🏃 运动', emoji: '🏃', color: 'green', name: '运动', direction: 'positive', goal_type: 'check', targetText: '1', unit: '', tags: ['力量', '有氧'] },
  { label: '🛡️ 戒色', emoji: '🛡️', color: 'purple', name: '戒色', direction: 'negative', goal_type: 'check', targetText: '1', unit: '', tags: ['手淫', '看色情', '边缘行为', '性爱', '无聊', '压力', '失眠', '酒精', '孤独'] },
  { label: '🚭 戒烟', emoji: '🚭', color: 'red', name: '不抽烟', direction: 'negative', goal_type: 'check', targetText: '1', unit: '', tags: ['酒局', '压力', '饭后'] },
  { label: '📱 刷手机', emoji: '📵', color: 'orange', name: '少刷手机', direction: 'negative', goal_type: 'count', targetText: '60', unit: '分钟', tags: ['无聊', '睡前'] },
];

export default function HabitEditScreen() {
  const colors = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ HabitEdit: { habitId?: number } | undefined }, 'HabitEdit'>>();
  const habitId = route.params?.habitId;
  const user = useAuthStore(s => s.user);
  const toast = useToast();

  const [loaded, setLoaded] = useState(!habitId);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [color, setColor] = useState('green');
  const [direction, setDirection] = useState<HabitDirection>('positive');
  const [goalType, setGoalType] = useState<HabitGoalType>('check');
  const [targetText, setTargetText] = useState('1');
  const [unit, setUnit] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [enableNotes, setEnableNotes] = useState(true);
  const [enableTags, setEnableTags] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [archived, setArchived] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!habitId) return;
    void (async () => {
      const h = await getHabit(habitId);
      if (!h) { toast.show('习惯不存在', 'error'); navigation.goBack(); return; }
      setName(h.name);
      setEmoji(h.emoji);
      setColor(h.color);
      setDirection(h.direction);
      setGoalType(h.goal_type);
      setTargetText(String(h.target_value));
      setUnit(h.unit);
      setWeekdays(h.weekdays);
      setEnableNotes(h.enable_notes);
      setEnableTags(h.enable_tags);
      setTags(h.tags);
      setArchived(h.archived);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitId]);

  const applyTemplate = (t: Template) => {
    setName(t.name);
    setEmoji(t.emoji);
    setColor(t.color);
    setDirection(t.direction);
    setGoalType(t.goal_type);
    setTargetText(t.targetText);
    setUnit(t.unit);
    setTags(t.tags);
    setEnableTags(t.tags.length > 0);
    setWeekdays([]);
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t) return;
    if (tags.includes(t)) { setNewTag(''); return; }
    setTags([...tags, t]);
    setNewTag('');
  };

  const removeTag = (t: string) => setTags(tags.filter(x => x !== t));

  const toggleWeekday = (w: number) => {
    setWeekdays(weekdays.includes(w) ? weekdays.filter(x => x !== w) : [...weekdays, w]);
  };

  const preset = (ws: number[]) => setWeekdays(ws);

  const handleSave = async () => {
    if (!user || saving) return;
    if (!name.trim()) { toast.show('请填写习惯名称', 'error'); return; }
    let target = 1;
    if (goalType === 'count') {
      target = parseFloat(targetText);
      if (Number.isNaN(target) || target < 0) { toast.show('目标值不能为负数', 'error'); return; }
    }
    const cfg: HabitConfig = {
      name: name.trim(),
      emoji,
      color,
      direction,
      goal_type: goalType,
      target_value: goalType === 'count' ? target : 1,
      unit: goalType === 'count' ? unit.trim() : '',
      weekdays: [...weekdays].sort((a, b) => a - b),
      enable_notes: enableNotes,
      enable_tags: enableTags,
      tags,
      archived,
    };
    setSaving(true);
    try {
      if (habitId) {
        await updateHabit(habitId, cfg);
        toast.show('已保存', 'success');
      } else {
        await createHabit(user.id, cfg);
        toast.show('已创建', 'success');
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!habitId) return;
    const ok = await confirmAsync('删除习惯', '将同时删除该习惯的全部打卡记录，且无法恢复。', '删除');
    if (!ok) return;
    await deleteHabit(habitId);
    toast.show('已删除', 'info');
    navigation.goBack();
  };

  if (!loaded) {
    return (
      <Screen>
        <Header title={habitId ? '编辑习惯' : '新建习惯'} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={habitId ? '编辑习惯' : '新建习惯'} />
      <BodyScroll>

        {/* 模板快捷填充（仅新建） */}
        {!habitId && (
          <>
            <SectionHeader icon="flash-outline" text="从模板开始" />
            <View style={styles.templateRow}>
              {TEMPLATES.map(t => (
                <Pressable
                  key={t.label}
                  onPress={() => applyTemplate(t)}
                  style={({ pressed }) => [
                    styles.templateChip,
                    { backgroundColor: colors.surface, borderColor: colors.ink },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <T variant="cap" style={styles.templateText}>{t.label}</T>
                </Pressable>
              ))}
            </View>
            <Divider />
          </>
        )}

        {/* 基本 */}
        <SectionHeader icon="create-outline" text="基本" />
        <Input label="名称" value={name} onChangeText={setName} placeholder="例如：每天阅读" required />

        <View style={styles.fieldGap}>
          <T variant="cap">图标</T>
          <Pressable
            onPress={() => setEmojiOpen(true)}
            style={({ pressed }) => [
              styles.emojiBtn,
              { backgroundColor: colors.surface, borderColor: colors.ink },
              pressed && { opacity: 0.7 },
            ]}
          >
            <T style={styles.emojiBig}>{emoji}</T>
            <T variant="cap">点击更换</T>
          </Pressable>
        </View>

        <View style={styles.fieldGap}>
          <T variant="cap">颜色</T>
          <View style={styles.swatchRow}>
            {Object.entries(HABIT_COLORS).map(([key, c]) => {
              const selected = key === color;
              return (
                <Pressable
                  key={key}
                  onPress={() => setColor(key)}
                  hitSlop={4}
                  style={({ pressed }) => [
                    styles.swatch,
                    { backgroundColor: c.bg, borderColor: colors.ink },
                    selected && styles.swatchSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {selected ? <Ionicons name="checkmark-sharp" size={16} color={colors.ink} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Divider />

        {/* 记录方向 */}
        <SectionHeader icon="swap-vertical-outline" text="记录方向" />
        <View style={styles.optionRow2}>
          <OptionCard
            active={direction === 'positive'}
            icon="trending-up-sharp"
            title="正向习惯"
            sub="做到了才打卡 · 运动、阅读"
            onPress={() => setDirection('positive')}
          />
          <OptionCard
            active={direction === 'negative'}
            icon="trending-down-sharp"
            title="反向习惯"
            sub="犯了才记录 · 抽烟、刷手机"
            onPress={() => setDirection('negative')}
          />
        </View>

        <Divider />

        {/* 目标类型 */}
        <SectionHeader icon="flag-outline" text="目标类型" />
        <View style={styles.optionRow2}>
          <OptionCard
            small
            active={goalType === 'check'}
            icon="checkbox-sharp"
            title="简单打卡"
            sub="当天完成即达成"
            onPress={() => setGoalType('check')}
          />
          <OptionCard
            small
            active={goalType === 'count'}
            icon="speedometer-sharp"
            title="数量目标"
            sub="按数量记录进度"
            onPress={() => setGoalType('count')}
          />
        </View>
        {goalType === 'count' && (
          <>
            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Input label="每日目标值" value={targetText} onChangeText={setTargetText} keyboardType="numeric" required />
              </View>
              <View style={styles.col}>
                <Input label="单位" value={unit} onChangeText={setUnit} placeholder="杯 / 分钟 / 次" />
              </View>
            </View>
            <T variant="cap" style={styles.helper}>
              {direction === 'positive'
                ? '每天数量 ≥ 目标值即达成，未达标记为部分完成'
                : '目标值填 0 表示零容忍，任何记录即失守；填其他值表示每日上限'}
            </T>
          </>
        )}

        <Divider />

        {/* 生效日 */}
        <SectionHeader icon="calendar-outline" text="生效日" />
        <View style={styles.templateRow}>
          <PresetChip label="每天" active={weekdays.length === 0} onPress={() => preset([])} />
          <PresetChip label="工作日" active={weekdays.join(',') === '1,2,3,4,5'} onPress={() => preset([1, 2, 3, 4, 5])} />
          <PresetChip label="周末" active={weekdays.join(',') === '0,6'} onPress={() => preset([0, 6])} />
        </View>
        <View style={styles.weekRow}>
          {WEEKDAY_NAMES.map((w, i) => {
            const selected = weekdays.includes(i);
            return (
              <Pressable
                key={w}
                onPress={() => toggleWeekday(i)}
                style={({ pressed }) => [
                  styles.weekChip,
                  {
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: colors.ink,
                  },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <T variant="cap" color={colors.ink} style={styles.weekText}>{w}</T>
              </Pressable>
            );
          })}
        </View>
        <T variant="cap" style={styles.helper}>不选任何一天 = 每天</T>

        <Divider />

        {/* 记录内容 */}
        <SectionHeader icon="list-outline" text="记录内容" />
        <View style={[styles.switchCard, { borderColor: colors.ink, backgroundColor: colors.surface }]}>
          <View style={styles.switchTexts}>
            <T variant="title">备注</T>
            <T variant="cap" style={styles.switchSub}>每次记录可附一段文字</T>
          </View>
          <Switch
            value={enableNotes}
            onValueChange={setEnableNotes}
            trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
            thumbColor={colors.ink}
          />
        </View>
        <View style={[styles.switchCard, { borderColor: colors.ink, backgroundColor: colors.surface }]}>
          <View style={styles.switchTexts}>
            <T variant="title">标签</T>
            <T variant="cap" style={styles.switchSub}>记录时从下方标签集中选择</T>
          </View>
          <Switch
            value={enableTags}
            onValueChange={setEnableTags}
            trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
            thumbColor={colors.ink}
          />
        </View>

        {enableTags && (
          <View style={styles.tagEditor}>
            <View style={styles.tagChipRow}>
              {tags.map(t => (
                <Pressable
                  key={t}
                  onPress={() => removeTag(t)}
                  style={({ pressed }) => [
                    styles.tagChip,
                    { backgroundColor: colors.accentDim, borderColor: colors.ink },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <T variant="cap" style={styles.tagChipText}>{t} ✕</T>
                </Pressable>
              ))}
              {tags.length === 0 && (
                <T variant="cap" style={styles.helper}>还没有标签，在下方添加</T>
              )}
            </View>
            <View style={styles.tagInputRow}>
              <View style={styles.tagInput}>
                <Input label="新标签" value={newTag} onChangeText={setNewTag} placeholder="例如：压力" />
              </View>
              <View style={styles.tagAddBtn}>
                <GhostButton title="添加" icon="add-sharp" onPress={addTag} />
              </View>
            </View>
          </View>
        )}

        {/* 归档（仅编辑） */}
        {habitId && (
          <>
            <Divider />
            <View style={[styles.switchCard, { borderColor: colors.ink, backgroundColor: colors.surface }]}>
              <View style={styles.switchTexts}>
                <T variant="title">归档</T>
                <T variant="cap" style={styles.switchSub}>不再显示在打卡列表，历史保留</T>
              </View>
              <Switch
                value={archived}
                onValueChange={setArchived}
                trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
                thumbColor={colors.ink}
              />
            </View>
          </>
        )}

        <View style={styles.saveWrap}>
          <PrimaryButton
            title={habitId ? '保 存' : '创建习惯'}
            icon="checkmark-sharp"
            loading={saving}
            onPress={() => void handleSave()}
          />
        </View>
        {habitId && (
          <View style={styles.deleteWrap}>
            <PrimaryButton title="删除习惯" icon="trash-outline" danger onPress={() => void handleDelete()} />
          </View>
        )}
      </BodyScroll>

      {/* 图标选择弹窗 */}
      <Modal visible={emojiOpen} transparent animationType="fade" onRequestClose={() => setEmojiOpen(false)}>
        <Pressable style={[styles.modalMask, { backgroundColor: colors.scrim }]} onPress={() => setEmojiOpen(false)}>
          <View style={styles.modalShadowWrap}>
            <View pointerEvents="none" style={[styles.modalShadow, { backgroundColor: colors.ink }]} />
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.ink }]}
              onPress={() => undefined}
            >
              <T variant="title">选择图标</T>
              <ScrollView style={styles.emojiGridScroll}>
                <View style={styles.emojiGrid}>
                  {EMOJIS.map(e => (
                    <Pressable
                      key={e}
                      onPress={() => { setEmoji(e); setEmojiOpen(false); }}
                      style={({ pressed }) => [
                        styles.emojiCell,
                        { borderColor: colors.borderLight },
                        e === emoji && { backgroundColor: colors.accent, borderColor: colors.ink },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <T style={styles.emojiCellText}>{e}</T>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/** 选项卡：方向 / 目标类型 二选一 */
function OptionCard({ active, icon, title, sub, onPress, small }: {
  active: boolean; icon: IconName; title: string; sub: string; onPress: () => void; small?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={styles.optionWrap}>
      <View pointerEvents="none" style={[styles.optionShadow, { backgroundColor: colors.ink }]} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.optionCard,
          small && styles.optionCardSmall,
          {
            backgroundColor: active ? colors.accent : colors.surface,
            borderColor: colors.ink,
          },
          pressed && styles.optionSink,
        ]}
      >
        <View style={styles.optionTitleRow}>
          <Ionicons name={icon} size={small ? 14 : 16} color={colors.ink} />
          <T variant={small ? 'body' : 'title'}>{title}</T>
          {active ? <Ionicons name="checkmark-sharp" size={15} color={colors.primary} style={styles.optionCheck} /> : null}
        </View>
        <T variant="cap" style={styles.optionSub}>{sub}</T>
      </Pressable>
    </View>
  );
}

function PresetChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.templateChip,
        { backgroundColor: active ? colors.accent : colors.surface, borderColor: colors.ink },
        pressed && { opacity: 0.6 },
      ]}
    >
      <T variant="cap" style={styles.templateText}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  templateChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderWidth: 2,
  },
  templateText: { letterSpacing: 0.5, textTransform: 'none', fontSize: 12 },
  fieldGap: { marginBottom: 14 },
  emojiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8,
  },
  emojiBig: { fontSize: 26, lineHeight: 30 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  swatch: { width: 34, height: 34, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3 },
  optionRow2: { flexDirection: 'row', gap: 10 },
  optionWrap: { flex: 1, paddingRight: 3, paddingBottom: 3 },
  optionShadow: { position: 'absolute', top: 3, left: 3, right: 0, bottom: 0 },
  optionCard: { borderWidth: 2, padding: 12 },
  optionCardSmall: { padding: 10 },
  optionSink: { transform: [{ translateX: 3 }, { translateY: 3 }] },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionCheck: { marginLeft: 'auto' },
  optionSub: { marginTop: 4, textTransform: 'none', letterSpacing: 0 },
  twoCol: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  helper: { marginTop: 2, marginBottom: 10, textTransform: 'none', letterSpacing: 0 },
  weekRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  weekChip: {
    flex: 1, height: 36, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  weekText: { fontSize: 12 },
  switchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 2, padding: 12, marginBottom: 10,
  },
  switchTexts: { flex: 1 },
  switchSub: { marginTop: 2, textTransform: 'none', letterSpacing: 0 },
  tagEditor: { marginBottom: 10 },
  tagChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tagChip: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2 },
  tagChipText: { fontSize: 12, letterSpacing: 0, textTransform: 'none' },
  tagInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  tagInput: { flex: 1 },
  tagAddBtn: { paddingBottom: 14 },
  saveWrap: { marginTop: 16 },
  deleteWrap: { marginTop: 10 },
  modalMask: { flex: 1, justifyContent: 'center', padding: 24 },
  modalShadowWrap: { paddingRight: 6, paddingBottom: 6 },
  modalShadow: { position: 'absolute', top: 6, left: 6, right: 0, bottom: 0 },
  modalCard: { borderWidth: 2, padding: 16, maxHeight: '70%' },
  emojiGridScroll: { marginTop: 10 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  emojiCell: {
    width: '16.66%', aspectRatio: 1, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiCellText: { fontSize: 20, lineHeight: 24 },
});
