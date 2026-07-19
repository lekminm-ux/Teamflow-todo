# CHANGELOG_AI

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
