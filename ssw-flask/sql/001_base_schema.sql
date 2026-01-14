-- Base schema setup for the SQL Systems Workbench prototype.
-- The script follows the architecture defined in Phase 1 by establishing
-- system catalog tables in a dedicated schema and providing a demonstration
-- user schema with relational constraints and indexes.

BEGIN;

-- Ensure the system schema exists for catalog metadata managed by the app.
CREATE SCHEMA IF NOT EXISTS system;

-- Stores high-level table metadata for both system-managed and user-created tables.
CREATE TABLE IF NOT EXISTS system.system_tables (
    id              BIGSERIAL PRIMARY KEY,
    schema_name     TEXT NOT NULL,
    table_name      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    owner_role      TEXT NOT NULL,
    UNIQUE (schema_name, table_name)
);

-- Describes columns belonging to tables tracked in system_tables.
CREATE TABLE IF NOT EXISTS system.system_columns (
    id              BIGSERIAL PRIMARY KEY,
    table_id        BIGINT NOT NULL REFERENCES system.system_tables(id) ON DELETE CASCADE,
    column_name     TEXT NOT NULL,
    data_type       TEXT NOT NULL,
    is_nullable     BOOLEAN NOT NULL,
    default_expr    TEXT,
    ordinal_position INTEGER NOT NULL,
    UNIQUE (table_id, column_name)
);

-- Captures constraints such as primary keys and foreign keys.
CREATE TABLE IF NOT EXISTS system.system_constraints (
    id              BIGSERIAL PRIMARY KEY,
    table_id        BIGINT NOT NULL REFERENCES system.system_tables(id) ON DELETE CASCADE,
    constraint_type TEXT NOT NULL CHECK (constraint_type IN ('PRIMARY_KEY', 'UNIQUE', 'FOREIGN_KEY', 'CHECK')),
    definition_json JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Maintains index definitions for tracked tables.
CREATE TABLE IF NOT EXISTS system.system_indexes (
    id              BIGSERIAL PRIMARY KEY,
    table_id        BIGINT NOT NULL REFERENCES system.system_tables(id) ON DELETE CASCADE,
    index_name      TEXT NOT NULL,
    index_type      TEXT NOT NULL,
    columns         JSONB NOT NULL,
    uniqueness      BOOLEAN NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (table_id, index_name)
);

-- Role registry used by the application for basic authorization decisions.
CREATE TABLE IF NOT EXISTS system.system_roles (
    role_name       TEXT PRIMARY KEY,
    permissions_json JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only audit log capturing executed statements.
CREATE TABLE IF NOT EXISTS system.system_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    operation       TEXT NOT NULL,
    object_ref      TEXT,
    executed_sql    TEXT NOT NULL,
    params_json     JSONB,
    success         BOOLEAN NOT NULL,
    error_code      TEXT,
    duration_ms     NUMERIC(12, 3) NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_tables_schema_table ON system.system_tables (schema_name, table_name);
CREATE INDEX IF NOT EXISTS idx_system_columns_table ON system.system_columns (table_id);
CREATE INDEX IF NOT EXISTS idx_system_constraints_table ON system.system_constraints (table_id);
CREATE INDEX IF NOT EXISTS idx_system_indexes_table ON system.system_indexes (table_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_user_time ON system.system_audit_log (user_id, occurred_at DESC);

-- Demonstration user schema used by integration tests and sample data flows.
CREATE SCHEMA IF NOT EXISTS demo;

CREATE TABLE IF NOT EXISTS demo.accounts (
    account_id      BIGSERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO demo.accounts (email, display_name)
VALUES ('demo@example.com', 'Demo Account')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS demo.projects (
    project_id      BIGSERIAL PRIMARY KEY,
    account_id      BIGINT NOT NULL REFERENCES demo.accounts(account_id) ON DELETE CASCADE,
    project_name    TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, project_name)
);

CREATE TABLE IF NOT EXISTS demo.query_history (
    query_id        BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES demo.projects(project_id) ON DELETE CASCADE,
    sql_text        TEXT NOT NULL,
    execution_time_ms NUMERIC(12,3) NOT NULL,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supporting indexes for efficient lookup patterns showcased via the API.
CREATE INDEX IF NOT EXISTS idx_projects_account ON demo.projects (account_id);
CREATE INDEX IF NOT EXISTS idx_query_history_project_time ON demo.query_history (project_id, executed_at DESC);

COMMIT;
