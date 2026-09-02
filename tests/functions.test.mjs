/* ==========================================================================
   APP07 - FUNCTION UNIT TESTS (updated for auth + supervisor assignment)
   Run: node --test tests/functions.test.mjs
   C1 fix: modules are imported through REAL file URLs resolved from
   import.meta.url so their relative imports ("../_lib/authorization.js")
   resolve from disk instead of a data: URL that breaks relative specifiers.
   ========================================================================== */

import assert from "node:assert/strict";
function moduleUrl(relativePath) {
    return new URL(relativePath, import.meta.url);
}

const tasksApi = await import(moduleUrl("../functions/api/tasks.js").href);
const employeesApi = await import(moduleUrl("../functions/api/employees.js").href);

function jsonRequest(body, url = "https://teamflow.test/api/tasks") {
    return new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

function createMockDb() {
    const calls = [];

    return {
        calls,
        prepare(sql) {
            const statement = {
                values: [],
                // bind() only records values; execution methods log exactly
                // once so bound statements are never double-logged and an
                // unbound SELECT executed via all() is still logged.
                bind(...values) {
                    statement.values = values;
                    return statement;
                },
                async all() {
                    calls.push({ sql, values: statement.values });
                    return { results: [] };
                },
                async first() {
                    calls.push({ sql, values: statement.values });
                    return null;
                },
                async run() {
                    calls.push({ sql, values: statement.values });
                    return { success: true };
                }
            };
            return statement;
        }
    };
}

async function readJson(response) {
    return JSON.parse(await response.text());
}

const ISS = "https://test-team.example.com";
const memberUser = {
    role: "member",
    employee_code: "EMP001",
    display_name: "Demo User 01",
    issuer: ISS,
    subject: "sub-1"
};
const supervisorUser = {
    role: "supervisor",
    employee_code: null,
    display_name: "Supervisor",
    issuer: ISS,
    subject: "sup-sub"
};

{
    const response = await tasksApi.onRequestPost({
        env: { DB: createMockDb() },
        data: { user: memberUser },
        request: jsonRequest({ name: "Missing fields" })
    });

    assert.equal(response.status, 400);
    assert.match((await readJson(response)).error, /bad_request/);
}

{
    const response = await tasksApi.onRequestPost({
        env: { DB: createMockDb() },
        data: { user: memberUser },
        request: jsonRequest({
            id: "task_test",
            name: "Bad budget",
            createdDate: "2026-07-07",
            deadline: "2026-07-08",
            assignee: "EMP001",
            budget: -1,
            status: "Todo"
        })
    });

    assert.equal(response.status, 400);
    assert.match((await readJson(response)).message, /Budget/);
}

{
    const db = createMockDb();
    const response = await tasksApi.onRequestPost({
        env: { DB: db },
        data: { user: memberUser },
        request: jsonRequest({
            id: "task_test",
            name: "Valid task",
            description: "<script>alert(1)</script>",
            createdDate: "2026-07-07",
            deadline: "2026-07-08",
            assignee: "EMP001",
            budget: 100,
            status: "Todo"
        })
    });

    assert.equal(response.status, 200);
    assert.equal((await readJson(response)).success, true);
    assert.equal(db.calls.some(call => call.sql.includes("INSERT INTO tasks")), true);
    // Ownership is derived server-side from the session user (member = self).
    const insert = db.calls.find(call => call.sql.includes("INSERT INTO tasks"));
    assert.equal(insert.values[10], ISS);
    assert.equal(insert.values[11], "sub-1");
    // Canonical assignee value: the employee_code is stored verbatim.
    assert.equal(insert.values[5], "EMP001");
}

// UI-style member assignment: the client sends employee_code (canonical H1).
{
    const db = createMockDb();
    const response = await tasksApi.onRequestPost({
        env: { DB: db },
        data: { user: memberUser },
        request: jsonRequest({
            id: "task_ui",
            name: "UI-style assignment",
            createdDate: "2026-07-07",
            deadline: "2026-07-08",
            assignee: "EMP001", // value now sourced from option value = employee_code
            budget: 0,
            status: "Todo"
        })
    });

    assert.equal(response.status, 200);
    const insert = db.calls.find(call => call.sql.includes("INSERT INTO tasks"));
    assert.equal(insert.values[5], "EMP001");
}

// Member foreign assignment remains forbidden.
{
    const response = await tasksApi.onRequestPost({
        env: { DB: createMockDb() },
        data: { user: memberUser },
        request: jsonRequest({
            id: "task_foreign",
            name: "Foreign",
            createdDate: "2026-07-07",
            deadline: "2026-07-08",
            assignee: "EMP002",
            budget: 0,
            status: "Todo"
        })
    });

    assert.equal(response.status, 403);
}

// Supervisor assignment: the selected ACTIVE app_user becomes task owner.
{
    const db = createMockDb();
    const ownerRow = { issuer: ISS, subject: "emp-emp002-sub" };
    db.prepare = (sql => {
        const statement = {
            bind(...values) {
                statement.values = values;
                db.calls.push({ sql, values });
                return statement;
            },
            async all() {
                if (/FROM app_users/i.test(sql)) {
                    return {
                        results: [{
                            ...ownerRow,
                            employee_code: "EMP002",
                            role: "member",
                            display_name: "Demo User 02",
                            is_active: 1,
                            created_at: "2026-09-02T00:00:00Z"
                        }]
                    };
                }
                return { results: [] };
            },
            async first() {
                if (/FROM app_users/i.test(sql)) {
                    return statement.values[0] === "EMP002" ? ownerRow : null;
                }
                return null;
            },
            async run() {
                db.calls.push({ sql, values: statement.values || [] });
                return { success: true };
            }
        };
        return statement;
    });

    const response = await tasksApi.onRequestPost({
        env: { DB: db },
        data: { user: supervisorUser },
        request: jsonRequest({
            id: "task_sup",
            name: "Supervisor assigned",
            createdDate: "2026-07-07",
            deadline: "2026-07-08",
            assignee: "EMP002",
            budget: 50,
            status: "Todo"
        })
    });

    assert.equal(response.status, 200);
    const insert = db.calls.find(call => call.sql.includes("INSERT INTO tasks"));
    // Owner = resolved active app_user of the assignee, NOT the supervisor.
    assert.equal(insert.values[10], ISS);
    assert.equal(insert.values[11], "emp-emp002-sub");
    assert.equal(insert.values[12], supervisorUser.issuer); // created_by supervisor
    assert.equal(insert.values[13], supervisorUser.subject);
}

// Supervisor assignment of an unprovisioned employee is rejected.
{
    const db = createMockDb(); // app_users lookups always miss
    const response = await tasksApi.onRequestPost({
        env: { DB: db },
        data: { user: supervisorUser },
        request: jsonRequest({
            id: "task_ghost",
            name: "Unprovisioned",
            createdDate: "2026-07-07",
            deadline: "2026-07-08",
            assignee: "EMP999",
            budget: 0,
            status: "Todo"
        })
    });

    assert.equal(response.status, 400);
    assert.match((await readJson(response)).error, /unprovisioned_assignee/);
    assert.equal(db.calls.some(call => call.sql.includes("INSERT INTO tasks")), false);
}

{
    const response = await employeesApi.onRequestPost({
        env: { DB: createMockDb() },
        data: { user: memberUser },
        request: jsonRequest({ code: "EMP099", name: "Rogue Member" })
    });

    // Employees are supervisor-only now.
    assert.equal(response.status, 403);
}

{
    const db = createMockDb();
    const response = await employeesApi.onRequestPost({
        env: { DB: db },
        data: { user: supervisorUser },
        request: jsonRequest({ code: "emp015", name: "New Member" })
    });

    assert.equal(response.status, 200);
    assert.equal((await readJson(response)).success, true);
    assert.equal(db.calls.some(call => call.sql.includes("INSERT INTO employees")), true);
}

{
    const db = createMockDb();
    const response = await employeesApi.onRequestGet({
        env: { DB: db },
        data: { user: memberUser }
    });

    assert.equal(response.status, 200);
    // No write-on-GET: no DDL or seeding statements may run.
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /^SELECT/);
}

console.log("Function unit tests passed");
