"""纯业务逻辑函数，从前端 logic.ts 移植"""
from dataclasses import dataclass
from datetime import datetime, date, timedelta
from typing import List, Optional, Literal

DayState = Literal["success", "partial", "fail", "neutral", "pending"]


@dataclass
class HabitLike:
    """兼容 dict 和 ORM 对象的习惯数据"""
    direction: str
    goal_type: str
    target_value: float
    weekdays: list
    created_at: datetime

    @classmethod
    def from_obj(cls, h) -> "HabitLike":
        return cls(
            direction=h.direction,
            goal_type=h.goal_type,
            target_value=h.target_value,
            weekdays=h.weekdays if isinstance(h.weekdays, list) else [],
            created_at=h.created_at if isinstance(h.created_at, datetime) else datetime.fromisoformat(str(h.created_at)),
        )


def parse_date(date_str: str) -> date:
    return datetime.strptime(date_str, "%Y-%m-%d").date()


def weekday_of(date_str: str) -> int:
    """返回星期几，0=周日"""
    d = parse_date(date_str)
    return (d.weekday() + 1) % 7


def is_scheduled_day(habit: HabitLike, date_str: str) -> bool:
    if not habit.weekdays:
        return True
    return weekday_of(date_str) in habit.weekdays


def meets_goal(habit: HabitLike, value: float) -> bool:
    if habit.direction == "positive":
        return value >= habit.target_value
    else:
        return value <= habit.target_value


def judge_entry(habit: HabitLike, value: float) -> DayState:
    if habit.goal_type == "check":
        return "success" if meets_goal(habit, value) else "fail"
    else:
        if habit.direction == "positive":
            return "success" if value >= habit.target_value else "partial"
        else:
            return "fail" if value > habit.target_value else "success"


def day_state(habit: HabitLike, entry_value: Optional[float], date_str: str, today_str: str) -> DayState:
    created_date = habit.created_at.date() if isinstance(habit.created_at, datetime) else habit.created_at
    current = parse_date(date_str)

    if current < created_date:
        return "neutral"

    if entry_value is not None:
        return judge_entry(habit, entry_value)

    if not is_scheduled_day(habit, date_str):
        return "neutral"

    if date_str == today_str:
        return "pending"

    if habit.direction == "positive":
        return "fail"
    return "success"


@dataclass
class HabitStats:
    current_streak: int
    longest_streak: int
    total_success: int
    total_fail: int
    total_entries: int
    success_rate: float
    weekday: List[int]


def compute_stats(habit: HabitLike, entries: dict[str, float], today_str: str) -> HabitStats:
    """计算习惯统计
    entries: {date_str: value} 映射
    """
    created_date = habit.created_at.date()
    today = parse_date(today_str)

    # 收集所有日期状态
    all_states: dict[str, DayState] = {}
    current = created_date
    while current <= today:
        ds = current.strftime("%Y-%m-%d")
        val = entries.get(ds)
        all_states[ds] = day_state(habit, val, ds, today_str)
        current += timedelta(days=1)

    # 当前连续天数：从今天往回数
    current_streak = 0
    d = today
    while d >= created_date:
        ds = d.strftime("%Y-%m-%d")
        st = all_states.get(ds, "neutral")
        if st == "success":
            current_streak += 1
        elif st in ("neutral", "pending"):
            pass  # 跳过
        else:
            break
        d -= timedelta(days=1)

    # 最长连续天数
    longest_streak = 0
    run = 0
    d = created_date
    while d <= today:
        ds = d.strftime("%Y-%m-%d")
        st = all_states.get(ds, "neutral")
        if st == "success":
            run += 1
            longest_streak = max(longest_streak, run)
        elif st in ("fail", "partial"):
            run = 0
        d += timedelta(days=1)

    total_success = sum(1 for s in all_states.values() if s == "success")
    total_fail = sum(1 for s in all_states.values() if s == "fail")
    total_entries = len(entries)

    scheduled_days = sum(
        1 for ds, st in all_states.items() if st in ("success", "partial", "fail")
    )
    success_rate = round(total_success / scheduled_days * 100) if scheduled_days > 0 else 0

    weekday = [0] * 7
    for ds, st in all_states.items():
        wd = weekday_of(ds)
        if habit.direction == "positive":
            if st == "success":
                weekday[wd] += 1
        else:
            if st == "fail":
                weekday[wd] += 1

    return HabitStats(
        current_streak=current_streak,
        longest_streak=longest_streak,
        total_success=total_success,
        total_fail=total_fail,
        total_entries=total_entries,
        success_rate=round(success_rate),
        weekday=weekday,
    )


def recent_day_states(habit: HabitLike, entries: dict[str, float], days: int, today_str: str) -> List[dict]:
    """返回最近 N 天的日期状态"""
    today = parse_date(today_str)
    result = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        val = entries.get(ds)
        st = day_state(habit, val, ds, today_str)
        result.append({"date": ds, "state": st, "value": val})
    return result
