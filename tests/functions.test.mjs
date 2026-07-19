import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function importModule(filePath) {
    const source = await readFile(filePath, "utf8");
    return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

function jsonRequest(body, url = "https://teamflow.test/api") {
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
                bind(...values) {
                    calls.push({ sql, values });
                    return statement;
                },
                async all() {
                    return { results: [] };
                },
                async first() {
                    return null;
                },
                async run() {
                    calls.push({ sql, values: [] });
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

const tasksUrl = pathToFileURL("functions/api/tasks.js");
const employeesUrl = pathToFileURL("functions/api/employees.js");
const tasksApi = await importModule(tasksUrl);
const employeesApi = await importModule(employeesUrl);

{
    const response = await tasksApi.onRequestPost({
        env: { DB: createMockDb() },
        request: jsonRequest({ name: "Missing fields" })
    });

    assert.equal(response.status, 400);
    assert.match((await readJson(response)).error, /Missing required/);
}

{
    const response = await tasksApi.onRequestPost({
        env: { DB: createMockDb() },
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
    assert.match((await readJson(response)).error, /Budget/);
}

{
    const db = createMockDb();
    const response = await tasksApi.onRequestPost({
        env: { DB: db },
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
}

{
    const response = await employeesApi.onRequestPost({
        env: { DB: createMockDb() },
        request: jsonRequest({ code: "<bad>", name: "Bad code" })
    });

    assert.equal(response.status, 400);
    assert.match((await readJson(response)).error, /Employee code/);
}

{
    const db = createMockDb();
    const response = await employeesApi.onRequestPost({
        env: { DB: db },
        request: jsonRequest({ code: "emp015", name: "New Member" })
    });

    assert.equal(response.status, 200);
    assert.equal((await readJson(response)).success, true);
    assert.equal(db.calls.some(call => call.sql.includes("INSERT INTO employees")), true);
}

console.log("Function unit tests passed");
