/**
 * Chelan High School - Student Kiosk Engine (app.js)
 */

import { APP_CONFIG, formatTime } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, remove, push, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// State Variables
let currentMode = "phone"; // 'phone', 'bathroom', 'hall'
let selectedPocket = null;
let rosterData = {};
let checkedInPhones = {};
let activePasses = {};

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupTabs();
  setupSubmit();
  renderPocketGrid();
  attachFirebaseListeners();

  // Focus input automatically
  const input = document.getElementById("id-input");
  if (input) input.focus();
});

// Live Clock
function initClock() {
  const clockEl = document.getElementById("kiosk-clock");
  if (!clockEl) return;
  const update = () => {
    clockEl.textContent = formatTime(new Date());
  };
  setInterval(update, 1000);
  update();
}

// Firebase Realtime Listeners
function attachFirebaseListeners() {
  onValue(ref(db, "roster"), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
  });

  onValue(ref(db, "checkedInPhones"), (snapshot) => {
    checkedInPhones = snapshot.exists() ? snapshot.val() : {};
    updateHeaderCounters();
    renderPocketGrid();
  });

  onValue(ref(db, "activePasses"), (snapshot) => {
    activePasses = snapshot.exists() ? snapshot.val() : {};
    updateHeaderCounters();
  });
}

// Update Header Counters
function updateHeaderCounters() {
  const rackEl = document.getElementById("rack-count");
  const bathEl = document.getElementById("bathroom-count");
  const hallEl = document.getElementById("hall-count");

  const phoneCount = Object.keys(checkedInPhones).length;
  const bathCount = Object.values(activePasses).filter(p => p.type === "bathroom").length;
  const hallCount = Object.values(activePasses).filter(p => p.type === "hall").length;

  if (rackEl) rackEl.textContent = phoneCount;
  if (bathEl) bathEl.textContent = `${bathCount}/${APP_CONFIG.passLimits.bathroom}`;
  if (hallEl) hallEl.textContent = hallCount;
}

// Setup Mode Tabs
function setupTabs() {
  const tabPhone = document.getElementById("tab-phone");
  const tabBathroom = document.getElementById("tab-bathroom");
  const tabHall = document.getElementById("tab-hall");

  if (tabPhone) tabPhone.addEventListener("click", () => setMode("phone"));
  if (tabBathroom) tabBathroom.addEventListener("click", () => setMode("bathroom"));
  if (tabHall) tabHall.addEventListener("click", () => setMode("hall"));
}

function setMode(mode) {
  currentMode = mode;

  const card = document.getElementById("kiosk-card");
  const badge = document.getElementById("mode-badge");
  const heading = document.getElementById("mode-heading");
  const subtitle = document.getElementById("mode-subtitle");
  const submitBtn = document.getElementById("btn-submit");
  const pocketSection = document.getElementById("pocket-section");

  const tabPhone = document.getElementById("tab-phone");
  const tabBathroom = document.getElementById("tab-bathroom");
  const tabHall = document.getElementById("tab-hall");

  // Reset tab button styles
  [tabPhone, tabBathroom, tabHall].forEach(t => {
    if (t) t.className = "flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
  });

  if (mode === "phone") {
    card.style.borderColor = "#0B4F2C";
    badge.className = "bg-emerald-100 text-[#0B4F2C] text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full border border-emerald-300 mb-3";
    badge.textContent = "PHONE CHECK-IN / OUT";
    heading.textContent = "Scan/Enter Student Barcode or ID";
    subtitle.textContent = "Scan student ID card or manually enter ID, then select a chosen pocket slot.";
    tabPhone.className = "flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 bg-[#0B4F2C] text-white shadow-sm";
    submitBtn.style.backgroundColor = "#0B4F2C";
    pocketSection.classList.remove("hidden");
  } else if (mode === "bathroom") {
    card.style.borderColor = "#b91c1c"; // Red accent
    badge.className = "bg-rose-100 text-rose-800 text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full border border-rose-300 mb-3";
    badge.textContent = `BATHROOM PASS (STRICT LIMIT: ${APP_CONFIG.passLimits.bathroom} STUDENT)`;
    heading.textContent = "Scan/Enter ID for Bathroom Pass";
    subtitle.textContent = `Only ${APP_CONFIG.passLimits.bathroom} student permitted out at a time. Requires phone checked in.`;
    tabBathroom.className = "flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 bg-rose-700 text-white shadow-sm";
    submitBtn.style.backgroundColor = "#b91c1c";
    pocketSection.classList.add("hidden");
  } else if (mode === "hall") {
    card.style.borderColor = "#4338ca"; // Indigo accent
    badge.className = "bg-indigo-100 text-indigo-800 text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full border border-indigo-300 mb-3";
    badge.textContent = "HALL PASS / ACTIVITY OUT";
    heading.textContent = "Scan/Enter ID for Hall Pass";
    subtitle.textContent = "For library, office, nurse, or errant tasks. Requires phone checked in.";
    tabHall.className = "flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 bg-indigo-700 text-white shadow-sm";
    submitBtn.style.backgroundColor = "#4338ca";
    pocketSection.classList.add("hidden");
  }

  const input = document.getElementById("id-input");
  if (input) input.focus();
}

// Render 1–36 Pocket Selection Grid
function renderPocketGrid() {
  const grid = document.getElementById("pocket-grid");
  const slotBadge = document.getElementById("chosen-slot-badge");
  if (!grid) return;

  grid.innerHTML = "";

  if (slotBadge) {
    slotBadge.textContent = selectedPocket ? `Chosen Slot: Pocket #${selectedPocket.padStart(2, '0')}` : "Chosen Slot: None Selected";
  }

  for (let i = 1; i <= APP_CONFIG.pocketCount; i++) {
    const pocketNum = i.toString();
    const pocketPadded = pocketNum.padStart(2, '0');
    const isOccupied = !!checkedInPhones[pocketNum];
    const isSelected = selectedPocket === pocketNum;

    const btn = document.createElement("button");
    btn.type = "button";

    if (isOccupied) {
      btn.className = "flex flex-col items-center justify-center p-2 rounded-xl bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed select-none";
      btn.innerHTML = `
        <span class="text-xs font-black font-mono">${pocketPadded}</span>
        <span class="text-[8px] font-bold uppercase tracking-tighter">TAKEN</span>
      `;
      btn.disabled = true;
    } else if (isSelected) {
      btn.className = "flex flex-col items-center justify-center p-2 rounded-xl bg-[#0B4F2C] text-white border-2 border-emerald-400 shadow-md transform scale-105 transition cursor-pointer";
      btn.innerHTML = `
        <span class="text-xs font-black font-mono">${pocketPadded}</span>
        <span class="text-[8px] font-extrabold uppercase tracking-tighter text-amber-300">SELECTED</span>
      `;
    } else {
      btn.className = "flex flex-col items-center justify-center p-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 font-bold shadow-sm transition hover:scale-105 cursor-pointer";
      btn.innerHTML = `
        <span class="text-xs font-mono font-black">${pocketPadded}</span>
      `;
    }

    btn.addEventListener("click", () => {
      if (!isOccupied) {
        selectedPocket = isSelected ? null : pocketNum;
        renderPocketGrid();
      }
    });

    grid.appendChild(btn);
  }
}

// Form Submission Setup
function setupSubmit() {
  const submitBtn = document.getElementById("btn-submit");
  const input = document.getElementById("id-input");

  if (submitBtn) {
    submitBtn.addEventListener("click", processEntry);
  }

  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        processEntry();
      }
    });
  }
}

async function processEntry() {
  const input = document.getElementById("id-input");
  if (!input) return;

  const enteredID = input.value.trim();
  if (!enteredID) {
    showToast("Please scan or enter your Student ID.", "warning");
    return;
  }

  const student = rosterData[enteredID];
  const studentName = student ? `${student.firstName} ${student.lastName}` : `ID ${enteredID}`;

  if (currentMode === "phone") {
    await handlePhoneAction(enteredID, student, studentName);
  } else if (currentMode === "bathroom" || currentMode === "hall") {
    await handlePassAction(enteredID, student, studentName, currentMode);
  }

  input.value = "";
  input.focus();
}

// Phone Check-In / Check-Out Logic
async function handlePhoneAction(id, student, studentName) {
  // Check if student already has a phone checked in
  let existingPocket = null;
  for (const [pNum, record] of Object.entries(checkedInPhones)) {
    if (record.id === id) {
      existingPocket = pNum;
      break;
    }
  }

  if (existingPocket) {
    // Check-out phone automatically
    await remove(ref(db, `checkedInPhones/${existingPocket}`));
    await push(ref(db, "logs"), {
      timestamp: serverTimestamp(),
      studentId: id,
      studentName: studentName,
      action: "PHONE_CHECKOUT",
      details: `Checked out phone from Pocket #${existingPocket}`
    });

    showToast(`Phone checked out from Pocket #${existingPocket}. Thanks, ${student ? student.firstName : 'Student'}!`, "success");
    return;
  }

  // Phone Check-In requires selecting a pocket
  if (!selectedPocket) {
    showToast("Please tap an open pocket slot (01–36) below.", "warning");
    return;
  }

  const payload = {
    id: id,
    firstName: student ? student.firstName : "Guest",
    lastName: student ? student.lastName : "Student",
    pocket: selectedPocket,
    timestamp: serverTimestamp()
  };

  await set(ref(db, `checkedInPhones/${selectedPocket}`), payload);
  await push(ref(db, "logs"), {
    timestamp: serverTimestamp(),
    studentId: id,
    studentName: studentName,
    action: "PHONE_CHECKIN",
    details: `Checked in phone to Pocket #${selectedPocket}`
  });

  showToast(`Phone checked in to Pocket #${selectedPocket}!`, "success");
  selectedPocket = null;
  renderPocketGrid();
}

// Pass Issue / Return Logic
async function handlePassAction(id, student, studentName, passType) {
  const existingPassKey = Object.keys(activePasses).find(k => activePasses[k].studentId === id);

  if (existingPassKey) {
    // Return Pass
    const pass = activePasses[existingPassKey];
    await remove(ref(db, `activePasses/${existingPassKey}`));
    await push(ref(db, "logs"), {
      timestamp: serverTimestamp(),
      studentId: id,
      studentName: studentName,
      action: "PASS_RETURN",
      details: `Returned ${pass.type.toUpperCase()} pass`
    });

    showToast(`Pass returned. Welcome back, ${student ? student.firstName : 'Student'}!`, "success");
    return;
  }

  // Capacity check
  const currentOutCount = Object.values(activePasses).filter(p => p.type === passType).length;
  const limit = passType === "bathroom" ? APP_CONFIG.passLimits.bathroom : APP_CONFIG.passLimits.hall;

  if (currentOutCount >= limit) {
    showToast(`Maximum limit reached for ${passType} passes (${limit}). Please wait!`, "error");
    return;
  }

  // Issue Pass
  const newPassRef = push(ref(db, "activePasses"));
  await set(newPassRef, {
    studentId: id,
    studentName: studentName,
    type: passType,
    startTime: serverTimestamp()
  });

  await push(ref(db, "logs"), {
    timestamp: serverTimestamp(),
    studentId: id,
    studentName: studentName,
    action: `PASS_${passType.toUpperCase()}`,
    details: `Issued ${passType.toUpperCase()} pass`
  });

  showToast(`${passType === "bathroom" ? "Bathroom" : "Hall"} Pass issued for ${studentName}!`, "success");
}

// Toast Feedback Overlay Helper
function showToast(message, type = "info") {
  const toast = document.getElementById("kiosk-toast");
  if (!toast) return;

  const bgColors = {
    success: "bg-emerald-700 text-white",
    warning: "bg-amber-500 text-slate-900",
    error: "bg-rose-700 text-white",
    info: "bg-blue-700 text-white"
  };

  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm border border-white/20 backdrop-blur-md transition-all duration-300 z-50 ${bgColors[type] || bgColors.info}`;
  toast.textContent = message;
  toast.classList.remove("hidden", "opacity-0");

  setTimeout(() => {
    toast.classList.add("opacity-0");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 3500);
}
