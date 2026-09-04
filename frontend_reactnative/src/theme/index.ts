/**
 * 新野兽派主题
 * 奶油底色、纯白卡面、墨黑粗边框、硬偏移阴影、高饱和色块、零渐变零圆角
 */
import { Platform } from 'react-native';

export const palette = {
  cream: '#F5F1E6',       // 页面底色
  creamDark: '#EDE7D6',   // 次级面
  white: '#FFFFFF',       // 卡面
  ink: '#141414',         // 墨黑：边框 / 阴影 / 正文
  inkSoft: '#57534A',     // 次级文字
  inkFaint: '#A8A093',    // 占位文字
  line: '#D9D2C2',        // 弱分割线
  green: '#00C16A',
  greenDim: 'rgba(0,193,106,0.16)',
  red: '#FF4D4D',
  redDim: 'rgba(255,77,77,0.18)',
  yellow: '#FFD02E',
  yellowDim: 'rgba(255,208,46,0.25)',
  blue: '#4D7CFE',
  blueDim: 'rgba(77,124,254,0.16)',
  scrim: 'rgba(20,20,20,0.55)',
};

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderLight: string;
  text: string;
  subtext: string;
  placeholder: string;
  ink: string;
  primary: string;
  primaryDim: string;
  primaryText: string;
  danger: string;
  dangerDim: string;
  success: string;
  successDim: string;
  accent: string;
  accentDim: string;
  info: string;
  infoDim: string;
  mask: string;
  scrim: string;
}

export const colors: ThemeColors = {
  background: palette.cream,
  surface: palette.white,
  surfaceAlt: palette.creamDark,
  border: palette.ink,
  borderLight: palette.line,
  text: palette.ink,
  subtext: palette.inkSoft,
  placeholder: palette.inkFaint,
  ink: palette.ink,
  primary: palette.green,
  primaryDim: palette.greenDim,
  primaryText: palette.ink,   // 色块上一律墨黑文字
  danger: palette.red,
  dangerDim: palette.redDim,
  success: palette.green,
  successDim: palette.greenDim,
  accent: palette.yellow,
  accentDim: palette.yellowDim,
  info: palette.blue,
  infoDim: palette.blueDim,
  mask: palette.scrim,
  scrim: palette.scrim,
};

/** 习惯可配色板：key 存入 habits.color */
export const HABIT_COLORS: Record<string, { bg: string; dim: string; label: string }> = {
  green:  { bg: palette.green,  dim: palette.greenDim,  label: '绿' },
  blue:   { bg: palette.blue,   dim: palette.blueDim,   label: '蓝' },
  yellow: { bg: palette.yellow, dim: palette.yellowDim, label: '黄' },
  orange: { bg: '#FF8A00',      dim: 'rgba(255,138,0,0.18)',  label: '橙' },
  red:    { bg: palette.red,    dim: palette.redDim,    label: '红' },
  purple: { bg: '#9B51E0',      dim: 'rgba(155,81,224,0.16)', label: '紫' },
  pink:   { bg: '#FF5CA8',      dim: 'rgba(255,92,168,0.16)', label: '粉' },
  teal:   { bg: '#00B8A9',      dim: 'rgba(0,184,169,0.16)',  label: '青' },
};

export function habitColor(colorKey: string): { bg: string; dim: string } {
  return HABIT_COLORS[colorKey] ?? HABIT_COLORS.green;
}

export const metrics = {
  radius: 0,          // 野兽派：零圆角
  gap: 12,
  screenPadding: 16,
  borderWidth: 2,     // 粗边框
  shadowOffset: 4,    // 硬偏移阴影
  monoFont: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};
