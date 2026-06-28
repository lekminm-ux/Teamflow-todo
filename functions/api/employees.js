/* ==========================================================================
   CLOUDFLARE PAGES FUNCTION - Serverless API for Employees (/api/employees)
   ========================================================================== */

/**
 * GET /api/employees
 * ดึงรายชื่อพนักงานทั้งหมด
 */
export async function onRequestGet(context) {
    const { env } = context;
    try {
        // ประกันความปลอดภัย: สร้างตารางพนักงานหากยังไม่มีในระบบ (Auto-Create Schema)
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS employees (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        `).run();

        // ตรวจสอบจำนวนข้อมูลในระบบ
        const countResult = await env.DB.prepare("SELECT COUNT(*) as count FROM employees").first();
        
        // หากไม่มีข้อมูลตั้งต้น ให้ทำการ Seed ข้อมูลพนักงาน 14 คนดั้งเดิม
        if (countResult && countResult.count === 0) {
            const DEFAULT_MEMBERS = [
                { code: "EMP001", name: "สมัค" },
                { code: "EMP002", name: "ต๊ะ" },
                { code: "EMP003", name: "อ้อม" },
                { code: "EMP004", name: "ปราง" },
                { code: "EMP005", name: "จอย" },
                { code: "EMP006", name: "บุ๋ม" },
                { code: "EMP007", name: "ตาล" },
                { code: "EMP008", name: "มิน" },
                { code: "EMP009", name: "โต้ย" },
                { code: "EMP010", name: "หมี" },
                { code: "EMP011", name: "โค้ก" },
                { code: "EMP012", name: "เบิ้ล" },
                { code: "EMP013", name: "ลี่" },
                { code: "EMP014", name: "แพร" }
            ];

            for (const m of DEFAULT_MEMBERS) {
                await env.DB.prepare("INSERT INTO employees (code, name) VALUES (?, ?)").bind(m.code, m.name).run();
            }
        }

        // คิวรีรายชื่อพนักงานทั้งหมดเรียงตามรหัสพนักงาน
        const { results } = await env.DB.prepare("SELECT * FROM employees ORDER BY code ASC").all();
        
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
 * POST /api/employees
 * เพิ่มหรืออัปเดตข้อมูลพนักงาน
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    try {
        const employee = await request.json();
        
        if (!employee.code || !employee.name) {
            return new Response(JSON.stringify({ error: "ข้อมูลสำคัญไม่ครบถ้วน (Missing required fields)" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // ทำการสร้างตารางหากไม่มี (กันเหนียว)
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS employees (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        `).run();

        // ค้นหาพนักงานเดิมด้วย code เพื่อทำความสะอาดสิทธิ์หรืออัปเดตทับ (Upsert)
        const existing = await env.DB.prepare("SELECT code FROM employees WHERE code = ?").bind(employee.code).first();

        if (existing) {
            // อัปเดตทับคนเดิม
            await env.DB.prepare("UPDATE employees SET name = ? WHERE code = ?").bind(employee.name, employee.code).run();
        } else {
            // แทรกพนักงานคนใหม่
            await env.DB.prepare("INSERT INTO employees (code, name) VALUES (?, ?)").bind(employee.code, employee.name).run();
        }

        return new Response(JSON.stringify({ success: true, message: "บันทึกข้อมูลพนักงานสำเร็จ" }), {
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
 * DELETE /api/employees?code={code}
 * ลบพนักงานออกจากระบบ
 */
export async function onRequestDelete(context) {
    const { env, request } = context;
    try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        
        if (!code) {
            return new Response(JSON.stringify({ error: "ไม่พบ Parameter code" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // ดำเนินการลบพนักงานออกจาก D1
        await env.DB.prepare("DELETE FROM employees WHERE code = ?").bind(code).run();

        return new Response(JSON.stringify({ success: true, message: "ลบรายชื่อพนักงานสำเร็จ" }), {
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }
}
