"""ensure_result_storage_key_column

Revision ID: 18ebefc7a1a1
Revises: b276a16e9310
Create Date: 2026-10-10 06:44:24.975403

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '18ebefc7a1a1'
down_revision: Union[str, None] = 'b276a16e9310'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    columns = [c['name'] for c in insp.get_columns('redaction_jobs')]
    if 'result_storage_key' not in columns:
        op.add_column('redaction_jobs', sa.Column('result_storage_key', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    columns = [c['name'] for c in insp.get_columns('redaction_jobs')]
    if 'result_storage_key' in columns:
        op.drop_column('redaction_jobs', 'result_storage_key')
