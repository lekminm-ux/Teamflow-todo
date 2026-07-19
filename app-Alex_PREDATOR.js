/* ==========================================================================
   TEAMFLOW JAVASCRIPT - State, API & UI Controller (Cloudflare D1 Enabled)
   ========================================================================== */

// 1. Team Members Definition
const TEAM_MEMBERS = [
    "สมัค", "ต๊ะ", "อ้อม", "ปราง", "จอย", "บุ๋ม", 
    "ตาล", "มิน", "โต้ย", "หมี", "โค้ก", "เบิ้ล", "ลี่", "แพร"
];

// 2. Initial Mock Data (Fallback Tasks if Database is Empty or Offline)
const INITIAL_TASKS = [
    {
        id: "task_1",
        name: "พัฒนาระบบหลังบ้าน API เชื่อมต่อระบบคลังสินค้า",
        description: "เขียน API สำหรับเช็คสต็อกสินค้าแบบ Real-time และเชื่อมต่อระบบขนส่งภายนอก รองรับโหลด 500 req/sec",
        createdDate: "2026-05-25",
        deadline: "2026-06-10",
        assignee: "สมัค",
        budget: 45000,
        status: "In Progress",
        correctiveAction: "",
        remark: "โครงสร้างหลักเสร็จแล้ว กำลังเชื่อมต่อ API ขนส่ง"
    },
    {
        id: "task_2",
        name: "ออกแบบ UI/UX หน้าจอระบบสมัครสมาชิกและตะกร้าสินค้าใหม่",
        description: "ปรับปรุงหน้าชำระเงินให้จบในหน้าเดียว (One-page Checkout) เพื่อลดอัตรา Drop-off ของลูกค้า",
        createdDate: "2026-05-20",
        deadline: "2026-05-28",
        assignee: "อ้อม",
        budget: 15000,
        status: "Done",
        correctiveAction: "ปรับลดขนาดปุ่มให้เหมาะสมกับหน้าจอมือถือตามฟีดแบกแรก",
        remark: "ผ่านการรีวิวจากทีมการตลาดแล้ว"
    },
    {
        id: "task_3",
        name: "ทดสอบความปลอดภัยระบบชำระเงิน (Penetration Test)",
        description: "ตรวจสอบหาช่องโหว่ SQL Injection, Cross-Site Scripting (XSS) ในหน้าชำระเงิน",
        createdDate: "2026-05-28",
        deadline: "2026-06-03",
        assignee: "ต๊ะ",
        budget: 35000,
        status: "Review",
        correctiveAction: "พบบั๊กความปลอดภัยปานกลาง 1 จุด กำลังแก้ไขโค้ดควบคุมสิทธิ์การเข้าถึงข้อมูล",
        remark: "รอผลการประเมินรอบสองเพื่อย้ายไป Done"
    },
    {
        id: "task_4",
        name: "จัดทำเอกสารคู่มือการใช้งานระบบสำหรับผู้ดูแลระบบ (Admin Manual)",
        description: "เขียนคู่มือความยาวประมาณ 20 หน้า ครอบคลุมการตั้งค่าคลังสินค้า การตั้งค่าคูปองส่วนลด และการสร้างสิทธิ์พนักงาน",
        createdDate: "2026-05-30",
        deadline: "2026-06-15",
        assignee: "ปราง",
        budget: 8000,
        status: "Todo",
        correctiveAction: "",
        remark: ""
    },
    {
        id: "task_5",
        name: "วางแผนแคมเปญโฆษณา Facebook & TikTok ประจำเดือนมิถุนายน",
        description: "จัดเตรียมสื่อโฆษณา วิดีโอสั้น รีวิวการใช้งานผลิตภัณฑ์ และกำหนดงบประมาณกลุ่มเป้าหมายรายสัปดาห์",
        createdDate: "2026-05-29",
        deadline: "2026-06-08",
        assignee: "จอย",
        budget: 120000,
        status: "In Progress",
        correctiveAction: "",
        remark: "งบโฆษณาแบ่งเป็น Facebook 60% และ TikTok 40%"
    },
    {
        id: "task_6",
        name: "วิเคราะห์งบการเงินและรายงานยอดขาย ไตรมาส 1 (Q1)",
        description: "รวบรวมข้อมูลรายจ่าย รายรับ งบดุล และยอดขายแต่ละสาขาเพื่อวิเคราะห์อัตราการเติบโต",
        createdDate: "2026-05-15",
        deadline: "2026-05-30",
        assignee: "บุ๋ม",
        budget: 20000,
        status: "Done",
        correctiveAction: "",
        remark: "ข้อมูลครบถ้วน ถูกต้องตามรอบบัญชี"
    }
];

// 3. Application State
let tasks = [];
let currentRole = "supervisor"; // Default view
let draggedTaskId = null;
let currentTab = "board"; // board or calendar
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-11
let employees = []; // Dynamic employee list loaded from API

const HTML_ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
};

function toText(value) {
    return value === undefined || value === null ? "" : String(value);
}

function escapeHTML(value) {
    return toText(value).replace(/[&<>"']/g, char => HTML_ESCAPE_MAP[char]);
}

function getLocalDateString(date = new Date()) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().split("T")[0];
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    populateSelectOptions();
    bindEvents();
    initAppState(); // Async load from API
});

// Load tasks from Cloudflare API (with LocalStorage / Mock Data fallbacks)
async function initAppState() {
    // 1. Load employees list first
    try {
        const response = await fetch("/api/employees");
        if (response.ok) {
            employees = await response.json();
        }
    } catch (err) {
        console.warn("⚠️ ไม่สามารถดึงข้อมูลพนักงานจาก D1 ได้:", err);
    }

    // Fallback: Seed initial employees if empty (e.g. offline/local fallback)
    if (!employees || employees.length === 0) {
        const DEFAULT_TEAM = [
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
        employees = [...DEFAULT_TEAM];
    }

    populateSelectOptions(); // Populate dropdowns dynamically from loaded employees!

    // 2. Load tasks
    try {
        const response = await fetch("/api/tasks");
        if (response.ok) {
            tasks = await response.json();
            saveTasksToLocalBackup();
            renderApp();
            return;
        }
    } catch (err) {
        console.warn("⚠️ ไม่สามารถโหลดข้อมูลจาก Cloudflare API ได้ (อาจจะกำลังรันโหมด Local/ยังไม่ผูกฐานข้อมูล) -> กำลังสลับไปใช้ระบบเก็บข้อมูลในเครื่อง");
    }

    // Fallback: LocalStorage
    const savedTasks = localStorage.getItem("teamflow_tasks");
    if (savedTasks) {
        try {
            const parsedTasks = JSON.parse(savedTasks);
            tasks = Array.isArray(parsedTasks) ? parsedTasks : [...INITIAL_TASKS];
        } catch (err) {
            console.warn("Invalid local task backup. Falling back to initial tasks.", err);
            tasks = [...INITIAL_TASKS];
            saveTasksToLocalBackup();
        }
    } else {
        tasks = [...INITIAL_TASKS];
        saveTasksToLocalBackup();
    }
    renderApp();
}

function saveTasksToLocalBackup() {
    localStorage.setItem("teamflow_tasks", JSON.stringify(tasks));
}

function notifyCloudSyncFailure(action) {
    alert(`บันทึก${action}ในเครื่องแล้ว แต่ซิงค์ขึ้นฐานข้อมูล Cloudflare D1 ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อหรือการตั้งค่า D1`);
}

// ==========================================================================
// CLOUDFLARE CLOUD D1 DATABASE SYNC FUNCTIONS (ASYNC BACKEND CALLS)
// ==========================================================================
async function apiCreateTask(task) {
    try {
        const response = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(task)
        });
        if (!response.ok) throw new Error(`Create task failed: ${response.status}`);
        return true;
    } catch (err) {
        console.error("❌ ไม่สามารถซิงค์การเพิ่มงานขึ้น D1 ได้:", err);
        return false;
    }
}

async function apiUpdateTask(task) {
    try {
        const response = await fetch("/api/tasks", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(task)
        });
        if (!response.ok) throw new Error(`Update task failed: ${response.status}`);
        return true;
    } catch (err) {
        console.error("❌ ไม่สามารถซิงค์การอัปเดตขึ้น D1 ได้:", err);
        return false;
    }
}

async function apiDeleteTask(taskId) {
    try {
        const response = await fetch(`/api/tasks?id=${encodeURIComponent(taskId)}`, {
            method: "DELETE"
        });
        if (!response.ok) throw new Error(`Delete task failed: ${response.status}`);
        return true;
    } catch (err) {
        console.error("❌ ไม่สามารถซิงค์การลบขึ้น D1 ได้:", err);
        return false;
    }
}

// Populate member select option elements dynamically
function populateSelectOptions() {
    const optgroup = document.getElementById("members-optgroup");
    const filterAssignee = document.getElementById("filter-assignee");
    const taskAssigneeInput = document.getElementById("task-assignee-input");
    const calendarAssigneeFilter = document.getElementById("calendar-assignee-filter");

    optgroup.innerHTML = "";
    
    // Clear filter lists but keep default 'all'
    if (filterAssignee) {
        filterAssignee.innerHTML = '<option value="all">ทุกคน (All Members)</option>';
    }
    if (calendarAssigneeFilter) {
        calendarAssigneeFilter.innerHTML = '<option value="all">ทุกคนในทีม (All Members)</option>';
    }
    if (taskAssigneeInput) {
        taskAssigneeInput.innerHTML = '';
    }
    
    employees.forEach(member => {
        const option = document.createElement("option");
        option.value = `member_${member.name}`;
        option.textContent = `พนักงาน: ${member.name} (${member.code})`;
        optgroup.appendChild(option);

        const filterOpt = document.createElement("option");
        filterOpt.value = member.name;
        filterOpt.textContent = `${member.name} (${member.code})`;
        filterAssignee.appendChild(filterOpt);

        const modalOpt = document.createElement("option");
        modalOpt.value = member.name;
        modalOpt.textContent = `${member.name} (${member.code})`;
        taskAssigneeInput.appendChild(modalOpt);

        if (calendarAssigneeFilter) {
            const calendarOpt = document.createElement("option");
            calendarOpt.value = member.name;
            calendarOpt.textContent = `${member.name} (${member.code})`;
            calendarAssigneeFilter.appendChild(calendarOpt);
        }
    });
}

function bindEvents() {
    document.getElementById("role-select").addEventListener("change", (e) => {
        currentRole = e.target.value;
        currentTab = "board"; // Reset to board tab on role change
        resetTabButtons();
        renderApp();
    });

    document.getElementById("task-search").addEventListener("input", renderTasksTable);
    document.getElementById("filter-assignee").addEventListener("change", renderTasksTable);
    document.getElementById("filter-status").addEventListener("change", renderTasksTable);
}

// ==========================================================================
// CORE RENDERING ENGINE
// ==========================================================================
function renderApp() {
    const supervisorView = document.getElementById("supervisor-view");
    const memberView = document.getElementById("member-view");

    if (currentRole === "supervisor") {
        supervisorView.classList.add("active");
        memberView.classList.remove("active");
        
        if (currentTab === "board") {
            calculateMetrics();
            renderWorkloadList();
            renderTasksTable();
        } else {
            renderCalendar();
        }
    } else {
        supervisorView.classList.remove("active");
        memberView.classList.add("active");

        const activeMember = currentRole.replace("member_", "");
        renderMemberHeader(activeMember);
        
        if (currentTab === "board") {
            renderKanbanBoard(activeMember);
        } else {
            renderCalendar();
        }
    }
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================================================
// TABS SWITCHER & CALENDAR LOGIC
// ==========================================================================
function resetTabButtons() {
    const tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach(btn => {
        if (btn.id.includes("board")) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    document.querySelectorAll(".tab-content-wrapper").forEach(el => {
        if (el.id.includes("board")) {
            el.classList.remove("hidden");
        } else {
            el.classList.add("hidden");
        }
    });
}

function switchViewTab(tabName) {
    currentTab = tabName;
    
    // Update active tab button classes
    const isSupervisor = currentRole === "supervisor";
    const prefix = isSupervisor ? "sup" : "mem";
    
    const boardBtn = document.getElementById(`tab-btn-${prefix}-board`);
    const calendarBtn = document.getElementById(`tab-btn-${prefix}-calendar`);
    
    if (tabName === "board") {
        if (boardBtn) boardBtn.classList.add("active");
        if (calendarBtn) calendarBtn.classList.remove("active");
        
        document.getElementById(`${prefix}-board-content`).classList.remove("hidden");
        document.getElementById(`${prefix}-calendar-content`).classList.add("hidden");
    } else {
        if (boardBtn) boardBtn.classList.remove("active");
        if (calendarBtn) calendarBtn.classList.add("active");
        
        document.getElementById(`${prefix}-board-content`).classList.add("hidden");
        document.getElementById(`${prefix}-calendar-content`).classList.remove("hidden");
    }

    renderApp();
}

function changeCalendarMonth(direction) {
    calendarMonth += direction;
    if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear -= 1;
    } else if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear += 1;
    }
    renderCalendar();
}

function jumpToCurrentMonth() {
    const today = new Date();
    calendarYear = today.getFullYear();
    calendarMonth = today.getMonth();
    renderCalendar();
}

function renderCalendar() {
    const isSupervisor = currentRole === "supervisor";
    const prefix = isSupervisor ? "sup" : "mem";
    
    // 1. Update Month Year Label
    const thaiMonths = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const labelEl = document.getElementById(`${prefix}-calendar-month-year`);
    if (labelEl) {
        labelEl.textContent = `${thaiMonths[calendarMonth]} ${calendarYear + 543}`;
    }

    // 2. Filter tasks
    let activeAssignee = "all";
    if (isSupervisor) {
        const filterEl = document.getElementById("calendar-assignee-filter");
        activeAssignee = filterEl ? filterEl.value : "all";
    } else {
        activeAssignee = currentRole.replace("member_", "");
    }

    const filteredCalendarTasks = tasks.filter(task => {
        const matchesAssignee = activeAssignee === "all" || task.assignee === activeAssignee;
        return matchesAssignee;
    });

    // 3. Render Desktop Monthly Grid
    renderCalendarGrid(prefix, filteredCalendarTasks);

    // 4. Render Mobile Timeline
    renderCalendarTimeline(prefix, filteredCalendarTasks);
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function renderCalendarGrid(prefix, tasksList) {
    const daysGrid = document.getElementById(`${prefix}-calendar-days`);
    if (!daysGrid) return;
    daysGrid.innerHTML = "";

    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const lastDayDate = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const prevLastDayDate = new Date(calendarYear, calendarMonth, 0).getDate();
    
    const today = new Date();

    // Previous month filler
    for (let i = firstDayIndex; i > 0; i--) {
        const dateNum = prevLastDayDate - i + 1;
        const dayCell = document.createElement("div");
        dayCell.className = "calendar-day empty";
        dayCell.innerHTML = `
            <div class="day-header">
                <span class="day-number">${dateNum}</span>
            </div>
            <div class="calendar-day-tasks-list"></div>
        `;
        daysGrid.appendChild(dayCell);
    }

    // Current month days
    for (let i = 1; i <= lastDayDate; i++) {
        const dateString = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = today.getFullYear() === calendarYear && 
                        today.getMonth() === calendarMonth && 
                        today.getDate() === i;

        const dayCell = document.createElement("div");
        dayCell.className = `calendar-day${isToday ? ' today' : ''}`;
        
        const header = document.createElement("div");
        header.className = "day-header";
        header.innerHTML = `<span class="day-number">${i}</span>`;
        dayCell.appendChild(header);

        const tasksContainer = document.createElement("div");
        tasksContainer.className = "calendar-day-tasks-list";

        const dayTasks = tasksList.filter(t => t.deadline === dateString);
        
        dayTasks.forEach(task => {
            const pill = document.createElement("div");
            const statusClass = `pill-${getStatusId(task.status)}`;
            pill.className = `calendar-task-pill ${statusClass}`;
            
            const assigneeName = toText(task.assignee);
            const displayAssignee = currentRole === "supervisor" ? `[${assigneeName.substring(0, 1)}] ` : "";
            pill.textContent = `${displayAssignee}${toText(task.name)}`;
            pill.title = `${toText(task.name)} (${assigneeName}) - กำหนดส่ง: ${formatDate(task.deadline)}`;
            
            pill.onclick = (e) => {
                e.stopPropagation();
                openDetailModal(task.id);
            };
            tasksContainer.appendChild(pill);
        });

        dayCell.appendChild(tasksContainer);
        daysGrid.appendChild(dayCell);
    }

    // Next month filler
    const totalSlots = firstDayIndex + lastDayDate;
    const remainingSlots = (7 - (totalSlots % 7)) % 7;
    for (let i = 1; i <= remainingSlots; i++) {
        const dayCell = document.createElement("div");
        dayCell.className = "calendar-day empty";
        dayCell.innerHTML = `
            <div class="day-header">
                <span class="day-number">${i}</span>
            </div>
            <div class="calendar-day-tasks-list"></div>
        `;
        daysGrid.appendChild(dayCell);
    }
}

function renderCalendarTimeline(prefix, tasksList) {
    const timelineContainer = document.getElementById(`${prefix}-calendar-mobile-timeline`);
    if (!timelineContainer) return;
    timelineContainer.innerHTML = "";

    const monthPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;
    const monthTasks = tasksList.filter(t => t.deadline.startsWith(monthPrefix));

    if (monthTasks.length === 0) {
        timelineContainer.innerHTML = `
            <div class="timeline-empty-state">
                <i data-lucide="calendar-off"></i>
                <p>ไม่มีงานที่มีกำหนดส่งในเดือนนี้</p>
            </div>
        `;
        return;
    }

    monthTasks.sort((a, b) => a.deadline.localeCompare(b.deadline));

    const groupedTasks = {};
    monthTasks.forEach(task => {
        if (!groupedTasks[task.deadline]) {
            groupedTasks[task.deadline] = [];
        }
        groupedTasks[task.deadline].push(task);
    });

    const todayStr = getLocalDateString();

    Object.keys(groupedTasks).forEach(dateStr => {
        const dateTasks = groupedTasks[dateStr];
        const isToday = dateStr === todayStr;

        const timelineGroup = document.createElement("div");
        timelineGroup.className = "timeline-group";

        const marker = document.createElement("div");
        marker.className = "timeline-date-marker";
        marker.innerHTML = `
            <div class="timeline-dot"></div>
            <span class="timeline-date-text${isToday ? ' is-today' : ''}">
                ${isToday ? 'วันนี้ (Today) - ' : ''}${formatDate(dateStr)}
            </span>
        `;
        timelineGroup.appendChild(marker);

        const cardsContainer = document.createElement("div");
        cardsContainer.className = "timeline-cards-container";

        dateTasks.forEach(task => {
            const card = document.createElement("div");
            const statusClass = `card-${getStatusId(task.status)}`;
            card.className = `timeline-card ${statusClass}`;
            card.onclick = () => openDetailModal(task.id);

            const isOverdue = isTaskOverdue(task);
            const overdueLabel = isOverdue 
                ? `<span class="overdue-danger" style="font-size:0.7rem;margin-left:0.5rem;"><i data-lucide="alert-circle" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:2px;"></i> เกินเวลา</span>` 
                : "";

            const budgetLabel = task.budget > 0 
                ? `<span class="tag tag-budget" style="font-size:0.65rem;margin-right:0.25rem;">฿${Number(task.budget).toLocaleString('th-TH')}</span>` 
                : "";

            card.innerHTML = `
                <div class="timeline-card-header">
                    <h4 class="timeline-card-title">${escapeHTML(task.name)}</h4>
                    <span class="badge badge-${getStatusId(task.status)}">${escapeHTML(normalizeStatus(task.status))}</span>
                </div>
                <p class="timeline-card-desc">${escapeHTML(task.description || "ไม่มีรายละเอียดเพิ่มเติม")}</p>
                <div class="timeline-card-footer">
                    <div class="timeline-card-assignee">
                        <div class="avatar-mini" style="width:18px;height:18px;font-size:0.6rem;">${escapeHTML(toText(task.assignee).substring(0, 1))}</div>
                        <span>${escapeHTML(task.assignee)}</span>
                    </div>
                    <div>
                        ${budgetLabel}
                        ${overdueLabel}
                    </div>
                </div>
            `;
            cardsContainer.appendChild(card);
        });

        timelineGroup.appendChild(cardsContainer);
        timelineContainer.appendChild(timelineGroup);
    });
}

// Normalize status values to support bilingual or raw database imports
function normalizeStatus(status) {
    if (!status) return "Todo";
    const s = String(status).trim();
    if (s.startsWith("Todo") || s.includes("สิ่งที่ต้องทำ")) return "Todo";
    if (s.startsWith("In Progress") || s.includes("กำลังทำ") || s.includes("กำลังดำเนินการ")) return "In Progress";
    if (s.startsWith("Review") || s.includes("รอตรวจงาน")) return "Review";
    if (s.startsWith("Done") || s.includes("เสร็จสิ้น")) return "Done";
    return s;
}

// Get DOM ID / CSS class identifier for a status
function getStatusId(status) {
    const norm = normalizeStatus(status);
    if (norm === "Todo") return "todo";
    if (norm === "In Progress") return "progress";
    if (norm === "Review") return "review";
    if (norm === "Done") return "done";
    return "todo";
}

// Check if a task is overdue
function isTaskOverdue(task) {
    if (normalizeStatus(task.status) === "Done") return false;
    const todayStr = getLocalDateString();
    return toText(task.deadline) < todayStr;
}

// Formatting utilities
function formatDate(dateString) {
    if (!dateString) return "-";
    const parts = dateString.split("-");
    if (parts.length !== 3) return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return "฿0";
    return "฿" + Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ==========================================================================
// 1. SUPERVISOR RENDERERS & ACTIONS
// ==========================================================================
function calculateMetrics() {
    const total = tasks.length;
    const todo = tasks.filter(t => normalizeStatus(t.status) === "Todo").length;
    const progress = tasks.filter(t => normalizeStatus(t.status) === "In Progress").length;
    const review = tasks.filter(t => normalizeStatus(t.status) === "Review").length;
    const done = tasks.filter(t => normalizeStatus(t.status) === "Done").length;
    
    const totalBudget = tasks.reduce((sum, t) => sum + (Number(t.budget) || 0), 0);
    const overdue = tasks.filter(isTaskOverdue).length;

    document.getElementById("stat-total-tasks").textContent = total;
    document.getElementById("stat-progress-tasks").textContent = progress;
    document.getElementById("stat-review-tasks").textContent = review;
    document.getElementById("stat-done-tasks").textContent = done;
    document.getElementById("stat-total-budget").textContent = formatCurrency(totalBudget);
    
    const overdueEl = document.getElementById("stat-overdue-tasks");
    overdueEl.textContent = overdue;
    if (overdue > 0) {
        overdueEl.closest(".metric-card").classList.add("bg-red-light");
    } else {
        overdueEl.closest(".metric-card").classList.remove("bg-red-light");
    }
}

function renderWorkloadList() {
    const workloadContainer = document.getElementById("workload-container");
    workloadContainer.innerHTML = "";

    const counts = {};
    employees.forEach(m => counts[m.name] = 0);
    
    tasks.forEach(task => {
        if (task.assignee && counts[task.assignee] !== undefined) {
            counts[task.assignee]++;
        }
    });

    const maxTasks = Math.max(...Object.values(counts), 1);
    const sortedMembers = [...employees].sort((a, b) => counts[b.name] - counts[a.name]);

    sortedMembers.forEach(member => {
        const count = counts[member.name];
        const percent = (count / maxTasks) * 100;

        const item = document.createElement("div");
        item.className = "workload-item";
        item.innerHTML = `
            <div class="workload-label-flex">
                <span class="workload-name">${escapeHTML(member.name)} <span style="font-size:0.75rem; color:var(--text-muted);">(${escapeHTML(member.code)})</span></span>
                <span class="workload-count">${count} งาน</span>
            </div>
            <div class="workload-progress-bar-container">
                <div class="workload-progress-bar-fill" style="width: ${percent}%"></div>
            </div>
        `;
        workloadContainer.appendChild(item);
    });
}

function renderTasksTable() {
    const searchVal = document.getElementById("task-search").value.toLowerCase();
    const assigneeVal = document.getElementById("filter-assignee").value;
    const statusVal = document.getElementById("filter-status").value;
    const tbody = document.getElementById("tasks-table-body");
    const noTasksMsg = document.getElementById("no-tasks-message");

    tbody.innerHTML = "";

    const filteredTasks = tasks.filter(task => {
        const taskName = toText(task.name).toLowerCase();
        const taskDescription = toText(task.description).toLowerCase();
        const matchesSearch = taskName.includes(searchVal) || taskDescription.includes(searchVal);
        const matchesAssignee = assigneeVal === "all" || task.assignee === assigneeVal;
        const matchesStatus = statusVal === "all" || normalizeStatus(task.status) === statusVal;

        return matchesSearch && matchesAssignee && matchesStatus;
    });

    if (filteredTasks.length === 0) {
        noTasksMsg.classList.remove("hidden");
    } else {
        noTasksMsg.classList.add("hidden");
        filteredTasks.sort((a, b) => a.deadline.localeCompare(b.deadline));

        filteredTasks.forEach(task => {
            const tr = document.createElement("tr");
            tr.onclick = () => openDetailModal(task.id);
            
            const overdueSpan = isTaskOverdue(task) 
                ? `<span class="badge badge-overdue"><i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> เกินกำหนด</span>` 
                : "";

            const normStatus = normalizeStatus(task.status);
            const statusClass = `badge-${getStatusId(task.status)}`;
            const taskId = toText(task.id);
            const statusLabelMap = {
                "Todo": "Todo (สิ่งที่ต้องทำ)",
                "In Progress": "In Progress (กำลังทำ)",
                "Review": "Review (รอตรวจงาน)",
                "Done": "Done (เสร็จสิ้น)"
            };

            tr.innerHTML = `
                <td>
                    <div class="task-name-cell">${escapeHTML(task.name)}</div>
                    <span class="task-desc-subtext">${escapeHTML(task.description || "ไม่มีรายละเอียดเพิ่มเติม")}</span>
                </td>
                <td>
                    <div class="assignee-cell-flex">
                        <div class="avatar-mini">${escapeHTML(toText(task.assignee).substring(0, 1))}</div>
                        <span>${escapeHTML(task.assignee)}</span>
                    </div>
                </td>
                <td>
                    <span class="${isTaskOverdue(task) ? 'overdue-danger' : ''}">${formatDate(task.deadline)}</span>
                    ${overdueSpan}
                </td>
                <td class="text-semibold">${formatCurrency(task.budget)}</td>
                <td>
                    <span class="badge ${statusClass}">${statusLabelMap[normStatus] || normStatus}</span>
                </td>
                <td class="actions-cell">
                    <button class="btn-edit-icon" type="button" title="แก้ไขงาน">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn-danger-icon" type="button" title="ลบงาน">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            `;
            tr.querySelector(".actions-cell").addEventListener("click", event => event.stopPropagation());
            tr.querySelector(".btn-edit-icon").addEventListener("click", () => openEditTaskModal(taskId));
            tr.querySelector(".btn-danger-icon").addEventListener("click", () => deleteTask(taskId));
            tbody.appendChild(tr);
        });
    }
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================================================
// 2. MEMBER RENDERERS (KANBAN BOARD)
// ==========================================================================
function renderMemberHeader(memberName) {
    document.getElementById("member-board-title").textContent = `บอร์ดงานของ ${memberName}`;
    document.getElementById("member-board-subtitle").textContent = `จัดการงาน แลกเปลี่ยนข้อมูล ปรับปรุงแก้ไขปัญหาของคุณ และรายงานผลโครงการ`;
    
    const avatarEl = document.getElementById("member-avatar");
    avatarEl.textContent = memberName.substring(0, 1);
    
    let hash = 0;
    for (let i = 0; i < memberName.length; i++) {
        hash = memberName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ["#059669", "#10b981", "#34d399", "#047857", "#0d9488", "#14b8a6", "#15803d", "#16a34a", "#22c55e"];
    const colorIndex = Math.abs(hash) % colors.length;
    avatarEl.style.backgroundColor = colors[colorIndex];
}

function renderKanbanBoard(memberName) {
    const columns = ["Todo", "In Progress", "Review", "Done"];
    const memberTasks = tasks.filter(t => t.assignee === memberName);

    columns.forEach(col => {
        const colId = getStatusId(col);
        const colCardsContainer = document.getElementById(`cards-${colId}`);
        const colCountEl = document.getElementById(`count-${colId}`);
        colCardsContainer.innerHTML = "";

        const colTasks = memberTasks.filter(t => normalizeStatus(t.status) === col);
        colCountEl.textContent = colTasks.length;

        colTasks.forEach(task => {
            const card = document.createElement("div");
            card.className = "task-card";
            card.draggable = true;
            card.id = `card_${task.id}`;
            const taskId = toText(task.id);
            
            card.addEventListener("dragstart", (e) => {
                draggedTaskId = task.id;
                card.classList.add("dragging");
                e.dataTransfer.setData("text/plain", task.id);
            });
            card.addEventListener("dragend", () => {
                card.classList.remove("dragging");
                document.querySelectorAll(".column-cards").forEach(el => el.classList.remove("drag-over"));
            });

            const overdueBadge = isTaskOverdue(task) 
                ? `<span class="tag bg-red-light color-red text-semibold"><i data-lucide="alert-circle" style="width:12px;height:12px;vertical-align:middle;display:inline-block;margin-right:2px;"></i> เกินเวลา</span>` 
                : "";

            const budgetTag = task.budget > 0 
                ? `<span class="tag tag-budget">฿${Number(task.budget).toLocaleString('th-TH')}</span>` 
                : "";

            card.innerHTML = `
                <div class="task-card-detail-trigger">
                    <div class="card-title-area">
                        <h4>${escapeHTML(task.name)}</h4>
                    </div>
                    <p class="card-desc">${escapeHTML(task.description || "ไม่มีรายละเอียดเพิ่มเติม")}</p>
                    <div class="card-tags">
                        ${budgetTag}
                        <span class="tag tag-date">เริ่ม: ${formatDate(task.createdDate)}</span>
                    </div>
                    <div class="card-footer">
                        <div class="card-deadline-flex ${isTaskOverdue(task) ? 'overdue-danger' : 'color-dark-grey'}">
                            <i data-lucide="calendar"></i>
                            <span>ส่ง: ${formatDate(task.deadline)}</span>
                        </div>
                        ${overdueBadge}
                    </div>
                </div>
                <div class="task-card-actions" style="position: absolute; right: 8px; bottom: 8px; z-index: 10;">
                    <button class="action-dot" type="button" title="แก้ไขงาน">
                        <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            `;
            card.querySelector(".task-card-detail-trigger").addEventListener("click", () => openDetailModal(taskId));
            card.querySelector(".task-card-actions").addEventListener("click", event => event.stopPropagation());
            card.querySelector(".action-dot").addEventListener("click", () => openEditTaskModal(taskId));
            colCardsContainer.appendChild(card);
        });
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================================================
// DRAG AND DROP HANDLERS
// ==========================================================================
function allowDrop(e) {
    e.preventDefault();
    const container = e.currentTarget;
    container.classList.add("drag-over");
}

document.querySelectorAll(".column-cards").forEach(container => {
    container.addEventListener("dragleave", (e) => {
        e.currentTarget.classList.remove("drag-over");
    });
});

async function dropTask(e) {
    e.preventDefault();
    const container = e.currentTarget;
    container.classList.remove("drag-over");

    const parentColumn = container.closest(".kanban-column");
    const targetStatus = parentColumn.getAttribute("data-status");
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    
    if (taskId) {
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1 && normalizeStatus(tasks[taskIndex].status) !== targetStatus) {
            tasks[taskIndex].status = targetStatus;
            saveTasksToLocalBackup();
            
            const synced = await apiUpdateTask(tasks[taskIndex]);
            if (!synced) notifyCloudSyncFailure("สถานะงาน");
            
            const activeMember = currentRole.replace("member_", "");
            renderKanbanBoard(activeMember);
        }
    }
    draggedTaskId = null;
}

// ==========================================================================
// TASK CREATION / EDITING ACTIONS
// ==========================================================================
function openAddTaskModal() {
    document.getElementById("modal-title").textContent = "สร้างงานใหม่ (Add New Task)";
    document.getElementById("task-form").reset();
    document.getElementById("task-id").value = "";
    
    const today = getLocalDateString();
    document.getElementById("task-created-input").value = today;
    document.getElementById("task-deadline-input").value = today;

    const assigneeSelect = document.getElementById("task-assignee-input");
    assigneeSelect.disabled = false;
    assigneeSelect.value = employees[0]?.name || "";
    document.getElementById("task-status-input").value = "Todo";

    document.getElementById("task-modal").classList.add("active");
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function openAddTaskModalForCurrentMember() {
    openAddTaskModal();
    const activeMember = currentRole.replace("member_", "");
    const assigneeSelect = document.getElementById("task-assignee-input");
    assigneeSelect.value = activeMember;
    assigneeSelect.disabled = true;
}

function openEditTaskModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById("modal-title").textContent = "แก้ไขงาน (Edit Task)";
    document.getElementById("task-id").value = task.id;
    document.getElementById("task-name-input").value = task.name;
    document.getElementById("task-desc-input").value = task.description || "";
    
    const assigneeSelect = document.getElementById("task-assignee-input");
    assigneeSelect.value = task.assignee;
    assigneeSelect.disabled = currentRole !== "supervisor";

    document.getElementById("task-budget-input").value = task.budget || 0;
    document.getElementById("task-created-input").value = task.createdDate;
    document.getElementById("task-deadline-input").value = task.deadline;
    document.getElementById("task-status-input").value = normalizeStatus(task.status);
    document.getElementById("task-corrective-input").value = task.correctiveAction || "";
    document.getElementById("task-remark-input").value = task.remark || "";

    closeDetailModal();
    document.getElementById("task-modal").classList.add("active");
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function closeTaskModal() {
    document.getElementById("task-modal").classList.remove("active");
}

async function saveTask(e) {
    e.preventDefault();
    
    const id = document.getElementById("task-id").value;
    const name = document.getElementById("task-name-input").value.trim();
    const description = document.getElementById("task-desc-input").value.trim();
    const assignee = document.getElementById("task-assignee-input").value;
    const budget = Number(document.getElementById("task-budget-input").value) || 0;
    const createdDate = document.getElementById("task-created-input").value;
    const deadline = document.getElementById("task-deadline-input").value;
    const status = document.getElementById("task-status-input").value;
    const correctiveAction = document.getElementById("task-corrective-input").value.trim();
    const remark = document.getElementById("task-remark-input").value.trim();

    if (!name || !assignee || !createdDate || !deadline || !status) {
        alert("กรุณากรอกข้อมูลสำคัญที่มีสัญลักษณ์ดอกจัน (*) ให้ครบถ้วน");
        return;
    }

    if (id) {
        // Edit Existing Task
        const taskIdx = tasks.findIndex(t => t.id === id);
        if (taskIdx !== -1) {
            tasks[taskIdx] = {
                ...tasks[taskIdx],
                name,
                description,
                assignee,
                budget,
                createdDate,
                deadline,
                status,
                correctiveAction,
                remark
            };
            saveTasksToLocalBackup();
            
            const synced = await apiUpdateTask(tasks[taskIdx]);
            if (!synced) notifyCloudSyncFailure("การแก้ไขงาน");
        }
    } else {
        // Create New Task
        const newTask = {
            id: "task_" + Date.now(),
            name,
            description,
            assignee,
            budget,
            createdDate,
            deadline,
            status,
            correctiveAction,
            remark
        };
        tasks.push(newTask);
        saveTasksToLocalBackup();
        
        const synced = await apiCreateTask(newTask);
        if (!synced) notifyCloudSyncFailure("งานใหม่");
    }

    closeTaskModal();
    renderApp();
}

async function deleteTask(taskId) {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบงานนี้อย่างถาวร?")) {
        tasks = tasks.filter(t => t.id !== taskId);
        saveTasksToLocalBackup();
        
        const synced = await apiDeleteTask(taskId);
        if (!synced) notifyCloudSyncFailure("การลบงาน");
        renderApp();
    }
}

// ==========================================================================
// TASK DETAIL POPUP VIEW
// ==========================================================================
function openDetailModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById("detail-title").textContent = task.name;
    document.getElementById("detail-assignee").textContent = task.assignee;
    document.getElementById("detail-budget").textContent = formatCurrency(task.budget);
    document.getElementById("detail-created").textContent = formatDate(task.createdDate);
    document.getElementById("detail-deadline").textContent = formatDate(task.deadline);
    document.getElementById("detail-desc").textContent = task.description || "ไม่มีรายละเอียดเพิ่มเติม";
    
    const badge = document.getElementById("detail-status-badge");
    badge.className = "badge";
    
    const normStatus = normalizeStatus(task.status);
    const statusClass = `badge-${getStatusId(task.status)}`;
    badge.classList.add(statusClass);
    
    const statusLabelMap = {
        "Todo": "Todo (สิ่งที่ต้องทำ)",
        "In Progress": "In Progress (กำลังทำ)",
        "Review": "Review (รอตรวจงาน)",
        "Done": "Done (เสร็จสิ้น)"
    };
    badge.textContent = statusLabelMap[normStatus] || normStatus;

    const overdueBadge = document.getElementById("detail-overdue-badge");
    if (isTaskOverdue(task)) {
        overdueBadge.classList.remove("hidden");
    } else {
        overdueBadge.classList.add("hidden");
    }

    const correctiveActionEl = document.getElementById("detail-corrective");
    correctiveActionEl.textContent = task.correctiveAction || "ไม่มีข้อมูลแนวทางการแก้ไข";
    if (task.correctiveAction) {
        correctiveActionEl.classList.add("corrective-highlight");
    } else {
        correctiveActionEl.classList.remove("corrective-highlight");
    }

    document.getElementById("detail-remark").textContent = task.remark || "ไม่มีหมายเหตุเพิ่มเติม";

    const editBtn = document.getElementById("detail-edit-btn");
    editBtn.onclick = () => openEditTaskModal(task.id);

    const fastActionsContainer = document.getElementById("detail-fast-actions");
    fastActionsContainer.innerHTML = "";
    
    const statuses = ["Todo", "In Progress", "Review", "Done"];
    statuses.forEach(st => {
        if (st !== normStatus) {
            const btn = document.createElement("button");
            const labelMap = {
                "Todo": "Todo",
                "In Progress": "Progress",
                "Review": "Review",
                "Done": "Done"
            };

            const statusId = getStatusId(st);
            btn.className = `btn-fast-status btn-fast-${statusId}`;
            btn.textContent = `ย้ายไป ${labelMap[st]}`;
            btn.onclick = () => {
                updateTaskStatusDirectly(task.id, st);
                closeDetailModal();
            };
            fastActionsContainer.appendChild(btn);
        }
    });

    document.getElementById("detail-modal").classList.add("active");
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function closeDetailModal() {
    document.getElementById("detail-modal").classList.remove("active");
}

async function updateTaskStatusDirectly(taskId, newStatus) {
    const taskIdx = tasks.findIndex(t => t.id === taskId);
    if (taskIdx !== -1) {
        tasks[taskIdx].status = newStatus;
        saveTasksToLocalBackup();
        
        const synced = await apiUpdateTask(tasks[taskIdx]);
        if (!synced) notifyCloudSyncFailure("สถานะงาน");
        renderApp();
    }
}

// ==========================================================================
// D1 API INTERACTION FOR EMPLOYEES
// ==========================================================================
async function apiCreateEmployee(employee) {
    try {
        const response = await fetch("/api/employees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(employee)
        });
        if (!response.ok) throw new Error(`Save employee failed: ${response.status}`);
        return true;
    } catch (err) {
        console.error("❌ ไม่สามารถเพิ่ม/แก้ไขพนักงานบน D1 ได้:", err);
        return false;
    }
}

async function apiDeleteEmployee(code) {
    try {
        const response = await fetch(`/api/employees?code=${encodeURIComponent(code)}`, {
            method: "DELETE"
        });
        if (!response.ok) throw new Error(`Delete employee failed: ${response.status}`);
        return true;
    } catch (err) {
        console.error("❌ ไม่สามารถลบพนักงานบน D1 ได้:", err);
        return false;
    }
}

// ==========================================================================
// EMPLOYEE MODAL UI ACTIONS
// ==========================================================================
function openEmployeeModal() {
    document.getElementById("employee-form").reset();
    renderEmployeeTable();
    document.getElementById("employee-modal").classList.add("active");
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function closeEmployeeModal() {
    document.getElementById("employee-modal").classList.remove("active");
}

function renderEmployeeTable() {
    const tbody = document.getElementById("employee-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    employees.forEach(emp => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--primary-medium);">${escapeHTML(emp.code)}</td>
            <td>${escapeHTML(emp.name)}</td>
            <td class="actions-cell">
                <button class="btn-danger-icon" type="button" title="ลบพนักงาน">
                    <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                </button>
            </td>
        `;
        tr.querySelector(".btn-danger-icon").addEventListener("click", () => deleteEmployee(emp.code, emp.name));
        tbody.appendChild(tr);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

async function saveEmployee(e) {
    e.preventDefault();
    const code = document.getElementById("emp-code-input").value.trim().toUpperCase();
    const name = document.getElementById("emp-name-input").value.trim();

    if (!code || !name) {
        alert("กรุณากรอกรหัสพนักงานและชื่อพนักงานให้ครบถ้วน");
        return;
    }

    const existingIdx = employees.findIndex(emp => emp.code === code);
    const newEmp = { code, name };

    if (existingIdx !== -1) {
        employees[existingIdx] = newEmp;
    } else {
        const nameExists = employees.some(emp => emp.name === name);
        if (nameExists) {
            alert(`ชื่อพนักงาน "${name}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่นหรือเติมรหัสนามสกุลสั้นเพื่อป้องกันความสับสน`);
            return;
        }
        employees.push(newEmp);
    }

    // Clear form
    document.getElementById("employee-form").reset();

    const synced = await apiCreateEmployee(newEmp);
    if (!synced) notifyCloudSyncFailure("ข้อมูลพนักงาน");

    // Refresh UI
    renderEmployeeTable();
    populateSelectOptions();
    renderApp();
}

async function deleteEmployee(code, name) {
    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบพนักงาน ${name} (${code}) ออกจากระบบ?\n*การลบนี้จะไม่ลบตัวงานของพนักงานออก*`)) {
        employees = employees.filter(emp => emp.code !== code);
        
        const synced = await apiDeleteEmployee(code);
        if (!synced) notifyCloudSyncFailure("การลบพนักงาน");

        // Refresh UI
        renderEmployeeTable();
        populateSelectOptions();
        renderApp();
    }
}
