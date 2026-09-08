"""用户级 MCP 访问密钥表 mcp_api_keys（「我的」页面自助管理）

Revision ID: 008_mcp_api_keys
Revises: 007_ai_tool_calls
Create Date: 2026-09-08 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "008_mcp_api_keys"
down_revision: Union[str, None] = "007_ai_tool_calls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """防御式迁移：先检查再执行，兼容 create_all 已提前建表的环境"""
    insp = sa.inspect(op.get_bind())
    if "mcp_api_keys" not in insp.get_table_names():
        op.create_table(
            "mcp_api_keys",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("label", sa.String(50), nullable=False, server_default="默认密钥"),
            sa.Column("prefix", sa.String(12), nullable=False),
            sa.Column("key_encrypted", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_mcp_keys_prefix", "mcp_api_keys", ["prefix"])
        op.create_index("ix_mcp_keys_user_id", "mcp_api_keys", ["user_id"])


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "mcp_api_keys" in insp.get_table_names():
        op.drop_table("mcp_api_keys")
