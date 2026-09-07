"""新增 projects 表，并从既有任务回收项目名

Revision ID: 003_add_projects
Revises: 002_add_tasks
Create Date: 2026-09-07 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003_add_projects"
down_revision: Union[str, None] = "002_add_tasks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_project_user_name"),
    )
    op.create_index("ix_projects_user_sort", "projects", ["user_id", "sort_order"])
    # 把存量任务里用过的项目名回收进项目表，保证选择器里能选到
    op.execute(
        "INSERT INTO projects (user_id, name, sort_order) "
        "SELECT DISTINCT user_id, project, 0 FROM tasks WHERE project IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_table("projects")
