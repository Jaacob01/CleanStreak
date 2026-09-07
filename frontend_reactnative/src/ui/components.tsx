/**
 * 新野兽派 UI 组件库
 * 零圆角、墨黑粗边框、硬偏移阴影、高饱和色块、按压下沉
 */
import React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardTypeOptions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { metrics } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** 硬阴影偏移量 */
export const SHADOW = metrics.shadowOffset;

// ---------- 文本 ----------
export function T({
  variant = 'body',
  color,
  style,
  children,
  numberOfLines,
}: {
  variant?: 'h1' | 'h2' | 'title' | 'body' | 'cap' | 'mono' | 'streak';
  color?: string;
  style?: TextStyle | TextStyle[];
  children?: React.ReactNode;
  numberOfLines?: number;
}) {
  const colors = useTheme();
  const sizes: Record<string, TextStyle> = {
    h1: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -1.5 },
    h2: { fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
    title: { fontSize: 16, fontWeight: '800', color: colors.text },
    body: { fontSize: 14, fontWeight: '600', color: colors.text },
    cap: { fontSize: 11, fontWeight: '800', color: colors.subtext, letterSpacing: 1, textTransform: 'uppercase' },
    mono: { fontSize: 13, fontFamily: metrics.monoFont, fontWeight: '700', color: colors.text },
    streak: { fontSize: 56, fontFamily: metrics.monoFont, fontWeight: '900', color: colors.primary, letterSpacing: -3 },
  };
  return (
    <RNText style={[sizes[variant], color ? { color } : null, style]} numberOfLines={numberOfLines}>
      {children}
    </RNText>
  );
}

// ---------- 硬阴影辅助 ----------
/** 底层阴影矩形：包在 shadowWrap 内使用 */
function ShadowRect({ color, offset = SHADOW }: { color: string; offset?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: offset, left: offset, right: 0, bottom: 0, backgroundColor: color }}
    />
  );
}

// ---------- 页面骨架 ----------
export function Screen({ children }: { children: React.ReactNode }) {
  const colors = useTheme();
  return (
    <SafeAreaView style={[styles.flex1, { backgroundColor: colors.background }]} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

export function Header({
  title,
  titleExtra,
  onBack,
  back = true,
  right,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  onBack?: () => void;
  back?: boolean;
  right?: React.ReactNode;
}) {
  const colors = useTheme();
  const navigation = useNavigation();
  const handleBack = onBack ?? (() => { if (navigation.canGoBack()) navigation.goBack(); });
  return (
    <View style={[styles.header, { borderBottomColor: colors.ink }]}>
      {back ? (
        <Pressable
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: colors.surface, borderColor: colors.ink },
            pressed && styles.sink2,
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
      ) : (
        <View style={[styles.backBtn, styles.headerLogoBox, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
          <Image
            source={require('../../assets/logo-icon.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>
      )}
      <View style={styles.titleRow} pointerEvents="none">
        <T variant="title" numberOfLines={1}>{title}</T>
        {titleExtra}
      </View>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function BodyScroll({
  children,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
}) {
  return (
    <ScrollView
      style={styles.flex1}
      contentContainerStyle={[{ padding: 16 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

// ---------- 基础元素 ----------
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
}) {
  const colors = useTheme();
  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.ink },
    style as ViewStyle,
  ];
  return (
    <View style={styles.shadowWrap}>
      <ShadowRect color={colors.ink} />
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, pressed && styles.sink]}>
          {children}
        </Pressable>
      ) : (
        <View style={cardStyle}>{children}</View>
      )}
    </View>
  );
}

export function Divider() {
  const colors = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.ink }]} />;
}

export type BadgeTone = 'green' | 'red' | 'yellow' | 'blue' | 'gray';

export function Badge({ text, tone = 'green' }: { text: string; tone?: BadgeTone }) {
  const colors = useTheme();
  const map: Record<BadgeTone, string> = {
    green: colors.success,
    red: colors.danger,
    yellow: colors.accent,
    blue: colors.info,
    gray: colors.surfaceAlt,
  };
  return (
    <View style={[styles.badge, { backgroundColor: map[tone], borderColor: colors.ink }]}>
      <RNText style={{ fontSize: 11, fontWeight: '800', color: colors.ink, letterSpacing: 0.5 }}>{text}</RNText>
    </View>
  );
}

// ---------- 按钮 ----------
export function PrimaryButton({
  title, onPress, loading, disabled, danger, icon,
}: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean; danger?: boolean; icon?: IconName;
}) {
  const colors = useTheme();
  const active = !disabled && !loading;
  const bg = danger ? colors.danger : colors.primary;
  return (
    <View style={[styles.shadowWrap, !active && { opacity: 0.45 }]}>
      <ShadowRect color={colors.ink} />
      <Pressable
        disabled={!active}
        onPress={onPress}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: bg, borderColor: colors.ink },
          pressed && active && styles.sink,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.ink} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={16} color={colors.primaryText} /> : null}
            <RNText style={[styles.primaryBtnText, { color: colors.primaryText }]}>{title}</RNText>
          </>
        )}
      </Pressable>
    </View>
  );
}

export function GhostButton({
  title, onPress, danger, icon,
}: {
  title: string; onPress: () => void; danger?: boolean; icon?: IconName;
}) {
  const colors = useTheme();
  const fg = danger ? colors.danger : colors.text;
  return (
    <View style={styles.shadowWrap}>
      <ShadowRect color={colors.ink} />
      <Pressable
        hitSlop={4}
        onPress={onPress}
        style={({ pressed }) => [
          styles.ghostBtn,
          { backgroundColor: colors.surface, borderColor: colors.ink },
          pressed && styles.sink,
        ]}
      >
        {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
        <RNText style={{ fontSize: 14, fontWeight: '800', color: fg }}>{title}</RNText>
      </Pressable>
    </View>
  );
}

export function IconButton({ name, onPress, danger }: { name: IconName; onPress: () => void; danger?: boolean }) {
  const colors = useTheme();
  return (
    <View style={styles.shadowWrap2}>
      <ShadowRect color={colors.ink} offset={2} />
      <Pressable
        hitSlop={6}
        onPress={onPress}
        style={({ pressed }) => [
          styles.iconBtn,
          { backgroundColor: colors.surface, borderColor: colors.ink },
          pressed && styles.sink2,
        ]}
      >
        <Ionicons name={name} size={15} color={danger ? colors.danger : colors.subtext} />
      </Pressable>
    </View>
  );
}

// ---------- 表单控件 ----------
interface InputProps {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; secure?: boolean; keyboardType?: KeyboardTypeOptions;
  multiline?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  required?: boolean;
}

export function Input(props: InputProps) {
  const colors = useTheme();
  const [revealed, setRevealed] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={styles.fieldGap}>
      <T variant="cap" style={styles.fieldLabel}>{props.label}{props.required ? ' *' : ''}</T>
      <View>
        <TextInput
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.placeholder}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={props.secure && !revealed}
          keyboardType={props.keyboardType}
          multiline={props.multiline}
          autoCapitalize={props.autoCapitalize ?? 'none'}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              borderColor: focused ? colors.primary : colors.ink,
              color: colors.text,
              minHeight: props.multiline ? 84 : 50,
              textAlignVertical: props.multiline ? 'top' : 'center',
            },
          ]}
        />
        {props.secure && !props.multiline ? (
          <Pressable
            hitSlop={6}
            onPress={() => setRevealed(r => !r)}
            style={styles.inputEye}
          >
            <Ionicons name={revealed ? 'eye-off' : 'eye'} size={18} color={colors.subtext} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export interface PickerOption { label: string; value: string; }

export function PickerField({
  label, value, options, onChange, required,
}: {
  label: string; value: string; options: PickerOption[]; onChange: (v: string) => void; required?: boolean;
}) {
  const colors = useTheme();
  const [open, setOpen] = React.useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View style={styles.fieldGap}>
      <T variant="cap" style={styles.fieldLabel}>{label}{required ? ' *' : ''}</T>
      <View style={styles.shadowWrap}>
        <ShadowRect color={colors.ink} />
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.input,
            styles.pickerField,
            { backgroundColor: colors.surface, borderColor: colors.ink },
            pressed && styles.sink,
          ]}
        >
          <RNText style={{ color: current ? colors.text : colors.placeholder, fontSize: 15, fontWeight: '600' }}>
            {current ? current.label : '请选择'}
          </RNText>
          <Ionicons name="chevron-down" size={16} color={colors.subtext} />
        </Pressable>
      </View>
      <PickerSheet
        visible={open}
        title={label}
        options={options}
        value={value}
        onSelect={(v) => { onChange(v); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/** 底部选择弹层：标题栏 + 大触感选项；点遮罩关闭，点面板本身不关闭 */
export function PickerSheet({
  visible, title, options, value, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.modalMask, { backgroundColor: colors.scrim }]} onPress={onClose}>
        <View style={styles.sheetShadowWrap}>
          <ShadowRect color={colors.ink} offset={6} />
          <Pressable
            style={[
              styles.sheetCard,
              { backgroundColor: colors.surface, borderColor: colors.ink, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.ink }]}>
              <T variant="title">{title}</T>
              <Pressable
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.sheetClose,
                  { backgroundColor: colors.surface, borderColor: colors.ink },
                  pressed && styles.sink2,
                ]}
              >
                <Ionicons name="close-sharp" size={16} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: Math.round(height * 0.5) }} bounces={false}>
              {options.map((o, i) => {
                const selected = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => { onSelect(o.value); }}
                    style={({ pressed }) => [
                      styles.optionRow,
                      i < options.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
                      selected && { backgroundColor: colors.accentDim },
                      pressed && { backgroundColor: colors.accent },
                    ]}
                  >
                    <RNText
                      style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: selected ? '900' : '600' }}
                      numberOfLines={1}
                    >
                      {o.label}
                    </RNText>
                    {selected && <Ionicons name="checkmark-sharp" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export function MultiSelect({
  label, values, options, onChange,
}: {
  label: string; values: string[]; options: PickerOption[]; onChange: (v: string[]) => void;
}) {
  const colors = useTheme();
  const toggle = (val: string) => {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };
  return (
    <View style={styles.fieldGap}>
      <T variant="cap" style={styles.fieldLabel}>{label}</T>
      <View style={styles.chipRow}>
        {options.map(o => {
          const selected = values.includes(o.value);
          return (
            <Pressable
              key={o.value}
              onPress={() => toggle(o.value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.accent : colors.surface,
                  borderColor: colors.ink,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <RNText style={{ color: selected ? colors.ink : colors.subtext, fontSize: 13, fontWeight: '800' }}>
                {o.label}
              </RNText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- 空状态 ----------
export function EmptyState({ icon, title, sub }: { icon: IconName; title: string; sub?: string }) {
  const colors = useTheme();
  return (
    <View style={styles.emptyState}>
      <View style={styles.shadowWrap}>
        <ShadowRect color={colors.ink} />
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
          <View style={[styles.emptyIconBox, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
            <Ionicons name={icon} size={26} color={colors.ink} />
          </View>
          <T variant="title" style={styles.emptyTitle}>{title}</T>
          {sub ? <T variant="cap" style={styles.emptySub}>{sub}</T> : null}
        </View>
      </View>
    </View>
  );
}

// ---------- 分区标题 ----------
export function SectionHeader({ icon, text }: { icon: IconName; text: string }) {
  const colors = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconBox, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
        <Ionicons name={icon} size={12} color={colors.ink} />
      </View>
      <T variant="title">{text}</T>
    </View>
  );
}

// ---------- 样式 ----------
const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: metrics.borderWidth,
  },
  backBtn: {
    width: 32, height: 32, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  headerLogoBox: { overflow: 'hidden' },
  headerLogo: { width: 22, height: 22 },
  headerRight: { flex: 1, alignItems: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  // 硬阴影
  shadowWrap: { paddingRight: SHADOW, paddingBottom: SHADOW },
  shadowWrap2: { paddingRight: 2, paddingBottom: 2 },
  sink: { transform: [{ translateX: SHADOW }, { translateY: SHADOW }] },
  sink2: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  card: { borderWidth: 2, padding: 14 },
  divider: { height: metrics.borderWidth, marginVertical: 12 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 2,
    marginRight: 6,
    marginBottom: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderWidth: 2,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderWidth: 2,
  },
  iconBtn: { width: 28, height: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  fieldGap: { marginBottom: 20 },
  fieldLabel: { marginBottom: 8 },
  input: {
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
  },
  inputEye: { position: 'absolute', right: 14, top: 16 },
  pickerField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalMask: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  sheetShadowWrap: { paddingRight: 6, paddingBottom: 6 },
  sheetCard: { borderWidth: 2 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  sheetClose: { width: 30, height: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyCard: { borderWidth: 2, padding: 24, alignItems: 'center' },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { marginTop: 16 },
  emptySub: { marginTop: 8, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionIconBox: { width: 22, height: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
