import os
import uuid

import psycopg2
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url


POSTGRES_BASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://ciphera:ciphera_password@postgres:5432/ciphera_db",
)


@pytest.fixture
def migration_test_db():
    """Provide a fresh, uniquely named PostgreSQL database for each test."""
    database_name = f"ciphera_migration_check_{uuid.uuid4().hex[:12]}"
    test_url = make_url(POSTGRES_BASE_URL).set(database=database_name).render_as_string(hide_password=False)

    conn = psycopg2.connect(POSTGRES_BASE_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE "{database_name}";')
    finally:
        conn.close()

    try:
        yield test_url
    finally:
        conn = psycopg2.connect(POSTGRES_BASE_URL)
        conn.autocommit = True
        try:
            with conn.cursor() as cursor:
                cursor.execute(f'DROP DATABASE IF EXISTS "{database_name}";')
        finally:
            conn.close()


def _alembic_config(database_url: str) -> Config:
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", database_url)
    config.set_section_option("alembic", "sqlalchemy.url", database_url)
    return config


def test_fresh_database_migration_to_head(migration_test_db):
    """A fresh database includes the current source, policy, and artifact metadata."""
    command.upgrade(_alembic_config(migration_test_db), "head")

    engine = create_engine(migration_test_db)
    try:
        inspector = inspect(engine)
        document_columns = {column["name"] for column in inspector.get_columns("documents")}
        job_columns = {column["name"] for column in inspector.get_columns("redaction_jobs")}
    finally:
        engine.dispose()

    assert "source_sha256" in document_columns
    assert {
        "result_storage_key",
        "result_sha256",
        "policy_version",
        "policy_sha256",
        "source_storage_key",
        "source_sha256",
        "entities_snapshot",
        "entities_sha256",
    }.issubset(job_columns)


def test_checksum_migration_preserves_existing_job_data(migration_test_db):
    """Upgrading from the immutable-snapshot revision preserves legacy job rows."""
    config = _alembic_config(migration_test_db)
    command.upgrade(config, "d9a1b38f4e72")
    engine = create_engine(migration_test_db)

    with engine.begin() as connection:
        connection.execute(text("INSERT INTO organizations (id, name) VALUES ('org_prev', 'Legacy Org');"))
        connection.execute(text("INSERT INTO documents (id, org_id, filename) VALUES ('doc_prev', 'org_prev', 'legacy.pdf');"))
        connection.execute(
            text(
                "INSERT INTO redaction_jobs (id, document_id, status, error_message) "
                "VALUES ('job_prev', 'doc_prev', 'COMPLETED', '/legacy/path/redacted.pdf');"
            )
        )

    command.upgrade(config, "head")
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT id, status, error_message, result_storage_key, result_sha256 FROM redaction_jobs WHERE id='job_prev';")
        ).fetchone()
    engine.dispose()

    assert row is not None
    assert row[0] == "job_prev"
    assert row[1] == "COMPLETED"
    assert row[2] == "/legacy/path/redacted.pdf"
    assert row[3] is None
    assert row[4] is None  # Existing output bytes have no trusted checksum.


def test_checksum_migration_downgrade_and_reupgrade(migration_test_db):
    """The checksum-only migration can be rolled back and reapplied safely."""
    config = _alembic_config(migration_test_db)
    command.upgrade(config, "head")
    command.downgrade(config, "d9a1b38f4e72")

    engine = create_engine(migration_test_db)
    try:
        job_columns = {column["name"] for column in inspect(engine).get_columns("redaction_jobs")}
        assert "result_storage_key" in job_columns
        assert "result_sha256" not in job_columns
    finally:
        engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(migration_test_db)
    try:
        job_columns = {column["name"] for column in inspect(engine).get_columns("redaction_jobs")}
    finally:
        engine.dispose()
    assert "result_sha256" in job_columns


def test_forward_upgrade_from_pre_release_snapshot_revision(migration_test_db):
    """A forward-only upgrade from b276 applies current release metadata migrations."""
    config = _alembic_config(migration_test_db)
    command.upgrade(config, "b276a16e9310")

    engine = create_engine(migration_test_db)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO organizations (id, name) VALUES ('org_prev', 'Legacy Org');"))
        connection.execute(text("INSERT INTO documents (id, org_id, filename) VALUES ('doc_prev', 'org_prev', 'legacy.pdf');"))
        connection.execute(
            text("INSERT INTO redaction_jobs (id, document_id, status, error_message) VALUES ('job_prev', 'doc_prev', 'COMPLETED', 'legacy');")
        )

    command.upgrade(config, "head")
    inspector = inspect(engine)
    job_columns = {column["name"] for column in inspector.get_columns("redaction_jobs")}
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT id, status, error_message, result_storage_key, result_sha256 FROM redaction_jobs WHERE id='job_prev';")
        ).fetchone()
    engine.dispose()

    assert {"result_storage_key", "result_sha256", "entities_snapshot", "policy_sha256"}.issubset(job_columns)
    assert row is not None
    assert row[0] == "job_prev"
    assert row[1] == "COMPLETED"
    assert row[2] == "legacy"
    assert row[3] is None
    assert row[4] is None
