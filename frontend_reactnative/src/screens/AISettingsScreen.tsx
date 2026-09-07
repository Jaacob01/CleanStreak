/**
 * AI 设置页（仅管理员）：供应商/Base URL/API Key/模型/系统提示词
 * api_key 服务端加密存储，回显只有掩码；留空提交 = 不修改
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, T, Card, Input, PrimaryButton, Divider } from '../ui/components';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../ui/toast';
import { api_aiGetSettings, api_aiUpdateSettings, api_aiTestConnection } from '../api/ai';
import type { AISettings } from '../api/ai';

type IconName = keyof typeof Ionicons.glyphMap;

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: '通义千问',
  moonshot: 'Kimi',
  zhipu: '智谱',
  ollama: 'Ollama(本地)',
  custom: '自定义',
};

export default function AISettingsScreen() {
  const colors = useTheme();
  const toast = useToast();

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState('custom');
  const [presets, setPresets] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [savedMask, setSavedMask] = useState('');
  const [modelName, setModelName] = useState('');
  const [promptChat, setPromptChat] = useState('');
  const [promptAnalyze, setPromptAnalyze] = useState('');
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('2048');

  const load = useCallback(async () => {
    try {
      const s: AISettings = await api_aiGetSettings();
      setEnabled(s.enabled);
      setProvider(s.provider);
      setPresets(s.provider_presets ?? {});
      setBaseUrl(s.base_url);
      setSavedMask(s.has_api_key ? s.api_key_masked : '');
      setModelName(s.model_name);
      setPromptChat(s.system_prompt_chat);
      setPromptAnalyze(s.system_prompt_analyze);
      setTemperature(String(s.temperature));
      setMaxTokens(String(s.max_tokens));
    } catch (e: any) {
      toast.show(e?.message ?? '加载 AI 设置失败', 'error');
    }
    setLoaded(true);
  }, [toast]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selectProvider = (key: string) => {
    setProvider(key);
    const url = presets[key];
    if (url !== undefined && key !== 'custom') setBaseUrl(url);
    if (key === 'custom') setBaseUrl('');
  };

  const save = async () => {
    if (saving) return;
    if (enabled && (!baseUrl.trim() || !modelName.trim())) {
      toast.show('启用状态下 Base URL 和模型必填', 'error');
      return;
    }
    const temp = parseFloat(temperature);
    const mt = parseInt(maxTokens, 10);
    if (Number.isNaN(temp) || temp < 0 || temp > 2) { toast.show('temperature 需在 0-2 之间', 'error'); return; }
    if (Number.isNaN(mt) || mt < 128 || mt > 32768) { toast.show('max_tokens 需在 128-32768 之间', 'error'); return; }
    setSaving(true);
    try {
      await api_aiUpdateSettings({
        enabled,
        provider,
        base_url: baseUrl.trim(),
        model_name: modelName.trim(),
        system_prompt_chat: promptChat,
        system_prompt_analyze: promptAnalyze,
        temperature: temp,
        max_tokens: mt,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setApiKey('');
      toast.show('AI 设置已保存', 'success');
      await load();
    } catch (e: any) {
      toast.show(e?.message ?? '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const r = await api_aiTestConnection({
        base_url: baseUrl.trim() || undefined,
        model_name: modelName.trim() || undefined,
        api_key: apiKey.trim() || undefined,
      });
      toast.show(r.message, r.ok ? 'success' : 'error');
    } catch (e: any) {
      toast.show(e?.message ?? '测试失败', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) {
    return (
      <Screen>
        <Header title="AI 设置" />
        <View style={styles.center}><T variant="cap">加载中…</T></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="AI 设置" />
      <ScrollView style={styles.flex1} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* 启用开关 */}
        <Card>
          <View style={styles.switchRow}>
            <View style={styles.switchTexts}>
              <T variant="title">启用 AI 功能</T>
              <T variant="cap" style={styles.switchSub}>关闭后所有用户不可使用 AI 聊天与分析</T>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ true: colors.primary, false: colors.surfaceAlt }}
              thumbColor={colors.ink}
            />
          </View>
        </Card>

        <Divider />

        {/* 供应商预设 */}
        <T variant="cap" style={styles.label}>供应商（自动填 Base URL）</T>
        <View style={styles.chipWrap}>
          {Object.keys(PROVIDER_LABELS).map(key => {
            const active = provider === key;
            return (
              <Pressable
                key={key}
                onPress={() => selectProvider(key)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: active ? colors.accent : colors.surface, borderColor: colors.ink },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <T variant="cap" color={colors.ink} style={styles.chipText}>{PROVIDER_LABELS[key]}</T>
              </Pressable>
            );
          })}
        </View>

        <Input
          label="Base URL（OpenAI 兼容接口）"
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="https://api.deepseek.com/v1"
          autoCapitalize="none"
        />
        <Input
          label="API Key"
          value={apiKey}
          onChangeText={setApiKey}
          placeholder={savedMask ? `已保存 ${savedMask}，留空则不修改` : 'sk-...'}
          secure
          autoCapitalize="none"
        />
        <Input
          label="模型名称"
          value={modelName}
          onChangeText={setModelName}
          placeholder="deepseek-chat / gpt-4o-mini / qwen-plus"
          autoCapitalize="none"
        />

        <Divider />

        <Input
          label="聊天系统提示词（留空用默认）"
          value={promptChat}
          onChangeText={setPromptChat}
          placeholder="你是 CleanStreak 的个人数据分析助手…"
          multiline
        />
        <Input
          label="分析系统提示词（留空用默认）"
          value={promptAnalyze}
          onChangeText={setPromptAnalyze}
          placeholder="你是习惯与任务数据分析专家，请输出结构化报告…"
          multiline
        />

        <View style={styles.twoCol}>
          <Input
            label="Temperature"
            value={temperature}
            onChangeText={setTemperature}
            placeholder="0.7"
            keyboardType="decimal-pad"
          />
          <Input
            label="Max Tokens"
            value={maxTokens}
            onChangeText={setMaxTokens}
            placeholder="2048"
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.btnRow}>
          <View style={styles.btnFlex}>
            <PrimaryButton title="测试连接" icon="flash-outline" loading={testing} onPress={() => void test()} />
          </View>
          <View style={styles.btnFlex}>
            <PrimaryButton title="保存" icon="save-outline" loading={saving} onPress={() => void save()} />
          </View>
        </View>

        <Card>
          <View style={styles.noteRow}>
            <Ionicons name={'information-circle' as IconName} size={15} color={colors.ink} />
            <T variant="cap" style={styles.noteText}>
              兼容 OpenAI 协议的服务均可（DeepSeek / 通义 / Kimi / 智谱 / Ollama 等）。AI 分析会把习惯与任务摘要发送给所配置的服务；使用本地 Ollama 可确保数据不出服务器。API Key 加密存储、仅显示掩码。
            </T>
          </View>
        </Card>
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTexts: { flex: 1 },
  switchSub: { marginTop: 3, textTransform: 'none', letterSpacing: 0 },
  label: { marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: { borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { textTransform: 'none', letterSpacing: 0, fontSize: 12 },
  twoCol: { flexDirection: 'row', gap: 12 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 20 },
  btnFlex: { flex: 1 },
  noteRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noteText: { flex: 1, textTransform: 'none', letterSpacing: 0, lineHeight: 17 },
});
