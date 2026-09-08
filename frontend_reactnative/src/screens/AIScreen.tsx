/**
 * AI 助手页：基于个人习惯/任务数据的对话答疑
 * 服务端负责拼数据上下文与多轮历史；本页只管会话 UI
 *
 * 布局：Header → 消息区(弹性) → 输入坞(恒贴底) → TabBar 垫片
 * 交互：流式逐字上屏；生成中 Send 变「停止」；自动吸底跟随；空态居中引导卡
 * 键盘：iOS 手动监听键盘事件补 padding（避免 KeyboardAvoidingView 残留缝隙把输入坞顶到中间）
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, FlatList, Keyboard, Platform, Pressable, StyleSheet, TextInput, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, T, EmptyState, PrimaryButton } from '../ui/components';
import { MiniMarkdown } from '../ui/MiniMarkdown';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/auth';
import { useToast } from '../ui/toast';
import { confirmAsync } from '../ui/confirm';
import { TabBarSpacer } from '../ui/TabBarSpacer';
import { api_aiChatStream, api_aiChatClear, api_aiChatHistory, api_aiStatus } from '../api/ai';
import type { AIToolEvent } from '../api/ai';
import type { RootNav } from '../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;

/** 本地消息（服务端历史 + 当轮新增） */
interface LocalMsg {
  key: string;
  role: 'user' | 'assistant';
  content: string;
  /** 正在流式生成中：内容随分片增长，气泡尾带闪烁光标 */
  streaming?: boolean;
  /** 本条回复过程中 AI 执行过的工具（查询/建任务/打卡…） */
  tools?: AIToolEvent[];
}

const QUICK_ASKS: { icon: IconName; label: string }[] = [
  { icon: 'flame', label: '本周习惯总结' },
  { icon: 'warning', label: '哪个习惯最难坚持？' },
  { icon: 'add-circle', label: '帮我建个任务' },
  { icon: 'checkbox', label: '看看今天还有什么没做' },
];

export default function AIScreen() {
  const colors = useTheme();
  const navigation = useNavigation<RootNav>();
  const user = useAuthStore(s => s.user);
  const toast = useToast();

  const [checking, setChecking] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const keySeq = useRef(0);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList<LocalMsg>>(null);
  const inputRef = useRef<TextInput>(null);
  /** 是否停在列表最底部（新消息/流式片段到来时自动跟到底） */
  const atBottomRef = useRef(true);

  const nextKey = () => `m${++keySeq.current}`;

  // iOS 键盘：手动跟随，弹起/收起都归零，杜绝布局残留
  const [kbPad, setKbPad] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subs = [
      Keyboard.addListener('keyboardWillShow', (e) => setKbPad(e.endCoordinates.height)),
      Keyboard.addListener('keyboardWillHide', () => setKbPad(0)),
    ];
    return () => { subs.forEach(s => s.remove()); };
  }, []);

  /** 吸底：仅在用户本就停在底部时才跟随滚动 */
  const pinToBottom = () => {
    if (atBottomRef.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  };

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      setChecking(true);
      try {
        const s = await api_aiStatus();
        if (!alive) return;
        setEnabled(s.enabled);
        if (s.enabled && !busyRef.current) {
          const h = await api_aiChatHistory();
          if (!alive) return;
          setMessages(h.messages.map(m => ({ key: `h${m.id}`, role: m.role, content: m.content })));
        }
      } catch {
        if (alive) setEnabled(false);
      }
      if (alive) setChecking(false);
    })();
    return () => { alive = false; };
  }, []));

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current) return;
    setInput('');
    const userKey = nextKey();
    const replyKey = nextKey();
    setMessages(prev => [
      ...prev,
      { key: userKey, role: 'user', content: text },
      { key: replyKey, role: 'assistant', content: '', streaming: true },
    ]);
    setBusy(true);
    busyRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;
    const toolAcc: AIToolEvent[] = [];
    setTimeout(pinToBottom, 40);
    try {
      await api_aiChatStream(text, delta => {
        setMessages(prev => prev.map(m => (m.key === replyKey ? { ...m, content: m.content + delta } : m)));
        pinToBottom();
      }, ac.signal, ev => {
        toolAcc.push(ev);
        setMessages(prev => prev.map(m => (m.key === replyKey ? { ...m, tools: [...toolAcc] } : m)));
        pinToBottom();
      });
    } catch (e: any) {
      const aborted = e?.name === 'AbortError';
      if (!aborted) toast.show(e?.message ?? 'AI 调用失败', 'error');
      // 出错/中止：空回复气泡移除，已有部分内容保留
      setMessages(prev => prev.filter(m => m.key !== replyKey || m.content));
    } finally {
      setMessages(prev => prev.map(m => (m.key === replyKey ? { ...m, streaming: false } : m)));
      abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
      pinToBottom();
    }
  };

  const stop = () => abortRef.current?.abort();

  const clearChat = async () => {
    if (busy || messages.length === 0) return;
    const ok = await confirmAsync('清空对话', '确定清空全部 AI 聊天记录？', '清空');
    if (!ok) return;
    try {
      await api_aiChatClear();
      setMessages([]);
    } catch (e: any) {
      toast.show(e?.message ?? '清空失败', 'error');
    }
  };

  if (checking) {
    return (
      <Screen>
        <Header title="AI 助手" back={false} />
        <View style={styles.center}>
          <T variant="cap">检查 AI 服务状态…</T>
        </View>
      </Screen>
    );
  }

  if (!enabled) {
    return (
      <Screen>
        <Header title="AI 助手" back={false} />
        <EmptyState
          icon="sparkles"
          title="AI 功能未开放"
          sub={user?.role === 'admin' ? '先在「AI 设置」中配置供应商与模型' : '管理员尚未启用 AI 服务'}
        />
        {user?.role === 'admin' && (
          <View style={styles.configBtnWrap}>
            <PrimaryButton title="去配置" icon="settings-outline" onPress={() => navigation.navigate('AISettings')} />
          </View>
        )}
      </Screen>
    );
  }

  const canSend = !busy && input.trim().length > 0;

  return (
    <Screen>
      <Header
        title="AI 助手"
        back={false}
        right={
          messages.length > 0 ? (
            <Pressable
              hitSlop={8}
              disabled={busy}
              onPress={() => void clearChat()}
              style={({ pressed }) => [(pressed || busy) && { opacity: 0.5 }]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.subtext} />
            </Pressable>
          ) : null
        }
      />
      <View style={[styles.body, { paddingBottom: kbPad }]}>
        {messages.length === 0 ? (
          /* 空态引导：居中卡片 + 快捷提问 */
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: colors.accent, borderColor: colors.ink }]}>
              <Ionicons name="sparkles" size={26} color={colors.ink} />
            </View>
            <T variant="h2" style={styles.heroTitle}>和你的数据聊聊</T>
            <T variant="cap" style={styles.heroSub}>能答疑分析，也能替你打卡、建任务，试试这些：</T>
            <View style={styles.heroChips}>
              {QUICK_ASKS.map(q => (
                <Pressable
                  key={q.label}
                  onPress={() => void send(q.label)}
                  style={({ pressed }) => [
                    styles.heroChip,
                    { backgroundColor: colors.surface, borderColor: colors.ink },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name={q.icon} size={13} color={colors.ink} />
                  <T variant="cap" style={styles.heroChipText} color={colors.ink}>{q.label}</T>
                </Pressable>
              ))}
            </View>
            <T variant="cap" style={styles.heroFoot}>回复为流式生成 · 删除类操作会先跟你确认</T>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.flex1}
            contentContainerStyle={styles.listContent}
            data={[...messages].reverse()}
            inverted
            keyExtractor={m => m.key}
            renderItem={({ item }) => <Bubble msg={item} />}
            onScroll={e => { atBottomRef.current = e.nativeEvent.contentOffset.y <= 40; }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* 输入坞：恒贴底 */}
        <View style={[styles.dock, { borderTopColor: colors.ink, backgroundColor: colors.background }]}>
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={busy ? 'AI 正在回复…' : '问点什么…'}
            placeholderTextColor={colors.placeholder}
            style={[
              styles.input,
              {
                backgroundColor: colors.surface, borderColor: colors.ink, color: colors.text,
                minHeight: 46, maxHeight: 110,
              },
            ]}
            multiline
            textAlignVertical="center"
            autoCapitalize="sentences"
            editable={!busy}
            submitBehavior="submit"
            onSubmitEditing={() => void send()}
          />
          <Pressable
            disabled={busy ? false : !canSend}
            onPress={busy ? stop : () => void send()}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: busy ? colors.danger : canSend ? colors.primary : colors.surfaceAlt,
                borderColor: colors.ink,
              },
              (pressed || (!busy && !canSend)) && { opacity: 0.6 },
            ]}
          >
            <Ionicons name={busy ? 'stop' : 'arrow-up'} size={20} color={busy ? colors.ink : colors.ink} />
          </Pressable>
        </View>
        <TabBarSpacer />
      </View>
    </Screen>
  );
}

/** 单条消息气泡：AI 左侧带头像块，用户右侧对齐；AI 气泡内先列本轮执行过的工具 */
function Bubble({ msg }: { msg: LocalMsg }) {
  const colors = useTheme();
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAI]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: colors.primary, borderColor: colors.ink }]}>
          <Ionicons name="sparkles" size={12} color={colors.ink} />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          { backgroundColor: isUser ? colors.accent : colors.surface, borderColor: colors.ink },
        ]}
      >
        {isUser ? (
          <T variant="body" style={styles.bubbleText} color={colors.ink}>{msg.content}</T>
        ) : (
          // AI 回复为 Markdown:标题/表格/列表等走 MiniMarkdown 渲染;流式未闭合语法自动降级为文本
          <>
            {msg.tools?.map((t, i) => (
              <View key={`t${i}`} style={[styles.toolChip, { borderColor: colors.ink }]}>
                <Ionicons
                  name={t.ok ? 'checkmark-circle' : 'alert-circle'}
                  size={12}
                  color={t.ok ? colors.primary : colors.danger}
                />
                <T variant="cap" style={styles.toolChipText}>{t.label}{t.detail ? ` · ${t.detail}` : ''}</T>
              </View>
            ))}
            {msg.content ? <MiniMarkdown text={msg.content} /> : null}
            {msg.streaming ? (
              <View style={styles.cursorRow}>
                <StreamCursor />
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

/** 流式光标：静止状态才渲染，持续闪烁表示生成中 */
function StreamCursor() {
  const colors = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.Text style={{ opacity, color: colors.primary, fontWeight: '900' }}>▌</Animated.Text>;
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  configBtnWrap: { paddingHorizontal: 24, paddingBottom: 24 },
  body: { flex: 1 },
  // 空态引导
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingBottom: 8 },
  heroIcon: {
    width: 58, height: 58, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroTitle: { marginBottom: 6 },
  heroSub: { textTransform: 'none', letterSpacing: 0, textAlign: 'center', marginBottom: 18 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 2, paddingHorizontal: 10, paddingVertical: 8,
  },
  heroChipText: { textTransform: 'none', letterSpacing: 0, fontSize: 11 },
  heroFoot: { marginTop: 18, opacity: 0.7 },
  // 消息列表
  listContent: { padding: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  rowAI: { paddingRight: 12 },
  rowUser: { justifyContent: 'flex-end', paddingLeft: 12 },
  avatar: {
    width: 24, height: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginRight: 8, marginTop: 4,
  },
  bubble: { borderWidth: 2, paddingHorizontal: 12, paddingVertical: 9, maxWidth: '94%' },
  bubbleText: { lineHeight: 21, textTransform: 'none', letterSpacing: 0 },
  toolChip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4,
    borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 6,
  },
  toolChipText: { textTransform: 'none', letterSpacing: 0, fontSize: 10 },
  cursorRow: { height: 20, justifyContent: 'center' },
  // 输入坞
  dock: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderTopWidth: 2,
  },
  input: {
    flex: 1, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, fontWeight: '600',
  },
  sendBtn: {
    width: 48, height: 48, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 1,
  },
});
