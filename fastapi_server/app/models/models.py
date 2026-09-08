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
    # 角色：user=普通用户（默认）；admin=管理员（仅手动改库授予，可配置 AI）
    role = Column(String(10), nullable=False, default="user", server_default="user")
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
    # 每次打卡的独立明细 [{value, tags, notes}, ...]；value 恒等于各次 value 之和
    # 顶层 tags/notes 是按次汇总（标签并集 / 备注拼接），供旧消费方（统计/导出/AI）使用
    details = Column(JSON, nullable=False, default=list)
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


class AISettings(Base):
    """AI 全局配置（单行，管理员维护）；api_key Fernet 加密存储"""
    __tablename__ = "ai_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    provider = Column(String(50), nullable=False, default="custom", server_default="custom")
    base_url = Column(String(255), nullable=False, default="", server_default="")
    api_key_encrypted = Column(String, nullable=True)
    model_name = Column(String(100), nullable=False, default="", server_default="")
    system_prompt_chat = Column(String, nullable=True)
    system_prompt_analyze = Column(String, nullable=True)
    temperature = Column(Float, nullable=False, default=0.7, server_default="0.7")
    max_tokens = Column(Integer, nullable=False, default=2048, server_default="2048")
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AIChatMessage(Base):
    """AI 聊天历史（按用户隔离）"""
    __tablename__ = "ai_chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(10), nullable=False)  # user / assistant
    content = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_ai_chat_user_time", "user_id", "id"),
    )


class AIToolCall(Base):
    """AI 工具调用审计（App 聊天与 MCP 端点共用，按用户隔离）"""
    __tablename__ = "ai_tool_calls"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tool = Column(String(64), nullable=False)
    arguments = Column(JSON, nullable=False, default=dict)
    # 执行结果 JSON（超长截断），ok=False 时通常是 {"error": ...}
    result = Column(String, nullable=True)
    ok = Column(Boolean, nullable=False, default=True)
    source = Column(String(10), nullable=False, default="chat")  # chat / mcp
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_ai_tool_user_time", "user_id", "id"),
    )


class McpApiKey(Base):
    """用户级 MCP 访问密钥（「我的」页面自助生成/吊销）；prefix 存明文前缀用于检索，全量 Fernet 加密"""
    __tablename__ = "mcp_api_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    label = Column(String(50), nullable=False, default="默认密钥", server_default="默认密钥")
    prefix = Column(String(12), nullable=False)  # 明文前缀（cs_ + 8 hex），用于鉴权检索与列表展示
    key_encrypted = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_mcp_keys_prefix", "prefix"),
        Index("ix_mcp_keys_user_id", "user_id"),
    )
