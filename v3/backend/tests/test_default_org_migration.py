import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "a9d4c21b7f01_isolate_legacy_default_org.py"
)
SPEC = importlib.util.spec_from_file_location("legacy_org_migration", MIGRATION_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_upgrade_splits_legacy_documents_and_quarantines_unassigned_rows():
    engine = sa.create_engine("sqlite:///:memory:")
    metadata = sa.MetaData()
    users = sa.Table(
        "users",
        metadata,
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("full_name", sa.String),
    )
    organizations = sa.Table(
        "organizations",
        metadata,
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("name", sa.String),
        sa.Column("created_by", sa.String),
        sa.Column("created_at", sa.DateTime),
    )
    memberships = sa.Table(
        "organization_members",
        metadata,
        sa.Column("org_id", sa.String, primary_key=True),
        sa.Column("user_id", sa.String, primary_key=True),
        sa.Column("role", sa.String),
        sa.Column("joined_at", sa.DateTime),
    )
    documents = sa.Table(
        "documents",
        metadata,
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("org_id", sa.String),
        sa.Column("uploaded_by", sa.String),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            users.insert(),
            [
                {"id": "alice", "full_name": "Alice"},
                {"id": "bob", "full_name": "Bob"},
            ],
        )
        connection.execute(
            organizations.insert(),
            [{"id": "default-org", "name": "Default Organization"}],
        )
        connection.execute(
            memberships.insert(),
            [
                {"org_id": "default-org", "user_id": "alice", "role": "MEMBER"},
                {"org_id": "default-org", "user_id": "bob", "role": "MEMBER"},
            ],
        )
        connection.execute(
            documents.insert(),
            [
                {"id": "alice-doc", "org_id": "default-org", "uploaded_by": "alice"},
                {"id": "bob-doc", "org_id": "default-org", "uploaded_by": "bob"},
                {"id": "unassigned-doc", "org_id": "default-org", "uploaded_by": None},
            ],
        )

        context = MigrationContext.configure(connection)
        with Operations.context(context):
            MIGRATION.upgrade()

        assert connection.execute(
            sa.select(documents.c.id, documents.c.org_id).order_by(documents.c.id)
        ).all() == [
            ("alice-doc", "org_alice"),
            ("bob-doc", "org_bob"),
            ("unassigned-doc", "org_legacy_unassigned"),
        ]
        assert connection.execute(
            sa.select(memberships.c.org_id, memberships.c.user_id, memberships.c.role)
            .order_by(memberships.c.user_id)
        ).all() == [
            ("org_alice", "alice", "OWNER"),
            ("org_bob", "bob", "OWNER"),
        ]
        assert connection.execute(
            sa.select(organizations.c.id).where(organizations.c.id == "default-org")
        ).first() is None
