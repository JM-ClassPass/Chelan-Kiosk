/**
 * Chelan High School - Teacher Dashboard Engine (teacher.js)
 */

import { APP_CONFIG, formatTime } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, remove, push 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// Dashboard State
let rosterData = {};
let presentStudents = {};
let activePasses = {};
let runningLogs = [];
let sortMode = "last"; // "first" | "last" | "pocket"
let logSearchQuery = "";

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupQuickAdd();
  setupSortingToggles();
  setupCheckOutAll();
  setupSearchLog();
  attachFirebaseListeners();
});

// Realtime Header Clock
function initClock() {
  const clockEl = document.getElementById("roster-clock");
  if (!clockEl) return;
  const updateClock = () => {
    clockEl.textContent = formatTime(new Date());
  };
  setInterval(updateClock, 1000);
  updateClock();
}

// Realtime Firebase Synchronization
function attachFirebaseListeners() {
  // Roster Listener
  onValue(ref(db, "roster"), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
    renderCurrentlyInRoom();
  });

  // Present/Checked-in Students
  onValue(ref(db, "checkins"), (snapshot) => {
    presentStudents = snapshot.exists() ? snapshot.val() : {};
    renderCurrentlyInRoom();
    updateMetrics();
  });

  // Active Passes
  onValue(ref(db, "passes/active"), (snapshot) => {
    activePasses = snapshot.exists() ? snapshot.val() : {};
    renderPasses();
    updateMetrics();
  });

  // History/Running Logs
  onValue(ref(db, "logs"), (snapshot) => {
    const rawLogs = snapshot.exists() ? snapshot.val() : {};
    runningLogs = Object.values(rawLogs);
    renderRunningLog();
    updateMetrics();
  });
}

// Render "Currently In Room" Column
function renderCurrentlyInRoom() {
  const container = document.getElementById("in-room-list");
  const countEl = document.getElementById("in-room-count");
  if (!container) return;

  const entries = Object.entries(presentStudents);
  if (countEl) countEl.textContent = `${entries.length} Students`;

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 italic text-xs">
        No students currently checked into room.
      </div>
    `;
    return;
  }

  // Sort Student List
  entries.sort(([idA, sA], [idB, sB]) => {
    const studentA = rosterData[idA] || sA || {};
    const studentB = rosterData[idB] || sB || {};

    if (sortMode === "first") {
      return (studentA.firstName || "").localeCompare(studentB.firstName || "");
    } else if (sortMode === "pocket") {
      return (sA.pocketNumber || 0) - (sB.pocketNumber || 0);
    } else {
      return (studentA.lastName || "").localeCompare(studentB.lastName || "");
    }
  });

  container.innerHTML = entries.map(([id, data]) => {
    const student = rosterData[id] || data;
    const nameStr = `${student.firstName || ''} ${student.lastName || ''}`.trim() || `Student (${id})`;
    const pocketNum = data.pocketNumber || 1;

    return `
      <div class="bg-[#E8F5E9] border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between shadow-xs">
        <span class="font-bold text-slate-800 text-xs">${nameStr}</span>
        <div class="flex items-center gap-2">
          <span class="bg-emerald-200/80 text-emerald-900 text-xs font-bold px-2 py-0.5 rounded-md">
            ${pocketNum}
          </span>
          <button data-checkout-id="${id}" class="btn-checkout text-rose-400 hover:text-rose-600 font-bold text-sm leading-none">
            &times;
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach Checkout Click Event
  document.querySelectorAll(".btn-checkout").forEach(btn => {
    btn.onclick = async (e) => {
      const id = e.currentTarget.getAttribute("data-checkout-id");
      if (id) {
        await checkoutStudent(id);
      }
    };
  });
}

// Checkout Single Student
async function checkoutStudent(id) {
  const student = rosterData[id] || {};
  const nameStr = `${student.firstName || ''} ${student.lastName || ''}`.trim() || id;
  
  await remove(ref(db, `checkins/${id}`));
  
  // Log Action
  await push(ref(db, "logs"), {
    timestamp: Date.now(),
    studentName: nameStr,
    actionType: "Phone",
    actionDetails: "Phone Check-Out"
  });
}

// Render Bathroom & Hall Pass Sections
function renderPasses() {
  const bathroomContainer = document.getElementById("bathroom-pass-list");
  const hallContainer = document.getElementById("hall-pass-list");
  const bathroomBadge = document.getElementById("bathroom-pass-badge");
  const hallBadge = document.getElementById("hall-pass-badge");

  const passes = Object.entries(activePasses);
  const bathroomList = passes.filter(([_, p]) => p.type === "Bathroom" || p.reason === "Bathroom" || p.reason === "Restroom");
  const hallList = passes.filter(([_, p]) => p.type !== "Bathroom" && p.reason !== "Bathroom" && p.reason !== "Restroom");

  if (bathroomBadge) bathroomBadge.textContent = `${bathroomList.length}/1 Out`;
  if (hallBadge) hallBadge.textContent = `${hallList.length} Out`;

  // Render Bathroom
  if (bathroomContainer) {
    bathroomContainer.innerHTML = bathroomList.length === 0 
      ? `<p class="pt-1 text-xs text-slate-400 italic">No students out.</p>` 
      : bathroomList.map(([id, p]) => renderPassItem(id, p)).join('');
  }

  // Render Hall Pass
  if (hallContainer) {
    hallContainer.innerHTML = hallList.length === 0 
      ? `<p class="pt-1 text-xs text-slate-400 italic">No students out.</p>` 
      : hallList.map(([id, p]) => renderPassItem(id, p)).join('');
  }
}

function renderPassItem(id, pass) {
  const student = rosterData[id] || {};
  const nameStr = `${student.firstName || ''} ${student.lastName || ''}`.trim() || pass.studentName || id;

  return `
    <div class="bg-rose-50 border border-rose-200 rounded-xl p-2.5 flex items-center justify-between mb-1.5">
      <span class="font-bold text-slate-800 text-xs">${nameStr}</span>
      <button onclick="endPass('${id}')" class="text-xs bg-rose-600 text-white font-bold px-2 py-1 rounded-md">
        Return
      </button>
    </div>
  `;
}

// Render Running Log Table
function renderRunningLog() {
  const container = document.getElementById("running-log-list");
  const countBadge = document.getElementById("log-count-badge");
  if (!container) return;

  // Filter Logs
  const filtered = runningLogs.filter(log => {
    const q = logSearchQuery.toLowerCase();
    const name = (log.studentName || "").toLowerCase();
    const details = (log.actionDetails || "").toLowerCase();
    return name.includes(q) || details.includes(q);
  });

  if (countBadge) countBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-xs text-slate-400 italic">
        No logs matching search.
      </div>
    `;
    return;
  }

  // Sort Descending (Newest first)
  filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  container.innerHTML = filtered.map(log => {
    const timeStr = log.timestamp ? formatTime(new Date(log.timestamp)) : "00:00 AM";
    const badgeStyle = getActionBadgeStyle(log.actionType || log.actionDetails);

    return `
      <div class="grid grid-cols-12 items-center text-xs py-2 border-b border-slate-50 hover:bg-slate-50/80 px-1 rounded-lg">
        <span class="col-span-3 text-slate-500 font-mono text-[11px]">${timeStr}</span>
        <span class="col-span-4 font-bold text-slate-800 truncate">${log.studentName || 'Student'}</span>
        <div class="col-span-5 flex items-center gap-1.5 truncate">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${badgeStyle.classes}">
            ${badgeStyle.label}
          </span>
          <span class="text-slate-600 text-[11px] truncate">${log.actionDetails || ''}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Get Badge Classes based on Action Type
function getActionBadgeStyle(typeStr = "") {
  const str = typeStr.toLowerCase();
  if (str.includes("phone")) {
    return { label: "Phone", classes: "bg-emerald-100 text-emerald-800" };
  } else if (str.includes("hall") || str.includes("pass")) {
    return { label: "Hall", classes: "bg-indigo-100 text-indigo-800" };
  } else if (str.includes("approved")) {
    return { label: "Approved", classes: "bg-emerald-100 text-emerald-800" };
  }
  return { label: "System", classes: "bg-slate-100 text-slate-700" };
}

// Update Daily Metrics Summary
function updateMetrics() {
  const checkinsEl = document.getElementById("metric-checkins");
  const passTripsEl = document.getElementById("metric-pass-trips");
  const peakTimeEl = document.getElementById("metric-peak-time");

  if (checkinsEl) checkinsEl.textContent = Object.keys(presentStudents).length;
  if (passTripsEl) passTripsEl.textContent = Object.keys(activePasses).length;
  if (peakTimeEl) peakTimeEl.textContent = "1:00 AM"; // Standard static calculation or calculated dynamically from logs
}

// Button Handlers & Form Setup
function setupSortingToggles() {
  document.querySelectorAll(".btn-sort").forEach(btn => {
    btn.onclick = (e) => {
      document.querySelectorAll(".btn-sort").forEach(b => {
        b.className = "btn-sort px-2 py-0.5 rounded text-slate-500 hover:text-slate-800";
      });
      e.currentTarget.className = "btn-sort px-2 py-0.5 rounded bg-slate-800 text-white font-bold";
      sortMode = e.currentTarget.getAttribute("data-sort");
      renderCurrentlyInRoom();
    };
  });
}

function setupQuickAdd() {
  const form = document.getElementById("form-quick-add");
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("quick-add-id").value.trim();
    const firstName = document.getElementById("quick-add-first").value.trim();
    const lastName = document.getElementById("quick-add-last").value.trim();

    if (!id || !firstName || !lastName) return;

    await set(ref(db, `roster/${id}`), { firstName, lastName });
    
    // Add to current checkins
    await set(ref(db, `checkins/${id}`), {
      firstName,
      lastName,
      timestamp: Date.now(),
      pocketNumber: Object.keys(presentStudents).length + 1
    });

    form.reset();
  };
}

function setupCheckOutAll() {
  const btn = document.getElementById("btn-checkout-all");
  if (!btn) return;

  btn.onclick = async () => {
    if (confirm("Are you sure you want to check out all present students?")) {
      await remove(ref(db, "checkins"));
    }
  };
}

function setupSearchLog() {
  const input = document.getElementById("log-search-input");
  if (!input) return;

  input.oninput = (e) => {
    logSearchQuery = e.target.value.trim();
    renderRunningLog();
  };
}
