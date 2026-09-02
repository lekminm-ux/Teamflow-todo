# CHANGELOG_AI

## 2026-09-02

### Tool ที่ใช้
Codex + Browser ภายใน Codex App + local terminal

### Session Goal
ดำเนิน APP07 Source-of-Truth Apply Gate โดยนำเฉพาะ validated feature diff จาก Hermes sanitized workspace เข้า `TodoList_WebApp`, รัน tests/syntax และ Codex Final QA โดยไม่ Commit, Push, Deploy หรือแก้ Production

### สิ่งที่ทำเสร็จแล้ว
- อ่าน `PROJECT_CONTEXT.md`, `CHANGELOG_AI.md`, ตรวจ `git status`, `git log -5` และ `git pull --ff-only`; repo สะอาดและ GitHub ตอบ `Already up to date`
- ดาวน์โหลด exact APP07 contract ผ่าน Browser ใน Codex App; 4 re-sealed files ตรง hash ที่ผ่าน DeepSeek PASS:
  - `app.js` = `cd590f9c20a02601a077c680c3bff11315b7348873d5b7cdd4046825c448fd28`
  - `functions/api/tasks.js` = `0380ec12908e485f59c62dd5022295ffc575b2c3def66fe13262aef5507c50b9`
  - `tests/functions.test.mjs` = `13de49e63a14e07f35bbd9da84ef2b8a4ba02b8de1628ea769c1b2fb7a1aed88`
  - `tests/auth-ownership.test.mjs` = `b60db1ab518091fe832577c209526d56d5bb29eafa5d924bfe1a7c0edae6e6a5`
- อ่าน `SANITIZATION_MANIFEST.json` และแยก endpoint/person identifiers/mock tasks ออกจาก feature diff; รักษาค่าจริงเดิมของ Source-of-Truth และแก้ sanitization corruption `เปDemo User 13ยน` กลับเป็นข้อความไทยเดิม
- เพิ่ม Cloudflare Access JWT verification (`RS256`), active `app_users` mapping, default-deny middleware, minimal session endpoint, server-side task ownership, supervisor-only employee writes, optimistic locking และ additive D1 migration
- ปิด production localStorage task fallback และ client-side role authority; เพิ่ม DOM-safe escaping สำหรับ user-controlled HTML sinks
- รักษา `style.css` แบบ byte-identical และไม่แตะ `*-Alex_PREDATOR.js`
- แก้ test File URL helper ให้รองรับ Windows (`new URL(..., import.meta.url)`) หลัง Final QA พบ path `D:\\D:\\...`

### ไฟล์ที่เพิ่ม/แก้ไข
- Modified: `index.html`, `app.js`, `functions/api/tasks.js`, `functions/api/employees.js`, `schema.sql`, `wrangler.toml`, `tests/functions.test.mjs`, `PROJECT_CONTEXT.md`, `CHANGELOG_AI.md`
- Added: `package.json`, `functions/_middleware.js`, `functions/_lib/authorization.js`, `functions/api/session.js`, `migrations/0001_auth_ownership.sql`, `tests/auth-ownership.test.mjs`
- Unchanged/excluded: `style.css`, `*-Alex_PREDATOR.js`, `.git`, credentials, Cloudflare/D1/Production

### Tests หรือ Checks ที่รัน
- `node --check` ผ่านทุก production/new JS/MJS
- `npm test` ผ่าน `48/48`, fail `0`
- `git diff --check` ผ่าน
- Secret/private-key scan ผ่าน
- Browser ภายใน Codex App local preview โหลด HTML/JS และแสดง fail-closed shell ตามคาดเมื่อไม่มี Access session

### Notes / Risks
- Source-of-Truth Apply และ Codex Final QA ผ่านแล้ว; Owner อนุมัติ APP07 Local Commit Gate เมื่อ 2026-09-02 และ entry นี้รวมอยู่ใน local commit ของ change set
- ยังไม่ได้ตั้ง `ACCESS_TEAM_DOMAIN`, `ACCESS_AUDIENCE`, D1 `database_id`, Access policy, migration หรือ `app_users` จริง; placeholders ทำให้ระบบ fail closed
- Local Commit ได้รับอนุมัติเฉพาะ change set นี้; ยังไม่อนุมัติ Push, Deploy, D1/Cloudflare write, Production Verification หรือ Release
- Gate ถัดไป: Remote Push (ยัง `NO`); D1/Access/Deploy และ Production Verification ต้องอนุมัติแยก

## 2026-07-08

### Tool ที่ใช้
Codex

### Session Goal
สร้างระบบไฟล์ความจำกลางสำหรับโปรเจกต์นี้ เพื่อให้ใช้งานหลายเครื่องและหลาย AI tool เช่น Codex, Claude Code, Antigravity ได้อย่างปลอดภัย

### สิ่งที่ทำเสร็จแล้ว
- อ่านโครงสร้างโปรเจกต์จาก disk
- ตรวจสอบแล้วว่าเดิมยังไม่มี `PROJECT_CONTEXT.md` และ `CHANGELOG_AI.md`
- อ่านไฟล์หลักที่เกี่ยวข้อง:
  - `app.js`
  - `index.html`
  - `functions/api/tasks.js`
  - `functions/api/employees.js`
  - `tests/functions.test.mjs`
  - `schema.sql`
  - `wrangler.toml`
  - `Codex_Multi_Device_Blueprint.md`
- สร้าง `PROJECT_CONTEXT.md` พร้อมบริบท project, tech stack, important files, workflow, database/API, business rules, testing/deployment notes, working rules, multi-device/multi-AI workflow, OneDrive/Git conflict rules, high-risk files, known risks, suggested improvements
- สร้าง `CHANGELOG_AI.md` เป็น log กลางสำหรับงาน AI ต่อไป
- เพิ่มกติกาสำคัญตามที่ผู้ใช้ระบุ:
  - ทุก AI ต้องอ่าน `PROJECT_CONTEXT.md` และ `CHANGELOG_AI.md` ก่อนเริ่มแก้
  - ต้อง inspect ไฟล์จริงจาก disk ก่อน patch
  - ห้ามพึ่ง chat history อย่างเดียว
  - หลีกเลี่ยงให้ AI หลายตัวแก้ไฟล์เดียวกันพร้อมกัน
  - ถ้าใช้ OneDrive ต้องรอ sync เสร็จก่อนเริ่มงาน
  - ถ้าเกิด conflict copy ให้หยุดและ compare ก่อน
  - หลังทำงานเสร็จทุกครั้งให้ update `CHANGELOG_AI.md`
  - ถ้าเปลี่ยน architecture, schema, deployment, workflow หรือ rule สำคัญ ให้ update `PROJECT_CONTEXT.md`

### ไฟล์ที่เพิ่ม/แก้ไข
- Added: `PROJECT_CONTEXT.md`
- Added: `CHANGELOG_AI.md`

### Tests หรือ Checks ที่รัน
- `Get-ChildItem -Force`
- `rg --files`
- `Test-Path PROJECT_CONTEXT.md`
- `Test-Path CHANGELOG_AI.md`
- `git status --short`
- Read/check source and config files listed above

ยังไม่ได้รัน functional tests หลังสร้าง docs เพราะงานนี้เป็น documentation/context setup เท่านั้น

### Notes / Risks
- พบไฟล์ untracked/สำเนาที่ควรตรวจเทียบก่อนแก้หรือลบ:
  - `Codex_Multi_Device_Blueprint.md`
  - `app-Alex_PREDATOR.js`
  - `functions/api/employees-Alex_PREDATOR.js`
  - `functions/api/tasks-Alex_PREDATOR.js`
  - `tests/`
- `tests/functions.test.mjs` อาจคาดหวัง validation ที่ยังไม่อยู่ใน `functions/api/*.js` ปัจจุบัน ต้องรันและตรวจ diff ก่อนใช้อ้างอิง
- บางคำสั่ง PowerShell แสดงภาษาไทยในไฟล์เป็น mojibake จึงควรเปิดจาก editor/browser หรือเช็ก encoding ก่อนสรุปว่าไฟล์เสีย
- มีความเสี่ยงจากการใช้ OneDrive sync พร้อมกับ Git ถ้าเปิดหลายเครื่องหรือหลาย AI tool พร้อมกัน

### Next Step
- Compare ไฟล์ `*-Alex_PREDATOR.js` กับไฟล์หลัก เพื่อหาว่าเป็น conflict copy หรือเวอร์ชันใหม่กว่า
- ตัดสินใจว่าจะเก็บ/ลบ/merge conflict copies อย่างไร หลัง compare แล้วเท่านั้น
- รัน:
  - `node --check app.js`
  - `node --check functions\api\tasks.js`
  - `node --check functions\api\employees.js`
  - `node tests\functions.test.mjs`
- ถ้า tests fail ให้ sync tests กับ implementation หรือแก้ implementation ตาม validation ที่ต้องการ
- หลังแก้ code ครั้งถัดไป ต้องอัปเดต `CHANGELOG_AI.md` อีกครั้ง
