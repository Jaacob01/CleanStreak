# CleanStreak 任务管理功能 — 完整方案

> 日期: 2026-09-04  
> 状态: 方案定稿，待实施  
> 核心思路: 将 Notion 任务工作流（carry-over / 分组 / 进展追加）融入现有 4 Tab 结构，不新增 Tab

---

## 一、总体设计

### 1.1 目标

在 CleanStreak 现有习惯追踪功能基础上，增加**任务管理**能力。任务和习惯是两种不同的自律工具：

| 维度 | 习惯 | 任务 |
|---|---|---|
| 本质 | 每日重复打卡 | 一次性事项，做完即止 |
| 生命周期 | 长期存在 | 创建 → 进行 → 完成/搁置 |
| 核心指标 | 连续天数、达成率 | 完成数、存活天数、阻塞率 |
| 操作 | 打卡、计数 | 追加进展、标记完成 |

两者共存于同一 App，共享用户体系，UI 风格统一（新野兽派）。

### 1.2 不加第 5 个 Tab

保持 4 Tab 结构，任务管理**分散融入**现有页面：

```
今日 Tab  → 今日行动中心：任务概要 + 习惯打卡 + 日历 + 完整待办列表
习惯 Tab  → 改名"管理"：习惯管理 + 任务管理，分段切换
统计 Tab  → 习惯统计 + 任务统计，分段切换
我的 Tab  → 不变
```

### 1.3 核心机制来源

从 Notion 任务工作流中提炼的关键机制：

- **Carry-Over（智能带入）**：未完成任务自动跟随到今天，不会消失
- **双日期**：`created_at`（不变）+ `date`（随带入更新），可算存活天数
- **分组**：Work / Jac / Outsource，按项目关键词自动归类
- **进展追加**：append-only，带时间戳，永不覆盖
- **阻塞记录**：单独字段，标记阻塞原因
- **状态机**：待完成 → 已完成 / 搁置

---

## 二、数据模型

### 2.1 新增 Task 表

```python
class Task(Base):
    __tablename__ = "tasks"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    title           = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)

    # 双日期：carry-over 的核心
    date            = Column(String(10), nullable=False)          # YYYY-MM-DD，随带入更新
    created_at      = Column(DateTime(timezone=True), default=utcnow)  # 原始创建，不变

    # 分类
    group           = Column(String(20), nullable=False, default="Work")   # Work / Jac / Outsource
    project         = Column(String(50), nullable=True)                     # 项目关键词
    priority        = Column(Integer, nullable=False, default=2)            # 0=P0紧急 1=P1高 2=P2中 3=P3低

    # 状态
    status          = Column(String(10), nullable=False, default="pending") # pending / done / shelved
    completed       = Column(Boolean, nullable=False, default=False)
    completed_at    = Column(DateTime(timezone=True), nullable=True)

    # 进展 & 阻塞
    progress_log    = Column(JSON, nullable=False, default=list)   # [{time:"HH:MM", text:"..."}]
    blocked_reason  = Column(Text, nullable=True)

    # 排序 & 来源
    sort_order      = Column(Integer, nullable=False, default=0)
    source          = Column(String(10), nullable=False, default="manual")  # manual / carry

    # 可选关联习惯
    habit_id        = Column(Integer, ForeignKey("habits.id", ondelete="SET NULL"), nullable=True)

    user    = relationship("User", back_populates="tasks")
    habit   = relationship("Habit", back_populates="linked_tasks")

    __table_args__ = (
        Index("ix_tasks_user_date", "user_id", "date"),
        Index("ix_tasks_user_status", "user_id", "status"),
        Index("ix_tasks_user_group", "user_id", "group"),
    )
```

### 2.2 User 模型补充关系

```python
class User(Base):
    # ... 现有字段不变 ...
    tasks = relationship("Task", back_populates="user", lazy="noload")
```

### 2.3 Habit 模型补充关系（可选）

```python
class Habit(Base):
    # ... 现有字段不变 ...
    linked_tasks = relationship("Task", back_populates="habit", lazy="noload")
```

### 2.4 Alembic Migration

新增 `alembic/versions/002_add_tasks.py`，创建 tasks 表及索引。

---

## 三、API 设计

> 统一 POST，查询参数放 JSON body，错误返回简洁中文。

### 3.1 端点列表

| 端点 | 作用 | 请求体关键字段 |
|---|---|---|
| `POST /api/v1/tasks/list` | 查询任务 | `date`, `group`, `status`, `priority`, `project` |
| `POST /api/v1/tasks/create` | 创建任务 | `title`, `group`, `project`, `priority`, `date` |
| `POST /api/v1/tasks/update` | 更新任务（partial patch） | `id` + 要改的字段 |
| `POST /api/v1/tasks/delete` | 删除任务 | `id` |
| `POST /api/v1/tasks/complete` | 标记完成 / 撤销完成 | `id`, `completed` |
| `POST /api/v1/tasks/progress` | 追加进展记录 | `id`, `text` |
| `POST /api/v1/tasks/block` | 记录阻塞 | `id`, `reason` |
| `POST /api/v1/tasks/carry` | Carry-Over 带入今天 | `date` |
| `POST /api/v1/tasks/move` | 调整排序 | `id`, `direction` |
| `POST /api/v1/tasks/stats` | 任务统计 | `date_from`, `date_to`, `group` |
| `POST /api/v1/tasks/report` | 每日简报 | `date` |

### 3.2 Carry-Over 端点详解

```
POST /api/v1/tasks/carry
Body: { "date": "2026-09-04" }

逻辑:
1. 查询 status != 'done' 且 date != 传入日期 的所有任务
2. 批量将 date 更新为传入日期
3. source 字段标记为 'carry'（区分新建和带入）
4. 幂等：同一天重复调用，第一步查不到就跳过

返回:
{
  "carried": 5,           // 带入数量
  "tasks": [...],         // 带入后的任务列表
  "summary": {
    "total_pending": 5,
    "by_group": {"Work": 3, "Jac": 1, "Outsource": 1},
    "by_priority": {"P0": 1, "P1": 2, "P2": 2}
  }
}
```

### 3.3 进展追加端点

```
POST /api/v1/tasks/progress
Body: { "id": 123, "text": "排查到字段映射问题" }

逻辑:
1. 读取 progress_log
2. 追加 { "time": "14:20", "text": "排查到字段映射问题" }
3. 写回（只增不改）

返回: 更新后的完整任务对象
```

### 3.4 每日简报端点

```
POST /api/v1/tasks/report
Body: { "date": "2026-09-04" }

返回:
{
  "date": "2026-09-04",
  "completed_today": [...],      // 今天完成的
  "pending": [...],              // 待完成
  "blocked": [...],              // 阻塞中
  "by_group": {
    "Work": { "pending": 3, "completed": 2, "blocked": 1 },
    "Jac": { "pending": 1, "completed": 0, "blocked": 0 },
    "Outsource": { "pending": 1, "completed": 1, "blocked": 0 }
  }
}
```

---

## 四、项目-分组映射

### 4.1 配置方式

后端维护映射表，支持动态学习：

```python
# 数据库表或 JSON 字段（存在 User 的 settings 里）
{
  "HRP": "Work",
  "职业病": "Work",
  "一附院": "Work",
  "中医院": "Work",
  "血透": "Work",
  "掌上宅": "Outsource",
  "Devvault": "Jac",
  "ExcelCleaner": "Jac"
}
```

### 4.2 匹配逻辑

```
创建任务时:
1. 提取 title 或 project 字段中的关键词
2. 遍历映射表，命中 → 自动填 group
3. 未命中 → 前端弹选择器让用户选分组
4. 用户选完后，自动把 project → group 写入映射（学习）
```

### 4.3 前端存储

映射配置存在后端 User.settings JSON 字段中，前端创建任务时先拉取，本地缓存。

---

## 五、前端页面改动

### 5.1 今日 Tab（HomeScreen）

#### 5.1.1 Pager 从 2 页变 3 页

```
现有: [今日] [日历]
改后: [今日] [日历] [待办]
```

`TAB_LABELS` 常量从 `['今日', '日历']` 改为 `['今日', '日历', '待办']`。

#### 5.1.2 "今日"视图布局调整

现有：整个页面是 DayHabitList（习惯打卡列表）。

改后：**上半任务概要 + 下半习惯打卡**，纵向排列，可滚动。

```
┌──────────────────────────────┐
│  Header: 今日打卡   09-04  [+]│
├──────────────────────────────┤
│ [今日] [日历] [待办]         │
├──────────────────────────────┤
│ ┌─ 待办 (3) ──────────────┐ │  ← TaskSummary 组件
│ │ ☐ P0 测试 供应商报表    │ │     默认展开前3条
│ │ ☐ P1 部署 职业病体检    │ │     超过3条显示"查看全部"
│ │ ☐ P2 重构 API 层        │ │
│ │        [查看全部 →]      │ │     点击跳到"待办"页
│ └─────────────────────────┘ │
│ ┌─ 习惯 ──────────────────┐ │  ← 现有 DayHabitList
│ │ 🔥 运动         ☐       │ │
│ │ 📖 阅读         ☐       │ │
│ │ 💧 喝水         5/8杯   │ │
│ └─────────────────────────┘ │
└──────────────────────────────┘
```

**实现要点：**
- "今日"视图从直接渲染 `<DayHabitList>` 改为 `<ScrollView>` 包裹 `<TaskSummary>` + `<DayHabitList>`
- TaskSummary 组件：调 `/api/v1/tasks/list` 过滤 `date=today & status=pending`
- 任务卡片可直接勾选完成（调 `/api/v1/tasks/complete`）
- 点击任务跳转 TaskDetailScreen

#### 5.1.3 "待办"页（第三页）

完整的任务管理视图，嵌在 HomeScreen 的 pager 里：

```
┌──────────────────────────────┐
│  ┌─ 筛选栏 ───────────────┐ │
│  │ [全部][今天][本周][已完成]│ │
│  └─────────────────────────┘ │
│                              │
│ ■ Work (5)                   │  ← 按分组折叠
│ ┌──────────────────────────┐ │
│ │ ☐ P0 测试 供应商报表     │ │     红色左边框 = P0
│ │   HRP · 存活 3天         │ │     黄色 = P1，灰色 = P2/P3
│ │ ☐ P1 部署 职业病体检     │ │
│ │   职业病 · 存活 1天      │ │
│ └──────────────────────────┘ │
│ ■ Jac (2)                    │
│ ┌──────────────────────────┐ │
│ │ ☐ P2 重构 API 层         │ │
│ │   Devvault · 存活 5天    │ │
│ └──────────────────────────┘ │
│ ■ 已完成 (3)         [展开] │  ← 默认折叠
│                              │
│  ┌────────────────────────┐ │
│  │ [输入框] 快速添加任务   │ │  ← 底部常驻
│  └────────────────────────┘ │
└──────────────────────────────┘
```

**实现要点：**
- 新建 `TaskListPanel` 组件，被 HomeScreen 第三页引用
- 分组折叠：点击分组标题展开/收起
- 筛选用 SegmentedControl（复用现有 PageTabs 风格）
- 快速添加：底部输入框 + 分组/优先级快捷选择，回车即创建
- 已完成区域默认折叠，点击展开

### 5.2 习惯 Tab → "管理" Tab

#### 5.2.1 改名

Tab 标题从"习惯"改为"管理"，图标从 `square.grid.2x2` / `apps` 换为 `clipboard` / `clipboard-outline`。

#### 5.2.2 顶部加 Segmented 切换

```
┌──────────────────────────────┐
│  管理                        │
├──────────────────────────────┤
│ [习惯管理] [任务管理]        │  ← SegmentedControl
├──────────────────────────────┤
│                              │
│  (根据选中渲染不同内容)       │
│                              │
└──────────────────────────────┘
```

#### 5.2.3 习惯管理（现有逻辑不变）

HabitsScreen 原有内容完整保留：习惯列表、排序、归档、点击进入 HabitEditScreen。

#### 5.2.4 任务管理（新增）

完整的任务管理面板：

```
┌──────────────────────────────┐
│ ■ 全部任务                   │
│ ┌──────────────────────────┐ │
│ │ 筛选: [全部分组 ▾]       │ │     分组筛选
│ │       [全部项目 ▾]       │ │     项目筛选
│ │       [全部优先级 ▾]     │ │     优先级筛选
│ │ 排序: [优先级 ▾]         │ │     排序方式
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ P0 ☐ 测试 供应商报表    │ │  ← 点击进入 TaskDetailScreen
│ │   Work · HRP · 09-01    │ │
│ │────────────────────────│ │
│ │ P1 ☐ 部署 职业病体检    │ │
│ │   Work · 职业病 · 09-03 │ │
│ │────────────────────────│ │
│ │ P2 ☐ 重构 API 层        │ │
│ │   Jac · Devvault · 08-30│ │
│ └──────────────────────────┘ │
│                              │
│  [+ 新建任务]                │  ← 底部按钮
└──────────────────────────────┘
```

**实现要点：**
- 新建 `TaskManagePanel` 组件
- 列表用 FlatList，支持下拉刷新
- 筛选项从 `/api/v1/tasks/list` 的返回数据动态生成
- 点击进入 TaskDetailScreen

### 5.3 统计 Tab（StatsScreen）

#### 5.3.1 顶部加 Segmented 切换

```
┌──────────────────────────────┐
│  统计         09-04          │
├──────────────────────────────┤
│ [习惯] [任务]                │
├──────────────────────────────┤
│  (根据选中渲染不同内容)       │
└──────────────────────────────┘
```

#### 5.3.2 习惯统计（现有逻辑不变）

#### 5.3.3 任务统计（新增）

```
┌──────────────────────────────┐
│ ■ 概览                       │
│ ┌──────────────────────────┐ │
│ │ 本周完成    12           │ │  ← 大数字
│ │ 本周创建    15           │ │
│ │ 完成率      80%          │ │
│ │ 最长存活    7天          │ │
│ └──────────────────────────┘ │
│                              │
│ ■ 按分组                     │
│ ┌──────────────────────────┐ │
│ │ Work    ████████░░  80%  │ │  ← 进度条
│ │ Jac     ██████░░░░  60%  │ │
│ │ Outsrc  ██████████ 100%  │ │
│ └──────────────────────────┘ │
│                              │
│ ■ 按优先级                   │
│ ┌──────────────────────────┐ │
│ │ P0 紧急  ██  2           │ │
│ │ P1 高    ████  4         │ │
│ │ P2 中    ██████  6       │ │
│ │ P3 低    ████  4         │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### 5.4 我的 Tab — 不变

---

## 六、新建/改动的前端组件

### 6.1 新增组件

| 组件 | 文件 | 作用 |
|---|---|---|
| `TaskSummary` | `ui/TaskSummary.tsx` | 今日页顶部任务概要（前3条 + 查看全部） |
| `TaskCard` | `ui/TaskCard.tsx` | 单条任务卡片（可勾选、显示优先级色块） |
| `TaskListPanel` | `ui/TaskListPanel.tsx` | 完整待办列表（按分组折叠、筛选、快速添加） |
| `TaskManagePanel` | `ui/TaskManagePanel.tsx` | 管理页任务面板（全部任务、筛选排序） |
| `TaskStatsPanel` | `ui/TaskStatsPanel.tsx` | 任务统计面板 |
| `TaskEditScreen` | `screens/TaskEditScreen.tsx` | 新建/编辑任务 |
| `TaskDetailScreen` | `screens/TaskDetailScreen.tsx` | 任务详情（进展追加、阻塞、完成） |

### 6.2 改动组件

| 组件 | 文件 | 改动 |
|---|---|---|
| `HomeScreen` | `screens/HomeScreen.tsx` | pager 2→3 页；"今日"视图加 TaskSummary；"待办"页用 TaskListPanel |
| `HabitsScreen` → `ManageScreen` | `screens/HabitsScreen.tsx` | 重命名；顶部加 Segmented 切换习惯/任务 |
| `StatsScreen` | `screens/StatsScreen.tsx` | 顶部加 Segmented 切换习惯/任务 |
| 导航 | `navigation/index.tsx` | Tab 名称和图标更新 |
| 导航类型 | `navigation/types.ts` | 新增 TaskEdit / TaskDetail 路由参数 |

### 6.3 TaskCard 视觉设计

沿用野兽派风格：

```
┌──────────────────────────────────┐
│█│ ☐  测试 供应商报表      P0 红 │  ← 左边色条 = 优先级颜色
│█│    HRP · 存活 3天              │     P0红 P1黄 P2蓝 P3灰
│█│    09:30 开始排查...           │     最近一条进展预览
└──────────────────────────────────┘
  白底 · 2px墨黑边框 · 硬偏移阴影
```

- 左侧 4px 色条标识优先级
- Checkbox 点击直接标记完成（动画：向右滑出 + 删除线）
- 已完成卡片：背景变灰、文字删除线、折叠到底部

### 6.4 快速添加交互

```
┌────────────────────────────────┐
│ [输入标题...]  [Work ▾] [P2 ▾]│  ← 一行搞定
└────────────────────────────────┘
```

- 输入标题时如果包含项目关键词（如"HRP"），自动匹配分组
- 回车即创建，不需要打开详情页
- 默认优先级 P2，日期=今天

---

## 七、Carry-Over 机制详解

### 7.1 触发时机

**懒触发**，不使用 cron：

```
触发条件:
1. App 启动时（App.tsx useEffect）
2. 切到今日 Tab 时（HomeScreen activePage === 0）
3. 手动下拉刷新

执行:
→ 调 POST /api/v1/tasks/carry {date: today}
→ 后端批量更新未完成任务的 date
→ 前端刷新任务列表
```

### 7.2 幂等保证

```
同一天多次调用 carry:
1. 查询: status != 'done' AND date != '2026-09-04'
2. 如果没有符合条件的 → 返回 carried: 0，无操作
3. 如果有 → 批量更新 date → 返回 carried: N
```

### 7.3 存活天数计算

```typescript
function taskAge(task: Task): number {
  const created = new Date(task.created_at);
  const today = new Date();
  return Math.floor((today - created) / 86400000);
}
```

前端展示: "存活 3天"，超过 7 天标红提醒。

---

## 八、完整工作流程

### 8.1 日常工作流

```
早上打开 App
  │
  ├→ 今日 Tab 自动触发 carry-over
  │   → 未完成任务 date 刷为今天
  │   → 今日视图显示：任务概要 + 习惯打卡
  │
  ├→ 查看待办，按优先级处理
  │   → 点击任务进入详情
  │   → 追加进展 "09:30 开始排查"
  │   → 遇到阻塞 → 记录阻塞原因
  │
  ├→ 完成任务
  │   → Checkbox 勾选 或 详情页点"标记完成"
  │   → 自动追加完成记录到进展
  │   → 任务移到"已完成"区域
  │
  ├→ 打卡习惯
  │   → 现有逻辑不变
  │
  └→ 查看统计
      → 习惯统计：连续天数、达成率
      → 任务统计：完成数、存活天数、分组分布
```

### 8.2 任务生命周期

```
创建 ─────────────────────────────────────────────┐
  │  title + group + project + priority           │
  │  date = today, created_at = now               │
  ▼                                               │
待完成 (pending)                                   │
  │                                               │
  ├→ 追加进展 ─→ 仍在待完成（进展记录区分是否在做）│
  ├→ 记录阻塞 ─→ 状态变搁置 (shelved)             │
  │              解除阻塞 ─→ 回到待完成            │
  │                                               │
  ├→ Carry-Over 每天自动带入（date 更新）          │
  │                                               │
  └→ 标记完成 ─→ 已完成 (done)                     │
                 completed_at = now                │
                 撤销完成 ─→ 回到待完成 ───────────┘
```

### 8.3 任务 vs 习惯的交互

- 任务可以**关联习惯**（habit_id），比如任务"完成今日运动"关联习惯"运动"
- 关联后，习惯打卡时可自动提示关联任务是否也要标记完成
- 不关联也完全独立使用

---

## 九、实现步骤

### Phase 1: 后端基础

| 步 | 内容 | 文件 |
|---|---|---|
| 1 | Task 模型定义 | `fastapi_server/app/models/models.py` |
| 2 | Alembic migration | `fastapi_server/alembic/versions/002_add_tasks.py` |
| 3 | Task schemas | `fastapi_server/app/schemas/task.py` |
| 4 | Task service（含 carry-over） | `fastapi_server/app/services/task_service.py` |
| 5 | Task router | `fastapi_server/app/routers/tasks.py` |
| 6 | main.py 注册 router | `fastapi_server/app/main.py` |
| 7 | User 模型补充 tasks 关系 | `fastapi_server/app/models/models.py` |

### Phase 2: 前端 API & 类型

| 步 | 内容 | 文件 |
|---|---|---|
| 8 | Task 类型定义 | `frontend_reactnative/src/db/types.ts` |
| 9 | Task API 层 | `frontend_reactnative/src/api/tasks.ts` |
| 10 | api/index.ts 导出 | `frontend_reactnative/src/api/index.ts` |

### Phase 3: 前端组件

| 步 | 内容 | 文件 |
|---|---|---|
| 11 | TaskCard 组件 | `frontend_reactnative/src/ui/TaskCard.tsx` |
| 12 | TaskSummary 组件（今日页概要） | `frontend_reactnative/src/ui/TaskSummary.tsx` |
| 13 | TaskListPanel 组件（完整待办列表） | `frontend_reactnative/src/ui/TaskListPanel.tsx` |
| 14 | TaskManagePanel 组件（管理页） | `frontend_reactnative/src/ui/TaskManagePanel.tsx` |
| 15 | TaskStatsPanel 组件（统计页） | `frontend_reactnative/src/ui/TaskStatsPanel.tsx` |

### Phase 4: 前端页面

| 步 | 内容 | 文件 |
|---|---|---|
| 16 | TaskEditScreen（新建/编辑） | `frontend_reactnative/src/screens/TaskEditScreen.tsx` |
| 17 | TaskDetailScreen（详情+进展） | `frontend_reactnative/src/screens/TaskDetailScreen.tsx` |
| 18 | 改造 HomeScreen（pager 3页 + 任务概要） | `frontend_reactnative/src/screens/HomeScreen.tsx` |
| 19 | 改造 HabitsScreen → ManageScreen | `frontend_reactnative/src/screens/HabitsScreen.tsx` |
| 20 | 改造 StatsScreen（加任务统计） | `frontend_reactnative/src/screens/StatsScreen.tsx` |
| 21 | 更新导航（Tab 名称 + 新路由） | `frontend_reactnative/src/navigation/index.tsx` |
| 22 | 更新导航类型 | `frontend_reactnative/src/navigation/types.ts` |

### Phase 5: 打通 & 优化

| 步 | 内容 |
|---|---|
| 23 | Carry-over 懒触发集成（App.tsx / HomeScreen） |
| 24 | 项目-分组映射配置 |
| 25 | 快速添加交互（自动匹配分组） |
| 26 | 完成动画（滑出 + 删除线） |
| 27 | 测试全链路 |

---

## 十、完整文件变更清单

### 新增文件

```
fastapi_server/
  alembic/versions/002_add_tasks.py
  app/schemas/task.py
  app/services/task_service.py
  app/routers/tasks.py

frontend_reactnative/src/
  ui/TaskCard.tsx
  ui/TaskSummary.tsx
  ui/TaskListPanel.tsx
  ui/TaskManagePanel.tsx
  ui/TaskStatsPanel.tsx
  screens/TaskEditScreen.tsx
  screens/TaskDetailScreen.tsx
```

### 改动文件

```
fastapi_server/
  app/models/models.py          ← 新增 Task 模型 + User/Habit 补充关系
  app/main.py                   ← 注册 tasks router

frontend_reactnative/src/
  db/types.ts                   ← 新增 Task 相关类型
  api/tasks.ts                  ← 新增（或新建文件）
  api/index.ts                  ← 导出 tasks API
  screens/HomeScreen.tsx        ← pager 3页 + 任务概要
  screens/HabitsScreen.tsx      ← 改名 ManageScreen + 分段切换
  screens/StatsScreen.tsx       ← 加任务统计分段
  navigation/index.tsx          ← Tab 名称/图标 + 新路由
  navigation/types.ts           ← 新增 TaskEdit/TaskDetail 路由参数
```

### 不动文件

```
所有现有 habits/entries/stats 的后端逻辑
所有现有认证逻辑
现有 UI 组件库（components.tsx）— 复用，不改
主题（theme/index.ts）— 复用，不改
我的 Tab（ProfileScreen）
设置页（SettingsScreen）
DayScreen / HabitEditScreen — 不动
```

---

## 十一、后续可选扩展

- [ ] 任务提醒推送（expo-notifications）
- [ ] 任务模板（常用任务一键创建）
- [ ] 任务看板视图（按状态分列）
- [ ] 任务关联日历视图（在"日历"页显示任务）
- [ ] 任务导出（复用现有 export 逻辑）
- [ ] 周报自动生成（每周五汇总）
