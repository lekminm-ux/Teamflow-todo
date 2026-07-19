/* ==========================================================================
   CLOUDFLARE PAGES FUNCTION - Serverless API for Tasks (/api/tasks)
   ========================================================================== */

const VALID_STATUSES = new Set(["Todo", "In Progress", "Review", "Done"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        }
    });
}

function sanitizeText(value, maxLength) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function validateTaskPayload(payload) {
    payload = payload && typeof payload === "object" ? payload : {};
    const task = {
        id: sanitizeText(payload.id, 100),
        name: sanitizeText(payload.name, 250),
        description: sanitizeText(payload.description, 5000),
        createdDate: sanitizeText(payload.createdDate, 10),
        deadline: sanitizeText(payload.deadline, 10),
        assignee: sanitizeText(payload.assignee, 120),
        budget: Number(payload.budget ?? 0),
        status: sanitizeText(payload.status, 20),
        correctiveAction: sanitizeText(payload.correctiveAction, 5000),
        remark: sanitizeText(payload.remark, 1000)
    };

    if (!task.id || !task.name || !task.assignee || !task.createdDate || !task.deadline || !task.status) {
        return { error: "Missing required task fields" };
    }
    if (!DATE_PATTERN.test(task.createdDate) || !DATE_PATTERN.test(task.deadline)) {
        return { error: "Dates must use YYYY-MM-DD format" };
    }
    if (task.deadline < task.createdDate) {
        return { error: "Deadline cannot be earlier than createdDate" };
    }
    if (!Number.isFinite(task.budget) || task.budget < 0) {
        return { error: "Budget must be a non-negative number" };
    }
    if (!VALID_STATUSES.has(task.status)) {
        return { error: "Invalid task status" };
    }

    return { task };
}

async function ensureTaskSchema(env) {
    await env.DB.prepare(`
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
        )
    `).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)").run();
}

/**
 * GET /api/tasks
 * ดึงรายการงานทั้งหมดจาก D1 Database
 */
export async function onRequestGet(context) {
    const { env } = context;
    try {
        if (!env.DB) {
            return jsonResponse({ error: "D1 database binding DB is not configured" }, 500);
        }
        await ensureTaskSchema(env);
        // ดึงงานทั้งหมด เรียงลำดับตาม Deadline
        const { results } = await env.DB.prepare("SELECT * FROM tasks ORDER BY deadline ASC").all();
        return jsonResponse(results);
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

/**
 * POST /api/tasks
 * เพิ่มงานใหม่ในฐานข้อมูล
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    try {
        if (!env.DB) {
            return jsonResponse({ error: "D1 database binding DB is not configured" }, 500);
        }
        await ensureTaskSchema(env);
        const rawTask = await request.json();
        const { task, error } = validateTaskPayload(rawTask);
        if (error) {
            return jsonResponse({ error }, 400);
        }
        
        // ตรวจสอบความถูกต้องของข้อมูลพื้นฐาน
        if (!task.id || !task.name || !task.assignee || !task.createdDate || !task.deadline || !task.status) {
            return jsonResponse({ error: "ข้อมูลสำคัญไม่ครบถ้วน (Missing required fields)" }, 400);
        }

        // แทรกข้อมูลเข้าตาราง tasks
        await env.DB.prepare(`
            INSERT INTO tasks (id, name, description, createdDate, deadline, assignee, budget, status, correctiveAction, remark)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            task.id,
            task.name,
            task.description || '',
            task.createdDate,
            task.deadline,
            task.assignee,
            Number(task.budget) || 0,
            task.status,
            task.correctiveAction || '',
            task.remark || ''
        ).run();

        return jsonResponse({ success: true, message: "สร้างงานสำเร็จ" });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

/**
 * PUT /api/tasks
 * อัปเดตงานเดิมในฐานข้อมูล (รองรับการทำ Upsert หากไม่พบ ID)
 */
export async function onRequestPut(context) {
    const { env, request } = context;
    try {
        if (!env.DB) {
            return jsonResponse({ error: "D1 database binding DB is not configured" }, 500);
        }
        await ensureTaskSchema(env);
        const rawTask = await request.json();
        const { task, error } = validateTaskPayload(rawTask);
        if (error) {
            return jsonResponse({ error }, 400);
        }
        
        if (!task.id || !task.name || !task.assignee || !task.createdDate || !task.deadline || !task.status) {
            return jsonResponse({ error: "ข้อมูลสำคัญไม่ครบถ้วน" }, 400);
        }

        // ตรวจสอบว่ามีงานนี้ในระบบหรือไม่
        const existing = await env.DB.prepare("SELECT id FROM tasks WHERE id = ?").bind(task.id).first();

        if (!existing) {
            // หากไม่มี ให้ทำการสร้างใหม่ (Upsert fallback)
            await env.DB.prepare(`
                INSERT INTO tasks (id, name, description, createdDate, deadline, assignee, budget, status, correctiveAction, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                task.id,
                task.name,
                task.description || '',
                task.createdDate,
                task.deadline,
                task.assignee,
                Number(task.budget) || 0,
                task.status,
                task.correctiveAction || '',
                task.remark || ''
            ).run();
        } else {
            // ทำการแก้ไขงานเดิม
            await env.DB.prepare(`
                UPDATE tasks SET 
                    name = ?, 
                    description = ?, 
                    createdDate = ?, 
                    deadline = ?, 
                    assignee = ?, 
                    budget = ?, 
                    status = ?, 
                    correctiveAction = ?, 
                    remark = ?
                WHERE id = ?
            `).bind(
                task.name,
                task.description || '',
                task.createdDate,
                task.deadline,
                task.assignee,
                Number(task.budget) || 0,
                task.status,
                task.correctiveAction || '',
                task.remark || '',
                task.id
            ).run();
        }

        return jsonResponse({ success: true, message: "บันทึกข้อมูลเรียบร้อย" });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

/**
 * DELETE /api/tasks?id={taskId}
 * ลบงานที่ต้องการออกจากฐานข้อมูล
 */
export async function onRequestDelete(context) {
    const { env, request } = context;
    try {
        if (!env.DB) {
            return jsonResponse({ error: "D1 database binding DB is not configured" }, 500);
        }
        await ensureTaskSchema(env);
        const url = new URL(request.url);
        const id = sanitizeText(url.searchParams.get("id"), 100);
        
        if (!id) {
            return jsonResponse({ error: "ไม่พบ Parameter ID" }, 400);
        }

        // ดำเนินการลบออกจาก D1
        await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();

        return jsonResponse({ success: true, message: "ลบงานสำเร็จ" });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
