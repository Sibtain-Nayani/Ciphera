"""Move legacy shared-default-organization records into isolated orgs.

Revision ID: a9d4c21b7f01
Revises: 18ebefc7a1a1
"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9d4c21b7f01"
down_revision: Union[str, None] = "18ebefc7a1a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_ORG_ID = "default-org"
UNASSIGNED_ORG_ID = "org_legacy_unassigned"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not {"users", "organizations", "organization_members", "documents"}.issubset(
        set(inspector.get_table_names())
    ):
        raise RuntimeError("The v3 identity/document schema is incomplete")

    legacy_org = bind.execute(
        sa.text("SELECT id FROM organizations WHERE id = :org_id"),
        {"org_id": LEGACY_ORG_ID},
    ).first()
    if not legacy_org:
        return

    member_ids = bind.execute(
        sa.text("SELECT user_id FROM organization_members WHERE org_id = :org_id"),
        {"org_id": LEGACY_ORG_ID},
    ).scalars().all()
    uploader_ids = bind.execute(
        sa.text(
            "SELECT DISTINCT uploaded_by FROM documents "
            "WHERE org_id = :org_id AND uploaded_by IS NOT NULL"
        ),
        {"org_id": LEGACY_ORG_ID},
    ).scalars().all()
    user_ids = sorted(set(member_ids) | set(uploader_ids))
    personal_org_by_user: dict[str, str] = {}

    for user_id in user_ids:
        user = bind.execute(
            sa.text("SELECT id, full_name FROM users WHERE id = :user_id"),
            {"user_id": user_id},
        ).mappings().first()
        if not user:
            continue

        personal_org_id = f"org_{user_id}"
        existing_org = bind.execute(
            sa.text("SELECT created_by FROM organizations WHERE id = :org_id"),
            {"org_id": personal_org_id},
        ).first()
        if existing_org and existing_org.created_by not in (None, user_id):
            raise RuntimeError(
                f"Cannot safely assign legacy records: {personal_org_id} belongs to another user"
            )
        if not existing_org:
            bind.execute(
                sa.text(
                    "INSERT INTO organizations (id, name, created_by, created_at) "
                    "VALUES (:id, :name, :created_by, :created_at)"
                ),
                {
                    "id": personal_org_id,
                    "name": f"{user['full_name'] or 'Personal'} Org",
                    "created_by": user_id,
                    "created_at": datetime.utcnow(),
                },
            )

        member_exists = bind.execute(
            sa.text(
                "SELECT 1 FROM organization_members "
                "WHERE org_id = :org_id AND user_id = :user_id"
            ),
            {"org_id": personal_org_id, "user_id": user_id},
        ).first()
        if not member_exists:
            bind.execute(
                sa.text(
                    "INSERT INTO organization_members (org_id, user_id, role, joined_at) "
                    "VALUES (:org_id, :user_id, :role, :joined_at)"
                ),
                {
                    "org_id": personal_org_id,
                    "user_id": user_id,
                    "role": "OWNER",
                    "joined_at": datetime.utcnow(),
                },
            )
        personal_org_by_user[user_id] = personal_org_id

    for user_id, personal_org_id in personal_org_by_user.items():
        bind.execute(
            sa.text(
                "UPDATE documents SET org_id = :personal_org_id "
                "WHERE org_id = :legacy_org_id AND uploaded_by = :user_id"
            ),
            {
                "personal_org_id": personal_org_id,
                "legacy_org_id": LEGACY_ORG_ID,
                "user_id": user_id,
            },
        )

    unassigned_docs = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM documents WHERE org_id = :org_id"
        ),
        {"org_id": LEGACY_ORG_ID},
    ).scalar_one()
    if unassigned_docs:
        quarantine = bind.execute(
            sa.text("SELECT id FROM organizations WHERE id = :org_id"),
            {"org_id": UNASSIGNED_ORG_ID},
        ).first()
        if not quarantine:
            bind.execute(
                sa.text(
                    "INSERT INTO organizations (id, name, created_by, created_at) "
                    "VALUES (:id, :name, NULL, :created_at)"
                ),
                {
                    "id": UNASSIGNED_ORG_ID,
                    "name": "Legacy Unassigned Documents (admin review)",
                    "created_at": datetime.utcnow(),
                },
            )
        bind.execute(
            sa.text("UPDATE documents SET org_id = :new_org WHERE org_id = :old_org"),
            {"new_org": UNASSIGNED_ORG_ID, "old_org": LEGACY_ORG_ID},
        )

    # No ordinary user retains membership in the shared tenant.
    bind.execute(
        sa.text("DELETE FROM organization_members WHERE org_id = :org_id"),
        {"org_id": LEGACY_ORG_ID},
    )
    bind.execute(
        sa.text("DELETE FROM organizations WHERE id = :org_id"),
        {"org_id": LEGACY_ORG_ID},
    )


def downgrade() -> None:
    raise RuntimeError(
        "This ownership migration is intentionally not reversible automatically. "
        "Restore a pre-migration backup and roll forward with a reviewed ownership map."
    )
