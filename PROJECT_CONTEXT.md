# PROJECT_CONTEXT

Last updated: 2026-09-02

## Project Name
TeamFlow - Todo / Team Task Dashboard

## Purpose / เป้าหมายของระบบ
TeamFlow เป็น Web Application สำหรับจัดการงานของทีม แสดง dashboard ภาพรวมงาน งบประมาณ สถานะ deadline workload รายบุคคล และ workflow การทำงานของสมาชิกทีม

เป้าหมายหลัก:
- ให้หัวหน้างานเห็นภาพรวมงานทั้งหมดของทีม
- ให้สมาชิกทีมเห็น Kanban board ของตัวเองและอัปเดตสถานะงานได้
- เก็บข้อมูลงานและรายชื่อพนักงานผ่าน Cloudflare D1 เมื่อ deploy แล้ว
- ใช้ Cloudflare Access + Google IdP และ server-side ownership เป็นขอบเขตความปลอดภัย; production task fallback ผ่าน localStorage ถูกปิด

## Tech Stack
- Frontend: HTML, CSS, JavaScript แบบ plain static files
- UI assets: Google Fonts, Lucide icons ผ่าน CDN
- Backend/API: Cloudflare Pages Functions
- Database: Cloudflare D1 / SQLite-compatible schema
- Authentication: Cloudflare Access JWT (`RS256`) + active-user mapping ใน D1
- Authorization: server-side role/ownership checks แบบ default-deny
- Tests: Node.js built-in test runner ผ่าน `npm test`
- Deployment config: `wrangler.toml`

## Important Files
- `index.html` - โครงสร้าง UI หลัก, dashboard, calendar, kanban, task modal, employee modal
- `style.css` - styling ทั้งระบบ
- `app.js` - frontend state, authenticated session UI, API calls, DOM-safe rendering, calendar, kanban และ modals
- `functions/_middleware.js` - default-deny authentication middleware
- `functions/_lib/authorization.js` - Access JWT verification และ role/ownership helpers
- `functions/api/session.js` - minimal authenticated session endpoint
- `functions/api/tasks.js` - Cloudflare Pages Function สำหรับ `/api/tasks`
- `functions/api/employees.js` - Cloudflare Pages Function สำหรับ `/api/employees`
- `schema.sql` - fresh-install schema สำหรับ `tasks`, `employees`, `app_users` และ ownership/audit columns
- `migrations/0001_auth_ownership.sql` - additive migration สำหรับ D1 เดิม
- `wrangler.toml` - D1 binding name `DB`, database name `teamflow-db`
- `tests/functions.test.mjs` - Function unit tests
- `tests/auth-ownership.test.mjs` - Access JWT, ownership, authorization และ XSS regression tests
- `CLOUDFLARE_DEPLOYMENT_GUIDE.md` - deployment guide
- `deployment_guide.html` - deployment guide แบบ HTML
- `Codex_Multi_Device_Blueprint.md` - note/blueprint เดิมเรื่อง multi-device workflow; terminal อาจแสดงภาษาไทยเป็น mojibake

## Folder Structure
```text
.
├─ .agents/
├─ .git/
├─ functions/
│  ├─ _lib/
│  │  └─ authorization.js
│  ├─ _middleware.js
│  └─ api/
│     ├─ employees.js
│     ├─ employees-Alex_PREDATOR.js
│     ├─ session.js
│     ├─ tasks.js
│     └─ tasks-Alex_PREDATOR.js
├─ migrations/
│  └─ 0001_auth_ownership.sql
├─ tests/
│  ├─ auth-ownership.test.mjs
│  └─ functions.test.mjs
├─ app.js
├─ app-Alex_PREDATOR.js
├─ index.html
├─ style.css
├─ schema.sql
├─ package.json
├─ wrangler.toml
├─ CLOUDFLARE_DEPLOYMENT_GUIDE.md
├─ Codex_Multi_Device_Blueprint.md
├─ deployment_guide.html
├─ PROJECT_CONTEXT.md
└─ CHANGELOG_AI.md
```

## Current Features / หน้าจอหรือ Workflow หลัก
- Role/session selector เป็น read-only; authority มาจาก verified server session เท่านั้น
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
  - frontend โหลด `/api/session` → `/api/employees` → `/api/tasks`
  - หากยืนยันตัวตน/API ไม่ผ่าน ระบบ fail closed และไม่ใช้ localStorage/mock tasks เป็น production fallback

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
  - ownership/audit: `owner_user_issuer`, `owner_user_subject`, `created_by_*`, `updated_by_*`, `row_version`
  - indexes: `idx_tasks_assignee`, `idx_tasks_status`, `idx_tasks_owner`
- `employees`
  - `code TEXT PRIMARY KEY`
  - `name TEXT NOT NULL`
  - `created_by_issuer`, `created_by_subject`
- `app_users`
  - stable identity key: `(issuer, subject)`
  - role: `member` หรือ `supervisor`
  - `employee_code`, `display_name`, `is_active`

API endpoints:
- `GET /api/session` - return minimal verified role/employee/display state
- `GET /api/tasks` - supervisor sees all; member sees only owned tasks
- `POST /api/tasks` - create with server-derived ownership
- `PUT /api/tasks` - ownership check + optimistic locking; no upsert fallback
- `DELETE /api/tasks?id={taskId}` - ownership check before delete
- `GET /api/employees` - read-only list; no write-on-GET seeding
- `POST/DELETE /api/employees` - supervisor-only

## Business Rules สำคัญ
- Valid task statuses used by UI: `Todo`, `In Progress`, `Review`, `Done`
- `Done` tasks are not counted as overdue
- Overdue logic compares `deadline` against today's date
- Dates are stored as `YYYY-MM-DD` strings
- Budget is numeric and displayed as Thai Baht
- Deleting an employee does not delete historical tasks assigned to that employee
- Employee code examples use `EMP001` style
- Supervisor can assign tasks to any employee
- Supervisor assignment requires an active provisioned `app_users` assignee and transfers ownership
- Member add/edit flow is locked to the verified employee code
- Legacy tasks with NULL ownership are supervisor-only
- Ownership fields cannot be changed from request payloads
- `row_version` mismatch returns `409`
- API currently uses prepared statements for DB writes/reads

## Deployment / Run / Test Instructions
Repo มี `package.json` สำหรับ Node built-in tests และไม่มี external dependency.

Static frontend:
- `index.html` เปิดเพื่อ UI shell review ได้ แต่หากไม่มี Access session/API ระบบจะแสดง fail-closed state โดยไม่โหลด task data

Cloudflare Pages / D1:
- Configure D1 binding `DB` in Cloudflare Pages or Wrangler.
- D1 เดิมต้องผ่าน Gate แยกก่อน apply `migrations/0001_auth_ownership.sql`; fresh database ใช้ `schema.sql`
- ตั้ง `ACCESS_TEAM_DOMAIN`, `ACCESS_AUDIENCE`, D1 `database_id` และ Cloudflare Access policy ใน Deploy Gate; placeholders ปัจจุบันตั้งใจให้ fail closed
- Provision `app_users` ด้วย verified issuer/subject และ `is_active=1` ผ่าน Gate แยก; ห้าม commit identity จริง

Tests/checks that can run locally if Node.js is available:
```powershell
node --check app.js
npm test
```

Current verification (2026-09-02): syntax ผ่านทุก JS/MJS และ `npm test` ผ่าน `48/48` บน Windows หลังปรับ test File URL helper แบบ cross-platform.

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
- `app.js` - รวม state/render/authenticated session/API ทั้งระบบ แก้ผิดแล้ว UI หลักพังได้
- `index.html` - มี DOM ids และ inline handlers ที่ `app.js` พึ่งพา
- `functions/api/tasks.js` - API งานและ D1 writes
- `functions/api/employees.js` - API รายชื่อพนักงานแบบ read-only GET และ supervisor-only writes
- `functions/_lib/authorization.js`, `functions/_middleware.js` - security boundary; ต้องคง default-deny
- `schema.sql` - เปลี่ยน schema กระทบ D1 และ API
- `wrangler.toml` - เปลี่ยน binding/database กระทบ deploy
- `style.css` - UI responsive/spacing ทั้งระบบ
- `tests/functions.test.mjs` - อาจไม่ตรงกับ implementation ปัจจุบัน ต้อง sync tests กับ code
- `app-Alex_PREDATOR.js`, `functions/api/*-Alex_PREDATOR.js` - สำเนา/ไฟล์ conflict ที่ต้อง compare ก่อนลบหรือใช้แทน

## APP07 Source-of-Truth Apply Status — 2026-09-02
- Owner อนุมัติ Source-of-Truth Apply Gate และนำ validated feature diff จาก sanitized workspace เข้า repo นี้แล้ว
- รักษา live master endpoint, person identifiers และ mock task values เดิมของ Source-of-Truth; ไม่คัดลอก sanitization-only replacements
- `*-Alex_PREDATOR.js` ทุกไฟล์ยังเป็น reference-only/excluded และไม่ถูกแก้
- Codex Final QA: syntax ผ่าน, security review ผ่าน, secret scan ผ่าน, local fail-closed preview ผ่าน และ automated tests `48/48`
- Owner อนุมัติ APP07 Local Commit Gate เมื่อ 2026-09-02 และ change set นี้ถูกจัดเก็บใน local commit ภายใต้ Gate ดังกล่าว
- Remote Push, D1 migration, Cloudflare Access, Deploy, Production Verification และ Release ยังไม่ได้รับอนุมัติและเป็น Gate แยก

## Known Risks / Notes
- มีไฟล์ untracked หลายไฟล์ ณ 2026-07-08: `Codex_Multi_Device_Blueprint.md`, `app-Alex_PREDATOR.js`, `functions/api/employees-Alex_PREDATOR.js`, `functions/api/tasks-Alex_PREDATOR.js`, `tests/`
- Source files มีข้อความภาษาไทย แต่ PowerShell output อาจแสดงเป็น mojibake; `index.html` บาง output แสดงไทยถูก บาง output แสดงเพี้ยน ขึ้นกับ command/encoding
- `innerHTML` sinks ที่รับ task/employee data ถูกบังคับผ่าน `escapeHtml`/`escapeJsLiteral`; tests ครอบคลุม 4 `formatDate` sinks
- Some date logic uses `new Date().toISOString()` which can cause timezone drift for Asia/Bangkok around midnight
- Access runtime variables, D1 migration, Access policy และ app-user provisioning ยังไม่ได้ตั้งจริง จึงยังห้าม Deploy
- `wrangler` was not confirmed available in PATH in the previous debugging session; verify before local Cloudflare testing

## Suggested Next Improvements
- Compare `app.js` with `app-Alex_PREDATOR.js` and decide which version is canonical
- Compare `functions/api/tasks.js` with `functions/api/tasks-Alex_PREDATOR.js`
- Compare `functions/api/employees.js` with `functions/api/employees-Alex_PREDATOR.js`
- Remove inline event handlers gradually and use `addEventListener`
- Add backend validation for date format, status enum, non-negative budget, employee code format
- Prepare a separately approved D1/Cloudflare Access deployment and rollback runbook before Production
