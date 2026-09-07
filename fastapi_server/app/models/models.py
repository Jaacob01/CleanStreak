from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, JSON, DateTime, ForeignKey,
    UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    tasks = relationship("Task", back_populates="user", lazy="noload")
    habits = relationship("Habit", back_populates="user", lazy="selectin")
    entries = relationship("HabitEntry", back_populates="user", lazy="noload")


class Habit(Base):
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    emoji = Column(String(10), nullable=False, default="🎯")
    color = Column(String(20), nullable=False, default="green")
    direction = Column(String(10), nullable=False, default="positive")
    goal_type = Column(String(10), nullable=False, default="check")
    target_value = Column(Float, nullable=False, default=1)
    unit = Column(String(20), nullable=False, default="")
    weekdays = Column(JSON, nullable=False, default=list)
    enable_notes = Column(Boolean, nullable=False, default=True)
    enable_tags = Column(Boolean, nullable=False, default=False)
    tags = Column(JSON, nullable=False, default=list)
    archived = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="habits")
    linked_tasks = relationship("Task", back_populates="habit", lazy="noload")
    entries = relationship("HabitEntry", back_populates="habit", cascade="all, delete-orphan", lazy="noload")

    __table_args__ = (
        Index("ix_habits_user_sort", "user_id", "sort_order"),
    )


class HabitEntry(Base):
    __tablename__ = "habit_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    date = Column(String(10), nullable=False)
    value = Column(Float, nullable=False, default=1)
    tags = Column(JSON, nullable=False, default=list)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="entries")
    habit = relationship("Habit", back_populates="entries")

    __table_args__ = (
        UniqueConstraint("habit_id", "date", name="uq_habit_date"),
        Index("ix_entries_user_date", "user_id", "date"),
        Index("ix_entries_habit_date", "habit_id", "date"),
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(String, nullable=True)
    date = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    group = Column(String(20), nullable=False, default="Work")
    project = Column(String(50), nullable=True)
    priority = Column(Integer, nullable=False, default=2)
    status = Column(String(10), nullable=False, default="pending")
    completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    progress_log = Column(JSON, nullable=False, default=list)
    blocked_reason = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    source = Column(String(10), nullable=False, default="manual")
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="SET NULL"), nullable=True)

    user = relationship("User", back_populates="tasks")
    habit = relationship("Habit", back_populates="linked_tasks")

    __table_args__ = (
        Index("ix_tasks_user_date", "user_id", "date"),
        Index("ix_tasks_user_status", "user_id", "status"),
        Index("ix_tasks_user_group", "user_id", "group"),
    )


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(50), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_project_user_name"),
        Index("ix_projects_user_sort", "user_id", "sort_order"),
    )


class TaskGroup(Base):
    """任务分组：按用户隔离；Task.group 存分组名字符串"""
    __tablename__ = "task_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(20), nullable=False)
    color = Column(String(20), nullable=False, default="#4D7CFE")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_task_group_user_name"),
        Index("ix_task_groups_user_sort", "user_id", "sort_order"),
    )
