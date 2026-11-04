"""Store the checksum of each verified redaction artifact.

Revision ID: e5b8f37a2c91
Revises: d9a1b38f4e72
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5b8f37a2c91"
down_revision: Union[str, None] = "d9a1b38f4e72"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column("redaction_jobs", sa.Column("result_sha256", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("redaction_jobs", "result_sha256")
