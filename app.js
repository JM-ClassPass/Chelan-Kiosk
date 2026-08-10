/**
 * Chelan High School - Student Kiosk Logic (app.js)
 */

import { APP_CONFIG, formatTime } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, remove, push, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// Local State
let enteredID = "";
let currentMode = "phone"; // Options: 'phone', 'bathroom', 'hall'
let selectedPocket = null;
let isMasked = true;

let rosterData = {};
let checkedInPhones = {};
let activePasses = {};

// Initialize Kiosk
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupKeypad();
  setupTabs();
  setupMaskToggle();
  renderPocketGrid();
  attachFirebaseListeners();
});

// Live Clock Helper
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
  // Sync Roster Data
  onValue(ref(db, "roster"), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
  });

  // Sync Phone Check-Ins
  onValue(ref(db, "checkedInPhones"), (snapshot) => {
    checkedInPhones = snapshot.exists() ? snapshot.val() : {};
    renderPocketGrid();
  });

  // Sync Active Passes
  onValue(ref(db, "activePasses"), (snapshot) => {
    activePasses = snapshot.exists() ? snapshot.val() : {};
  });
}

// Keypad Controls
function setupKeypad() {
  // Number Buttons 0-9
  for (let i = 0; i <= 9; i++) {
    const btn = document.getElementById(`btn-${i}`);
    if (btn) {
      btn.addEventListener("click", () => appendDigit(i.toString()));
    }
  }

  // Clear & Submit
  const clearBtn = document.getElementById("btn-clear");
  const submitBtn = document.getElementById("btn-submit");

  if (clearBtn) clearBtn.addEventListener("click", clearID);
  if (submitBtn) submitBtn.addEventListener("click", handleSubmit);

  // Physical Keyboard Input Support
  document.addEventListener("keydown", (e) => {
    if (e.key >= "0" && e.key <= "9") {
      appendDigit(e.key);
    } else if (e.key === "Backspace") {
      enteredID = enteredID.slice(0, -1);
      updateIDDisplay();
    } else if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      clearID();
    }
  });
}

function appendDigit(digit) {
  if (enteredID.length < 12) {
    enteredID += digit;
    updateIDDisplay();
  }
}

function clearID() {
  enteredID = "";
  updateIDDisplay();
}

function updateIDDisplay() {
  const display = document.getElementById("id-display");
  if (!display) return;

  if (enteredID.length === 0) {
    display.textContent = "• • • • • •";
    display.className = "text-2xl font-mono tracking-widest text-slate-400 select-none";
    return;
  }

  display.className = "text-3xl font-mono tracking-widest font-bold text-slate-900 select-none";
  if (isMasked) {
    display.textContent = "•".repeat(enteredID.length);
  } else {
    display.textContent = enteredID;
  }
}

function setupMaskToggle() {
  const toggleBtn = document.getElementById("toggle-mask-btn");
  if (!toggleBtn) return;

  toggleBtn.addEventListener("click", () => {
    isMasked = !isMasked;
    toggleBtn.innerHTML = isMasked 
      ? `<i class="fa-solid fa-eye"></i>` 
      : `<i class="fa-solid fa-eye-slash"></i>`;
    updateIDDisplay();
  });
}

// Mode Selection Tabs
function setupTabs() {
  const tabPhone = document.getElementById("tab-phone");
  const tabBathroom = document.getElementById("tab-bathroom");
  const tabHall = document.getElementById("tab-hall");

  if (tabPhone) {
    tabPhone.addEventListener("click", () => setMode("phone"));
  }
  if (tabBathroom) {
    tabBathroom.addEventListener("click", () => setMode("bathroom"));
  }
  if (tabHall) {
    tabHall.addEventListener("click", () => setMode("hall"));
  }
}

function setMode(mode) {
  currentMode = mode;
  const tabPhone = document.getElementById("tab-phone");
  const tabBathroom = document.getElementById("tab-bathroom");
  const tabHall = document.getElementById("tab-hall");

  // Reset Tab Styles
  [tabPhone, tabBathroom, tabHall].forEach(tab => {
    if (tab) {
      tab.className = "px-4 py-2.5 rounded-xl font-bold text-xs transition border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200";
    }
  });

  // Active Tab Highlight
  if (mode === "phone" && tabPhone) {
    tabPhone.className = "px-4 py-2.5 rounded-xl font-bold text-xs transition border border-emerald-500 bg-emerald-500 text-white shadow-md";
  } else if (mode === "bathroom" && tabBathroom) {
    tabBathroom.className = "px-4 py-2.5 rounded-xl font-bold text-xs transition border border-rose-500 bg-rose-500 text-white shadow-md";
  } else if (mode === "hall" && tabHall) {
    tabHall.className = "px-4 py-2.5 rounded-xl font-bold text-xs transition border border-purple-500 bg-purple-500 text-white shadow-md";
  }
}

// Render Pockets 1–36 Grid
function renderPocketGrid() {
  const grid = document.getElementById("pocket-grid");
  if (!grid) return;

  grid.innerHTML = "";

  for (let i = 1; i <= APP_CONFIG.pocketCount; i++) {
    const pocketNum = i.toString();
    const isOccupied = !!checkedInPhones[pocketNum];
    const student = isOccupied ? checkedInPhones[pocketNum] : null;
    const isSelected = selectedPocket === pocketNum;

    const btn = document.createElement("button");
    btn.type = "button";

    if (isOccupied) {
      btn.className = "flex flex-col items-center justify-center p-2 rounded-xl border border-slate-300 bg-slate-200 text-slate-500 cursor-not-allowed shadow-inner transition";
      btn.innerHTML = `
        <span class="text-xs font-black font-mono">${pocketNum}</span>
        <span class="text-[9px] truncate max-w-[50px] font-medium">${student.firstName || 'In Use'}</span>
      `;
      btn.disabled = true;
    } else if (isSelected) {
      btn.className = "flex flex-col items-center justify-center p-2 rounded-xl border-2 border-emerald-600 bg-emerald-500 text-white shadow-lg ring-2 ring-emerald-300 transition transform scale-105";
      btn.innerHTML = `
        <span class="text-sm font-black font-mono">${pocketNum}</span>
        <span class="text-[9px] font-bold uppercase tracking-wider">Selected</span>
      `;
    } else {
      btn.className = "flex flex-col items-center justify-center p-2 rounded-xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 font-mono font-bold shadow-sm transition hover:scale-105 cursor-pointer";
      btn.innerHTML = `
        <span class="text-sm font-black">${pocketNum}</span>
        <span class="text-[9px] text-emerald-600 font-semibold">Open</span>
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

// Handle Form Submission
async function handleSubmit() {
  if (!enteredID) {
    showToast("Please enter your Student ID.", "warning");
    return;
  }

  // Find Student in Roster
  const student = rosterData[enteredID];
  const studentName = student ? `${student.firstName} ${student.lastName}` : `ID ${enteredID}`;

  if (currentMode === "phone") {
    await handlePhoneAction(enteredID, student, studentName);
  } else if (currentMode === "bathroom" || currentMode === "hall") {
    await handlePassAction(enteredID, student, studentName, currentMode);
  }

  clearID();
}

// Action: Phone Check-In / Check-Out
async function handlePhoneAction(id, student, studentName) {
  // Check if student already checked in a phone
  let existingPocket = null;
  for (const [pNum, record] of Object.entries(checkedInPhones)) {
    if (record.id === id) {
      existingPocket = pNum;
      break;
    }
  }

  if (existingPocket) {
    // Check Out Phone
    await remove(ref(db, `checkedInPhones/${existingPocket}`));
    await push(ref(db, "logs"), {
      timestamp: serverTimestamp(),
      studentId: id,
      studentName: studentName,
      action: "PHONE_CHECKOUT",
      details: `Checked out phone from Pocket #${existingPocket}`
    });

    showToast(`Phone checked out from Pocket #${existingPocket}. Have a great day, ${student ? student.firstName : 'Student'}!`, "success");
    return;
  }

  // Check In Phone
  if (!selectedPocket) {
    showToast("Please select an available pocket number (1–36) on the right.", "warning");
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

// Action: Bathroom / Hall Pass
async function handlePassAction(id, student, studentName, passType) {
  const existingPassKey = Object.keys(activePasses).find(k => activePasses[k].studentId === id);

  if (existingPassKey) {
    // Return Active Pass
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

  // Check Capacity Limits
  const currentOutCount = Object.values(activePasses).filter(p => p.type === passType).length;
  const limit = passType === "bathroom" ? APP_CONFIG.passLimits.bathroom : APP_CONFIG.passLimits.hall;

  if (currentOutCount >= limit) {
    showToast(`Sorry, maximum limit for ${passType} passes (${limit}) reached. Please wait!`, "error");
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

// Toast Feedback Overlay
function showToast(message, type = "info") {
  const toast = document.getElementById("kiosk-toast");
  if (!toast) return;

  const bgColors = {
    success: "bg-emerald-600 text-white",
    warning: "bg-amber-500 text-slate-900",
    error: "bg-rose-600 text-white",
    info: "bg-blue-600 text-white"
  };

  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm border border-white/20 backdrop-blur-md transition-all duration-300 z-50 ${bgColors[type] || bgColors.info}`;
  toast.textContent = message;
  toast.classList.remove("hidden", "opacity-0");

  setTimeout(() => {
    toast.classList.add("opacity-0");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 3500);
}
