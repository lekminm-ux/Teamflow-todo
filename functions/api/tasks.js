/* ==========================================================================
   CLOUDFLARE PAGES FUNCTION - Serverless API for Tasks (/api/tasks)
   ========================================================================== */

/**
 * GET /api/tasks
 * ดึงรายการงานทั้งหมดจาก D1 Database
 */
export async function onRequestGet(context) {
    const { env } = context;
    try {
        // ดึงงานทั้งหมด เรียงลำดับตาม Deadline
        const { results } = await env.DB.prepare("SELECT * FROM tasks ORDER BY deadline ASC").all();
        return new Response(JSON.stringify(results), {
            headers: { 
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }
}

/**
 * POST /api/tasks
 * เพิ่มงานใหม่ในฐานข้อมูล
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    try {
        const task = await request.json();
        
        // ตรวจสอบความถูกต้องของข้อมูลพื้นฐาน
        if (!task.id || !task.name || !task.assignee || !task.createdDate || !task.deadline || !task.status) {
            return new Response(JSON.stringify({ error: "ข้อมูลสำคัญไม่ครบถ้วน (Missing required fields)" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
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

        return new Response(JSON.stringify({ success: true, message: "สร้างงานสำเร็จ" }), {
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }
}

/**
 * PUT /api/tasks
 * อัปเดตงานเดิมในฐานข้อมูล (รองรับการทำ Upsert หากไม่พบ ID)
 */
export async function onRequestPut(context) {
    const { env, request } = context;
    try {
        const task = await request.json();
        
        if (!task.id || !task.name || !task.assignee || !task.createdDate || !task.deadline || !task.status) {
            return new Response(JSON.stringify({ error: "ข้อมูลสำคัญไม่ครบถ้วน" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
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

        return new Response(JSON.stringify({ success: true, message: "บันทึกข้อมูลเรียบร้อย" }), {
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }
}

/**
 * DELETE /api/tasks?id={taskId}
 * ลบงานที่ต้องการออกจากฐานข้อมูล
 */
export async function onRequestDelete(context) {
    const { env, request } = context;
    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        
        if (!id) {
            return new Response(JSON.stringify({ error: "ไม่พบ Parameter ID" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // ดำเนินการลบออกจาก D1
        await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true, message: "ลบงานสำเร็จ" }), {
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }
}
