/* ==========================================================================
   APP07 - AUTH & OWNERSHIP TEST SUITE (node:test style, no framework deps)
   Run: node --test tests/auth-ownership.test.mjs
   Covers: missing / invalid / expired / wrong-audience JWT (REAL RS256
   signatures via WebCrypto), unregistered and inactive users, session
   redaction, own vs other task CRUD, immutable ownership, stale row_version,
   supervisor employees, no write on GET, legacy NULL-owner rows, production
   fallback removal, negative budget, supervisor assignment ownership and
   reassignment ownership transfer.
   C1 fix: modules are imported through REAL file URLs so their relative
   imports ("../_lib/authorization.js") resolve from disk.
   ========================================================================== */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function moduleUrl(relativePath) {
    return new URL(relativePath, import.meta.url);
}

const MODULES = {
    tasks: await import(moduleUrl("../functions/api/tasks.js").href),
    employees: await import(moduleUrl("../functions/api/employees.js").href),
    session: await import(moduleUrl("../functions/api/session.js").href),
    authorization: await import(moduleUrl("../functions/_lib/authorization.js").href),
    middleware: await import(moduleUrl("../functions/_middleware.js").href)
};

const { verifyAccessToken, AuthError, resolveActiveUser } = MODULES.authorization;

// ==========================================================================
// REAL RS256 KEY FIXTURE (C1 fix)
// A genuine RSA keypair is generated at runtime; tokens are genuinely signed
// with the private key and verified against the public JWK, exactly like the
// production Cloudflare Access path. No fake/truncated modulus, no signature
// bypass.
// ==========================================================================

const { privateKey, jwk } = await (async () => {
    const pair = await crypto.subtle.generateKey(
        { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["sign", "verify"]
    );
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    return { privateKey: pair.privateKey, jwk: { ...publicJwk, kid: "test-kid", alg: "RS256", use: "sig" } };
})();

function b64urlFromBytes(bytes) {
    return Buffer.from(bytes).toString("base64url");
}

async function signJwt(header, payload) {
    const signingInput =
        `${b64urlFromBytes(new TextEncoder().encode(JSON.stringify(header)))}.` +
        `${b64urlFromBytes(new TextEncoder().encode(JSON.stringify(payload)))}`;
    const signature = await crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        privateKey,
        new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${b64urlFromBytes(new Uint8Array(signature))}`;
}

// Only used to construct deliberately-broken tokens (bad signature segment).
function makeBrokenJwt(header, payload, signature = "bm90LXNpZw") {
    return (
        `${b64urlFromBytes(new TextEncoder().encode(JSON.stringify(header)))}.` +
        `${b64urlFromBytes(new TextEncoder().encode(JSON.stringify(payload)))}.${signature}`
    );
}

const VALID_HEADER = { alg: "RS256", kid: "test-kid", typ: "JWT" };
const NOW = Math.floor(Date.now() / 1000);

const CONFIG_ENV = {
    ACCESS_TEAM_DOMAIN: "test-team.example.com",
    ACCESS_AUDIENCE: "test-audience",
    ACCESS_CERTS_JSON: JSON.stringify({ keys: [jwk] })
};

const TEST_ENV = { ...CONFIG_ENV, DB: null };

function stubFetch() {
    return async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
}

const validClaims = { iss: "https://test-team.example.com", aud: "test-audience", exp: NOW + 600 };

// --- Minimal fake D1 for handler-level tests -------------------------------

function createFakeDb() {
    const tables = { tasks: [], employees: [], app_users: [] };
    const log = [];

    function matchWhere(row, where, values) {
        if (!where) return true;
        // Small SQL fixture: "col = ?" chains ANDed with literal conditions
        // such as "is_active = 1". Literal equality is enforced numerically/
        // textually; unknown condition shapes fail CLOSED (no silent true).
        const conds = where.replace(/^WHERE\s+/i, "").split(/\s+AND\s+/i);
        let valueIndex = 0;
        return conds.every((rawCond) => {
            const cond = rawCond.trim();
            const placeholder = cond.match(/^(\w+)\s*=\s*\?$/);
            if (placeholder) {
                const value = values[valueIndex++];
                return String(row[placeholder[1]]) === String(value);
            }
            const literal = cond.match(/^(\w+)\s*=\s*('?[A-Za-z0-9_.-]*'?)$/);
            if (literal) {
                const expected = literal[2].replace(/^'|'$/g, "");
                return String(row[literal[1]]) === String(expected);
            }
            return false; // unrecognized condition shape -> row does not match
        });
    }

    function extractTable(sql) {
        const m = sql.match(/\b(?:FROM|INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i);
        return m ? m[1] : null;
    }

    function statementFor(sql) {
        const stmt = {
            bind(...values) {
                stmt.values = values;
                return stmt;
            },
            async all() {
                const table = tables[extractTable(sql)] || [];
                const where = /WHERE/i.test(sql) ? sql.split(/WHERE/i)[1].replace(/ORDER BY.*$/i, "") : null;
                return { results: table.filter((row) => matchWhere(row, where, stmt.values)) };
            },
            async first() {
                const { results } = await stmt.all();
                return results[0] || null;
            },
            async run() {
                log.push({ sql: sql.trim(), values: stmt.values || [] });
                const table = tables[extractTable(sql)];
                if (!table) return { success: true };
                if (/^INSERT/i.test(sql)) {
                    const cols = sql.match(/\(([^)]+)\)/)[1].split(",").map((c) => c.trim());
                    const placeholders = (sql.match(/\?/g) || []).length;
                    const row = {};
                    cols.forEach((c, i) => { row[c] = stmt.values[i]; });
                    for (let i = cols.length; i < placeholders; i++) {
                        row[`col${i}`] = stmt.values[i];
                    }
                    if (row.row_version === undefined) row.row_version = 1;
                    table.push(row);
                } else if (/^DELETE/i.test(sql)) {
                    const where = /WHERE/i.test(sql) ? sql.split(/WHERE/i)[1] : null;
                    const idx = table.findIndex((row) => matchWhere(row, where, stmt.values));
                    if (idx !== -1) table.splice(idx, 1);
                } else if (/^UPDATE/i.test(sql)) {
                    const setPart = sql.split(/SET/i)[1].split(/WHERE/i)[0];
                    const assignments = setPart.split(",").map((s) => s.trim()).filter(Boolean);
                    const where = sql.split(/WHERE/i)[1];
                    table.filter((row) => matchWhere(row, where, stmt.values.slice(assignments.length)))
                        .forEach((row) => {
                            assignments.forEach((a, i) => {
                                const m = a.match(/(\w+)\s*=\s*\?/);
                                if (m) row[m[1]] = stmt.values[i];
                            });
                        });
                }
                return { success: true };
            }
        };
        return stmt;
    }

    return {
        prepare(sql) { return statementFor(sql); },
        _tables: tables,
        _log: log
    };
}

// ==========================================================================
// JWT VALIDATION (real RS256 signatures)
// ==========================================================================

test("missing token is rejected", async () => {
    await assert.rejects(
        () => verifyAccessToken(null, TEST_ENV, stubFetch()),
        (err) => err instanceof AuthError && err.code === "missing_token"
    );
});

test("malformed token is rejected", async () => {
    await assert.rejects(
        () => verifyAccessToken("not-a-jwt", TEST_ENV, stubFetch()),
        (err) => err.code === "invalid_token"
    );
});

test("unsupported algorithm is rejected", async () => {
    const token = makeBrokenJwt({ ...VALID_HEADER, alg: "HS256" }, {});
    await assert.rejects(
        () => verifyAccessToken(token, TEST_ENV, stubFetch()),
        (err) => err.code === "invalid_token"
    );
});

test("genuinely signed RS256 token verifies", async () => {
    const token = await signJwt(VALID_HEADER, validClaims);
    const payload = await verifyAccessToken(token, TEST_ENV, stubFetch());
    assert.equal(payload.iss, "https://test-team.example.com");
    assert.equal(payload.aud, "test-audience");
});

test("tampered payload of a signed token is rejected (invalid_signature)", async () => {
    const token = await signJwt(VALID_HEADER, validClaims);
    const parts = token.split(".");
    const tamperedPayload = b64urlFromBytes(new TextEncoder().encode(
        JSON.stringify({ ...validClaims, iss: "https://evil.example.com" })
    ));
    await assert.rejects(
        () => verifyAccessToken(`${parts[0]}.${tamperedPayload}.${parts[2]}`, TEST_ENV, stubFetch()),
        (err) => err.code === "invalid_signature"
    );
});

test("genuinely signed token with wrong key kid is rejected (unknown_kid)", async () => {
    const token = await signJwt({ ...VALID_HEADER, kid: "rogue-kid" }, validClaims);
    await assert.rejects(
        () => verifyAccessToken(token, TEST_ENV, stubFetch()),
        (err) => err.code === "unknown_kid"
    );
});

test("garbage signature segment is rejected", async () => {
    const token = makeBrokenJwt(VALID_HEADER, validClaims, "bm90LXNpZw");
    await assert.rejects(
        () => verifyAccessToken(token, TEST_ENV, stubFetch()),
        (err) => err.code === "invalid_signature"
    );
});

test("expired signed token is rejected", async () => {
    const token = await signJwt(VALID_HEADER, { ...validClaims, exp: NOW - 10 });
    await assert.rejects(
        () => verifyAccessToken(token, TEST_ENV, stubFetch()),
        (err) => err.code === "expired_token"
    );
});

test("signed token with wrong issuer is rejected", async () => {
    const token = await signJwt(VALID_HEADER, { ...validClaims, iss: "https://evil.example.com" });
    await assert.rejects(
        () => verifyAccessToken(token, TEST_ENV, stubFetch()),
        (err) => err.code === "invalid_issuer"
    );
});

test("signed token with wrong audience is rejected", async () => {
    const token = await signJwt(VALID_HEADER, { ...validClaims, aud: "other-audience" });
    await assert.rejects(
        () => verifyAccessToken(token, TEST_ENV, stubFetch()),
        (err) => err.code === "invalid_audience"
    );
});

test("missing runtime configuration fails closed", async () => {
    const env = { ACCESS_TEAM_DOMAIN: "REPLACE_WITH_ACCESS_TEAM_DOMAIN", ACCESS_AUDIENCE: "x" };
    const token = await signJwt(VALID_HEADER, validClaims);
    await assert.rejects(
        () => verifyAccessToken(token, env, stubFetch()),
        (err) => err.code === "config_missing"
    );
});

// ==========================================================================
// IDENTITY RESOLUTION (default deny)
// ==========================================================================

function dbWithUsers(users) {
    const db = createFakeDb();
    db._tables.app_users = users;
    return db;
}

test("unregistered identity is denied", async () => {
    const db = dbWithUsers([]);
    const user = await resolveActiveUser(db, "https://test-team.example.com", "unknown-sub");
    assert.equal(user, null);
});

test("inactive user is denied", async () => {
    const db = dbWithUsers([
        { issuer: "https://test-team.example.com", subject: "sub-1", role: "member", employee_code: "EMP001", display_name: "Demo User 01", is_active: 0 }
    ]);
    const user = await resolveActiveUser(db, "https://test-team.example.com", "sub-1");
    assert.equal(user, null);
});

test("active user resolves with minimal fields", async () => {
    const db = dbWithUsers([
        { issuer: "https://test-team.example.com", subject: "sub-1", role: "member", employee_code: "EMP001", display_name: "Demo User 01", is_active: 1 }
    ]);
    const user = await resolveActiveUser(db, "https://test-team.example.com", "sub-1");
    assert.equal(user.role, "member");
    assert.equal(user.employee_code, "EMP001");
    assert.equal(user.display_name, "Demo User 01");
    assert.equal(Object.prototype.hasOwnProperty.call(user, "email"), false);
});

// ==========================================================================
// SESSION ENDPOINT REDACTION
// ==========================================================================

test("session returns only role, employee and display state", async () => {
    const response = await MODULES.session.onRequestGet({
        data: {
            user: { role: "member", employee_code: "EMP001", display_name: "Demo User 01", issuer: "iss", subject: "sub" }
        }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["authenticated", "display_name", "employee_code", "role"]);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "email"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "subject"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "issuer"), false);
});

test("session without authenticated user is 401", async () => {
    const response = await MODULES.session.onRequestGet({ data: {} });
    assert.equal(response.status, 401);
});

// ==========================================================================
// MIDDLEWARE DEFAULT DENY
// ==========================================================================

function middlewareContext(token) {
    return {
        request: new Request("https://teamflow.test/api/tasks", {
            method: "GET",
            headers: token ? { "Cf-Access-Jwt-Assertion": token } : {}
        }),
        env: { ...CONFIG_ENV, DB: dbWithUsers([
            { issuer: "https://test-team.example.com", subject: "sub-1", role: "member", employee_code: "EMP001", display_name: "Demo User 01", is_active: 1 }
        ]) },
        data: {},
        next: async () => new Response("ok")
    };
}

test("middleware rejects request without token", async () => {
    const response = await MODULES.middleware.onRequest(middlewareContext(null));
    assert.equal(response.status, 401);
});

test("middleware rejects request with expired token", async () => {
    const token = await signJwt(VALID_HEADER, { ...validClaims, exp: NOW - 10 });
    const response = await MODULES.middleware.onRequest(middlewareContext(token));
    assert.equal(response.status, 401);
});

test("middleware rejects inactive app user (verified identity, no row)", async () => {
    const token = await signJwt(VALID_HEADER, { ...validClaims, sub: "not-registered" });
    const response = await MODULES.middleware.onRequest(middlewareContext(token));
    assert.equal(response.status, 403);
});

// ==========================================================================
// TASK OWNERSHIP CRUD
// ==========================================================================

const ISS = "https://test-team.example.com";

async function readJson(response) {
    return JSON.parse(await response.text());
}

function tasksContext(method, { user, body, url, db }) {
    return {
        request: new Request(url || "https://teamflow.test/api/tasks", {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined
        }),
        env: { DB: db },
        data: { user }
    };
}

function memberUser(sub = "sub-1", code = "EMP001") {
    return { role: "member", employee_code: code, display_name: "Demo User 01", issuer: ISS, subject: sub };
}

function supervisorUser() {
    return { role: "supervisor", employee_code: null, display_name: "Supervisor", issuer: ISS, subject: "sup-sub" };
}

function dbWithTasks(rows) {
    const db = createFakeDb();
    db._tables.tasks = rows.map((r) => ({ row_version: 1, ...r }));
    return db;
}

// Supervisor fixture DB: tasks table works normally; app_users resolves
// EMP002 -> active user, EMP003 -> inactive (unprovisioned for assignment).
function dbForSupervisor(tasksRows = []) {
    const db = dbWithTasks(tasksRows);
    db._tables.app_users = [
        { issuer: ISS, subject: "emp002-sub", role: "member", employee_code: "EMP002", display_name: "Demo User 02", is_active: 1 },
        { issuer: ISS, subject: "emp003-sub", role: "member", employee_code: "EMP003", display_name: "Demo User 03", is_active: 0 }
    ];
    return db;
}

const MEMBER_TASK = {
    id: "task_1",
    name: "Member task",
    description: "",
    createdDate: "2026-08-01",
    deadline: "2026-08-10",
    assignee: "EMP001",
    budget: 100,
    status: "Todo",
    correctiveAction: "",
    remark: "",
    owner_user_issuer: ISS,
    owner_user_subject: "sub-1",
    created_by_issuer: ISS,
    created_by_subject: "sub-1"
};

const OTHER_TASK = { ...MEMBER_TASK, id: "task_2", owner_user_subject: "sub-2" };
const LEGACY_TASK = { ...MEMBER_TASK, id: "task_3", owner_user_issuer: null, owner_user_subject: null };

test("member lists only own tasks", async () => {
    const db = dbWithTasks([MEMBER_TASK, OTHER_TASK, LEGACY_TASK]);
    const response = await MODULES.tasks.onRequestGet(tasksContext("GET", { user: memberUser(), db }));
    const body = await response.json();
    assert.deepEqual(body.map((t) => t.id), ["task_1"]);
});

test("supervisor lists all tasks including legacy rows", async () => {
    const db = dbWithTasks([MEMBER_TASK, OTHER_TASK, LEGACY_TASK]);
    const response = await MODULES.tasks.onRequestGet(tasksContext("GET", { user: supervisorUser(), db }));
    const body = await response.json();
    assert.equal(body.length, 3);
});

test("member creates own task", async () => {
    const db = createFakeDb();
    const response = await MODULES.tasks.onRequestPost(tasksContext("POST", {
        user: memberUser(),
        db,
        body: { id: "task_new", name: "New", createdDate: "2026-08-01", deadline: "2026-08-09", status: "Todo", assignee: "EMP001", budget: 5 }
    }));
    assert.equal(response.status, 200);
    assert.equal(db._tables.tasks.length, 1);
    assert.equal(db._tables.tasks[0].owner_user_subject, "sub-1");
    assert.equal(db._tables.tasks[0].row_version, 1);
});

test("member cannot assign task to another employee", async () => {
    const db = createFakeDb();
    const response = await MODULES.tasks.onRequestPost(tasksContext("POST", {
        user: memberUser(),
        db,
        body: { id: "task_new", name: "New", createdDate: "2026-08-01", deadline: "2026-08-09", status: "Todo", assignee: "EMP002", budget: 5 }
    }));
    assert.equal(response.status, 403);
    assert.equal(db._tables.tasks.length, 0);
});

// UI-style assignment (H1): the client sends the employee_code that comes
// from the dropdown option values; the API stores it as the canonical assignee.
test("UI-style assignment uses employee_code as canonical assignee", async () => {
    const db = createFakeDb();
    const response = await MODULES.tasks.onRequestPost(tasksContext("POST", {
        user: memberUser(),
        db,
        body: { id: "task_ui", name: "UI assignment", createdDate: "2026-08-01", deadline: "2026-08-09", status: "Todo", assignee: "EMP001", budget: 5 }
    }));
    assert.equal(response.status, 200);
    assert.equal(db._tables.tasks[0].assignee, "EMP001");
    assert.equal(db._tables.tasks[0].owner_user_subject, "sub-1");
});

// Supervisor assignment (H1/M1): resolve selected ACTIVE app_user -> owner.
test("supervisor assignment makes the assigned active app_user the task owner", async () => {
    const db = dbForSupervisor();
    const response = await MODULES.tasks.onRequestPost(tasksContext("POST", {
        user: supervisorUser(),
        db,
        body: { id: "task_sup", name: "Assigned by supervisor", createdDate: "2026-08-01", deadline: "2026-08-09", status: "Todo", assignee: "EMP002", budget: 5 }
    }));
    assert.equal(response.status, 200);
    const row = db._tables.tasks[0];
    assert.equal(row.assignee, "EMP002");
    assert.equal(row.owner_user_issuer, ISS);
    assert.equal(row.owner_user_subject, "emp002-sub"); // assignee owns the task
    assert.equal(row.created_by_subject, "sup-sub");    // audit: who created it
});

test("supervisor assignment of unprovisioned employee is rejected", async () => {
    const db = dbForSupervisor();
    const response = await MODULES.tasks.onRequestPost(tasksContext("POST", {
        user: supervisorUser(),
        db,
        body: { id: "task_ghost", name: "Ghost", createdDate: "2026-08-01", deadline: "2026-08-09", status: "Todo", assignee: "EMP999", budget: 5 }
    }));
    assert.equal(response.status, 400);
    assert.match((await readJson(response)).error, /unprovisioned_assignee/);
    assert.equal(db._tables.tasks.length, 0);
});

test("supervisor assignment of inactive employee is rejected", async () => {
    const db = dbForSupervisor();
    const response = await MODULES.tasks.onRequestPost(tasksContext("POST", {
        user: supervisorUser(),
        db,
        body: { id: "task_inactive", name: "Inactive", createdDate: "2026-08-01", deadline: "2026-08-09", status: "Todo", assignee: "EMP003", budget: 5 }
    }));
    assert.equal(response.status, 400);
    assert.equal(db._tables.tasks.length, 0);
});

// Supervisor visibility: the assigned owner sees the task in their list.
test("assigned member sees supervisor-assigned task in their own list", async () => {
    const db = dbWithTasks([
        { ...MEMBER_TASK, id: "task_sup2", assignee: "EMP002", owner_user_subject: "emp002-sub" }
    ]);
    const assignee = { role: "member", employee_code: "EMP002", display_name: "Demo User 02", issuer: ISS, subject: "emp002-sub" };
    const response = await MODULES.tasks.onRequestGet(tasksContext("GET", { user: assignee, db }));
    const body = await response.json();
    assert.deepEqual(body.map((t) => t.id), ["task_sup2"]);
});

// Supervisor reassignment transfers ownership explicitly.
test("supervisor reassignment transfers ownership to the new assignee", async () => {
    const db = dbForSupervisor([MEMBER_TASK]);
    const response = await MODULES.tasks.onRequestPut(tasksContext("PUT", {
        user: supervisorUser(),
        db,
        body: { id: "task_1", assignee: "EMP002", name: "Member task", status: "Todo", row_version: 1 }
    }));
    assert.equal(response.status, 200);
    const row = db._tables.tasks[0];
    assert.equal(row.assignee, "EMP002");
    assert.equal(row.owner_user_subject, "emp002-sub"); // ownership transferred
    assert.equal(row.created_by_subject, "sub-1");      // audit fields preserved
    const body = await response.json();
    assert.equal(body.row_version, 2);
});

test("member cannot update someone else's task", async () => {
    const db = dbWithTasks([OTHER_TASK]);
    const response = await MODULES.tasks.onRequestPut(tasksContext("PUT", {
        user: memberUser(),
        db,
        body: { id: "task_2", name: "Hacked", status: "Done" }
    }));
    assert.equal(response.status, 403);
    assert.equal(db._tables.tasks[0].name, "Member task");
});

test("member cannot update legacy NULL-owner task", async () => {
    const db = dbWithTasks([LEGACY_TASK]);
    const response = await MODULES.tasks.onRequestPut(tasksContext("PUT", {
        user: memberUser(),
        db,
        body: { id: "task_3", name: "Hacked legacy" }
    }));
    assert.equal(response.status, 403);
});

test("supervisor can update legacy NULL-owner task", async () => {
    const db = dbWithTasks([LEGACY_TASK]);
    const response = await MODULES.tasks.onRequestPut(tasksContext("PUT", {
        user: supervisorUser(),
        db,
        body: { id: "task_3", name: "Supervised", status: "Done" }
    }));
    assert.equal(response.status, 200);
    assert.equal(db._tables.tasks[0].name, "Supervised");
});

test("member cannot delete someone else's task", async () => {
    const db = dbWithTasks([OTHER_TASK]);
    const response = await MODULES.tasks.onRequestDelete(tasksContext("DELETE", {
        user: memberUser(),
        db,
        url: "https://teamflow.test/api/tasks?id=task_2"
    }));
    assert.equal(response.status, 403);
    assert.equal(db._tables.tasks.length, 1);
});

test("member can delete own task", async () => {
    const db = dbWithTasks([MEMBER_TASK]);
    const response = await MODULES.tasks.onRequestDelete(tasksContext("DELETE", {
        user: memberUser(),
        db,
        url: "https://teamflow.test/api/tasks?id=task_1"
    }));
    assert.equal(response.status, 200);
    assert.equal(db._tables.tasks.length, 0);
});

test("ownership fields are immutable via update payload", async () => {
    const db = dbWithTasks([MEMBER_TASK]);
    const response = await MODULES.tasks.onRequestPut(tasksContext("PUT", {
        user: memberUser(),
        db,
        body: {
            id: "task_1",
            name: "Renamed",
            status: "Done",
            owner_user_issuer: "https://evil.example.com",
            owner_user_subject: "attacker-sub"
        }
    }));
    assert.equal(response.status, 200);
    assert.equal(db._tables.tasks[0].owner_user_issuer, ISS);
    assert.equal(db._tables.tasks[0].owner_user_subject, "sub-1");
});

test("stale row_version update returns 409", async () => {
    const db = dbWithTasks([{ ...MEMBER_TASK, row_version: 3 }]);
    const response = await MODULES.tasks.onRequestPut(tasksContext("PUT", {
        user: memberUser(),
        db,
        body: { id: "task_1", name: "Raced", status: "Done", row_version: 2 }
    }));
    assert.equal(response.status, 409);
    assert.equal(db._tables.tasks[0].name, "Member task");
});

test("matching row_version update succeeds and increments", async () => {
    const db = dbWithTasks([{ ...MEMBER_TASK, row_version: 3 }]);
    const response = await MODULES.tasks.onRequestPut(tasksContext("PUT", {
        user: memberUser(),
        db,
        body: { id: "task_1", name: "Fresh", status: "Done", row_version: 3 }
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.row_version, 4);
});

test("negative budget is rejected with 400", async () => {
    const db = createFakeDb();
    const response = await MODULES.tasks.onRequestPost(tasksContext("POST", {
        user: memberUser(),
        db,
        body: { id: "task_neg", name: "Neg", createdDate: "2026-08-01", deadline: "2026-08-09", status: "Todo", assignee: "EMP001", budget: -5 }
    }));
    assert.equal(response.status, 400);
});

test("negative budget rejected on update too", async () => {
    const db = dbWithTasks([MEMBER_TASK]);
    const response = await MODULES.tasks.onRequestPut(tasksContext("PUT", {
        user: memberUser(),
        db,
        body: { id: "task_1", name: "Neg update", budget: -1, row_version: 1 }
    }));
    assert.equal(response.status, 400);
});

// ==========================================================================
// XSS-SAFE RENDERING BOUNDARY (H2, source assertions on app.js)
// Every task/employee-controlled value interpolated into an HTML template
// must pass through the escapeHtml / escapeJsLiteral boundary.
// ==========================================================================

test("app.js rendering boundary escapes task-controlled values", async () => {
    const appJs = await readFile(moduleUrl("../app.js"), "utf8");
    assert.match(appJs, /function escapeHtml\(/);
    assert.match(appJs, /function escapeJsLiteral\(/);

    // Extract only HTML-sink template literals (the ones later handed to
    // innerHTML). textContent / option.textContent / .title assignments are
    // safe DOM text sinks and are deliberately excluded.
    const htmlSinks = [];
    const sinkRe = /\.innerHTML\s*=\s*`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = sinkRe.exec(appJs)) !== null) {
        htmlSinks.push(m[1]);
    }
    assert.ok(htmlSinks.length > 0, "expected innerHTML template sinks to exist");

    // Every dynamic task/employee value inside an HTML template must be
    // escaped; no raw interpolation of these fields is allowed there.
    const forbiddenPatterns = [
        /\$\{task\.name\}/,
        /\$\{task\.description\}/,
        /\$\{task\.description\s*\|\|/,
        /\$\{task\.assignee\}/,
        /\$\{task\.status\}/,
        /\$\{emp\.name\}/,
        /\$\{emp\.code\}/,
        /\$\{member\.name\}/,
        /\$\{member\.code\}/
    ];
    for (const sink of htmlSinks) {
        for (const pattern of forbiddenPatterns) {
            assert.doesNotMatch(sink, pattern);
        }
    }
    // Positive proof: the escaping helpers are actually used inside sinks.
    assert.ok(
        htmlSinks.some((s) => s.includes("escapeHtml(task.name)")),
        "task.name must be escaped inside innerHTML templates"
    );
    assert.ok(
        htmlSinks.some((s) => s.includes("escapeHtml(emp.name)") || s.includes("escapeHtml(emp.code)")),
        "employee fields must be escaped inside innerHTML templates"
    );

    // Inline handlers embed identifiers as JS string literals: they must go
    // through escapeJsLiteral, never the raw value.
    const handlerRe = /onclick="[^"`]*\$\{(?:task|emp)\.[^}]*\}[^"`]*"/g;
    for (const handler of appJs.match(handlerRe) || []) {
        assert.match(handler, /escapeJsLiteral\(/, `inline handler must escape interpolations: ${handler}`);
    }
    assert.match(appJs, /openEditTaskModal\('\$\{escapeJsLiteral\(task\.id\)\}'\)/);
    assert.match(appJs, /deleteEmployee\('\$\{escapeJsLiteral\(emp\.code\)\}'/);
});

test("app.js formatDate results are escaped inside innerHTML templates", async () => {
    const appJs = await readFile(moduleUrl("../app.js"), "utf8");

    // Extract only HTML-sink template literals (handed to innerHTML).
    // textContent / .title assignments are safe text sinks and stay out of
    // scope, so safe textContent usage of formatDate is not prohibited.
    const htmlSinks = [];
    const sinkRe = /\.innerHTML\s*=\s*`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = sinkRe.exec(appJs)) !== null) {
        htmlSinks.push(m[1]);
    }
    assert.ok(htmlSinks.length > 0, "expected innerHTML template sinks to exist");

    for (const sink of htmlSinks) {
        assert.doesNotMatch(
            sink,
            /\$\{(?!\s*escapeHtml\s*\()formatDate\(/,
            "formatDate(...) interpolated into innerHTML must be wrapped in escapeHtml(...)"
        );
    }
    // Positive proof: at least one escaped formatDate interpolation exists.
    assert.ok(
        htmlSinks.some((s) => /escapeHtml\s*\(\s*formatDate\(/.test(s)),
        "expected escapeHtml(formatDate(...)) inside innerHTML templates"
    );
});

// ==========================================================================
// EMPLOYEES: SUPERVISOR-ONLY WRITES, NO WRITE ON GET
// ==========================================================================

test("member cannot create employee", async () => {
    const db = createFakeDb();
    const response = await MODULES.employees.onRequestPost({
        request: new Request("https://teamflow.test/api/employees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: "EMP099", name: "Rogue" })
        }),
        env: { DB: db },
        data: { user: memberUser() }
    });
    assert.equal(response.status, 403);
    assert.equal(db._tables.employees.length, 0);
});

test("supervisor can create employee with audit subject", async () => {
    const db = createFakeDb();
    const response = await MODULES.employees.onRequestPost({
        request: new Request("https://teamflow.test/api/employees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: "EMP015", name: "New Member" })
        }),
        env: { DB: db },
        data: { user: supervisorUser() }
    });
    assert.equal(response.status, 200);
    assert.equal(db._tables.employees[0].created_by_subject, "sup-sub");
});

test("invalid employee code returns 400 for supervisor", async () => {
    const db = createFakeDb();
    const response = await MODULES.employees.onRequestPost({
        request: new Request("https://teamflow.test/api/employees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: "<bad>", name: "Bad code" })
        }),
        env: { DB: db },
        data: { user: supervisorUser() }
    });
    assert.equal(response.status, 400);
});

test("GET employees performs no write (no seeding, no DDL)", async () => {
    const db = dbWithUsers([]);
    const response = await MODULES.employees.onRequestGet({ env: { DB: db }, data: { user: memberUser() } });
    assert.equal(response.status, 200);
    const writes = db._log.filter((entry) => !/^SELECT/i.test(entry.sql));
    assert.equal(writes.length, 0);
    const body = await response.json();
    assert.deepEqual(body, []);
});

test("member cannot delete employee", async () => {
    const db = createFakeDb();
    const response = await MODULES.employees.onRequestDelete({
        request: new Request("https://teamflow.test/api/employees?code=EMP001", { method: "DELETE" }),
        env: { DB: db },
        data: { user: memberUser() }
    });
    assert.equal(response.status, 403);
});

// ==========================================================================
// PRODUCTION FALLBACK REMOVAL (source assertions on app.js)
// ==========================================================================

test("app.js has no localStorage task fallback and no client role switching", async () => {
    const appJs = await readFile(moduleUrl("../app.js"), "utf8");
    assert.equal(/localStorage\.getItem\("teamflow_tasks"\)/.test(appJs), false);
    assert.equal(/localStorage\.setItem\("teamflow_tasks"/.test(appJs), false);
    assert.equal(/currentRole\s*=/.test(appJs), false);
    assert.match(appJs, /\/api\/session/);
});

console.log("auth-ownership tests completed");
