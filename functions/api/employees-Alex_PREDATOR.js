/* ==========================================================================
   CLOUDFLARE PAGES FUNCTION - Serverless API for Employees (/api/employees)
   ========================================================================== */

const EMPLOYEE_CODE_PATTERN = /^[A-Z0-9_-]{2,30}$/;

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

function validateEmployeePayload(payload) {
    payload = payload && typeof payload === "object" ? payload : {};
    const employee = {
        code: sanitizeText(payload.code, 30).toUpperCase(),
        name: sanitizeText(payload.name, 120)
    };

    if (!employee.code || !employee.name) {
        return { error: "Missing required employee fields" };
    }
    if (!EMPLOYEE_CODE_PATTERN.test(employee.code)) {
        return { error: "Employee code must be 2-30 characters and contain only letters, numbers, underscores, or hyphens" };
    }

    return { employee };
}

/**
 * GET /api/employees
 * ดึงรายชื่อพนักงานทั้งหมด
 */
export async function onRequestGet(context) {
    const { env } = context;
    try {
        if (!env.DB) {
            return jsonResponse({ error: "D1 database binding DB is not configured" }, 500);
        }
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
        
        return jsonResponse(results);
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

/**
 * POST /api/employees
 * เพิ่มหรืออัปเดตข้อมูลพนักงาน
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    try {
        if (!env.DB) {
            return jsonResponse({ error: "D1 database binding DB is not configured" }, 500);
        }
        const rawEmployee = await request.json();
        const { employee, error } = validateEmployeePayload(rawEmployee);
        if (error) {
            return jsonResponse({ error }, 400);
        }
        
        if (!employee.code || !employee.name) {
            return jsonResponse({ error: "ข้อมูลสำคัญไม่ครบถ้วน (Missing required fields)" }, 400);
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

        return jsonResponse({ success: true, message: "บันทึกข้อมูลพนักงานสำเร็จ" });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

/**
 * DELETE /api/employees?code={code}
 * ลบพนักงานออกจากระบบ
 */
export async function onRequestDelete(context) {
    const { env, request } = context;
    try {
        if (!env.DB) {
            return jsonResponse({ error: "D1 database binding DB is not configured" }, 500);
        }
        const url = new URL(request.url);
        const code = sanitizeText(url.searchParams.get("code"), 30).toUpperCase();
        
        if (!code) {
            return jsonResponse({ error: "ไม่พบ Parameter code" }, 400);
        }
        if (!EMPLOYEE_CODE_PATTERN.test(code)) {
            return jsonResponse({ error: "Invalid employee code" }, 400);
        }

        // ดำเนินการลบพนักงานออกจาก D1
        await env.DB.prepare("DELETE FROM employees WHERE code = ?").bind(code).run();

        return jsonResponse({ success: true, message: "ลบรายชื่อพนักงานสำเร็จ" });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
