"""AI 功能：用户角色 + AI 全局配置表 + AI 聊天历史表

Revision ID: 005_add_ai
Revises: 004_add_task_groups
Create Date: 2026-09-07 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005_add_ai"
down_revision: Union[str, None] = "004_add_task_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 用户角色：默认普通用户，管理员手动改库授予
    op.add_column(
        "users",
        sa.Column("role", sa.String(10), nullable=False, server_default="user"),
    )

    # AI 全局配置（单行）
    op.create_table(
        "ai_settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("provider", sa.String(50), nullable=False, server_default="custom"),
        sa.Column("base_url", sa.String(255), nullable=False, server_default=""),
        sa.Column("api_key_encrypted", sa.String(), nullable=True),
        sa.Column("model_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("system_prompt_chat", sa.String(), nullable=True),
        sa.Column("system_prompt_analyze", sa.String(), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=False, server_default="0.7"),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="2048"),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )

    # AI 聊天历史
    op.create_table(
        "ai_chat_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_chat_user_time", "ai_chat_messages", ["user_id", "id"])


def downgrade() -> None:
    op.drop_index("ix_ai_chat_user_time", table_name="ai_chat_messages")
    op.drop_table("ai_chat_messages")
    op.drop_table("ai_settings")
    op.drop_column("users", "role")
