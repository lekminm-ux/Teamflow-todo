# PROJECT_CONTEXT

Last updated: 2026-07-08

## Project Name
TeamFlow - Todo / Team Task Dashboard

## Purpose / เป้าหมายของระบบ
TeamFlow เป็น Web Application สำหรับจัดการงานของทีม แสดง dashboard ภาพรวมงาน งบประมาณ สถานะ deadline workload รายบุคคล และ workflow การทำงานของสมาชิกทีม

เป้าหมายหลัก:
- ให้หัวหน้างานเห็นภาพรวมงานทั้งหมดของทีม
- ให้สมาชิกทีมเห็น Kanban board ของตัวเองและอัปเดตสถานะงานได้
- เก็บข้อมูลงานและรายชื่อพนักงานผ่าน Cloudflare D1 เมื่อ deploy แล้ว
- ใช้ localStorage และ mock data เป็น fallback เมื่อ API หรือฐานข้อมูลยังไม่พร้อม

## Tech Stack
- Frontend: HTML, CSS, JavaScript แบบ plain static files
- UI assets: Google Fonts, Lucide icons ผ่าน CDN
- Backend/API: Cloudflare Pages Functions
- Database: Cloudflare D1 / SQLite-compatible schema
- Local fallback: browser localStorage key `teamflow_tasks`
- Tests: Node.js script ใน `tests/functions.test.mjs`
- Deployment config: `wrangler.toml`

## Important Files
- `index.html` - โครงสร้าง UI หลัก, dashboard, calendar, kanban, task modal, employee modal
- `style.css` - styling ทั้งระบบ
- `app.js` - frontend state, API calls, rendering, filtering, calendar, kanban, modals, localStorage fallback
- `functions/api/tasks.js` - Cloudflare Pages Function สำหรับ `/api/tasks`
- `functions/api/employees.js` - Cloudflare Pages Function สำหรับ `/api/employees`
- `schema.sql` - schema สำหรับตาราง `tasks` และ `employees`
- `wrangler.toml` - D1 binding name `DB`, database name `teamflow-db`
- `tests/functions.test.mjs` - Node-based unit tests สำหรับ Pages Functions โดยใช้ mock D1
- `CLOUDFLARE_DEPLOYMENT_GUIDE.md` - deployment guide
- `deployment_guide.html` - deployment guide แบบ HTML
- `Codex_Multi_Device_Blueprint.md` - note/blueprint เดิมเรื่อง multi-device workflow; terminal อาจแสดงภาษาไทยเป็น mojibake

## Folder Structure
```text
.
├─ .agents/
├─ .git/
├─ functions/
│  └─ api/
│     ├─ employees.js
│     ├─ employees-Alex_PREDATOR.js
│     ├─ tasks.js
│     └─ tasks-Alex_PREDATOR.js
├─ tests/
│  └─ functions.test.mjs
├─ app.js
├─ app-Alex_PREDATOR.js
├─ index.html
├─ style.css
├─ schema.sql
├─ wrangler.toml
├─ CLOUDFLARE_DEPLOYMENT_GUIDE.md
├─ Codex_Multi_Device_Blueprint.md
├─ deployment_guide.html
├─ PROJECT_CONTEXT.md
└─ CHANGELOG_AI.md
```

## Current Features / หน้าจอหรือ Workflow หลัก
- Role selector:
  - `supervisor` เห็น dashboard รวม
  - `member_<name>` เห็น board ของสมาชิกคนนั้น
- Supervisor dashboard:
  - metrics: total tasks, in progress, review, done, budget total, overdue
  - workload list ต่อพนักงาน
  - table งานทั้งหมด พร้อม search/filter by assignee/status
  - create/edit/delete task
  - employee management modal
- Team calendar:
  - monthly grid
  - mobile timeline
  - filter by assignee สำหรับ supervisor
- Member view:
  - Kanban columns: Todo, In Progress, Review, Done
  - drag-and-drop เพื่อเปลี่ยนสถานะ
  - add task for current member
  - edit task และดู detail modal
- Data sync:
  - frontend โหลด `/api/employees` ก่อน แล้วโหลด `/api/tasks`
  - ถ้า API ใช้ไม่ได้ ใช้ default employee list และ localStorage/mock tasks

## Database / Data Source / API ที่เกี่ยวข้อง
Cloudflare D1 binding:
- Binding: `DB`
- Database name: `teamflow-db`

Tables from `schema.sql`:
- `tasks`
  - `id TEXT PRIMARY KEY`
  - `name TEXT NOT NULL`
  - `description TEXT`
  - `createdDate TEXT NOT NULL`
  - `deadline TEXT NOT NULL`
  - `assignee TEXT NOT NULL`
  - `budget REAL DEFAULT 0`
  - `status TEXT NOT NULL`
  - `correctiveAction TEXT DEFAULT ''`
  - `remark TEXT DEFAULT ''`
  - indexes: `idx_tasks_assignee`, `idx_tasks_status`
- `employees`
  - `code TEXT PRIMARY KEY`
  - `name TEXT NOT NULL`

API endpoints:
- `GET /api/tasks` - return all tasks ordered by deadline
- `POST /api/tasks` - create task
- `PUT /api/tasks` - update existing task or upsert if not found
- `DELETE /api/tasks?id={taskId}` - delete task
- `GET /api/employees` - create employees table if needed, seed default employees if empty, return employees ordered by code
- `POST /api/employees` - create/update employee
- `DELETE /api/employees?code={code}` - delete employee

## Business Rules สำคัญ
- Valid task statuses used by UI: `Todo`, `In Progress`, `Review`, `Done`
- `Done` tasks are not counted as overdue
- Overdue logic compares `deadline` against today's date
- Dates are stored as `YYYY-MM-DD` strings
- Budget is numeric and displayed as Thai Baht
- Deleting an employee does not delete historical tasks assigned to that employee
- Employee code examples use `EMP001` style
- Supervisor can assign tasks to any employee
- Member add/edit flow may lock assignee to the current member
- API currently uses prepared statements for DB writes/reads

## Deployment / Run / Test Instructions
Current repo has no `package.json`.

Static frontend:
- `index.html` can be opened directly for UI review, but API calls will fail outside Cloudflare/Pages local dev and then fallback to localStorage/mock data.

Cloudflare Pages / D1:
- Configure D1 binding `DB` in Cloudflare Pages or Wrangler.
- Apply `schema.sql` to D1 before relying on `/api/tasks`.
- `wrangler.toml` contains `database_name = "teamflow-db"` but no concrete `database_id`.

Tests/checks that can run locally if Node.js is available:
```powershell
node --check app.js
node --check functions\api\tasks.js
node --check functions\api\employees.js
node --check tests\functions.test.mjs
node tests\functions.test.mjs
```

Important note:
- `tests/functions.test.mjs` appears to expect stricter API validation than the current `functions/api/*.js` implementation inspected on disk on 2026-07-08. Run tests before trusting them; if they fail, compare whether source files or conflict copies contain the intended newer implementation.

## Important Working Rules
- ทุก AI ต้องอ่าน `PROJECT_CONTEXT.md` และ `CHANGELOG_AI.md` ก่อนเริ่มแก้
- ต้อง inspect ไฟล์จริงจาก disk ก่อน patch ทุกครั้ง
- ห้ามพึ่ง chat history อย่างเดียว
- ก่อนแก้ไฟล์ ให้บอกไฟล์ที่จะถูกแก้ เหตุผล ความเสี่ยง และวิธีทดสอบ
- หลังทำงานเสร็จทุกครั้งให้ update `CHANGELOG_AI.md`
- ถ้าเปลี่ยน architecture, schema, deployment, workflow หรือ rule สำคัญ ให้ update `PROJECT_CONTEXT.md`
- หลีกเลี่ยงให้ AI หลายตัวแก้ไฟล์เดียวกันพร้อมกัน
- ห้ามลบหรือ overwrite ไฟล์ conflict/copy โดยไม่ compare ก่อน
- ถ้าพบไฟล์ที่มีภาษาไทยแสดงเพี้ยนใน terminal ให้ตรวจ encoding/เปิดจาก editor หรือ browser ก่อนสรุปว่าไฟล์เสียจริง

## Multi-Device Workflow
1. ก่อนเริ่มงานบนเครื่องใหม่ ให้รอ OneDrive sync เสร็จ
2. เปิด repo แล้วอ่าน `PROJECT_CONTEXT.md` และ `CHANGELOG_AI.md`
3. รัน `git status --short` และเช็กไฟล์ untracked/conflict
4. ถ้ามีไฟล์ `*-Alex_PREDATOR.js`, conflict copy, duplicate file, หรือไฟล์ที่ OneDrive สร้างสำเนา ให้หยุดและ compare ก่อนแก้ source หลัก
5. ให้ AI inspect ไฟล์จริงจาก disk ก่อนเริ่ม patch
6. แก้ไฟล์ทีละ scope เล็ก ๆ
7. รัน checks/tests ที่เกี่ยวข้อง
8. อัปเดต `CHANGELOG_AI.md`
9. รอ OneDrive sync เสร็จก่อนย้ายเครื่องหรือเปิดด้วย AI tool อีกตัว

## Multi-AI Tool Workflow สำหรับ Codex, Claude Code, Antigravity
ใช้กติกาเดียวกันกับทุก tool:
- อ่าน `PROJECT_CONTEXT.md`
- อ่าน `CHANGELOG_AI.md`
- inspect ไฟล์จริงจาก disk
- สรุปสถานะล่าสุดจากไฟล์ ไม่ใช่จาก chat history
- เสนอแผน/ไฟล์ที่จะกระทบก่อนแก้
- หลีกเลี่ยงแก้ไฟล์เดียวกันพร้อมกันหลาย tool
- หลังแก้ อัปเดต `CHANGELOG_AI.md`

Codex:
- เหมาะกับ patch, terminal checks, git status, unit tests
- ก่อน patch ให้ระบุไฟล์ที่จะเปลี่ยน

Claude Code:
- เหมาะกับ review/refactor/explanation
- ต้องอ่านไฟล์จริงก่อน และไม่สรุปจากบทสนทนาเดิม

Antigravity:
- เหมาะกับ IDE-oriented editing
- ก่อน run/preview ให้เช็กว่าไฟล์จาก OneDrive sync ครบ และไม่มี conflict copy ใหม่

## OneDrive / Git / Sync Conflict Rules
- OneDrive ใช้ sync ไฟล์ข้ามเครื่องได้ แต่ไม่ใช่ระบบ version control หลัก
- Git ควรใช้เป็น source of truth สำหรับการเปลี่ยน code จริงจัง
- ถ้าใช้ OneDrive ต้องรอ sync เสร็จก่อนเริ่มงาน
- ถ้าเกิด conflict copy ให้หยุดและ compare ก่อน
- อย่าแก้ไฟล์หลักพร้อมกับ conflict copy โดยไม่รู้ว่าไฟล์ไหนใหม่กว่า
- อย่า commit ไฟล์ conflict copy เช่น `*-Alex_PREDATOR.js` จนกว่าจะตรวจว่าเป็นไฟล์ที่ตั้งใจเก็บจริง
- ก่อนทำงานสำคัญให้รัน `git status --short`
- ก่อน commit ให้ review diff และตรวจว่าไม่มี secrets หรือไฟล์ชั่วคราว

## High-Risk Files ที่ต้องระวังก่อนแก้
- `app.js` - รวม state/render/API/localStorage ทั้งระบบ แก้ผิดแล้ว UI หลักพังได้
- `index.html` - มี DOM ids และ inline handlers ที่ `app.js` พึ่งพา
- `functions/api/tasks.js` - API งานและ D1 writes
- `functions/api/employees.js` - API รายชื่อพนักงานและ seed data
- `schema.sql` - เปลี่ยน schema กระทบ D1 และ API
- `wrangler.toml` - เปลี่ยน binding/database กระทบ deploy
- `style.css` - UI responsive/spacing ทั้งระบบ
- `tests/functions.test.mjs` - อาจไม่ตรงกับ implementation ปัจจุบัน ต้อง sync tests กับ code
- `app-Alex_PREDATOR.js`, `functions/api/*-Alex_PREDATOR.js` - สำเนา/ไฟล์ conflict ที่ต้อง compare ก่อนลบหรือใช้แทน

## Known Risks / Notes
- มีไฟล์ untracked หลายไฟล์ ณ 2026-07-08: `Codex_Multi_Device_Blueprint.md`, `app-Alex_PREDATOR.js`, `functions/api/employees-Alex_PREDATOR.js`, `functions/api/tasks-Alex_PREDATOR.js`, `tests/`
- Source files มีข้อความภาษาไทย แต่ PowerShell output อาจแสดงเป็น mojibake; `index.html` บาง output แสดงไทยถูก บาง output แสดงเพี้ยน ขึ้นกับ command/encoding
- `app.js` inspected on disk ยังใช้ `innerHTML` หลายจุดกับข้อมูลจาก task/employee; ควรระวัง XSS ถ้าข้อมูลมาจากผู้ใช้
- `app.js` API sync functions currently do not check `response.ok`; UI อาจคิดว่าบันทึกสำเร็จทั้งที่ backend fail
- `app.js` reads `localStorage` with `JSON.parse` without try/catch; localStorage corrupt อาจทำให้ init พัง
- Some date logic uses `new Date().toISOString()` which can cause timezone drift for Asia/Bangkok around midnight
- `functions/api/tasks.js` currently does basic required-field validation only; does not validate status/date/budget range
- `functions/api/tasks.js` assumes `tasks` table exists; employees API creates/seed table automatically but tasks API does not
- `tests/functions.test.mjs` may fail against current API because tests expect validations that are not present in current source
- `wrangler` was not confirmed available in PATH in the previous debugging session; verify before local Cloudflare testing

## Suggested Next Improvements
- Compare `app.js` with `app-Alex_PREDATOR.js` and decide which version is canonical
- Compare `functions/api/tasks.js` with `functions/api/tasks-Alex_PREDATOR.js`
- Compare `functions/api/employees.js` with `functions/api/employees-Alex_PREDATOR.js`
- Add frontend HTML escaping or DOM-safe rendering for user-controlled fields
- Remove inline event handlers gradually and use `addEventListener`
- Make API functions check `response.ok` and notify users when D1 sync fails
- Add backend validation for date format, status enum, non-negative budget, employee code format
- Add try/catch around localStorage parse
- Align `tests/functions.test.mjs` with current source or update source to satisfy tests
- Add `package.json` scripts for checks/tests, e.g. `npm test`
- Document exact Cloudflare Pages deployment steps with `database_id` once known
