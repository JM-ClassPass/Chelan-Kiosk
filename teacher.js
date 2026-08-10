/**
 * Chelan High School - Live Teacher Control Center Engine (teacher.js)
 */

import { APP_CONFIG, formatTime } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, remove, push, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// State
let checkedInPhones = {};
let activePasses = {};
let activityLogs = {};
let currentSort = "pocket"; // 'pocket', 'first', 'last'

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupSorting();
  setupBulkActions();
  attachFirebaseListeners();

  // Refresh dynamic timers every second
  setInterval(() => {
    renderPhones();
    renderPasses();
  }, 1000);
});

// Live Clock
function initClock() {
  const clockEl = document.getElementById("dashboard-clock");
  if (!clockEl) return;
  const update = () => {
    clockEl.textContent = formatTime(new Date());
  };
  setInterval(update, 1000);
  update();
}

// Listeners
function attachFirebaseListeners() {
  onValue(ref(db, "checkedInPhones"), (snapshot) => {
    checkedInPhones = snapshot.exists() ? snapshot.val() : {};
    renderPhones();
    updateCounters();
  });

  onValue(ref(db, "activePasses"), (snapshot) => {
    activePasses = snapshot.exists() ? snapshot.val() : {};
    renderPasses();
    updateCounters();
  });

  onValue(ref(db, "logs"), (snapshot) => {
    activityLogs = snapshot.exists() ? snapshot.val() : {};
    renderActivityLogs();
    updateStats();
  });
}

// Counters
function updateCounters() {
  const phoneCountEl = document.getElementById("dash-phone-count");
  const bathCountEl = document.getElementById("dash-bathroom-count");
  const hallCountEl = document.getElementById("dash-hall-count");

  const phoneCount = Object.keys(checkedInPhones).length;
  const bathLimit = APP_CONFIG?.passLimits?.bathroom || 1;
  const bathCount = Object.values(activePasses).filter(p => p.type === "bathroom").length;
  const hallCount = Object.values(activePasses).filter(p => p.type === "hall").length;

  if (phoneCountEl) phoneCountEl.textContent = phoneCount;
  if (bathCountEl) bathCountEl.textContent = `${bathCount}/${bathLimit}`;
  if (hallCountEl) hallCountEl.textContent = hallCount;
}

// Sorting Controls
function setupSorting() {
  const btnPocket = document.getElementById("sort-pocket");
  const btnFirst = document.getElementById("sort-first");
  const btnLast = document.getElementById("sort-last");

  const resetBtnStyles = () => {
    [btnPocket, btnFirst, btnLast].forEach(btn => {
      if (btn) btn.className = "px-2 py-1 rounded-lg text-slate-600 hover:text-slate-900";
    });
  };

  if (btnPocket) {
    btnPocket.onclick = () => {
      resetBtnStyles();
      btnPocket.className = "px-2 py-1 rounded-lg bg-white text-[#0B4F2C] shadow-xs font-bold";
      currentSort = "pocket";
      renderPhones();
    };
  }

  if (btnFirst) {
    btnFirst.onclick = () => {
      resetBtnStyles();
      btnFirst.className = "px-2 py-1 rounded-lg bg-white text-[#0B4F2C] shadow-xs font-bold";
      currentSort = "first";
      renderPhones();
    };
  }

  if (btnLast) {
    btnLast.onclick = () => {
      resetBtnStyles();
      btnLast.className = "px-2 py-1 rounded-lg bg-white text-[#0B4F2C] shadow-xs font-bold";
      currentSort = "last";
      renderPhones();
    };
  }
}

// Render Checked-In Phones
function renderPhones() {
  const container = document.getElementById("phones-container");
  if (!container) return;

  const entries = Object.entries(checkedInPhones);

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-400">
        <i class="fa-solid fa-mobile-screen-button text-3xl mb-2 opacity-50"></i>
        <p class="text-xs font-bold">No phones currently checked in.</p>
      </div>
    `;
    return;
  }

  // Sort Array
  entries.sort(([pNumA, a], [pNumB, b]) => {
    if (currentSort === "pocket") return parseInt(pNumA) - parseInt(pNumB);
    if (currentSort === "first") return (a.firstName || "").localeCompare(b.firstName || "");
    if (currentSort === "last") return (a.lastName || "").localeCompare(b.lastName || "");
    return 0;
  });

  const now = Date.now();

  container.innerHTML = entries.map(([pocket, data]) => {
    const elapsedSecs = data.timestamp ? Math.floor((now - data.timestamp) / 1000) : 0;
    const elapsedFormatted = formatDuration(elapsedSecs);

    return `
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between hover:border-emerald-500/50 transition">
        <div class="flex items-center gap-3">
          <span class="w-9 h-9 rounded-xl bg-[#0B4F2C] text-white font-mono font-black text-xs flex items-center justify-center shadow-xs">
            #${pocket.padStart(2, '0')}
          </span>
          <div>
            <p class="text-xs font-bold text-slate-800 leading-tight">${data.firstName || ''} ${data.lastName || ''}</p>
            <p class="text-[10px] text-slate-400 font-mono">ID: ${data.id || 'N/A'}</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[10px] font-mono font-bold bg-emerald-100 text-[#0B4F2C] px-2 py-0.5 rounded-full border border-emerald-200">
            ${elapsedFormatted}
          </span>
          <button data-checkout="${pocket}" class="btn-checkout-single p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
            <i class="fa-solid fa-right-from-bracket text-xs"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach single checkout event listeners
  document.querySelectorAll(".btn-checkout-single").forEach(btn => {
    btn.onclick = async (e) => {
      const pocket = e.currentTarget.getAttribute("data-checkout");
      const phoneData = checkedInPhones[pocket];
      if (pocket && phoneData) {
        await remove(ref(db, `checkedInPhones/${pocket}`));
        await push(ref(db, "logs"), {
          timestamp: serverTimestamp(),
          studentId: phoneData.id,
          studentName: `${phoneData.firstName} ${phoneData.lastName}`,
          action: "PHONE_CHECKOUT",
          details: `Manual teacher check-out from Pocket #${pocket}`
        });
      }
    };
  });
}

// Render Passes
function renderPasses() {
  const bathContainer = document.getElementById("bathroom-pass-container");
  const hallContainer = document.getElementById("hall-pass-container");

  const passes = Object.entries(activePasses);
  const bathPasses = passes.filter(([_, p]) => p.type === "bathroom");
  const hallPasses = passes.filter(([_, p]) => p.type === "hall");

  const now = Date.now();

  // Render Bathroom
  if (bathContainer) {
    if (bathPasses.length === 0) {
      bathContainer.innerHTML = `<p class="text-xs text-slate-400 py-2 italic text-center">No students out for bathroom</p>`;
    } else {
      bathContainer.innerHTML = bathPasses.map(([key, data]) => {
        const elapsed = data.startTime ? Math.floor((now - data.startTime) / 1000) : 0;
        return `
          <div class="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-center justify-between">
            <div>
              <p class="text-xs font-bold text-rose-950">${data.studentName}</p>
              <p class="text-[10px] font-mono text-rose-700">Out: ${formatDuration(elapsed)}</p>
            </div>
            <button data-return="${key}" class="btn-return-pass text-xs font-bold bg-rose-700 text-white px-3 py-1.5 rounded-xl hover:bg-rose-800 transition">
              Return
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // Render Hall
  if (hallContainer) {
    if (hallPasses.length === 0) {
      hallContainer.innerHTML = `<p class="text-xs text-slate-400 py-2 italic text-center">No active hall passes</p>`;
    } else {
      hallContainer.innerHTML = hallPasses.map(([key, data]) => {
        const elapsed = data.startTime ? Math.floor((now - data.startTime) / 1000) : 0;
        return `
          <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 flex items-center justify-between">
            <div>
              <p class="text-xs font-bold text-indigo-950">${data.studentName}</p>
              <p class="text-[10px] font-mono text-indigo-700">Out: ${formatDuration(elapsed)}</p>
            </div>
            <button data-return="${key}" class="btn-return-pass text-xs font-bold bg-indigo-700 text-white px-3 py-1.5 rounded-xl hover:bg-indigo-800 transition">
              Return
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // Pass Return Listeners
  document.querySelectorAll(".btn-return-pass").forEach(btn => {
    btn.onclick = async (e) => {
      const key = e.currentTarget.getAttribute("data-return");
      const pass = activePasses[key];
      if (key && pass) {
        await remove(ref(db, `activePasses/${key}`));
        await push(ref(db, "logs"), {
          timestamp: serverTimestamp(),
          studentId: pass.studentId,
          studentName: pass.studentName,
          action: "PASS_RETURN",
          details: `Manual return of ${pass.type.toUpperCase()} pass`
        });
      }
    };
  });
}

// Render Logs Feed
function renderActivityLogs() {
  const container = document.getElementById("activity-log-container");
  if (!container) return;

  const logs = Object.values(activityLogs);
  if (logs.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 py-10 text-center">No activity recorded today.</p>`;
    return;
  }

  logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  container.innerHTML = logs.map(log => {
    const timeStr = log.timestamp ? formatTime(new Date(log.timestamp)) : 'Just Now';
    let badgeClass = "bg-slate-100 text-slate-700";

    if (log.action?.includes("CHECKIN")) badgeClass = "bg-emerald-100 text-[#0B4F2C]";
    if (log.action?.includes("CHECKOUT")) badgeClass = "bg-amber-100 text-amber-800";
    if (log.action?.includes("BATHROOM")) badgeClass = "bg-rose-100 text-rose-800";
    if (log.action?.includes("HALL")) badgeClass = "bg-indigo-100 text-indigo-800";

    return `
      <div class="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex items-start gap-2.5">
        <span class="text-[10px] font-mono text-slate-400 font-bold whitespace-nowrap pt-0.5">${timeStr}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <p class="text-xs font-bold text-slate-800 truncate">${log.studentName || 'Student'}</p>
            <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeClass}">
              ${log.action || 'LOG'}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 truncate mt-0.5">${log.details || ''}</p>
        </div>
      </div>
    `;
  }).join('');
}

// Update Daily Stats Block
function updateStats() {
  const checkinsEl = document.getElementById("stat-checkins");
  const tripsEl = document.getElementById("stat-trips");

  const logs = Object.values(activityLogs);
  const checkinCount = logs.filter(l => l.action === "PHONE_CHECKIN").length;
  const tripCount = logs.filter(l => l.action?.startsWith("PASS_") && l.action !== "PASS_RETURN").length;

  if (checkinsEl) checkinsEl.textContent = checkinCount;
  if (tripsEl) tripsEl.textContent = tripCount;
}

// Bulk Actions & CSV Export
function setupBulkActions() {
  const btnCheckoutAll = document.getElementById("btn-checkout-all");
  const btnExport = document.getElementById("btn-export-csv");
  const btnClear = document.getElementById("btn-clear-logs");

  if (btnCheckoutAll) {
    btnCheckoutAll.onclick = async () => {
      const entries = Object.entries(checkedInPhones);
      if (entries.length === 0) return;

      if (confirm(`Are you sure you want to check out all ${entries.length} phones?`)) {
        for (const [pocket, data] of entries) {
          await remove(ref(db, `checkedInPhones/${pocket}`));
          await push(ref(db, "logs"), {
            timestamp: serverTimestamp(),
            studentId: data.id,
            studentName: `${data.firstName} ${data.lastName}`,
            action: "PHONE_CHECKOUT",
            details: `Bulk check-out from Pocket #${pocket}`
          });
        }
      }
    };
  }

  if (btnExport) {
    btnExport.onclick = () => {
      const logs = Object.values(activityLogs);
      if (logs.length === 0) {
        alert("No log data available to export.");
        return;
      }

      let csv = "Timestamp,Student ID,Student Name,Action,Details\n";
      logs.forEach(l => {
        const time = l.timestamp ? new Date(l.timestamp).toLocaleString() : "";
        csv += `"${time}","${l.studentId || ''}","${l.studentName || ''}","${l.action || ''}","${l.details || ''}"\n`;
      });

      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Chelan_Pass_Log_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    };
  }

  if (btnClear) {
    btnClear.onclick = async () => {
      if (confirm("Are you sure you want to clear today's activity log? This cannot be undone.")) {
        await remove(ref(db, "logs"));
      }
    };
  }
}

// Helper: Duration Formatter
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
