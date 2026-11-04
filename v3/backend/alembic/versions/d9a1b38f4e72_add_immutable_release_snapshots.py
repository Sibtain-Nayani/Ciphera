"""Add source, entity, and policy snapshots to verified redaction jobs.

Revision ID: d9a1b38f4e72
Revises: c4f90a2e1d63
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9a1b38f4e72"
down_revision: Union[str, None] = "c4f90a2e1d63"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_sha256", sa.String(length=64), nullable=True))
    op.add_column("redaction_jobs", sa.Column("policy_version", sa.String(), nullable=True))
    op.add_column("redaction_jobs", sa.Column("policy_sha256", sa.String(length=64), nullable=True))
    op.add_column("redaction_jobs", sa.Column("source_storage_key", sa.String(), nullable=True))
    op.add_column("redaction_jobs", sa.Column("source_sha256", sa.String(length=64), nullable=True))
    op.add_column("redaction_jobs", sa.Column("entities_snapshot", sa.JSON(), nullable=True))
    op.add_column("redaction_jobs", sa.Column("entities_sha256", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("redaction_jobs", "entities_sha256")
    op.drop_column("redaction_jobs", "entities_snapshot")
    op.drop_column("redaction_jobs", "source_sha256")
    op.drop_column("redaction_jobs", "source_storage_key")
    op.drop_column("redaction_jobs", "policy_sha256")
    op.drop_column("redaction_jobs", "policy_version")
    op.drop_column("documents", "source_sha256")
