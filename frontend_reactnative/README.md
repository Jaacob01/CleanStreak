# CleanStreak

野兽派风格的通用习惯追踪 App。每个习惯独立维护，正向打卡 / 反向记录随意配置。

## 设计理念

- **正向习惯**：做到了才打卡（运动、阅读、喝水……），记录累积成就
- **反向习惯**：犯了才记录（抽烟、刷手机、零食……），默认每天都是"保持"，只在与自己对抗时出现
- 每个习惯的一切都可以配置：方向、目标、频率、标签、颜色、图标

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Expo 57 + React Native 0.86 + React 19 |
| 导航 | @react-navigation (bottom-tabs + native-stack) |
| 状态管理 | Zustand |
| 本地数据库 | expo-sqlite（Web 端 IndexedDB 同构实现） |
| 安全存储 | expo-secure-store |
| 认证 | 本地账户（SHA-256 哈希） |
| 语言 | TypeScript (strict) |

## 项目结构

```
src/
├── App.tsx                      # 入口
├── db/
│   ├── index.ts                 # SQLite：建表 + 迁移 + CRUD
│   ├── index.web.ts             # IndexedDB 同构实现（Web 端）
│   ├── logic.ts                 # 打卡判定 / streak 纯逻辑（无 UI/DB 依赖）
│   └── types.ts                 # 数据模型
├── hooks/useTheme.tsx           # 主题 hook
├── navigation/
│   ├── index.tsx                # 4 Tab + Stack
│   └── types.ts
├── screens/
│   ├── LoginScreen.tsx          # 登录/注册
│   ├── HomeScreen.tsx           # 今日：快速打卡
│   ├── DayScreen.tsx            # 任意日期：查看/补录
│   ├── HabitsScreen.tsx         # 习惯管理（排序/归档/删除）
│   ├── HabitEditScreen.tsx      # 习惯配置（全量可配置项）
│   ├── StatsScreen.tsx          # 统计（总览 + 单习惯热力图）
│   ├── ProfileScreen.tsx        # 我的（导出/设置/关于）
│   └── SettingsScreen.tsx       # 安全设置
├── store/
│   ├── auth.ts                  # 认证状态
│   └── settings.ts
├── theme/index.ts               # 野兽派主题 + 习惯色板
└── ui/
    ├── components.tsx           # UI 组件库
    ├── EntryCard.tsx            # 打卡卡片（四种形态共用）
    ├── DayHabitList.tsx         # 某天习惯列表（今日/日期页共用）
    ├── AppLock.tsx
    ├── confirm.ts
    └── toast.tsx
```

## 每个习惯的可配置项

| 配置 | 说明 |
|---|---|
| 名称 / 图标 / 颜色 | 图标 48 个 emoji 任选，颜色 8 色色板 |
| 记录方向 | 正向（做到了打卡）/ 反向（犯了记录） |
| 目标类型 | 简单打卡 / 数量目标 |
| 目标值 + 单位 | 正向 = 每日达标线（如喝水 8 杯）；反向 = 每日上限（如抽烟 ≤ 5 支） |
| 生效日 | 每天 / 工作日 / 周末 / 任意星期组合（未生效日不影响 streak） |
| 标签集 | 自定义标签（如"压力、酒局"），记录时点选 |
| 备注开关 | 是否允许记录附文字 |
| 归档 | 隐藏但保留历史，可随时恢复 |
| 排序 | 在习惯列表中上移/下移 |

## 页面

- **今日**：当日全部习惯一键打卡；正向计数 ±1；反向一键记录并附标签/备注
- **习惯**：新建（可用模板快速填充）、编辑、排序、归档、删除
- **统计**：总览（每习惯 streak + 近 7 天状态）→ 单习惯深视图：当前/最长连续、达成率、月度热力图、星期分布、最近记录
- **日期页**：从热力图或今日页进入，补录/修改任意一天
- **我的**：JSON 全量导出（习惯 + 记录）、生物识别锁、修改密码

## 判定规则（db/logic.ts）

- 正向：记录数量 ≥ 目标值 = 达成；未达标 = 部分完成；生效日无记录（已过）= 未达成
- 反向：记录数量 ≤ 上限 = 保持；超限（或简单打卡有记录）= 失守
- 未生效日为中性：既不计入也不打断 streak
- 今天尚无记录 = 待定（pending）：不中断当前 streak，也不计入

## 数据模型

```sql
CREATE TABLE habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🎯',
  color TEXT NOT NULL DEFAULT 'green',
  direction TEXT NOT NULL DEFAULT 'positive',  -- positive | negative
  goal_type TEXT NOT NULL DEFAULT 'check',     -- check | count
  target_value REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '',
  weekdays TEXT NOT NULL DEFAULT '[]',         -- JSON 数组，空 = 每天
  enable_notes INTEGER NOT NULL DEFAULT 1,
  enable_tags INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',             -- JSON 数组
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 每天每习惯最多一条记录（value = 数量累计）
CREATE TABLE habit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  habit_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 1,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (habit_id, date),
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
);
```

### v1 自动迁移

旧版（戒色单场景）的 `records` 表会在启动时自动迁移为一个「保持干净 🛡️」反向习惯：
旧的类型/地点/诱因分别转为标签与备注文本，历史 streak 完整保留。

## 野兽派设计语言

零圆角、2px 墨黑粗边框、硬偏移阴影、高饱和实色色块、按压下沉。
奶油底 `#F5F1E6` / 卡面纯白 / 墨黑 `#141414` / 荧光绿 `#00C16A` / 红 `#FF4D4D` / 黄 `#FFD02E` / 蓝 `#4D7CFE`。

## 快速开始

```bash
npm install

# 启动开发服务
npx expo start -c

# iOS（本项目含 ios/ 原生工程与 Pods）
npx expo run:ios

# Web (H5 调试)
npx expo start --web
```

## 类型检查与逻辑自测

```bash
npx tsc --noEmit
```

License: Private
