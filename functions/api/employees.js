/* ==========================================================================
   CLOUDFLARE PAGES FUNCTION - Serverless API for Employees (/api/employees)
   Supervisor-only management. Write-on-GET seeding removed: GET is strictly
   read-only. All statements are prepared D1 statements. Audit subjects
   recorded additively.
   ========================================================================== */

import { isSupervisor, jsonError } from "../_lib/authorization.js";

function jsonOk(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        }
    });
}

const EMPLOYEE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function denyNonSupervisor() {
    return jsonError("forbidden", "เฉพาะหัวหน้างานเท่านั้น (Supervisor access required)", 403);
}

/**
 * GET /api/employees - read-only listing for all authenticated users.
 * No table creation, no seeding, no writes of any kind.
 */
export async function onRequestGet(context) {
    const { env } = context;
    try {
        const { results } = await env.DB.prepare("SELECT code, name FROM employees ORDER BY code ASC").all();
        return jsonOk(results);
    } catch (err) {
        return jsonError("internal_error", err.message, 500);
    }
}

/**
 * POST /api/employees - supervisor-only upsert by code.
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    const user = context.data && context.data.user;
    if (!isSupervisor(user)) return denyNonSupervisor();

    try {
        const employee = await request.json();
        if (!employee || !employee.code || !employee.name) {
            return jsonError("bad_request", "ข้อมูลสำคัญไม่ครบถ้วน (Missing required fields)", 400);
        }
        if (!EMPLOYEE_CODE_PATTERN.test(employee.code)) {
            return jsonError("bad_request", "รหัสพนักงานไม่ถูกต้อง (Employee code invalid)", 400);
        }

        const existing = await env.DB.prepare("SELECT code FROM employees WHERE code = ?").bind(employee.code).first();
        if (existing) {
            await env.DB.prepare("UPDATE employees SET name = ? WHERE code = ?")
                .bind(employee.name, employee.code)
                .run();
        } else {
            await env.DB.prepare(
                "INSERT INTO employees (code, name, created_by_issuer, created_by_subject) VALUES (?, ?, ?, ?)"
            ).bind(employee.code, employee.name, user.issuer, user.subject).run();
        }

        return jsonOk({ success: true, message: "บันทึกข้อมูลพนักงานสำเร็จ" });
    } catch (err) {
        return jsonError("internal_error", err.message, 500);
    }
}

/**
 * DELETE /api/employees?code={code} - supervisor-only removal.
 */
export async function onRequestDelete(context) {
    const { env, request } = context;
    const user = context.data && context.data.user;
    if (!isSupervisor(user)) return denyNonSupervisor();

    try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        if (!code) {
            return jsonError("bad_request", "ไม่พบ Parameter code", 400);
        }

        await env.DB.prepare("DELETE FROM employees WHERE code = ?").bind(code).run();
        return jsonOk({ success: true, message: "ลบรายชื่อพนักงานสำเร็จ" });
    } catch (err) {
        return jsonError("internal_error", err.message, 500);
    }
}
