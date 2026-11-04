"""Track refresh-token use for atomic rotation and replay detection.

Revision ID: c4f90a2e1d63
Revises: b7c184d2f0a6
"""
from datetime import datetime
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4f90a2e1d63"
down_revision: Union[str, None] = "b7c184d2f0a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refresh_tokens_session_id", "refresh_tokens", ["session_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)

    # Preserve sessions issued before this revision. The current hash is the
    # only live refresh credential available to backfill for each session.
    if "sessions" in sa.inspect(bind).get_table_names():
        sessions = sa.Table("sessions", sa.MetaData(), autoload_with=bind)
        rows = bind.execute(sa.select(
            sessions.c.id,
            sessions.c.refresh_token_hash,
            sessions.c.created_at,
            sessions.c.expires_at,
        )).mappings()
        token_table = sa.table(
            "refresh_tokens",
            sa.column("id", sa.String()),
            sa.column("session_id", sa.String()),
            sa.column("token_hash", sa.String(64)),
            sa.column("created_at", sa.DateTime()),
            sa.column("expires_at", sa.DateTime()),
            sa.column("consumed_at", sa.DateTime()),
        )
        for row in rows:
            bind.execute(token_table.insert().values(
                id=str(uuid.uuid4()),
                session_id=row["id"],
                token_hash=row["refresh_token_hash"],
                created_at=row["created_at"] or datetime.utcnow(),
                expires_at=row["expires_at"],
                consumed_at=None,
            ))


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_session_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
