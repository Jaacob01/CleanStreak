"""打卡记录增加按次明细列 details（每次打卡独立的 value/tags/notes）

Revision ID: 006_entry_details
Revises: 005_add_ai
Create Date: 2026-09-08 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006_entry_details"
down_revision: Union[str, None] = "005_add_ai"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """防御式迁移：先检查再执行，兼容 create_all 已提前建列的环境"""
    insp = sa.inspect(op.get_bind())
    if "details" not in [c["name"] for c in insp.get_columns("habit_entries")]:
        op.add_column(
            "habit_entries",
            sa.Column("details", sa.JSON(), nullable=False, server_default="[]"),
        )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "details" in [c["name"] for c in insp.get_columns("habit_entries")]:
        op.drop_column("habit_entries", "details")
