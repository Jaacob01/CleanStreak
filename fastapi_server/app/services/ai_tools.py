"""AI 工具注册表：把业务服务封装为 LLM 可调用的工具（App 聊天 agent loop 与 MCP 端点共用）

每个工具 = 名称 + 中文描述 + JSON Schema 参数 + 执行函数（对 service 层的薄封装，不写新业务逻辑）。
所有执行统一走 execute_tool：业务异常（HTTPException）转为 {"error": ...} 返回给 LLM 继续对话、
危险操作（danger=True）必须带 confirm=true 才真正执行、每次调用落审计表 ai_tool_calls。
"""
import json
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import date as _date_cls, timedelta
from app.models.models import AIToolCall, Habit, HabitEntry
from app.schemas.entry import EntrySave
from app.schemas.group import GroupCreate, GroupRename
from app.schemas.habit import HabitCreate, HabitUpdate
from app.schemas.project import ProjectCreate, ProjectRename
from app.schemas.task import TaskCreate, TaskListRequest, TaskStatsRequest, TaskUpdate
from app.services import entry_service, group_service, habit_service, project_service, task_service
from app.services.ai_context_service import (
    STATE_SYMBOL, WEEKDAY_NAMES, build_context, resolve_range, today_cn,
)
from app.utils.logic import HabitLike, compute_stats, day_state

P_LABELS = {0: "P0", 1: "P1", 2: "P2", 3: "P3"}
STATUS_LABELS = {"pending": "待完成", "done": "已完成", "shelved": "已阻塞"}
AUDIT_RESULT_MAX_CHARS = 4000  # 审计表 result 截断长度


# ---- 序列化（给 LLM 看的紧凑结构，中文键与数据上下文风格一致）----

def _task_brief(t) -> dict:
    """ORM Task 与 TaskResponse 字段同名，两者通用"""
    d = {
        "id": t.id,
        "标题": t.title,
        "日期": t.date,
        "分组": t.group,
        "优先级": P_LABELS.get(t.priority, "P2"),
        "状态": STATUS_LABELS.get(t.status, t.status),
    }
    if t.project:
        d["项目"] = t.project
    if t.blocked_reason:
        d["阻塞原因"] = t.blocked_reason
    return d


def _habit_goal(h: Habit) -> str:
    if h.direction == "positive":
        text = "正向打卡" if h.goal_type == "check" else f"正向计数：每天 ≥ {h.target_value:g}{h.unit}"
    else:
        text = "反向克制（发生即失守）" if h.goal_type == "check" else f"反向限制：每天 ≤ {h.target_value:g}{h.unit}"
    if h.weekdays:
        text += "，生效日：" + "、".join(
            WEEKDAY_NAMES[int(w)] if 0 <= int(w) <= 6 else "?" for w in h.weekdays
        )
    return text


def _habit_brief(h: Habit) -> dict:
    return {
        "id": h.id,
        "名称": h.name,
        "emoji": h.emoji,
        "目标": _habit_goal(h),
        "已归档": h.archived,
    }


def _entry_brief(e: HabitEntry, habit_name: str) -> dict:
    d = {
        "habit_id": e.habit_id,
        "习惯": habit_name,
        "日期": e.date,
        "累计值": e.value,
        "打卡次数": len(e.details or []),
    }
    if e.tags:
        d["tags"] = e.tags
    if e.notes:
        d["notes"] = e.notes
    return d


def _group_brief(g) -> dict:
    return {"id": g.id, "名称": g.name, "颜色": g.color}


def _project_brief(p) -> dict:
    return {"id": p.id, "名称": p.name}


# ---- 工具定义 ----

@dataclass
class ToolDef:
    name: str
    label: str  # 前端/流式事件里展示的短名
    description: str
    parameters: dict
    handler: Callable[..., Awaitable[dict]]
    danger: bool = False  # True 时必须 confirm=true 才执行


TOOLS: dict[str, ToolDef] = {}


def _def(name: str, label: str, description: str, properties: dict, required: list,
         handler: Callable[..., Awaitable[dict]], danger: bool = False) -> None:
    TOOLS[name] = ToolDef(
        name=name, label=label, description=description, danger=danger,
        parameters={"type": "object", "properties": properties, "required": required},
        handler=handler,
    )


# ---- 任务查询 ----

async def _list_tasks(db, user_id: int, date: str = None, group: str = None, project: str = None,
                      status: str = None, priority: int = None, title_contains: str = None,
                      limit: int = 50) -> dict:
    limit = max(1, min(int(limit or 50), 200))
    filters = TaskListRequest(date=date, group=group, project=project, status=status, priority=priority)
    tasks = await task_service.list_tasks(db, user_id, filters)
    if title_contains:
        key = title_contains.lower()
        tasks = [t for t in tasks if key in t.title.lower()]
    total = len(tasks)
    tasks = tasks[:limit]
    out = {"命中数": total, "任务": [_task_brief(t) for t in tasks]}
    if total > limit:
        out["提示"] = f"仅返回前 {limit} 条，可加筛选条件缩小范围"
    return out


async def _get_task_stats(db, user_id: int, date_from: str = None, date_to: str = None, group: str = None) -> dict:
    return await task_service.get_stats(db, user_id, TaskStatsRequest(date_from=date_from, date_to=date_to, group=group))


async def _get_day_report(db, user_id: int, date: str = None) -> dict:
    date = date or today_cn().isoformat()
    r = await task_service.get_report(db, user_id, date)
    return {
        "日期": date,
        "已完成": [_task_brief(t) for t in r["completed_today"]],
        "待完成": [_task_brief(t) for t in r["pending"]],
        "已阻塞": [_task_brief(t) for t in r["blocked"]],
        "按分组": r["by_group"],
    }


# ---- 任务写操作 ----

async def _create_task(db, user_id: int, title: str, date: str = None, group: str = "Work",
                       project: str = None, priority: int = 2, description: str = None) -> dict:
    data = TaskCreate(title=title, date=date, group=group or "Work", project=project,
                      priority=priority if priority is not None else 2, description=description)
    t = await task_service.create_task(db, user_id, data)
    return {"结果": f"已创建任务「{t.title}」", "任务": _task_brief(t)}


async def _update_task(db, user_id: int, id: int, title: str = None, date: str = None,
                       group: str = None, project: str = None, priority: int = None,
                       description: str = None) -> dict:
    fields = {k: v for k, v in dict(title=title, date=date, group=group, project=project,
                                    priority=priority, description=description).items() if v is not None}
    if not fields:
        return {"error": "没有需要修改的字段"}
    data = TaskUpdate(id=id, **fields)
    t = await task_service.update_task(db, user_id, data)
    return {"结果": f"已更新任务「{t.title}」", "任务": _task_brief(t)}


async def _delete_task(db, user_id: int, id: int, confirm: bool = False) -> dict:
    task = await task_service.get_task(db, id, user_id)
    if not confirm:
        return {
            "需要确认": "删除任务不可恢复。请把目标复述给用户，待其明确同意后再带 confirm=true 调用。",
            "将删除": _task_brief(task),
        }
    title = task.title
    await task_service.delete_task(db, id, user_id)
    return {"结果": f"已删除任务「{title}」"}


async def _complete_task(db, user_id: int, id: int, completed: bool = True) -> dict:
    t = await task_service.complete_task(db, id, user_id, bool(completed))
    return {
        "结果": f"「{t.title}」已标记完成" if completed else f"「{t.title}」已恢复为待完成",
        "任务": _task_brief(t),
    }


async def _add_task_progress(db, user_id: int, id: int, text: str) -> dict:
    t = await task_service.append_progress(db, id, user_id, text)
    return {"结果": f"已为「{t.title}」追加进展记录"}


async def _block_task(db, user_id: int, id: int, reason: str) -> dict:
    t = await task_service.block_task(db, id, user_id, reason)
    return {"结果": f"「{t.title}」已标记为阻塞", "任务": _task_brief(t)}


async def _carry_overdue_tasks(db, user_id: int, date: str = None) -> dict:
    date = date or today_cn().isoformat()
    r = await task_service.carry_tasks(db, user_id, date)
    return {
        "结果": f"已把 {r['carried']} 个过期未完成任务搬到 {date}",
        "任务": [{"id": t.id, "标题": t.title, "分组": t.group, "优先级": P_LABELS.get(t.priority, "P2")}
                 for t in r["tasks"]],
        "当日概览": r["summary"],
    }


# ---- 习惯查询 ----

async def _list_habits(db, user_id: int, include_archived: bool = False) -> dict:
    habits = await habit_service.get_habits(db, user_id, include_archived=bool(include_archived))
    return {"数量": len(habits), "习惯": [_habit_brief(h) for h in habits]}


async def _get_habit_stats(db, user_id: int, habit_id: int) -> dict:
    h = await habit_service.get_habit(db, habit_id, user_id)
    entries = await entry_service.get_entries_by_habit(db, user_id, habit_id)
    emap = {e.date: e.value for e in entries}
    today = today_cn()
    today_str = today.isoformat()
    hl = HabitLike.from_obj(h)
    gs = compute_stats(hl, emap, today_str)
    recent = []
    d = today - timedelta(days=13)
    while d <= today:
        ds = d.isoformat()
        recent.append(STATE_SYMBOL[day_state(hl, emap.get(ds), ds, today_str)])
        d += timedelta(days=1)
    return {
        "习惯": _habit_brief(h),
        "当前连续天数": gs.current_streak,
        "历史最长连续": gs.longest_streak,
        "历史累计达成": gs.total_success,
        "历史累计未达成": gs.total_fail,
        "历史达成率%": gs.success_rate,
        "总打卡次数": len(entries),
        "最近14天逐日(✓达成 ~部分 ✗未达成 ·不计 ?待办)": "".join(recent),
    }


async def _get_day_entries(db, user_id: int, date: str = None) -> dict:
    date = date or today_cn().isoformat()
    entries = await entry_service.get_entries_by_date(db, user_id, date)
    habits = {h.id: h for h in await habit_service.get_habits(db, user_id, include_archived=True)}
    items = [_entry_brief(e, habits[e.habit_id].name if e.habit_id in habits else str(e.habit_id))
             for e in entries]
    return {"日期": date, "打卡记录数": len(items), "记录": items}


async def _get_data_overview(db, user_id: int, preset: str = "week", date_from: str = None,
                             date_to: str = None) -> dict:
    f, t, label = resolve_range(preset, date_from, date_to)
    context = await build_context(db, user_id, f, t)
    context["范围标签"] = label
    return context


# ---- 习惯写操作 ----

async def _create_habit(db, user_id: int, name: str, emoji: str = "🎯", direction: str = "positive",
                        goal_type: str = "check", target_value: float = 1, unit: str = "",
                        weekdays: list = None) -> dict:
    data = HabitCreate(name=name, emoji=emoji or "🎯", direction=direction, goal_type=goal_type,
                       target_value=target_value if target_value is not None else 1,
                       unit=unit or "", weekdays=weekdays or [])
    h = await habit_service.create_habit(db, user_id, data)
    return {"结果": f"已创建习惯 {h.emoji}「{h.name}」", "习惯": _habit_brief(h)}


async def _update_habit(db, user_id: int, id: int, name: str = None, emoji: str = None,
                        direction: str = None, goal_type: str = None, target_value: float = None,
                        unit: str = None, weekdays: list = None, archived: bool = None) -> dict:
    fields = {k: v for k, v in dict(name=name, emoji=emoji, direction=direction, goal_type=goal_type,
                                    target_value=target_value, unit=unit, weekdays=weekdays,
                                    archived=archived).items() if v is not None}
    if not fields:
        return {"error": "没有需要修改的字段"}
    data = HabitUpdate(id=id, **fields)
    h = await habit_service.update_habit(db, id, user_id, data)
    return {"结果": f"已更新习惯「{h.name}」", "习惯": _habit_brief(h)}


async def _delete_habit(db, user_id: int, id: int, confirm: bool = False) -> dict:
    h = await habit_service.get_habit(db, id, user_id)
    if not confirm:
        return {
            "需要确认": "删除习惯会一并删除其全部打卡历史，不可恢复。请把目标复述给用户，"
                       "待其明确同意后再带 confirm=true 调用。",
            "将删除": _habit_brief(h),
        }
    name = h.name
    await habit_service.delete_habit(db, id, user_id)
    return {"结果": f"已删除习惯「{name}」及其全部打卡记录"}


async def _toggle_habit_checkin(db, user_id: int, habit_id: int, date: str = None) -> dict:
    date = date or today_cn().isoformat()
    h = await habit_service.get_habit(db, habit_id, user_id)
    checked = await entry_service.toggle_entry(db, user_id, habit_id, date)
    return {"结果": f"已在 {date} 为「{h.name}」打卡" if checked else f"已取消「{h.name}」在 {date} 的打卡"}


async def _bump_habit_count(db, user_id: int, habit_id: int, delta: float, date: str = None) -> dict:
    date = date or today_cn().isoformat()
    h = await habit_service.get_habit(db, habit_id, user_id)
    new_value = await entry_service.bump_entry(db, user_id, habit_id, date, float(delta))
    action = "增加" if delta >= 0 else "减少"
    return {"结果": f"「{h.name}」{date} 累计已{action}为 {new_value:g}"}


async def _delete_entry(db, user_id: int, habit_id: int, date: str, confirm: bool = False) -> dict:
    h = await habit_service.get_habit(db, habit_id, user_id)
    e = await entry_service.get_entry(db, user_id, habit_id, date)
    if not e:
        return {"结果": f"「{h.name}」在 {date} 没有打卡记录，无需删除"}
    if not confirm:
        return {
            "需要确认": "删除打卡记录不可恢复。请把目标复述给用户，待其明确同意后再带 confirm=true 调用。",
            "将删除": _entry_brief(e, h.name),
        }
    await entry_service.delete_entry(db, user_id, habit_id, date)
    return {"结果": f"已删除「{h.name}」在 {date} 的打卡记录"}


async def _save_entry(db, user_id: int, habit_id: int, date: str, value: float = None,
                      tags: list = None, notes: str = None) -> dict:
    h = await habit_service.get_habit(db, habit_id, user_id)
    data = EntrySave(habit_id=habit_id, date=date, value=value, tags=tags, notes=notes)
    e = await entry_service.save_entry(db, user_id, data)
    return {"结果": f"已保存「{h.name}」在 {date} 的打卡", "记录": _entry_brief(e, h.name)}


# ---- 日报 / 周报 ----

def _format_task_line(t, include_project: bool = True) -> str:
    """格式化任务行：序号. 【项目】标题"""
    parts = []
    if include_project and t.project:
        parts.append(f"【{t.project}】")
    parts.append(t.title)
    return "".join(parts)


def _format_daily_report(date: str, groups: list, completed: list, pending: list, blocked: list) -> str:
    """生成日报：用户所有分组固定输出「昨日完成/今日计划/阻塞」三段，空的组也要完整显示（无）/无"""
    lines = [f"📋 每日工作简报 - {date}", ""]

    for idx, group in enumerate(groups):
        lines.append(f"【{group.upper()}】")
        lines.append("")

        lines.append("昨日完成：")
        g_completed = [t for t in completed if t.group == group]
        if g_completed:
            lines.extend(_format_task_line(t) for t in g_completed)
        else:
            lines.append("（无）")
        lines.append("")

        lines.append("今日计划：")
        g_pending = [t for t in pending if t.group == group]
        if g_pending:
            lines.extend(_format_task_line(t) for t in g_pending)
        else:
            lines.append("（无）")
        lines.append("")

        lines.append("阻塞 / 需要支持：")
        g_blocked = [t for t in blocked if t.group == group]
        if g_blocked:
            for t in g_blocked:
                reason = t.blocked_reason or "未知原因"
                lines.append(f"- {t.title}：{reason}")
        else:
            lines.append("无")

        if idx != len(groups) - 1:
            lines.extend(["", ""])

    return "\n".join(lines)


def _format_weekly_report(week_start: str, week_end: str, days: list[dict]) -> str:
    """生成周报：汇总一周各天"""
    lines = [f"📊 每周工作简报 - {week_start} ~ {week_end}", ""]

    total_completed = 0
    total_pending = 0
    total_blocked = 0
    all_completed = []
    all_pending = []

    for day in days:
        total_completed += len(day["completed"])
        total_pending += len(day["pending"])
        total_blocked += len(day["blocked"])
        all_completed.extend(day["completed"])
        all_pending.extend(day["pending"])

    # 汇总统计
    lines.append(f"本周总任务：{total_completed + total_pending + total_blocked}")
    lines.append(f"已完成：{total_completed}  待完成：{total_pending}  阻塞：{total_blocked}")
    completion_rate = round(total_completed / (total_completed + total_pending + total_blocked) * 100) if (total_completed + total_pending + total_blocked) > 0 else 0
    lines.append(f"完成率：{completion_rate}%")
    lines.append("")

    # 按分组汇总
    groups = sorted(set(t.group for d in days for t in d["completed"] + d["pending"] + d["blocked"]))
    if not groups:
        groups = ["Work"]

    for group in groups:
        lines.append(f"【{group.upper()}】")
        lines.append("")

        g_completed = [t for t in all_completed if t.group == group]
        lines.append("本周完成：")
        if g_completed:
            for t in g_completed:
                lines.append(_format_task_line(t))
        else:
            lines.append("（无）")
        lines.append("")

        g_pending = [t for t in all_pending if t.group == group]
        lines.append("待跟进：")
        if g_pending:
            for t in g_pending:
                lines.append(_format_task_line(t))
        else:
            lines.append("（无）")

        if group != groups[-1]:
            lines.append("")

    # 逐日明细
    lines.append("")
    lines.append("📅 逐日明细")
    lines.append("")
    for day in days:
        date = day["date"]
        dc = len(day["completed"])
        dp = len(day["pending"])
        db = len(day["blocked"])
        lines.append(f"{date}：完成 {dc} / 待办 {dp} / 阻塞 {db}")

    return "\n".join(lines)


async def _generate_daily_report(db, user_id: int, date: str = None) -> dict:
    date = date or today_cn().isoformat()
    r = await task_service.get_report(db, user_id, date)
    completed = r["completed_today"]
    pending = r["pending"]
    blocked = r["blocked"]

    # 所有自定义分组按 sort_order 排满，当天任务里出现但未建组的组名追加在后，保证每组必显示
    group_rows = await group_service.list_groups(db, user_id)
    groups = [g.name for g in group_rows]
    for name in sorted(r["by_group"].keys()):
        if name not in groups:
            groups.append(name)

    report = _format_daily_report(date, groups, completed, pending, blocked)
    return {"日期": date, "报告": report}


async def _generate_weekly_report(db, user_id: int, date: str = None) -> dict:
    """生成周报：默认本周（周一到今天/周日）"""
    today = today_cn()
    if date:
        today = _date_cls.fromisoformat(date)

    # 计算本周一
    weekday = today.weekday()  # 0=周一
    monday = today - timedelta(days=weekday)
    sunday = monday + timedelta(days=6)

    days = []
    current = monday
    while current <= min(sunday, today):
        date_str = current.isoformat()
        r = await task_service.get_report(db, user_id, date_str)
        days.append({
            "date": date_str,
            "completed": r["completed_today"],
            "pending": r["pending"],
            "blocked": r["blocked"],
        })
        current += timedelta(days=1)

    report = _format_weekly_report(monday.isoformat(), sunday.isoformat(), days)
    return {"周起始": monday.isoformat(), "周结束": sunday.isoformat(), "报告": report}


# ---- 分组 / 项目 ----

async def _list_groups(db, user_id: int) -> dict:
    groups = await group_service.list_groups(db, user_id)
    return {"数量": len(groups), "分组": [_group_brief(g) for g in groups]}


async def _create_group(db, user_id: int, name: str, color: str = None) -> dict:
    g = await group_service.create_group(db, user_id, GroupCreate(name=name, color=color))
    return {"结果": f"已创建分组「{g.name}」", "分组": _group_brief(g)}


async def _rename_group(db, user_id: int, id: int, name: str) -> dict:
    g = await group_service.rename_group(db, user_id, GroupRename(id=id, name=name))
    return {"结果": f"分组已重命名为「{g.name}」（组内任务已同步）"}


async def _delete_group(db, user_id: int, id: int, confirm: bool = False) -> dict:
    g = await group_service.get_group(db, id, user_id)
    if not confirm:
        return {
            "需要确认": "删除分组后，组内任务会移动到剩余的第一个分组。请把目标复述给用户，"
                       "待其明确同意后再带 confirm=true 调用。",
            "将删除": _group_brief(g),
        }
    await group_service.delete_group(db, id, user_id)
    return {"结果": f"已删除分组「{g.name}」，组内任务已移动到剩余的第一个分组"}


async def _list_projects(db, user_id: int) -> dict:
    projects = await project_service.list_projects(db, user_id)
    return {"数量": len(projects), "项目": [_project_brief(p) for p in projects]}


async def _create_project(db, user_id: int, name: str) -> dict:
    p = await project_service.create_project(db, user_id, ProjectCreate(name=name))
    return {"结果": f"已创建项目「{p.name}」", "项目": _project_brief(p)}


async def _rename_project(db, user_id: int, id: int, name: str) -> dict:
    p = await project_service.rename_project(db, user_id, ProjectRename(id=id, name=name))
    return {"结果": f"项目已重命名为「{p.name}」（相关任务已同步）"}


async def _delete_project(db, user_id: int, id: int, confirm: bool = False) -> dict:
    p = await project_service.get_project(db, id, user_id)
    if not confirm:
        return {
            "需要确认": "删除项目后，项目下的任务会变为「无项目」。请把目标复述给用户，"
                       "待其明确同意后再带 confirm=true 调用。",
            "将删除": _project_brief(p),
        }
    await project_service.delete_project(db, id, user_id)
    return {"结果": f"已删除项目「{p.name}」，相关任务已变为无项目"}


# ---- 注册表 ----

_DATE = {"type": "string", "description": "YYYY-MM-DD；不传默认今天"}

_def("list_tasks", "查询任务",
     "按条件查询当前用户的任务列表。操作任务前先用它拿到目标 id。",
     {
         "date": {**_DATE, "description": "只看某天的任务"},
         "group": {"type": "string", "description": "按分组名筛选"},
         "project": {"type": "string", "description": "按项目名筛选"},
         "status": {"type": "string", "enum": ["pending", "done", "shelved"],
                    "description": "pending=待完成 done=已完成 shelved=已阻塞"},
         "priority": {"type": "integer", "minimum": 0, "maximum": 3, "description": "P0-P3"},
         "title_contains": {"type": "string", "description": "按标题模糊筛选"},
         "limit": {"type": "integer", "description": "返回条数上限，默认 50"},
     },
     [], _list_tasks)

_def("create_task", "创建任务",
     "创建一个任务。用户没说日期时不要猜，用默认或先询问。",
     {
         "title": {"type": "string", "description": "任务标题"},
         "date": _DATE,
         "group": {"type": "string", "description": "分组名，默认 Work；不确定有哪些分组可先 list_groups"},
         "project": {"type": "string", "description": "项目名（可选）"},
         "priority": {"type": "integer", "minimum": 0, "maximum": 3, "description": "0=P0 最优先 … 3=P3，默认 2"},
         "description": {"type": "string", "description": "补充描述（可选）"},
     },
     ["title"], _create_task)

_def("update_task", "修改任务",
     "修改任务的标题/日期/分组/项目/优先级/描述。完成/恢复请用 complete_task。",
     {
         "id": {"type": "integer", "description": "任务 id"},
         "title": {"type": "string"}, "date": _DATE, "group": {"type": "string"},
         "project": {"type": "string"}, "priority": {"type": "integer", "minimum": 0, "maximum": 3},
         "description": {"type": "string"},
     },
     ["id"], _update_task)

_def("delete_task", "删除任务",
     "删除一个任务，不可恢复。必须先向用户复述目标并获得明确同意，才能带 confirm=true 调用。",
     {"id": {"type": "integer", "description": "任务 id"},
      "confirm": {"type": "boolean", "description": "用户明确同意后传 true"}},
     ["id"], _delete_task, danger=True)

_def("complete_task", "完成/恢复任务",
     "把任务标记为完成，或撤销完成（completed=false）恢复为待完成。",
     {"id": {"type": "integer", "description": "任务 id"},
      "completed": {"type": "boolean", "description": "true=完成（默认），false=恢复待完成"}},
     ["id"], _complete_task)

_def("add_task_progress", "追加任务进展",
     "给任务追加一条进展记录（会显示在任务详情时间线）。",
     {"id": {"type": "integer", "description": "任务 id"},
      "text": {"type": "string", "description": "进展内容"}},
     ["id", "text"], _add_task_progress)

_def("block_task", "阻塞任务",
     "把任务标记为阻塞（搁置）并记录原因。",
     {"id": {"type": "integer", "description": "任务 id"},
      "reason": {"type": "string", "description": "阻塞原因"}},
     ["id", "reason"], _block_task)

_def("carry_overdue_tasks", "搬运过期任务",
     "把今天之前所有未完成任务批量搬到指定日期（默认今天），过期任务清理常用。",
     {"date": _DATE}, [], _carry_overdue_tasks)

_def("list_habits", "查询习惯",
     "查询当前用户的习惯列表。操作习惯/打卡前先用它拿到 habit_id。",
     {"include_archived": {"type": "boolean", "description": "是否包含已归档习惯，默认否"}},
     [], _list_habits)

_def("get_habit_stats", "习惯统计",
     "查询单个习惯的连续天数、达成率、最近 14 天逐日状态等统计。",
     {"habit_id": {"type": "integer", "description": "习惯 id"}}, ["habit_id"], _get_habit_stats)

_def("create_habit", "创建习惯",
     "创建一个习惯。目标类型：check=勾选打卡，count=计数。",
     {
         "name": {"type": "string", "description": "习惯名"},
         "emoji": {"type": "string", "description": "图标 emoji，默认 🎯"},
         "direction": {"type": "string", "enum": ["positive", "negative"],
                       "description": "positive=正向养成（默认），negative=反向克制（如戒糖，发生即失守）"},
         "goal_type": {"type": "string", "enum": ["check", "count"],
                       "description": "check=勾选（默认），count=每日计数目标"},
         "target_value": {"type": "number", "description": "count 类的每日目标值，默认 1"},
         "unit": {"type": "string", "description": "计数单位，如 杯/分钟"},
         "weekdays": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 6},
                      "description": "生效星期，0=周日 … 6=周六；空=每天"},
     },
     ["name"], _create_habit)

_def("update_habit", "修改习惯",
     "修改习惯的名称/图标/目标/生效日等，或 archived=true 归档。",
     {
         "id": {"type": "integer", "description": "习惯 id"},
         "name": {"type": "string"}, "emoji": {"type": "string"},
         "direction": {"type": "string", "enum": ["positive", "negative"]},
         "goal_type": {"type": "string", "enum": ["check", "count"]},
         "target_value": {"type": "number"}, "unit": {"type": "string"},
         "weekdays": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 6}},
         "archived": {"type": "boolean", "description": "true=归档（不删数据）"},
     },
     ["id"], _update_habit)

_def("delete_habit", "删除习惯",
     "删除习惯及其全部打卡历史，不可恢复。必须先向用户复述目标并获得明确同意，才能带 confirm=true 调用。"
     "只想暂时隐藏请改用 update_habit 的 archived=true。",
     {"id": {"type": "integer", "description": "习惯 id"},
      "confirm": {"type": "boolean", "description": "用户明确同意后传 true"}},
     ["id"], _delete_habit, danger=True)

_def("toggle_habit_checkin", "打卡/取消打卡",
     "切换某习惯某天的打卡状态：未打卡则打卡，已打卡则取消。",
     {"habit_id": {"type": "integer", "description": "习惯 id"}, "date": _DATE},
     ["habit_id"], _toggle_habit_checkin)

_def("bump_habit_count", "习惯计数增减",
     "给计数型习惯某天的累计值增加/减少（delta 为负即扣减）。",
     {"habit_id": {"type": "integer", "description": "习惯 id"},
      "delta": {"type": "number", "description": "本次增减量，正增负减"},
      "date": _DATE},
     ["habit_id", "delta"], _bump_habit_count)

_def("save_entry", "保存打卡记录",
     "保存/覆盖某习惯某天的打卡记录（设置数值、标签、备注）。",
     {"habit_id": {"type": "integer", "description": "习惯 id"},
      "date": {"type": "string", "description": "YYYY-MM-DD"},
      "value": {"type": "number", "description": "当天累计值"},
      "tags": {"type": "array", "items": {"type": "string"}},
      "notes": {"type": "string"}},
     ["habit_id", "date"], _save_entry)

_def("delete_entry", "删除打卡记录",
     "删除某习惯某天的打卡记录，不可恢复。必须先向用户复述目标并获得明确同意，才能带 confirm=true 调用。",
     {"habit_id": {"type": "integer", "description": "习惯 id"},
      "date": {"type": "string", "description": "YYYY-MM-DD"},
      "confirm": {"type": "boolean", "description": "用户明确同意后传 true"}},
     ["habit_id", "date"], _delete_entry, danger=True)

_def("get_day_entries", "查询某天打卡",
     "查询某天（默认今天）全部习惯的打卡记录。",
     {"date": _DATE}, [], _get_day_entries)

_def("get_data_overview", "数据总览",
     "获取指定时间范围的习惯达成/任务完成结构化总览（与 AI 分析同一数据口径）。",
     {"preset": {"type": "string", "enum": ["day", "week", "month", "year", "custom"],
                 "description": "day=今天 week=本周(默认) month=本月 year=本年 custom=自定义"},
      "date_from": {"type": "string", "description": "custom 时的开始日期 YYYY-MM-DD"},
      "date_to": {"type": "string", "description": "custom 时的结束日期 YYYY-MM-DD"}},
     [], _get_data_overview)

_def("get_task_stats", "任务统计",
     "按时间范围/分组统计任务完成率、积压等。",
     {"date_from": {"type": "string", "description": "YYYY-MM-DD"},
      "date_to": {"type": "string", "description": "YYYY-MM-DD"},
      "group": {"type": "string"}},
     [], _get_task_stats)

_def("get_day_report", "当日任务数据",
     "查询某天（默认今天）任务的完成/待办/阻塞原始数据，仅供程序化查询或组装其他数据使用。"
     "用户要日报时禁止用本工具自行排版——必须改用 generate_daily_report，它返回的成品才是标准日报格式。",
     {"date": _DATE}, [], _get_day_report)

_def("generate_daily_report", "生成日报",
     "生成 Obsidian 风格每日工作简报，按分组展示已完成、待办、阻塞任务。"
     "无论当天有无数据都直接返回完整格式（无数据显示「（无）」），不需要先查询其他工具。"
     "用户要求生成日报/今日总结时必须调用本工具，并把返回的「报告」字段原文输出给用户："
     "保持格式不变，不要混入其他工具的数据，不要自行重新排版，不要添加额外点评。",
     {"date": _DATE}, [], _generate_daily_report)

_def("generate_weekly_report", "生成周报",
     "生成本周工作简报，汇总完成率、按分组归类、逐日明细。默认本周（周一到今天），传 date 可指定该周内任意一天。"
     "无论有无数据都直接返回完整格式，不需要先查询其他工具。"
     "用户要求生成周报时必须调用本工具，并把返回的「报告」字段原文输出给用户："
     "保持格式不变，不要混入其他工具的数据，不要自行重新排版，不要添加额外点评。",
     {"date": _DATE}, [], _generate_weekly_report)

_def("list_groups", "查询分组", "查询当前用户的任务分组列表。",
     {}, [], _list_groups)

_def("create_group", "创建分组", "创建任务分组。",
     {"name": {"type": "string", "description": "分组名（≤20 字）"},
      "color": {"type": "string", "description": "颜色值（可选，如 #4D7CFE）"}},
     ["name"], _create_group)

_def("rename_group", "重命名分组", "重命名分组，组内任务自动同步。",
     {"id": {"type": "integer"}, "name": {"type": "string"}}, ["id", "name"], _rename_group)

_def("delete_group", "删除分组",
     "删除分组（组内任务移到剩余第一个分组；最后一个分组不可删）。"
     "必须先向用户复述目标并获得明确同意，才能带 confirm=true 调用。",
     {"id": {"type": "integer"}, "confirm": {"type": "boolean", "description": "用户明确同意后传 true"}},
     ["id"], _delete_group, danger=True)

_def("list_projects", "查询项目", "查询当前用户的项目列表。", {}, [], _list_projects)

_def("create_project", "创建项目", "创建项目（任务的可选归属）。",
     {"name": {"type": "string", "description": "项目名（≤50 字）"}},
     ["name"], _create_project)

_def("rename_project", "重命名项目", "重命名项目，相关任务自动同步。",
     {"id": {"type": "integer"}, "name": {"type": "string"}}, ["id", "name"], _rename_project)

_def("delete_project", "删除项目",
     "删除项目（项目下任务变为无项目）。必须先向用户复述目标并获得明确同意，才能带 confirm=true 调用。",
     {"id": {"type": "integer"}, "confirm": {"type": "boolean", "description": "用户明确同意后传 true"}},
     ["id"], _delete_project, danger=True)


# ---- 对外接口 ----

def openai_schemas() -> list[dict]:
    """OpenAI Chat Completions 的 tools 参数"""
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            },
        }
        for t in TOOLS.values()
    ]


def mcp_manifest() -> list[dict]:
    """MCP tools/list 的返回"""
    return [
        {"name": t.name, "description": t.description, "inputSchema": t.parameters}
        for t in TOOLS.values()
    ]


def brief_result(result: dict) -> str:
    """流式 tool 事件里给前端展示的一句话摘要"""
    for key in ("error", "需要确认", "结果"):
        if key in result:
            return str(result[key])[:100]
    return ""


async def execute_tool(
    db: AsyncSession, user_id: int, name: str, arguments: Any, source: str = "chat",
) -> tuple[dict, bool]:
    """执行工具并审计。返回 (结果, 是否成功)；业务失败不抛异常，以 {"error": ...} 返回给 LLM"""
    td = TOOLS.get(name)
    if td is None:
        result, ok, arguments = {"error": f"未知工具：{name}"}, False, {"_raw": str(arguments)[:500]}
    elif not isinstance(arguments, dict):
        result, ok = {"error": "工具参数必须是 JSON 对象"}, False
    else:
        if not td.danger:
            arguments = {k: v for k, v in arguments.items() if k != "confirm"}
        try:
            result = await td.handler(db, user_id, **arguments)
            ok = isinstance(result, dict) and "error" not in result
        except HTTPException as e:
            result, ok = {"error": str(e.detail)}, False
        except TypeError as e:
            result, ok = {"error": f"参数不合法：{e}"}, False
        except (ValueError, KeyError) as e:
            result, ok = {"error": f"执行失败：{e}"}, False

    try:
        result_str = json.dumps(result, ensure_ascii=False, default=str)[:AUDIT_RESULT_MAX_CHARS]
    except (TypeError, ValueError):
        result_str = str(result)[:AUDIT_RESULT_MAX_CHARS]
    db.add(AIToolCall(
        user_id=user_id, tool=name,
        arguments=arguments if isinstance(arguments, dict) else {"_raw": str(arguments)[:500]},
        result=result_str, ok=ok, source=source,
    ))
    await db.flush()
    return result, ok
