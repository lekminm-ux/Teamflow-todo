-- DROP TABLE IF EXISTS tasks;

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    createdDate TEXT NOT NULL,
    deadline TEXT NOT NULL,
    assignee TEXT NOT NULL,
    budget REAL DEFAULT 0,
    status TEXT NOT NULL,
    correctiveAction TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    -- Additive ownership, audit and optimistic-locking columns.
    -- NULL ownership = legacy row, supervisor-only access.
    owner_user_issuer TEXT,
    owner_user_subject TEXT,
    created_by_issuer TEXT,
    created_by_subject TEXT,
    updated_by_issuer TEXT,
    updated_by_subject TEXT,
    row_version INTEGER NOT NULL DEFAULT 1
);

-- เพิ่มดัชนีเพื่อช่วยให้การคิวรีข้อมูลตามสถานะและพนักงานเร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_user_issuer, owner_user_subject);

-- ตารางรายชื่อพนักงาน (Employees Table)
CREATE TABLE IF NOT EXISTS employees (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by_issuer TEXT,
    created_by_subject TEXT
);

-- ตารางผู้ใช้แอปพลิเคชัน (app_users): identity key = stable issuer + subject
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
