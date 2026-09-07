"""新增 task_groups 表（按用户隔离的任务分组），并从既有任务回收分组

Revision ID: 004_add_task_groups
Revises: 003_add_projects
Create Date: 2026-09-07 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004_add_task_groups"
down_revision: Union[str, None] = "003_add_projects"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PALETTE = ["#4D7CFE", "#FFD02E", "#00C16A", "#FF4D4D", "#A8A093"]


def upgrade() -> None:
    op.create_table(
        "task_groups",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(20), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#4D7CFE"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_task_group_user_name"),
    )
    op.create_index("ix_task_groups_user_sort", "task_groups", ["user_id", "sort_order"])
    # 把存量任务用过的分组名按用户回收进分组表
    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT DISTINCT user_id, "group" FROM tasks')).fetchall()
    for i, (user_id, name) in enumerate(rows):
        conn.execute(
            sa.text(
                "INSERT INTO task_groups (user_id, name, color, sort_order) "
                "VALUES (:u, :n, :c, :s)"
            ),
            {"u": user_id, "n": name, "c": PALETTE[i % len(PALETTE)], "s": i},
        )


def downgrade() -> None:
    op.drop_table("task_groups")
