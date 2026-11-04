"""Track the JWT signing-key version for refresh sessions.

Revision ID: b7c184d2f0a6
Revises: a9d4c21b7f01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c184d2f0a6"
down_revision: Union[str, None] = "a9d4c21b7f01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("sessions")}
    if "signing_key_version" not in columns:
        op.add_column("sessions", sa.Column("signing_key_version", sa.String(length=64), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("sessions")}
    if "signing_key_version" in columns:
        op.drop_column("sessions", "signing_key_version")
