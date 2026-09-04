/**
 * 日期页：查看 / 补录任意一天的习惯记录
 */
import React, { useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Screen, Header } from '../ui/components';
import { useTheme } from '../hooks/useTheme';
import { DayHabitList } from '../ui/DayHabitList';
import { addDays, todayString, WEEKDAY_NAMES } from '../db/logic';
import type { RootParamList } from '../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;

function friendlyTitle(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日 · 周${WEEKDAY_NAMES[dt.getDay()]}`;
}

function NavBtn({ name, onPress, disabled, accent }: {
  name: IconName; onPress: () => void; disabled?: boolean; accent?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={styles.btnWrap}>
      <View pointerEvents="none" style={[styles.btnShadow, { backgroundColor: colors.ink }]} />
      <Pressable
        disabled={disabled}
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [
          styles.navBtn,
          { backgroundColor: accent && !disabled ? colors.accent : colors.surface, borderColor: colors.ink },
          disabled && { opacity: 0.35 },
          pressed && styles.sink,
        ]}
      >
        <Ionicons name={name} size={16} color={colors.ink} />
      </Pressable>
    </View>
  );
}

export default function DayScreen() {
  const route = useRoute<RouteProp<RootParamList, 'Day'>>();
  const today = todayString();
  const [date, setDate] = useState(route.params?.date ?? today);
  const isToday = date === today;

  return (
    <Screen>
      <Header
        title={friendlyTitle(date)}
        right={
          <View style={styles.navRow}>
            <NavBtn name="chevron-back" onPress={() => setDate(addDays(date, -1))} />
            {!isToday && <NavBtn name="today-outline" accent onPress={() => setDate(today)} />}
            <NavBtn
              name="chevron-forward"
              disabled={date >= today}
              onPress={() => setDate(addDays(date, 1))}
            />
          </View>
        }
      />
      <DayHabitList date={date} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnWrap: { paddingRight: 2, paddingBottom: 2 },
  btnShadow: { position: 'absolute', top: 2, left: 2, right: 0, bottom: 0 },
  navBtn: { width: 30, height: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sink: { transform: [{ translateX: 2 }, { translateY: 2 }] },
});
