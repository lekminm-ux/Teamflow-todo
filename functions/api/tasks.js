/* ==========================================================================
   CLOUDFLARE PAGES FUNCTION - Serverless API for Tasks (/api/tasks)
   Auth + ownership enforced. Runs behind functions/_middleware.js, which
   guarantees context.data.user is a verified active application user.
   - Members: list / create / update / delete ONLY their own tasks.
   - Supervisors: full access.
   - Ownership fields are immutable; foreign assignment is denied safely.
   - Optimistic locking via row_version (stale update -> 409).
   - Negative budget -> 400.
   - All statements are prepared D1 statements.
   ========================================================================== */

import {
    canModifyTask,
    isSupervisor,
    jsonError,
    resolveAllowedAssigneeOwner
} from "../_lib/authorization.js";

const NUMERIC_COLUMNS = ["budget"];
const OWNERSHIP_COLUMNS = ["owner_user_issuer", "owner_user_subject"];

function jsonOk(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        }
    });
}

function readJsonError(message, status = 400) {
    return jsonError("bad_request", message, status);
}

function sanitizeTaskInput(raw) {
    const task = {};
    for (const key of Object.keys(raw || {})) {
        if (OWNERSHIP_COLUMNS.includes(key)) continue; // ownership immutable
        const value = raw[key];
        task[key] = NUMERIC_COLUMNS.includes(key) ? Number(value) : value;
    }
    return task;
}

function validateBudget(task) {
    if (task.budget !== undefined && task.budget !== null && (!Number.isFinite(task.budget) || task.budget < 0)) {
        return readJsonError("งบประมาณไม่ถูกต้อง (Budget must be zero or a positive number)");
    }
    return null;
}

function requireRequiredFields(task) {
    if (!task.id || !task.name || !task.createdDate || !task.deadline || !task.status) {
        return readJsonError("ข้อมูลสำคัญไม่ครบถ้วน (Missing required fields)");
    }
    return null;
}

/**
 * Resolves an employee_code (the canonical assignee value) to the ACTIVE
 * app_user provisioned for it. Returns null when the assignee is missing,
 * unknown, or inactive (default deny).
 */
async function resolveAssigneeOwner(db, employeeCode) {
    return resolveAllowedAssigneeOwner(db, employeeCode);
}

/**
 * GET /api/tasks
 * Members receive only their own tasks (legacy NULL-owner rows excluded for
 * members); supervisors receive everything.
 */
export async function onRequestGet(context) {
    const { env } = context;
    const user = context.data && context.data.user;
    try {
        const statement = isSupervisor(user)
            ? env.DB.prepare("SELECT * FROM tasks ORDER BY deadline ASC")
            : env.DB.prepare(
                "SELECT * FROM tasks WHERE owner_user_issuer = ? AND owner_user_subject = ? ORDER BY deadline ASC"
              );
        const { results } = isSupervisor(user)
            ? await statement.all()
            : await statement.bind(user.issuer, user.subject).all();
        return jsonOk(results);
    } catch (err) {
        return jsonError("internal_error", err.message, 500);
    }
}

/**
 * POST /api/tasks
 * Members may only create tasks assigned to themselves. Assigning a task to
 * another employee is denied (403) for members and ignored/normalized for
 * supervisors? No - supervisors manage all tasks, so foreign assignment stays
 * a supervisor-only capability; members are denied with 403.
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    const user = context.data && context.data.user;
    try {
        const raw = await request.json();
        const task = sanitizeTaskInput(raw);

        const missing = requireRequiredFields(task);
        if (missing) return missing;
        const badBudget = validateBudget(task);
        if (badBudget) return badBudget;

        // Ownership is server-derived, never client-supplied.
        // employee_code is the canonical assignee value.
        let assigneeCode;
        let ownerIssuer;
        let ownerSubject;
        if (isSupervisor(user)) {
            // Supervisor assignment: the selected ACTIVE app_user becomes the
            // task owner. Unprovisioned / inactive assignees are rejected.
            assigneeCode = typeof task.assignee === "string" ? task.assignee.trim() : "";
            const owner = await resolveAssigneeOwner(env.DB, assigneeCode);
            if (!owner) {
                return jsonError(
                    "unprovisioned_assignee",
                    "ไม่พบพนักงานที่ได้รับมอบหมายในระบบ (Assignee is not a provisioned active user)",
                    400
                );
            }
            ownerIssuer = owner.issuer;
            ownerSubject = owner.subject;
        } else {
            // Members may only create tasks assigned to themselves.
            if (!user.employee_code) {
                return jsonError(
                    "forbidden",
                    "บัญชีของคุณยังไม่ผูกกับรหัสพนักงาน (Account is not linked to an employee code)",
                    403
                );
            }
            if (task.assignee && task.assignee !== user.employee_code) {
                return jsonError("forbidden", "การมอบหมายงานให้ผู้อื่นไม่ได้รับอนุญาต (Foreign assignment is denied)", 403);
            }
            assigneeCode = user.employee_code;
            ownerIssuer = user.issuer;
            ownerSubject = user.subject;
        }

        await env.DB.prepare(
            `INSERT INTO tasks (id, name, description, createdDate, deadline, assignee, budget, status, correctiveAction, remark,
                                owner_user_issuer, owner_user_subject, created_by_issuer, created_by_subject, row_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(
            task.id,
            task.name,
            task.description || '',
            task.createdDate,
            task.deadline,
            assigneeCode,
            Number.isFinite(task.budget) ? task.budget : 0,
            task.status,
            task.correctiveAction || '',
            task.remark || '',
            ownerIssuer,
            ownerSubject,
            user.issuer,
            user.subject
        ).run();

        return jsonOk({ success: true, message: "สร้างงานสำเร็จ" });
    } catch (err) {
        return jsonError("internal_error", err.message, 500);
    }
}

/**
 * PUT /api/tasks
 * Ownership enforced; ownership fields immutable; row_version optimistic
 * locking with 409 on stale writes. Legacy NULL-owner rows remain
 * supervisor-only. No upsert fallback: updates target existing rows only.
 */
export async function onRequestPut(context) {
    const { env, request } = context;
    const user = context.data && context.data.user;
    try {
        const raw = await request.json();
        const task = sanitizeTaskInput(raw);

        if (!task.id) return readJsonError("ไม่พบรหัสงาน (Missing task id)");

        const existing = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(task.id).first();
        if (!existing) {
            return jsonError("not_found", "ไม่พบงานที่ต้องการแก้ไข (Task not found)", 404);
        }

        if (!canModifyTask(user, existing)) {
            return jsonError("forbidden", "ไม่มีสิทธิ์แก้ไขงานนี้ (Not your task)", 403);
        }

        // Optimistic locking: stale version -> 409.
        const clientVersion = Number(raw.row_version);
        if (Number.isFinite(clientVersion) && clientVersion !== Number(existing.row_version)) {
            return jsonError("stale_version", "ข้อมูลถูกแก้ไขโดยผู้อื่นก่อนหน้า (Stale row version)", 409);
        }

        // Members cannot reassign to another employee.
        if (!isSupervisor(user) && task.assignee !== undefined && task.assignee !== user.employee_code) {
            return jsonError("forbidden", "การมอบหมายงานให้ผู้อื่นไม่ได้รับอนุญาต (Foreign assignment is denied)", 403);
        }

        // Supervisor reassignment explicitly transfers ownership to the newly
        // assigned ACTIVE app_user. Audit fields (created_by_*) are preserved;
        // updated_by_* records who performed the transfer.
        let ownerIssuer = existing.owner_user_issuer;
        let ownerSubject = existing.owner_user_subject;
        if (isSupervisor(user) && task.assignee !== undefined && task.assignee !== existing.assignee) {
            const owner = await resolveAssigneeOwner(env.DB, task.assignee);
            if (!owner) {
                return jsonError(
                    "unprovisioned_assignee",
                    "ไม่พบพนักงานที่ได้รับมอบหมายในระบบ (Assignee is not a provisioned active user)",
                    400
                );
            }
            ownerIssuer = owner.issuer;
            ownerSubject = owner.subject;
        }

        const badBudget = validateBudget(task);
        if (badBudget) return badBudget;

        const nextVersion = Number(existing.row_version) + 1;
        await env.DB.prepare(
            `UPDATE tasks SET
                name = ?,
                description = ?,
                createdDate = ?,
                deadline = ?,
                assignee = ?,
                budget = ?,
                status = ?,
                correctiveAction = ?,
                remark = ?,
                updated_by_issuer = ?,
                updated_by_subject = ?,
                owner_user_issuer = ?,
                owner_user_subject = ?,
                row_version = ?
             WHERE id = ? AND row_version = ?`
        ).bind(
            task.name !== undefined ? task.name : existing.name,
            task.description !== undefined ? (task.description || '') : existing.description,
            task.createdDate !== undefined ? task.createdDate : existing.createdDate,
            task.deadline !== undefined ? task.deadline : existing.deadline,
            task.assignee !== undefined ? task.assignee : existing.assignee,
            task.budget !== undefined && Number.isFinite(task.budget) ? task.budget : existing.budget,
            task.status !== undefined ? task.status : existing.status,
            task.correctiveAction !== undefined ? (task.correctiveAction || '') : existing.correctiveAction,
            task.remark !== undefined ? (task.remark || '') : existing.remark,
            user.issuer,
            user.subject,
            ownerIssuer,
            ownerSubject,
            nextVersion,
            task.id,
            existing.row_version
        ).run();

        return jsonOk({ success: true, message: "บันทึกข้อมูลเรียบร้อย", row_version: nextVersion });
    } catch (err) {
        return jsonError("internal_error", err.message, 500);
    }
}

/**
 * DELETE /api/tasks?id={taskId}
 * Members may delete only their own tasks; legacy NULL-owner rows are
 * supervisor-only.
 */
export async function onRequestDelete(context) {
    const { env, request } = context;
    const user = context.data && context.data.user;
    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) {
            return readJsonError("ไม่พบ Parameter ID");
        }

        const existing = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first();
        if (!existing) {
            return jsonError("not_found", "ไม่พบงานที่ต้องการลบ (Task not found)", 404);
        }
        if (!canModifyTask(user, existing)) {
            return jsonError("forbidden", "ไม่มีสิทธิ์ลบงานนี้ (Not your task)", 403);
        }

        await env.DB.prepare("DELETE FROM tasks WHERE id = ? AND row_version = ?")
            .bind(id, existing.row_version)
            .run();

        return jsonOk({ success: true, message: "ลบงานสำเร็จ" });
    } catch (err) {
        return jsonError("internal_error", err.message, 500);
    }
}
