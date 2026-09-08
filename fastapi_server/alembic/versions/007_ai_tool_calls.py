"""AI 工具调用审计表 ai_tool_calls（App 聊天与 MCP 共用）

Revision ID: 007_ai_tool_calls
Revises: 006_entry_details
Create Date: 2026-09-08 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "007_ai_tool_calls"
down_revision: Union[str, None] = "006_entry_details"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """防御式迁移：先检查再执行，兼容 create_all 已提前建表的环境"""
    insp = sa.inspect(op.get_bind())
    if "ai_tool_calls" not in insp.get_table_names():
        op.create_table(
            "ai_tool_calls",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("tool", sa.String(64), nullable=False),
            sa.Column("arguments", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("result", sa.String(), nullable=True),
            sa.Column("ok", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("source", sa.String(10), nullable=False, server_default="chat"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_ai_tool_user_time", "ai_tool_calls", ["user_id", "id"])


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "ai_tool_calls" in insp.get_table_names():
        op.drop_table("ai_tool_calls")
