"""AI 数据上下文构建器：把用户习惯/任务数据聚合为紧凑结构化摘要，供 LLM 引用

关键原则：
- 全部判定复用 app/utils/logic.py（day_state / compute_stats），保证 AI 口径与页面显示一致
- 原始逐日状态只保留最近 30 天，长范围聚合为月度达成率，控制 token 预算
- 时间口径统一使用东八区（与统计服务一致）
"""
import json
from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Habit, HabitEntry, Task
from app.utils.logic import HabitLike, day_state, compute_stats

TZ_CN = timezone(timedelta(hours=8))
WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
STATE_SYMBOL = {"success": "✓", "partial": "~", "fail": "✗", "neutral": "·", "pending": "?"}

MAX_RANGE_DAYS = 366        # 自定义范围上限
RECENT_STATE_DAYS = 30      # 逐日状态字符串保留天数
LONG_RANGE_DAYS = 60        # 超过该天数时附月度汇总
PRESETS = ("day", "week", "month", "year", "custom")


def today_cn() -> date:
    return datetime.now(TZ_CN).date()


def _fmt_num(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else str(round(float(x), 1))


def clamp_range(date_from: date, date_to: date) -> tuple[date, date]:
    today = today_cn()
    if date_from > date_to:
        date_from, date_to = date_to, date_from
    if (date_to - date_from).days + 1 > MAX_RANGE_DAYS:
        date_from = date_to - timedelta(days=MAX_RANGE_DAYS - 1)
    if date_to > today:
        date_to = today
    if date_from > today:
        date_from = today
    return date_from, date_to


def resolve_range(preset: str, date_from: str | None, date_to: str | None) -> tuple[date, date, str]:
    """预设 → 日期区间；返回 (起始, 结束, 中文标签)"""
    today = today_cn()
    if preset == "day":
        return today, today, "今日"
    if preset == "week":
        monday = today - timedelta(days=today.weekday())
        return monday, today, "本周"
    if preset == "month":
        return today.replace(day=1), today, "本月"
    if preset == "year":
        return today.replace(month=1, day=1), today, "本年"
    if preset == "custom":
        if not date_from or not date_to:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="自定义范围需要 date_from 和 date_to")
        try:
            df = datetime.strptime(date_from, "%Y-%m-%d").date()
            dt = datetime.strptime(date_to, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="日期格式应为 YYYY-MM-DD")
        df, dt = clamp_range(df, dt)
        return df, dt, f"自定义（{df.isoformat()} ~ {dt.isoformat()}）"
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的时间范围预设")


def _describe_goal(h: Habit) -> str:
    if h.direction == "positive":
        text = "正向打卡" if h.goal_type == "check" else f"正向计数：每天 ≥ {_fmt_num(h.target_value)}{h.unit}"
    else:
        text = "反向克制（发生即失守）" if h.goal_type == "check" else f"反向限制：每天 ≤ {_fmt_num(h.target_value)}{h.unit}"
    if h.weekdays:
        text += "，生效日：" + "、".join(WEEKDAY_NAMES[int(w)] if 0 <= int(w) <= 6 else "?" for w in h.weekdays)
    return text


async def build_context(
    db: AsyncSession,
    user_id: int,
    date_from: date,
    date_to: date,
) -> dict:
    """构建某个时间范围内的数据上下文（含全期 streak 等全局指标）"""
    today = today_cn()
    today_str = today.isoformat()
    days = (date_to - date_from).days + 1
    long_range = days > LONG_RANGE_DAYS
    recent_start = max(date_from, date_to - timedelta(days=RECENT_STATE_DAYS - 1))

    habits = list(
        (
            await db.execute(
                select(Habit)
                .where(Habit.user_id == user_id, Habit.archived == False)  # noqa: E712
                .order_by(Habit.sort_order)
            )
        ).scalars().all()
    )

    # 一次加载该用户全部打卡记录（量级小；compute_stats 需要全期数据算 streak）
    all_entries = list(
        (await db.execute(select(HabitEntry).where(HabitEntry.user_id == user_id))).scalars().all()
    )
    entries_by_habit: dict[int, dict[str, float]] = {}
    for e in all_entries:
        entries_by_habit.setdefault(e.habit_id, {})[e.date] = e.value

    habits_out = []
    for h in habits:
        emap = entries_by_habit.get(h.id, {})
        hl = HabitLike.from_obj(h)
        global_stats = compute_stats(hl, emap, today_str)

        r_success = r_partial = r_fail = r_pending = 0
        weekday_fail: Counter = Counter()
        monthly: dict[str, dict] = {}
        recent_states: list[str] = []

        d = date_from
        while d <= date_to:
            ds = d.isoformat()
            st = day_state(hl, emap.get(ds), ds, today_str)
            if st == "success":
                r_success += 1
            elif st == "partial":
                r_partial += 1
            elif st == "fail":
                r_fail += 1
                weekday_fail[WEEKDAY_NAMES[(d.weekday() + 1) % 7]] += 1
            elif st == "pending":
                r_pending += 1
            if d >= recent_start:
                recent_states.append(STATE_SYMBOL[st])
            if long_range:
                m = monthly.setdefault(ds[:7], {"达成": 0, "计划": 0})
                if st in ("success", "partial", "fail"):
                    m["计划"] += 1
                    if st == "success":
                        m["达成"] += 1
            d += timedelta(days=1)

        scheduled = r_success + r_partial + r_fail
        range_rate = round(r_success / scheduled * 100) if scheduled else 0

        in_range: dict = {
            "达成": r_success,
            "部分达成": r_partial,
            "未达成": r_fail,
            "待完成": r_pending,
            "达成率%": range_rate,
        }
        if weekday_fail:
            in_range["失守星期分布"] = dict(weekday_fail.most_common())
        if h.goal_type == "count":
            in_range_count = sum(1 for ds in emap if date_from.isoformat() <= ds <= date_to.isoformat())
            in_range["数量统计"] = {
                "累计": _fmt_num(sum(v for ds, v in emap.items() if date_from.isoformat() <= ds <= date_to.isoformat())),
                "有记录天数": in_range_count,
                "单位": h.unit or "-",
            }
        if recent_states:
            in_range[f"最近{len(recent_states)}天逐日"] = "".join(recent_states)
        if long_range and monthly:
            in_range["月度达成率%"] = {
                m: round(v["达成"] / v["计划"] * 100) if v["计划"] else 0
                for m, v in sorted(monthly.items())
            }

        habits_out.append({
            "名称": h.name,
            "emoji": h.emoji,
            "目标": _describe_goal(h),
            "当前连续天数": global_stats.current_streak,
            "历史最长连续": global_stats.longest_streak,
            "历史累计达成": global_stats.total_success,
            "历史累计未达成": global_stats.total_fail,
            "历史达成率%": global_stats.success_rate,
            "范围内": in_range,
        })

    # ---- 任务 ----
    tasks = list(
        (
            await db.execute(
                select(Task).where(
                    Task.user_id == user_id,
                    Task.date >= date_from.isoformat(),
                    Task.date <= date_to.isoformat(),
                )
            )
        ).scalars().all()
    )
    p_labels = {0: "P0", 1: "P1", 2: "P2", 3: "P3"}
    t_total = len(tasks)
    t_done = sum(1 for t in tasks if t.completed)
    t_pending = sum(1 for t in tasks if t.status == "pending")
    t_blocked = sum(1 for t in tasks if t.status == "shelved")
    by_group: dict[str, dict] = {}
    by_priority: Counter = Counter()
    for t in tasks:
        g = by_group.setdefault(t.group, {"总数": 0, "完成": 0, "待完成": 0})
        g["总数"] += 1
        if t.completed:
            g["完成"] += 1
        elif t.status == "pending":
            g["待完成"] += 1
        by_priority[p_labels.get(t.priority, "P2")] += 1

    today_str = today.isoformat()
    overdue = [t for t in tasks if t.status == "pending" and t.date < today_str]
    blocked_items = [
        {"标题": t.title, "原因": t.blocked_reason or "-", "日期": t.date}
        for t in tasks if t.status == "shelved"
    ][:10]
    pending_items = [
        {"标题": t.title, "优先级": p_labels.get(t.priority, "P2"), "日期": t.date}
        for t in tasks if t.status == "pending"
    ][:10]

    tasks_out: dict = {
        "总数": t_total,
        "已完成": t_done,
        "待完成": t_pending,
        "已阻塞": t_blocked,
        "完成率%": round(t_done / t_total * 100) if t_total else 0,
        "按优先级": dict(by_priority),
    }
    if by_group:
        tasks_out["按分组"] = by_group
    if overdue:
        tasks_out["过期未完成"] = {"数量": len(overdue), "示例": [t.title for t in overdue[:10]]}
    if blocked_items:
        tasks_out["阻塞任务"] = blocked_items
    if pending_items:
        tasks_out["待完成任务示例"] = pending_items

    # ---- 上一周期对比（同长度窗口）----
    compare: dict | None = None
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=days - 1)
    if prev_from <= prev_to:
        prev_scheduled = prev_success = 0
        for h in habits:
            emap = entries_by_habit.get(h.id, {})
            hl = HabitLike.from_obj(h)
            d = prev_from
            while d <= prev_to:
                ds = d.isoformat()
                st = day_state(hl, emap.get(ds), ds, today_str)
                if st in ("success", "partial", "fail"):
                    prev_scheduled += 1
                    if st == "success":
                        prev_success += 1
                d += timedelta(days=1)
        prev_tasks = list(
            (
                await db.execute(
                    select(Task).where(
                        Task.user_id == user_id,
                        Task.date >= prev_from.isoformat(),
                        Task.date <= prev_to.isoformat(),
                    )
                )
            ).scalars().all()
        )
        prev_total = len(prev_tasks)
        prev_done = sum(1 for t in prev_tasks if t.completed)
        if prev_scheduled or prev_total:
            compare = {
                "上一周期": f"{prev_from.isoformat()} ~ {prev_to.isoformat()}",
                "习惯达成率%": round(prev_success / prev_scheduled * 100) if prev_scheduled else None,
                "任务完成率%": round(prev_done / prev_total * 100) if prev_total else None,
            }

    # ---- 亮点（规则预计算，引导 LLM 有据可依）----
    highlights: list[str] = []
    with_scheduled = [
        h for h in habits_out
        if h["范围内"]["达成"] + h["范围内"]["部分达成"] + h["范围内"]["未达成"] >= 5
    ]
    if with_scheduled:
        best = max(with_scheduled, key=lambda h: h["范围内"]["达成率%"])
        worst = min(with_scheduled, key=lambda h: h["范围内"]["达成率%"])
        if best["范围内"]["达成率%"] >= 80:
            highlights.append(f"表现最佳：{best['emoji']}{best['名称']}，达成率 {best['范围内']['达成率%']}%")
        if worst["范围内"]["达成率%"] <= 50 and worst["名称"] != best["名称"]:
            highlights.append(f"需关注：{worst['emoji']}{worst['名称']}，达成率仅 {worst['范围内']['达成率%']}%，未达成 {worst['范围内']['未达成']} 天")
    streaker = max(habits_out, key=lambda h: h["当前连续天数"], default=None)
    if streaker and streaker["当前连续天数"] >= 3:
        highlights.append(f"连续性最强：{streaker['emoji']}{streaker['名称']}，已连续 {streaker['当前连续天数']} 天")
    if t_total:
        highlights.append(f"任务完成率 {round(t_done / t_total * 100) if t_total else 0}%（完成 {t_done}/{t_total}）")
    if overdue:
        highlights.append(f"有 {len(overdue)} 个任务已过期未完成")
    if t_blocked:
        highlights.append(f"有 {t_blocked} 个任务处于阻塞状态")

    context = {
        "说明": "以下是 CleanStreak 用户的习惯打卡与任务数据摘要，回答必须基于这些数据",
        "今天": f"{today_str}（{WEEKDAY_NAMES[(today.weekday() + 1) % 7]}）",
        "统计范围": {
            "开始": date_from.isoformat(),
            "结束": date_to.isoformat(),
            "天数": days,
        },
        "习惯": habits_out,
        "任务": tasks_out,
    }
    if compare:
        context["对比上一周期"] = compare
    if highlights:
        context["亮点提示"] = highlights
    return context


def context_to_json(context: dict) -> str:
    return json.dumps(context, ensure_ascii=False, separators=(",", ":"))
