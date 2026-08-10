/**
 * Chelan High School - Teacher Live Dashboard Engine (teacher.js)
 */

import { APP_CONFIG, formatTime } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, remove, update 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// State
let rosterData = {};
let activePasses = {};
let passHistory = {};

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  attachFirebaseListeners();
  setupEventListeners();
});

// Live Header Clock
function initClock() {
  const clockEl = document.getElementById("roster-clock") || document.getElementById("teacher-clock");
  if (!clockEl) return;
  
  const updateClock = () => {
    clockEl.textContent = formatTime(new Date());
  };
  
  setInterval(updateClock, 1000);
  updateClock();
}

// Realtime Firebase Listeners
function attachFirebaseListeners() {
  // Listen to Roster
  onValue(ref(db, "roster"), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
    const countEl = document.getElementById("stat-roster-count");
    if (countEl) countEl.textContent = Object.keys(rosterData).length;
  });

  // Listen to Active Passes
  onValue(ref(db, "passes/active"), (snapshot) => {
    activePasses = snapshot.exists() ? snapshot.val() : {};
    renderActivePasses();
    updateStats();
  });

  // Listen to Today's Pass History/Logs
  onValue(ref(db, "passes/history"), (snapshot) => {
    passHistory = snapshot.exists() ? snapshot.val() : {};
    renderActivityLog();
    updateStats();
  });
}

// Render Active Hall Passes Grid
function renderActivePasses() {
  const container = document.getElementById("active-passes-container");
  if (!container) return;

  const entries = Object.entries(activePasses);

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
        <i class="fa-solid fa-circle-check text-4xl text-emerald-400 mb-2"></i>
        <p class="font-bold text-sm">No Active Passes</p>
        <p class="text-xs">All students are currently in class.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = entries.map(([id, pass]) => {
    const student = rosterData[id] || { firstName: pass.firstName || 'Student', lastName: pass.lastName || '' };
    const startTime = pass.timestamp ? formatTime(new Date(pass.timestamp)) : 'Active';
    const isOvertime = pass.timestamp && (Date.now() - pass.timestamp > 10 * 60 * 1000); // 10 minutes limit

    return `
      <div class="p-4 rounded-xl border ${isOvertime ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50/50 border-emerald-200'} flex flex-col justify-between shadow-sm">
        <div>
          <div class="flex items-start justify-between">
            <div>
              <h3 class="font-black text-slate-800 text-sm">${student.firstName} ${student.lastName}</h3>
              <p class="text-[11px] font-mono text-slate-500">ID: ${id}</p>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isOvertime ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'}">
              ${pass.reason || 'Restroom'}
            </span>
          </div>
          <div class="mt-3 flex items-center justify-between text-xs text-slate-600 font-medium">
            <span>Departed: <b>${startTime}</b></span>
          </div>
        </div>

        <button data-end-pass="${id}" class="btn-end-pass mt-3 w-full py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-right-to-bracket"></i> End Pass / Return
        </button>
      </div>
    `;
  }).join('');

  // Attach button event handlers
  document.querySelectorAll(".btn-end-pass").forEach(btn => {
    btn.onclick = async (e) => {
      const studentId = e.currentTarget.getAttribute("data-end-pass");
      if (studentId) {
        await endPass(studentId);
      }
    };
  });
}

// End an active pass and write to history log
async function endPass(studentId) {
  const pass = activePasses[studentId];
  if (!pass) return;

  const now = Date.now();
  const historyEntry = {
    ...pass,
    returnTimestamp: now,
    durationMinutes: Math.round((now - (pass.timestamp || now)) / 60000)
  };

  // Add to history and remove from active
  await set(ref(db, `passes/history/${now}_${studentId}`), historyEntry);
  await remove(ref(db, `passes/active/${studentId}`));
}

// Render History Log
function renderActivityLog() {
  const container = document.getElementById("activity-log-container");
  if (!container) return;

  const entries = Object.entries(passHistory);

  if (entries.length === 0) {
    container.innerHTML = `
      <p class="text-center py-8 text-xs text-slate-400 italic">No activity logged today.</p>
    `;
    return;
  }

  // Sort descending (most recent first)
  entries.sort((a, b) => (b[1].returnTimestamp || 0) - (a[1].returnTimestamp || 0));

  container.innerHTML = entries.slice(0, 30).map(([key, pass]) => {
    const student = rosterData[pass.id] || { firstName: pass.firstName || 'Student', lastName: pass.lastName || '' };
    const timeOut = pass.timestamp ? formatTime(new Date(pass.timestamp)) : '';
    const timeIn = pass.returnTimestamp ? formatTime(new Date(pass.returnTimestamp)) : '';

    return `
      <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
        <div>
          <span class="font-bold text-slate-800">${student.firstName} ${student.lastName}</span>
          <span class="text-slate-400 text-[10px] ml-1">(${pass.reason || 'Pass'})</span>
          <div class="text-[10px] text-slate-500 font-mono mt-0.5">
            ${timeOut} &rarr; ${timeIn}
          </div>
        </div>
        <span class="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
          ${pass.durationMinutes || 0}m
        </span>
      </div>
    `;
  }).join('');
}

// Update Top Dashboard Counters
function updateStats() {
  const activeCount = Object.keys(activePasses).length;
  const historyCount = Object.keys(passHistory).length;

  const activeStatEl = document.getElementById("stat-active-count");
  const totalTodayEl = document.getElementById("stat-total-today");
  const overtimeEl = document.getElementById("stat-overtime-count");

  if (activeStatEl) activeStatEl.textContent = activeCount;
  if (totalTodayEl) totalTodayEl.textContent = activeCount + historyCount;

  // Calculate overtime passes (>10 mins)
  if (overtimeEl) {
    const overtimeCount = Object.values(activePasses).filter(p => {
      return p.timestamp && (Date.now() - p.timestamp > 10 * 60 * 1000);
    }).length;
    overtimeEl.textContent = overtimeCount;
  }
}

function setupEventListeners() {
  const btnClear = document.getElementById("btn-clear-history");
  if (btnClear) {
    btnClear.onclick = () => {
      if (confirm("Clear local activity view? (Firebase logs remain safe)")) {
        passHistory = {};
        renderActivityLog();
      }
    };
  }
}
