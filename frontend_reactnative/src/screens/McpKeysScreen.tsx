/**
 * MCP 密钥页：生成/复制/吊销外部 AI 客户端接入 /mcp 的长期密钥
 * 上半：密钥管理；下半：分段 tab「安装教程 / 使用教程」
 * 整页单一 ScrollView，tab 切换用条件渲染
 */
import React, { useCallback, useState } from 'react';
import {
  Platform, Pressable, ScrollView, Share,
  StyleSheet, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, T, Card, Divider, PrimaryButton } from '../ui/components';
import { confirmAsync } from '../ui/confirm';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../ui/toast';
import { BASE_URL } from '../api/client';
import { api_mcpKeyList, api_mcpKeyCreate, api_mcpKeyDelete, McpKey } from '../api/mcpKeys';

const MCP_URL = `${BASE_URL}/mcp`;

const TAB_LABELS = ['安装教程', '使用教程'] as const;
const TAB_ICONS = ['download-outline', 'chatbubbles-outline'] as const;

// ---------- 安装教程数据 ----------

interface TutorialItem {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  buildConfig: (url: string, key: string) => string;
  buildPrompt: (url: string, key: string) => string;
}

const INSTALL_TUTORIALS: TutorialItem[] = [
  {
    icon: 'terminal-outline',
    title: 'Hermes Agent',
    desc: 'MCP 加到 ~/.hermes/config.yaml，规则定死写入全局 ~/.hermes/SOUL.md（所有项目生效，禁止写进任何项目的 CLAUDE.md）。',
    buildConfig: (url, key) =>
      `mcp_servers:\n  cleanstreak:\n    url: "${url}"\n    headers:\n      Authorization: "Bearer ${key}"\n    timeout: 120`,
    buildPrompt: (url, key) =>
      `请在 ~/.hermes/config.yaml 的 mcp_servers 下添加一个名为 cleanstreak 的 HTTP 类型 MCP 服务器，URL 为 ${url}，Authorization header 为 "Bearer ${key}"，timeout 设为 120。添加完成后用 /reload-mcp 热加载（或重启 Hermes）。\n\n然后，把以下规则追加到 Hermes 的全局系统级规则文件 ~/.hermes/SOUL.md（该文件每次会话无条件注入系统提示词，对所有项目生效）。只允许写入 ~/.hermes/SOUL.md，严禁写入任何项目的 CLAUDE.md / AGENTS.md / .hermes.md 等项目级规则文件：\n\nCleanStreak 任务/习惯管理规则：\n- 任务管理（创建、查询、完成、阻塞、搬运过期任务等）必须调用 CleanStreak MCP 的对应工具\n- 习惯管理（打卡、计数、创建、统计等）必须调用 CleanStreak MCP 的对应工具\n- 日报必须调用 generate_daily_report，周报必须调用 generate_weekly_report，把返回的「报告」原文输出给用户——不要自己排版、不要混入其他工具的数据、不要自行点评\n- 查询任务统计、数据总览必须调用 get_task_stats / get_data_overview 工具\n- 不要绕过 MCP 自己分析 git log 或读写本地文件来生成报告`,
  },
  {
    icon: 'code-slash-outline',
    title: 'Claude Code',
    desc: '在终端执行以下命令添加远程 MCP 服务器。',
    buildConfig: (url, key) =>
      `claude mcp add --transport http cleanstreak ${url} \\\n  --header "Authorization: Bearer ${key}"`,
    buildPrompt: (url, key) =>
      `请帮我执行以下命令，把 CleanStreak 的 MCP 服务器添加到 Claude Code：\nclaude mcp add --transport http cleanstreak ${url} --header "Authorization: Bearer ${key}"`,
  },
  {
    icon: 'desktop-outline',
    title: 'Cursor / ZCode',
    desc: '在 MCP 设置里添加 HTTP 类型服务器，或在 config.json 中配置。',
    buildConfig: (url, key) =>
      JSON.stringify(
        { mcp: { servers: { cleanstreak: { type: 'http', url, headers: { Authorization: `Bearer ${key}` } } } } },
        null, 2,
      ),
    buildPrompt: (url, key) =>
      `请把以下 MCP 服务器配置添加到 Cursor 的 MCP 设置中（类型选 HTTP/streamable）：\n名称：cleanstreak\nURL：${url}\nHeader：Authorization: Bearer ${key}`,
  },
  {
    icon: 'globe-outline',
    title: '通用 HTTP 客户端',
    desc: '任何支持 MCP Streamable HTTP 的客户端，使用以下三要素连接。',
    buildConfig: (url, key) =>
      `传输类型：Streamable HTTP\nURL：${url}\nHeader：Authorization: Bearer ${key}`,
    buildPrompt: (url, key) =>
      `请帮我配置一个 MCP 服务器连接：传输类型 Streamable HTTP，URL ${url}，Authorization header 为 Bearer ${key}。`,
  },
  {
    icon: 'terminal-outline',
    title: 'curl 手动测试',
    desc: '用 curl 直接调 MCP 端点，验证连接是否正常。',
    buildConfig: (url, key) =>
      `# 列出工具\ncurl -s ${url} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'\n\n# 调用工具示例\ncurl -s ${url} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_tasks","arguments":{}}}'`,
    buildPrompt: (url, key) =>
      `请用 curl 测试以下 MCP 端点是否可用：\n1. 先 POST ${url}，Header 带 Authorization: Bearer ${key}，body 为 {"jsonrpc":"2.0","id":1,"method":"tools/list"}\n2. 再调用 tools/call 测试 list_tasks 工具`,
  },
];

// ---------- 使用教程数据 ----------

interface UsageItem {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  examples: string[];
}

const USAGE_ITEMS: UsageItem[] = [
  {
    icon: 'checkbox-outline',
    title: '任务管理',
    examples: [
      '帮我查一下今天的任务',
      '创建一个任务：写周报，优先级 P1',
      '把「写周报」标记为完成',
      '追加进展：已发给领导',
      '阻塞「联调接口」，原因是等后端部署',
      '把过期任务都搬到今天',
      '查一下 Work 分组本周的任务统计',
    ],
  },
  {
    icon: 'flame-outline',
    title: '习惯与打卡',
    examples: [
      '查一下我有哪些习惯',
      '给喝水习惯打卡',
      '阅读习惯 +30 分钟',
      '查看今天的打卡记录',
      '查看喝水习惯的统计数据',
      '创建一个习惯：早起，每天 7 点',
      '把跑步习惯归档',
    ],
  },
  {
    icon: 'folder-outline',
    title: '分组与项目',
    examples: [
      '查一下有哪些分组',
      '创建一个分组叫「副业」',
      '把「副业」重命名为「外包」',
      '创建一个项目叫「掌上宅」',
    ],
  },
  {
    icon: 'analytics-outline',
    title: '数据总览',
    examples: [
      '看一下本周的数据总览',
      '查一下本月的习惯达成情况',
      '今天的任务报告',
    ],
  },
  {
    icon: 'document-text-outline',
    title: '日报 / 周报',
    examples: [
      '生成今天的日报',
      '生成 2026-09-08 的日报',
      '生成本周周报',
      '生成上周周报（传该周内任意一天的日期）',
    ],
  },
  {
    icon: 'shield-checkmark-outline',
    title: '安全机制',
    examples: [
      '删除操作（任务/习惯/分组/项目）需要二次确认',
      'AI 会先复述目标，等你明确同意后才执行删除',
      '所有操作按用户隔离，只能操作自己的数据',
      '每次调用都写审计日志',
    ],
  },
];

// ---------- 主页面 ----------

export default function McpKeysScreen() {
  const colors = useTheme();
  const toast = useToast();

  const [keys, setKeys] = useState<McpKey[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    try {
      const r = await api_mcpKeyList();
      setKeys(r.keys);
    } catch (e: any) {
      toast.show(e?.message ?? '加载失败', 'error');
    } finally {
      setLoaded(true);
    }
  }, [toast]);

  React.useEffect(() => { void reload(); }, [reload]);

  const copyText = async (text: string, tip = '已复制到剪贴板') => {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
        toast.show(tip, 'success');
      } catch {
        toast.show('复制失败，请手动选择文本', 'error');
      }
      return;
    }
    try {
      await Share.share({ message: text });
    } catch {}
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const k = await api_mcpKeyCreate(label.trim() || undefined);
      setLabel('');
      await reload();
      toast.show(`已生成「${k.label}」`, 'success');
    } catch (e: any) {
      toast.show(e?.message ?? '生成失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (k: McpKey) => {
    const ok = await confirmAsync('吊销密钥', `确定吊销「${k.label}」？使用它的客户端将立即失去访问权限。`, '吊销');
    if (!ok) return;
    try {
      await api_mcpKeyDelete(k.id);
      await reload();
      toast.show('已吊销', 'success');
    } catch (e: any) {
      toast.show(e?.message ?? '删除失败', 'error');
    }
  };

  const activeKey = keys[0]?.key ?? '<生成密钥后自动填入>';

  return (
    <Screen>
      <Header title="MCP 密钥" />
      <ScrollView style={styles.flex1} contentContainerStyle={styles.body}>

        {/* ---- 密钥管理 ---- */}
        <Card>
          <T variant="body" style={styles.paraTitle}>给外部 AI 助手的通行证</T>
          <T variant="cap" style={styles.paraText}>
            在 hermes、ZCode 等支持 MCP 的 AI 客户端里配置以下地址和密钥，就能让它直接管理你的任务、
            习惯与打卡。密钥等同账号凭证，请勿外传；吊销后立即失效。
          </T>
          <CopyRow label="MCP 地址" value={MCP_URL} onCopy={() => void copyText(MCP_URL)} />
          <CopyRow label="鉴权头" value={`Authorization: Bearer ${keys[0]?.key ?? '<你的密钥>'}`}
                   onCopy={() => keys[0] && void copyText(`Authorization: Bearer ${keys[0].key}`)} />
        </Card>

        <View style={styles.createRow}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="备注（可选，如 hermes）"
            placeholderTextColor={colors.placeholder}
            style={[styles.labelInput, { borderColor: colors.ink, backgroundColor: colors.surface, color: colors.text }]}
            maxLength={50}
          />
          <PrimaryButton title="生成密钥" icon="add" onPress={() => void create()} disabled={busy} />
        </View>

        {loaded && keys.length === 0 && (
          <T variant="cap" style={styles.empty}>还没有密钥，点上方「生成密钥」创建一个</T>
        )}
        {keys.map(k => (
          <Card key={k.id}>
            <View style={styles.keyHeader}>
              <View style={styles.keyTitleWrap}>
                <T variant="body">{k.label}</T>
                <T variant="cap" style={styles.keyMeta}>
                  创建于 {k.created_at?.slice(0, 10)}
                  {k.last_used_at ? ` · 最近使用 ${k.last_used_at.slice(0, 10)}` : ' · 从未使用'}
                </T>
              </View>
              <Pressable hitSlop={8} onPress={() => void remove(k)} style={({ pressed }) => pressed && { opacity: 0.5 }}>
                <Ionicons name="trash-outline" size={17} color={colors.danger} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => void copyText(k.key)}
              style={({ pressed }) => [
                styles.keyBox, { borderColor: colors.ink, backgroundColor: colors.surfaceAlt },
                pressed && { opacity: 0.7 },
              ]}
            >
              <T variant="cap" style={styles.keyText} numberOfLines={1}>{k.key}</T>
              <Ionicons name="copy-outline" size={14} color={colors.subtext} />
            </Pressable>
            <T variant="cap" style={styles.keyTip}>点一下复制 · 配置到客户端的 Authorization: Bearer ***</T>
          </Card>
        ))}

        <Divider />

        {/* ---- 分段 tab ---- */}
        <PageTabs page={page} onChange={setPage} />

        {/* ---- 安装教程 ---- */}
        {page === 0 && (
          <>
            <T variant="cap" style={styles.paraText}>
              选择你的 AI 客户端，展开查看配置方式，一键复制配置 JSON。
            </T>
            {INSTALL_TUTORIALS.map((t, idx) => (
              <TutorialCard
                key={t.title}
                item={t}
                expanded={expandedIdx === idx}
                onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                mcpUrl={MCP_URL}
                activeKey={activeKey}
                onCopy={(text) => void copyText(text, '配置已复制')}
              />
            ))}
          </>
        )}

        {/* ---- 使用教程 ---- */}
        {page === 1 && (
          <>
            <T variant="cap" style={styles.paraText}>
              连接成功后，直接用自然语言和 AI 对话即可管理任务、习惯与打卡。
            </T>
            {USAGE_ITEMS.map(item => (
              <UsageCard key={item.title} item={item} />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------- 子组件 ----------

/** 分段 tab：墨框容器 + 硬阴影，选中段黄底 */
function PageTabs({ page, onChange }: { page: number; onChange: (p: number) => void }) {
  const colors = useTheme();
  return (
    <View style={tabsStyles.wrap}>
      <View pointerEvents="none" style={[tabsStyles.shadow, { backgroundColor: colors.ink }]} />
      <View style={[tabsStyles.row, { backgroundColor: colors.surface, borderColor: colors.ink }]}>
        {TAB_LABELS.map((label, i) => {
          const active = page === i;
          return (
            <Pressable
              key={label}
              onPress={() => onChange(i)}
              style={({ pressed }) => [
                tabsStyles.seg,
                i < TAB_LABELS.length - 1 && tabsStyles.segDivider,
                active && { backgroundColor: colors.accent },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name={TAB_ICONS[i] as any} size={13} color={colors.ink} />
              <T variant="cap" color={colors.ink} style={tabsStyles.segText}>{label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** 说明卡里的单行「标签 + 值 + 复制」 */
function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  const colors = useTheme();
  return (
    <Pressable onPress={onCopy} style={({ pressed }) => [styles.copyRow, { borderColor: colors.ink }, pressed && { opacity: 0.7 }]}>
      <View style={styles.copyTexts}>
        <T variant="cap" style={styles.copyLabel}>{label}</T>
        <T variant="cap" style={styles.copyValue} numberOfLines={1}>{value}</T>
      </View>
      <Ionicons name="copy-outline" size={14} color={colors.subtext} />
    </Pressable>
  );
}

/** 可展开的安装教程卡片 */
function TutorialCard({
  item, expanded, onToggle, mcpUrl, activeKey, onCopy,
}: {
  item: TutorialItem;
  expanded: boolean;
  onToggle: () => void;
  mcpUrl: string;
  activeKey: string;
  onCopy: (text: string) => void;
}) {
  const colors = useTheme();
  const configText = item.buildConfig(mcpUrl, activeKey);

  return (
    <Card>
      <Pressable onPress={onToggle} style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Ionicons name={item.icon} size={18} color={colors.primary} />
          <T variant="body" style={styles.cardTitle}>{item.title}</T>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.subtext} />
      </Pressable>
      <T variant="cap" style={styles.cardDesc}>{item.desc}</T>
      {expanded && (
        <>
          <View style={[styles.codeBlock, { borderColor: colors.ink, backgroundColor: colors.surfaceAlt }]}>
            <T variant="mono" style={styles.codeText}>{configText}</T>
          </View>
          <View style={styles.btnRow}>
            <Pressable
              onPress={() => onCopy(configText)}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.primary, borderColor: colors.ink, flex: 1 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="copy-outline" size={14} color={colors.primaryText} />
              <T variant="body" style={[styles.actionBtnText, { color: colors.primaryText }]}>复制配置</T>
            </Pressable>
            <Pressable
              onPress={() => onCopy(item.buildPrompt(mcpUrl, activeKey))}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.accent, borderColor: colors.ink, flex: 1 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primaryText} />
              <T variant="body" style={[styles.actionBtnText, { color: colors.primaryText }]}>复制提示词</T>
            </Pressable>
          </View>
        </>
      )}
    </Card>
  );
}

/** 使用教程卡片（固定展开，展示示例对话） */
function UsageCard({ item }: { item: UsageItem }) {
  const colors = useTheme();
  return (
    <Card>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Ionicons name={item.icon} size={18} color={colors.primary} />
          <T variant="body" style={styles.cardTitle}>{item.title}</T>
        </View>
      </View>
      {item.examples.map((ex, i) => (
        <View key={i} style={styles.exampleRow}>
          <T variant="mono" style={styles.exampleBullet}>›</T>
          <T variant="cap" style={styles.exampleText}>{ex}</T>
        </View>
      ))}
    </Card>
  );
}

// ---------- 样式 ----------

const styles = StyleSheet.create({
  // 整体
  flex1: { flex: 1 },
  body: { padding: 14, paddingBottom: 32, gap: 12 },
  paraTitle: { fontWeight: '700', marginBottom: 6 },
  paraText: { textTransform: 'none', letterSpacing: 0, lineHeight: 17, marginBottom: 10 },
  copyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8,
  },
  copyTexts: { flex: 1, minWidth: 0 },
  copyLabel: { opacity: 0.6, marginBottom: 2 },
  copyValue: { textTransform: 'none', letterSpacing: 0 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelInput: {
    flex: 1, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontWeight: '600',
  },
  empty: { textAlign: 'center', marginTop: 8, opacity: 0.7 },
  keyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  keyTitleWrap: { flex: 1, minWidth: 0 },
  keyMeta: { marginTop: 2, opacity: 0.7 },
  keyBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 9,
  },
  keyText: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textTransform: 'none', letterSpacing: 0 },
  keyTip: { marginTop: 6, opacity: 0.6 },
  // 通用卡片头
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '700' },
  cardDesc: { textTransform: 'none', letterSpacing: 0, lineHeight: 16, marginBottom: 8 },
  // 安装教程
  codeBlock: {
    borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 10,
  },
  codeText: {
    fontSize: 12, lineHeight: 18,
    textTransform: 'none', letterSpacing: 0,
  },
  btnRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 2, paddingVertical: 9, paddingHorizontal: 14,
  },
  actionBtnText: { fontWeight: '700', fontSize: 13 },
  // 使用教程
  exampleRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 3,
  },
  exampleBullet: { fontSize: 14, lineHeight: 18, color: '#999' },
  exampleText: { flex: 1, textTransform: 'none', letterSpacing: 0, lineHeight: 18 },
});

const tabsStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    paddingRight: 20,
  },
  shadow: { position: 'absolute', top: 12, left: 20, right: 4, bottom: 8 },
  row: { flexDirection: 'row', borderWidth: 2 },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  segDivider: { borderRightWidth: 2, borderRightColor: '#141414' },
  segText: { letterSpacing: 1 },
});
