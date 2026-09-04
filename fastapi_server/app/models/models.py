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
