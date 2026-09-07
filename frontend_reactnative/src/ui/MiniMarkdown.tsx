/**
 * 轻量 Markdown 渲染器(AI 输出用,零外部依赖)
 *
 * 支持:# ~ #### 标题、- / * / • 列点(缩进分级)、1. / 1、 编号、> 引用、
 *       --- 分隔线、| 表格 |、``` 代码块、**加粗**、`行内代码`
 * 流式安全:每次全量重解析,未闭合语法(如半张表格、未收尾的 **)按普通文本降级展示,
 *           后续分片到达后自然修正
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { T } from './components';
import { useTheme } from '../hooks/useTheme';

// ---------- 行内解析:**加粗** 与 `行内代码` ----------

/** 成对标记才生效(注意 **bold** 必须排在 *italic* 之前),流式期间的孤立 * 或 ` 原样显示 */
const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

function InlineText({ text }: { text: string }) {
  const colors = useTheme();
  const parts = text.split(INLINE_RE);
  return (
    <>
      {parts.map((seg, i) => {
        if (/^\*\*[^*\n]+\*\*$/.test(seg)) {
          return (
            <T key={i} variant="body" style={mdStyles.bold}>{seg.slice(2, -2)}</T>
          );
        }
        if (/^\*[^*\n]+\*$/.test(seg)) {
          return (
            <T key={i} variant="body" style={mdStyles.italic}>{seg.slice(1, -1)}</T>
          );
        }
        if (/^`[^`\n]+`$/.test(seg)) {
          return (
            <T key={i} variant="mono" style={[mdStyles.inlineCode, { backgroundColor: colors.surfaceAlt, borderColor: colors.ink }]}>
              {seg.slice(1, -1)}
            </T>
          );
        }
        return <T key={i} variant="body">{seg}</T>;
      })}
    </>
  );
}

// ---------- 块级解析 ----------

type Align = 'left' | 'center' | 'right';

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'hr' }
  | { type: 'bullet'; level: number; text: string }
  | { type: 'num'; index: string; text: string }
  | { type: 'quote'; lines: string[] }
  | { type: 'code'; lines: string[] }
  | { type: 'table'; header: string[]; align: Align[]; rows: string[][] };

const isDivider = (l: string) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
const isTableRow = (l: string) => l.trim().startsWith('|');
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

const cellsOf = (l: string) =>
  l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

const alignOf = (c: string): Align => {
  const left = c.startsWith(':'), right = c.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
};

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // ``` 代码块:到闭合 ``` 或文末(流式未闭合时整体按代码降级)
    if (trimmed.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      i++; // 跳过闭合 ```(存在时)
      blocks.push({ type: 'code', lines: buf });
      continue;
    }

    if (isDivider(trimmed)) { blocks.push({ type: 'hr' }); i++; continue; }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'h', level: heading[1].length as 1 | 2 | 3 | 4, text: heading[2].replace(/#+\s*$/, '') });
      i++;
      continue;
    }

    // | 表格 |:连续表格行合为一块,首行为表头,第二行为对齐行(存在时)
    if (isTableRow(trimmed)) {
      const tbl: string[] = [];
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim()) { tbl.push(lines[i]); i++; }
      const header = cellsOf(tbl[0]);
      let align: Align[] = [];
      let rest = tbl.slice(1);
      if (tbl.length > 1 && isTableSep(tbl[1])) {
        align = cellsOf(tbl[1]).map(alignOf);
        rest = tbl.slice(2);
      }
      blocks.push({ type: 'table', header, align, rows: rest.map(cellsOf) });
      continue;
    }

    // > 引用:连续引用行合为一块
    if (trimmed.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }

    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet && !isDivider(trimmed)) {
      const level = Math.min(2, Math.floor(bullet[1].replace(/\t/g, '  ').length / 2));
      blocks.push({ type: 'bullet', level, text: bullet[2] });
      i++;
      continue;
    }

    const num = line.match(/^\s*(\d+)[.、)]\s+(.*)$/);
    if (num) {
      blocks.push({ type: 'num', index: num[1], text: num[2] });
      i++;
      continue;
    }

    blocks.push({ type: 'p', text: trimmed });
    i++;
  }
  return blocks;
}

// ---------- 渲染 ----------

export function MiniMarkdown({ text }: { text: string }) {
  const colors = useTheme();
  const blocks = parseBlocks(text);
  return (
    <View style={mdStyles.wrap}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h': {
            if (b.level === 1) return <T key={i} variant="h2" style={mdStyles.h1}>{b.text}</T>;
            if (b.level === 2) {
              return (
                <View key={i} style={mdStyles.h2}>
                  <View style={[mdStyles.h2Bar, { backgroundColor: colors.accent, borderColor: colors.ink }]} />
                  <T variant="title">{b.text}</T>
                </View>
              );
            }
            return <T key={i} variant="body" style={mdStyles.h3}>{b.text}</T>;
          }
          case 'hr':
            return <View key={i} style={[mdStyles.hr, { borderColor: colors.ink }]} />;
          case 'bullet':
            return (
              <View key={i} style={[mdStyles.bullet, { marginLeft: b.level * 16 }]}>
                <View style={[mdStyles.dot, { backgroundColor: colors.ink }]} />
                <T variant="body" style={mdStyles.text}><InlineText text={b.text} /></T>
              </View>
            );
          case 'num':
            return (
              <View key={i} style={mdStyles.bullet}>
                <T variant="mono" style={mdStyles.num}>{b.index}.</T>
                <T variant="body" style={mdStyles.text}><InlineText text={b.text} /></T>
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={[mdStyles.quote, { borderColor: colors.ink }]}>
                {b.lines.map((l, j) => (
                  <T key={j} variant="body" style={mdStyles.text}><InlineText text={l} /></T>
                ))}
              </View>
            );
          case 'code':
            return (
              <View key={i} style={[mdStyles.code, { backgroundColor: colors.surfaceAlt, borderColor: colors.ink }]}>
                {b.lines.map((l, j) => (
                  <T key={j} variant="mono" style={mdStyles.codeLine}>{l || ' '}</T>
                ))}
              </View>
            );
          case 'table':
            return (
              <View key={i} style={[mdStyles.table, { borderColor: colors.ink }]}>
                <View style={[mdStyles.tableRow, { backgroundColor: colors.accent }]}>
                  {b.header.map((c, j) => (
                    <T key={j} variant="body" style={[mdStyles.tableCell, mdStyles.bold, { textAlign: b.align[j] ?? 'left' }]}>
                      <InlineText text={c} />
                    </T>
                  ))}
                </View>
                {b.rows.map((row, r) => (
                  <View key={r} style={[mdStyles.tableRow, { borderTopWidth: 1, borderTopColor: colors.ink }]}>
                    {row.map((c, j) => (
                      <T key={j} variant="body" style={[mdStyles.tableCell, { textAlign: b.align[j] ?? 'left' }]}>
                        <InlineText text={c} />
                      </T>
                    ))}
                  </View>
                ))}
              </View>
            );
          default:
            return <T key={i} variant="body" style={mdStyles.text}><InlineText text={b.text} /></T>;
        }
      })}
    </View>
  );
}

const mdStyles = StyleSheet.create({
  wrap: { gap: 2 },
  bold: { fontWeight: '900' },
  italic: { fontStyle: 'italic' },
  h1: { marginTop: 4 },
  h2: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 2 },
  h2Bar: { width: 6, height: 18, borderWidth: 2 },
  h3: { fontWeight: '900', marginTop: 4 },
  hr: { borderWidth: 1, marginVertical: 6 },
  bullet: { flexDirection: 'row', gap: 8, marginTop: 3, paddingRight: 4 },
  dot: { width: 6, height: 6, marginTop: 7 },
  num: { marginTop: 1 },
  text: { flex: 1, lineHeight: 21, textTransform: 'none', letterSpacing: 0 },
  quote: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 2, marginVertical: 4 },
  code: { borderWidth: 2, padding: 10, marginVertical: 4 },
  codeLine: { lineHeight: 18, textTransform: 'none', letterSpacing: 0 },
  inlineCode: { borderWidth: 1, paddingHorizontal: 5, fontSize: 13 },
  table: { borderWidth: 2, marginVertical: 6 },
  tableRow: { flexDirection: 'row' },
  tableCell: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, lineHeight: 18, textTransform: 'none', letterSpacing: 0 },
});
