-- ==========================================================================
-- APP07 ADDITIVE D1 MIGRATION 0001: authentication + task ownership
-- Additive only: existing tables and rows are untouched. Legacy tasks with
-- NULL ownership remain supervisor-only.
-- No real domain, audience, identifier, email, subject or credential data
-- is included here.
-- ==========================================================================

-- Registered application users, keyed by stable issuer + subject.
CREATE TABLE IF NOT EXISTS app_users (
    issuer         TEXT NOT NULL,
    subject        TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'supervisor')),
    employee_code  TEXT,
    display_name   TEXT,
    is_active      INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_app_users_employee_code ON app_users(employee_code);

-- Task ownership: nullable for additive rollout. Audit subjects record who
-- created / last modified each row.
ALTER TABLE tasks ADD COLUMN owner_user_issuer  TEXT;
ALTER TABLE tasks ADD COLUMN owner_user_subject TEXT;
ALTER TABLE tasks ADD COLUMN created_by_issuer  TEXT;
ALTER TABLE tasks ADD COLUMN created_by_subject TEXT;
ALTER TABLE tasks ADD COLUMN updated_by_issuer  TEXT;
ALTER TABLE tasks ADD COLUMN updated_by_subject TEXT;
ALTER TABLE tasks ADD COLUMN row_version        INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_user_issuer, owner_user_subject);

-- Employee audit subject columns (additive).
ALTER TABLE employees ADD COLUMN created_by_issuer  TEXT;
ALTER TABLE employees ADD COLUMN created_by_subject TEXT;
