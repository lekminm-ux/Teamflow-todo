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
    remark TEXT DEFAULT ''
);

-- เพิ่มดัชนีเพื่อช่วยให้การคิวรีข้อมูลตามสถานะและพนักงานเร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ตารางรายชื่อพนักงาน (Employees Table)
CREATE TABLE IF NOT EXISTS employees (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL
);
