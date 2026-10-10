import pytest
import psycopg2
import os
from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, inspect, text

POSTGRES_BASE_URL = os.getenv("TEST_DATABASE_URL", "postgresql://ciphera:ciphera_password@postgres:5432/ciphera_db")
TEST_DB_NAME = "ciphera_test_migration_verification"
TEST_DB_URL = f"postgresql://ciphera:ciphera_password@postgres:5432/{TEST_DB_NAME}"

@pytest.fixture(scope="module")
def migration_test_db():
    # Setup test DB
    conn = psycopg2.connect(POSTGRES_BASE_URL)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"DROP DATABASE IF EXISTS {TEST_DB_NAME};")
    cur.execute(f"CREATE DATABASE {TEST_DB_NAME};")
    cur.close()
    conn.close()

    yield TEST_DB_URL

    # Teardown
    conn = psycopg2.connect(POSTGRES_BASE_URL)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"DROP DATABASE IF EXISTS {TEST_DB_NAME};")
    cur.close()
    conn.close()

def test_fresh_database_migration_to_head(migration_test_db):
    """A brand new database running alembic upgrade head must contain result_storage_key."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", migration_test_db)
    cfg.set_section_option("alembic", "sqlalchemy.url", migration_test_db)
    
    # Run full migration chain to head (18ebefc7a1a1)
    command.upgrade(cfg, "head")
    
    engine = create_engine(migration_test_db)
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns("redaction_jobs")]
    engine.dispose()
    
    assert "result_storage_key" in cols, "result_storage_key column must exist in redaction_jobs table on fresh head migration"

def test_upgrade_from_previous_revision_preserves_existing_data(migration_test_db):
    """
    Test upgrading an existing database from b276a16e9310 to head:
    1. Downgrade to b276a16e9310
    2. Insert pre-existing document and redaction_job rows
    3. Upgrade to head
    4. Assert result_storage_key column exists, and previous data is undamaged.
    """
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", migration_test_db)
    cfg.set_section_option("alembic", "sqlalchemy.url", migration_test_db)
    
    # Step 1: Downgrade to b276a16e9310
    command.downgrade(cfg, "b276a16e9310")
    engine = create_engine(migration_test_db)
    insp = inspect(engine)
    cols_prev = [c["name"] for c in insp.get_columns("redaction_jobs")]
    assert "result_storage_key" not in cols_prev
    
    # Step 2: Insert existing rows into DB at pre-revision state
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO organizations (id, name) VALUES ('org_prev', 'Legacy Org');"))
        conn.execute(text("INSERT INTO documents (id, org_id, filename) VALUES ('doc_prev', 'org_prev', 'legacy.pdf');"))
        conn.execute(text("INSERT INTO redaction_jobs (id, document_id, status, error_message) VALUES ('job_prev', 'doc_prev', 'COMPLETED', '/legacy/path/redacted.pdf');"))
    
    # Step 3: Upgrade to head (18ebefc7a1a1)
    command.upgrade(cfg, "head")
    insp = inspect(engine)
    cols_head = [c["name"] for c in insp.get_columns("redaction_jobs")]
    assert "result_storage_key" in cols_head
    
    # Step 4: Verify existing job data integrity
    with engine.connect() as conn:
        row = conn.execute(text("SELECT id, status, error_message, result_storage_key FROM redaction_jobs WHERE id='job_prev';")).fetchone()
        assert row is not None
        assert row[0] == "job_prev"
        assert row[1] == "COMPLETED"
        assert row[2] == "/legacy/path/redacted.pdf"
        assert row[3] is None  # New column defaults to NULL for legacy rows
    
    engine.dispose()

def test_downgrade_and_reupgrade_cycle(migration_test_db):
    """Verify downgrade to b276a16e9310 drops result_storage_key safely and re-upgrade restores it."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", migration_test_db)
    cfg.set_section_option("alembic", "sqlalchemy.url", migration_test_db)
    
    # Downgrade back to b276a16e9310
    command.downgrade(cfg, "b276a16e9310")
    engine = create_engine(migration_test_db)
    insp = inspect(engine)
    assert "result_storage_key" not in [c["name"] for c in insp.get_columns("redaction_jobs")]
    
    # Re-upgrade to head
    command.upgrade(cfg, "head")
    insp = inspect(engine)
    assert "result_storage_key" in [c["name"] for c in insp.get_columns("redaction_jobs")]
    engine.dispose()

def test_reconciliation_when_b276a16e9310_was_already_applied_without_column(migration_test_db):
    """
    Simulate the exact historical trap: A database already recorded b276a16e9310 as applied
    when its upgrade() was empty (so the column is missing in production/dev).
    Running alembic upgrade head advances to 18ebefc7a1a1 and safely adds the missing column.
    """
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", migration_test_db)
    cfg.set_section_option("alembic", "sqlalchemy.url", migration_test_db)
    
    # 1. Downgrade to b276a16e9310
    command.downgrade(cfg, "b276a16e9310")
    engine = create_engine(migration_test_db)
    
    # Verify column is absent
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns("redaction_jobs")]
    assert "result_storage_key" not in cols
    
    # Verify version table is at b276a16e9310
    with engine.connect() as conn:
        ver = conn.execute(text("SELECT version_num FROM alembic_version;")).scalar()
        assert ver == "b276a16e9310"
        
    # 2. Upgrade to head -> advances to 18ebefc7a1a1
    command.upgrade(cfg, "head")
    
    # 3. Column is now present!
    insp = inspect(engine)
    cols_after = [c["name"] for c in insp.get_columns("redaction_jobs")]
    assert "result_storage_key" in cols_after, "Forward reconciliation migration must create missing column"
    engine.dispose()
