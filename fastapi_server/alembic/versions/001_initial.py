"""初始迁移

Revision ID: 001_initial
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 用户表
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )

    # 习惯表
    op.create_table(
        "habits",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("emoji", sa.String(10), nullable=False, server_default="🎯"),
        sa.Column("color", sa.String(20), nullable=False, server_default="green"),
        sa.Column("direction", sa.String(10), nullable=False, server_default="positive"),
        sa.Column("goal_type", sa.String(10), nullable=False, server_default="check"),
        sa.Column("target_value", sa.Float(), nullable=False, server_default="1"),
        sa.Column("unit", sa.String(20), nullable=False, server_default=""),
        sa.Column("weekdays", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("enable_notes", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("enable_tags", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_habits_user_sort", "habits", ["user_id", "sort_order"])

    # 打卡记录表
    op.create_table(
        "habit_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("habit_id", sa.Integer(), sa.ForeignKey("habits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.String(10), nullable=False),
        sa.Column("value", sa.Float(), nullable=False, server_default="1"),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("habit_id", "date", name="uq_habit_date"),
    )
    op.create_index("ix_entries_user_date", "habit_entries", ["user_id", "date"])
    op.create_index("ix_entries_habit_date", "habit_entries", ["habit_id", "date"])


def downgrade() -> None:
    op.drop_table("habit_entries")
    op.drop_table("habits")
    op.drop_table("users")
