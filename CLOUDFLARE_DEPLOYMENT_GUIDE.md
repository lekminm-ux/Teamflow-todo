# คู่มือการติดตั้งระบบขึ้น Cloudflare Pages & D1 Database 🚀
(Cloudflare Pages & D1 Deployment Guide)

เนื่องจากระบบถูกแปลงเป็นระบบ **Full-stack** ที่บันทึกข้อมูลร่วมกันผ่านคลาวด์แล้ว คุณสามารถทำการติดตั้งระบบขึ้นใช้งานฟรี 100% บน Cloudflare โดยทำตามขั้นตอนสั้นๆ 5 ขั้นตอนด้านล่างนี้ได้เลยครับ:

---

## 📋 ขั้นตอนที่ 1: สมัครใช้งาน Cloudflare
1. เปิดเว็บเบราว์เซอร์ไปที่ **[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)**
2. กรอกอีเมลและรหัสผ่านเพื่อลงทะเบียนบัญชีใหม่ฟรี
3. ยืนยันอีเมลในกล่องจดหมายของคุณให้เรียบร้อย

---

## 💻 ขั้นตอนที่ 2: นำโค้ดขึ้น GitHub หรือ GitLab
เราต้องนำไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้นไปเก็บใน Repository ของคุณก่อน:
1. สร้าง **New Repository** ใน GitHub (เช่น ชื่อ `teamflow-todo`)
2. เปิด Command Prompt หรือ PowerShell ในคอมพิวเตอร์ของคุณ แล้วรันคำสั่งเหล่านี้ในโฟลเดอร์โครงการ:
   ```bash
   git init
   git add .
   git commit -m "Initialize TeamFlow App"
   git branch -M main
   git remote add origin https://github.com/ชื่อผู้ใช้ของคุณ/teamflow-todo.git
   git push -u origin main
   ```
*(หรือจะใช้โปรแกรม GitHub Desktop ลากโฟลเดอร์นี้เข้าไปสร้าง Repository แล้วกด Publish ก็ได้เช่นกัน)*

---

## 🗄️ ขั้นตอนที่ 3: สร้างฐานข้อมูล Cloudflare D1
เมื่อได้บัญชี Cloudflare แล้ว ให้ไปสร้างฐานข้อมูลเพื่อใช้เก็บชื่องาน งบประมาณ และสถานะต่างๆ:
1. ล็อกอินเข้าสู่หน้า **Cloudflare Dashboard**
2. เมนูด้านซ้าย เลือก **Workers & Pages** -> เลือกย่อย **D1**
3. คลิกปุ่ม **Create database** -> เลือก **D1** (Serverless SQL Database)
4. ตั้งชื่อฐานข้อมูลว่า: `teamflow-db`
5. คลิกปุ่ม **Create** ด้านล่างสุด

### 🛠️ รันคำสั่งสร้างตารางข้อมูล (Schema SQL):
หลังจากกดสร้างเสร็จ คุณจะอยู่ในหน้าแดชบอร์ดของฐานข้อมูล `teamflow-db`:
1. เลือกแท็บ **Console** (คอนโซล)
2. เปิดไฟล์ **[schema.sql](file:///g:/My Drive/Antigravity/Todo list/schema.sql)** ในคอมพิวเตอร์ของคุณ คัดลอกโค้ด SQL ทั้งหมดไปวางในคอนโซลของ Cloudflare:
   ```sql
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
   );

   CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
   CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
   ```
3. คลิกปุ่ม **Execute** (รันคำสั่ง) -> คุณจะพบข้อความตอบกลับสีเขียวแสดงว่าตารางฐานข้อมูลถูกสร้างเสร็จสมบูรณ์แล้ว!

---

## ⚡ ขั้นตอนที่ 4: สร้างและตั้งค่า Cloudflare Pages
เราจะลิงก์โค้ดจาก GitHub มาเปิดเป็นเว็บโฮสติ้ง:
1. ในแถบเมนูด้านซ้ายของ Cloudflare เลือก **Workers & Pages** -> เลือกแท็บย่อย **Overview**
2. คลิกปุ่ม **Create** -> เลือกแท็บ **Pages** -> คลิก **Connect to Git**
3. ล็อกอินบัญชี GitHub ของคุณ และเลือก Repository `teamflow-todo` ที่อัปโหลดไว้ในขั้นตอนที่ 2
4. ในหน้าตั้งค่าโปรเจกต์ (Build Settings):
   - **Project name:** ตั้งชื่อแอป (เช่น `teamflow-todo` - ชื่อนี้จะเป็นชื่อ URL ของเว็บคุณ)
   - **Production branch:** `main`
   - **Framework preset:** เลือกเป็น **None**
   - ส่วน Build command และ Build output ให้ปล่อยว่างไว้
5. คลิกปุ่ม **Save and Deploy** จากนั้นระบบจะเริ่มอ่านไฟล์และเปิดตัวเว็บครั้งแรก

---

## 🔗 ขั้นตอนที่ 5: ผูกฐานข้อมูล D1 เข้ากับแอป (สำคัญมาก!)
เมื่อ Deploy เสร็จเรียบร้อย ต้องเชื่อมตัวแอปพลิเคชันเข้ากับฐานข้อมูล SQL ที่สร้างไว้ในขั้นตอนที่ 3:
1. ไปที่หน้าโปรเจกต์ Pages ของคุณ (อยู่ใน **Workers & Pages** -> คลิกที่ชื่อโครงการ Pages ของคุณ)
2. คลิกที่แท็บ **Settings** (การตั้งค่า) -> เลือกเมนูย่อย **Functions** (ฟังก์ชัน)
3. เลื่อนลงมาด้านล่างสุดในหัวข้อ **D1 database bindings**
4. คลิกปุ่ม **Add binding**
   - **Variable name (ชื่อตัวแปร):** ระบุคำว่า `DB` (ตัวพิมพ์ใหญ่ทั้งหมด)
   - **D1 database (ฐานข้อมูล D1):** เลือกฐานข้อมูล `teamflow-db` ที่สร้างไว้
5. คลิก **Save**
6. **Deploy ซ้ำอีกครั้ง:** เลือกแท็บ **Deployments** ในโปรเจกต์ Pages ของคุณ -> คลิกปุ่มจุดสามจุดหน้าเวอร์ชันล่าสุด -> เลือก **Retry deployment** (หรือกด Push โค้ดใหม่ขึ้น GitHub) เพื่ออัปเดตสิทธิ์เชื่อมต่อฐานข้อมูล

---

## 🎉 เสร็จสิ้นการติดตั้ง!
ตอนนี้คุณจะได้ลิงก์หน้าเว็บแบบสาธารณะ เช่น `https://teamflow-todo.pages.dev` ที่สามารถ:
- สลับชื่อเพื่อจัดการงานของตนเอง หรือดูภาพรวมของพนักงานทั้ง 14 คน
- ใช้งานระบบฐานข้อมูลจริง ข้อมูลของทุกคนในทีมจะซิงค์หากันแบบ Real-time ทันที
- ใช้งานได้จากโทรศัพท์มือถือ แท็บเล็ต หรือคอมพิวเตอร์เครื่องอื่นๆ พร้อมกันโดยงบประมาณไม่สูญหาย!
