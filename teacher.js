/**
 * Chelan High School - Teacher Live Dashboard Logic (v1.1.10)
 */

import { APP_CONFIG, formatDuration, formatTime, formatDate } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, push, remove, get 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// State Variables
let currentSortMode = 'first'; // 'first', 'last', 'pocket'
let activeSessionData = { phones: {}, bathroom: {}, hallPass: {} };
let logsData = {};
let logSearchQuery = '';

// Authentication Logic
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authPasswordInput = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');

function checkAuthentication() {
  if (sessionStorage.getItem('teacherAuthenticated') === 'true') {
    authModal.classList.add('hidden');
    initDashboard();
  } else {
    authModal.classList.remove('hidden');
    authPasswordInput.focus();
  }
}

authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const enteredPass = authPasswordInput.value.trim();
  if (enteredPass === APP_CONFIG.security.teacherPassword) {
    sessionStorage.setItem('teacherAuthenticated', 'true');
    authError.classList.add('hidden');
    authModal.classList.add('hidden');
    initDashboard();
  } else {
    authError.classList.remove('hidden');
    authPasswordInput.value = '';
    authPasswordInput.focus();
  }
});

// Initialize Dashboard Function
function initDashboard() {
  // Populate Metadata Header
  document.getElementById('dash-version').textContent = APP_CONFIG.version;
  document.getElementById('dash-room').textContent = APP_CONFIG.department;

  // Live Clock
  function updateClock() {
    document.getElementById('dash-clock').textContent = formatTime(new Date());
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Attach Sorting Listeners
  const sortFirstBtn = document.getElementById('sort-first-btn');
  const sortLastBtn = document.getElementById('sort-last-btn');
  const sortPocketBtn = document.getElementById('sort-pocket-btn');

  sortFirstBtn.addEventListener('click', () => setSortMode('first'));
  sortLastBtn.addEventListener('click', () => setSortMode('last'));
  sortPocketBtn.addEventListener('click', () => setSortMode('pocket'));

  // Attach Check Out All Button
  document.getElementById('check-out-all-btn').addEventListener('click', handleCheckOutAll);

  // Attach Quick Add Form
  document.getElementById('quick-add-form').addEventListener('submit', handleQuickAddStudent);

  // Attach Search Filter Input
  document.getElementById('log-search-input').addEventListener('input', (e) => {
    logSearchQuery = e.target.value.toLowerCase().trim();
    renderLogsTable();
  });

  // Attach Clear Log Modal Actions
  const clearModal = document.getElementById('clear-confirm-modal');
  document.getElementById('clear-log-btn').addEventListener('click', () => clearModal.classList.remove('hidden'));
  document.getElementById('clear-cancel-btn').addEventListener('click', () => clearModal.classList.add('hidden'));
  document.getElementById('clear-confirm-btn').addEventListener('click', handleClearLogs);

  // Attach Export CSV Button
  document.getElementById('export-csv-btn').addEventListener('click', handleExportCSV);

  // Firebase Realtime Listener: Active Session
  onValue(ref(db, 'activeSession'), (snapshot) => {
    activeSessionData = snapshot.exists() ? snapshot.val() : { phones: {}, bathroom: {}, hallPass: {} };
    renderInRoomCards();
    renderPassCards();
  });

  // Firebase Realtime Listener: Running Logs
  onValue(ref(db, 'logs'), (snapshot) => {
    logsData = snapshot.exists() ? snapshot.val() : {};
    renderLogsTable();
    updateMetrics();
  });

  // Live Timer Re-render Interval (Every 10s to update elapsed durations)
  setInterval(() => {
    renderInRoomCards();
    renderPassCards();
  }, 10000);
}

// Set Card Sorting Mode
function setSortMode(mode) {
  currentSortMode = mode;
  const btnFirst = document.getElementById('sort-first-btn');
  const btnLast = document.getElementById('sort-last-btn');
  const btnPocket = document.getElementById('sort-pocket-btn');

  const activeClass = "bg-slate-700 text-white font-semibold px-2.5 py-1 rounded-md border border-slate-600";
  const inactiveClass = "bg-slate-800 text-slate-400 hover:text-white font-semibold px-2.5 py-1 rounded-md border border-slate-700";

  btnFirst.className = mode === 'first' ? activeClass : inactiveClass;
  btnLast.className = mode === 'last' ? activeClass : inactiveClass;
  btnPocket.className = mode === 'pocket' ? activeClass : inactiveClass;

  renderInRoomCards();
}

// Render Left Column: Currently In Room
function renderInRoomCards() {
  const container = document.getElementById('student-cards-container');
  const badge = document.getElementById('in-room-count-badge');
  const phonesObj = activeSessionData.phones || {};
  const bathroomObj = activeSessionData.bathroom || {};
  const hallObj = activeSessionData.hallPass || {};

  const phonesList = Object.keys(phonesObj).map(key => ({
    key,
    ...phonesObj[key]
  }));

  badge.textContent = `${phonesList.length} Students`;

  if (phonesList.length === 0) {
    container.innerHTML = `<p class="text-slate-500 text-sm italic text-center py-8">No students checked in.</p>`;
    return;
  }

  // Sort Student List
  phonesList.sort((a, b) => {
    const nameA = a.name.split(' ');
    const nameB = b.name.split(' ');
    const firstA = nameA[0] || '';
    const lastA = nameA.slice(1).join(' ') || '';
    const firstB = nameB[0] || '';
    const lastB = nameB.slice(1).join(' ') || '';

    if (currentSortMode === 'first') return firstA.localeCompare(firstB);
    if (currentSortMode === 'last') return lastA.localeCompare(lastB);
    if (currentSortMode === 'pocket') return parseInt(a.pocket, 10) - parseInt(b.pocket, 10);
    return 0;
  });

  // Render Top-Down Cards
  container.innerHTML = phonesList.map(item => {
    const isBathroomOut = Object.values(bathroomObj).some(b => b.id === item.id);
    const isHallOut = Object.values(hallObj).some(h => h.id === item.id);

    let borderStyle = "border-emerald-500/40 bg-emerald-950/20";
    let badgeText = `<span class="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded">In Room</span>`;

    if (isBathroomOut) {
      borderStyle = "border-rose-500 bg-rose-950/30";
      badgeText = `<span class="bg-rose-500/20 text-rose-300 text-[10px] font-bold px-1.5 py-0.5 rounded">Bathroom</span>`;
    } else if (isHallOut) {
      borderStyle = "border-purple-500 bg-purple-950/30";
      badgeText = `<span class="bg-purple-500/20 text-purple-300 text-[10px] font-bold px-1.5 py-0.5 rounded">Hall Pass</span>`;
    }

    const elapsedMins = Math.floor((Date.now() - item.timestamp) / 60000);

    return `
      <div class="student-card-item bg-slate-800 border ${borderStyle} rounded-xl p-3 shadow flex justify-between items-center gap-2">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-amber-400 font-mono font-bold text-xs bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">#${item.pocket}</span>
            <span class="font-bold text-white text-sm">${item.name}</span>
          </div>
          <div class="flex items-center gap-2 text-[10px] text-slate-400">
            ${badgeText}
            <span>${item.checkInTime} (${elapsedMins}m ago)</span>
          </div>
        </div>
        <button onclick="window.checkoutSinglePhone('${item.key}')" class="text-slate-400 hover:text-rose-400 text-sm font-bold p-1 transition" title="Check Out Phone">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  }).join('');
}

// Single Phone Checkout Global Handler
window.checkoutSinglePhone = async function(key) {
  const record = (activeSessionData.phones || {})[key];
  if (!record) return;

  const durationSecs = Math.round((Date.now() - record.timestamp) / 1000);
  const durationStr = formatDuration(durationSecs);

  await remove(ref(db, `activeSession/phones/${key}`));
  await push(ref(db, 'logs'), {
    date: formatDate(),
    time: formatTime(),
    id: record.id,
    name: record.name,
    type: 'Phone',
    duration: durationStr,
    details: 'COS'
  });
};

// Check Out All Phones Handler
async function handleCheckOutAll() {
  const phonesObj = activeSessionData.phones || {};
  const keys = Object.keys(phonesObj);
  if (keys.length === 0) return;

  if (!confirm(`Are you sure you want to check out all ${keys.length} phones?`)) return;

  for (const key of keys) {
    const record = phonesObj[key];
    const durationSecs = Math.round((Date.now() - record.timestamp) / 1000);
    const durationStr = formatDuration(durationSecs);

    await push(ref(db, 'logs'), {
      date: formatDate(),
      time: formatTime(),
      id: record.id,
      name: record.name,
      type: 'Phone',
      duration: durationStr,
      details: 'COA'
    });
  }

  await remove(ref(db, 'activeSession/phones'));
}

// Render Middle Column: Bathroom & Hall Pass Cards
function renderPassCards() {
  const bathroomObj = activeSessionData.bathroom || {};
  const hallObj = activeSessionData.hallPass || {};

  // Bathroom Card
  const bathBadge = document.getElementById('bathroom-count-badge');
  const bathList = document.getElementById('bathroom-active-list');
  const bathKeys = Object.keys(bathroomObj);

  bathBadge.textContent = `${bathKeys.length}/${APP_CONFIG.maxBathroomPasses} Out`;

  if (bathKeys.length === 0) {
    bathList.innerHTML = `<p class="text-xs text-slate-500 italic">No students out on bathroom pass.</p>`;
  } else {
    bathList.innerHTML = bathKeys.map(k => {
      const item = bathroomObj[k];
      const elapsedMins = Math.floor((Date.now() - item.timestamp) / 60000);
      return `
        <div class="bg-rose-950/30 border border-rose-500/40 rounded-xl p-2.5 flex justify-between items-center text-xs">
          <div>
            <div class="font-bold text-white">${item.name}</div>
            <div class="text-[10px] text-rose-300">Out at ${item.outTime} (${elapsedMins}m ago)</div>
          </div>
          <button onclick="window.returnPass('bathroom', '${k}')" class="bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded transition">Return</button>
        </div>
      `;
    }).join('');
  }

  // Hall Pass Card
  const hallBadge = document.getElementById('hall-count-badge');
  const hallList = document.getElementById('hall-active-list');
  const hallKeys = Object.keys(hallObj);

  hallBadge.textContent = `${hallKeys.length}/${APP_CONFIG.maxHallPasses} Out`;

  if (hallKeys.length === 0) {
    hallList.innerHTML = `<p class="text-xs text-slate-500 italic">No students out on hall pass.</p>`;
  } else {
    hallList.innerHTML = hallKeys.map(k => {
      const item = hallObj[k];
      const elapsedMins = Math.floor((Date.now() - item.timestamp) / 60000);
      return `
        <div class="bg-purple-950/30 border border-purple-500/40 rounded-xl p-2.5 flex justify-between items-center text-xs">
          <div>
            <div class="font-bold text-white">${item.name}</div>
            <div class="text-[10px] text-purple-300">Out at ${item.outTime} (${elapsedMins}m ago)</div>
          </div>
          <button onclick="window.returnPass('hallPass', '${k}')" class="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold px-2 py-1 rounded transition">Return</button>
        </div>
      `;
    }).join('');
  }
}

// Return Pass Handler
window.returnPass = async function(type, key) {
  const item = (activeSessionData[type] || {})[key];
  if (!item) return;

  const durationSecs = Math.round((Date.now() - item.timestamp) / 1000);
  const durationStr = formatDuration(durationSecs);
  const detailsCode = type === 'bathroom' ? 'BP-I' : 'HP-I';
  const typeLabel = type === 'bathroom' ? 'Bathroom' : 'Hall Pass';

  await remove(ref(db, `activeSession/${type}/${key}`));
  await push(ref(db, 'logs'), {
    date: formatDate(),
    time: formatTime(),
    id: item.id,
    name: item.name,
    type: typeLabel,
    duration: durationStr,
    details: detailsCode
  });
};

// Handle Quick Add Student
async function handleQuickAddStudent() {
  const id = document.getElementById('qa-id').value.trim();
  const firstName = document.getElementById('qa-first').value.trim();
  const lastName = document.getElementById('qa-last').value.trim();

  if (!id || !firstName || !lastName) return;

  await set(ref(db, `roster/${id}`), {
    id,
    firstName,
    lastName
  });

  document.getElementById('qa-id').value = '';
  document.getElementById('qa-first').value = '';
  document.getElementById('qa-last').value = '';

  alert(`Added ${firstName} ${lastName} (ID: ${id}) to roster!`);
}

// Render Right Column: 5-Column Running Log Table
function renderLogsTable() {
  const tbody = document.getElementById('running-log-tbody');
  const logsList = Object.values(logsData).reverse(); // Most recent first

  const filteredLogs = logsList.filter(log => {
    if (!logSearchQuery) return true;
    const matchName = (log.name || '').toLowerCase().includes(logSearchQuery);
    const matchId = (log.id || '').toLowerCase().includes(logSearchQuery);
    const matchDetails = (log.details || '').toLowerCase().includes(logSearchQuery);
    const matchType = (log.type || '').toLowerCase().includes(logSearchQuery);
    return matchName || matchId || matchDetails || matchType;
  });

  if (filteredLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500 italic">No matching log entries.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredLogs.map(log => {
    let actionBadge = `<span class="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold">Phone</span>`;
    if (log.type === 'Bathroom') {
      actionBadge = `<span class="bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded text-[10px] font-bold">Bathroom</span>`;
    } else if (log.type === 'Hall Pass') {
      actionBadge = `<span class="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-[10px] font-bold">Hall Pass</span>`;
    }

    return `
      <tr class="hover:bg-slate-800/50 transition">
        <td class="py-2 px-3 text-slate-400">${log.time}</td>
        <td class="py-2 px-3 font-semibold text-white">${log.name}</td>
        <td class="py-2 px-3">${actionBadge}</td>
        <td class="py-2 px-3 text-slate-300">${log.duration || '--'}</td>
        <td class="py-2 px-3 text-amber-400 font-bold">${log.details}</td>
      </tr>
    `;
  }).join('');
}

// Calculate & Update Daily Metrics
function updateMetrics() {
  const logsList = Object.values(logsData);
  const checkInsCount = logsList.filter(l => l.details && l.details.startsWith('CI-')).length;
  const passTripsCount = logsList.filter(l => l.details === 'BP-O' || l.details === 'HP-O').length;

  // Peak Hour Calculation
  const hourCounts = {};
  logsList.forEach(l => {
    if (l.time) {
      const hourStr = l.time.split(':')[0] + ' ' + (l.time.includes('AM') ? 'AM' : 'PM');
      hourCounts[hourStr] = (hourCounts[hourStr] || 0) + 1;
    }
  });

  let peakHour = '--';
  let maxCount = 0;
  Object.keys(hourCounts).forEach(h => {
    if (hourCounts[h] > maxCount) {
      maxCount = hourCounts[h];
      peakHour = h;
    }
  });

  document.getElementById('metric-checkins').textContent = checkInsCount;
  document.getElementById('metric-trips').textContent = passTripsCount;
  document.getElementById('metric-peak').textContent = peakHour;
}

// Clear Logs Handler
async function handleClearLogs() {
  await remove(ref(db, 'logs'));
  document.getElementById('clear-confirm-modal').classList.add('hidden');
}

// CSV Export Handler with Code Key Legend
function handleExportCSV() {
  const logsList = Object.values(logsData);
  if (logsList.length === 0) {
    alert("No log data available to export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Date,Time,ID,Name,Type,Duration,Details\n";

  logsList.forEach(l => {
    const row = [
      `"${l.date || ''}"`,
      `"${l.time || ''}"`,
      `"${l.id || ''}"`,
      `"${l.name || ''}"`,
      `"${l.type || ''}"`,
      `"${l.duration || '--'}"`,
      `"${l.details || ''}"`
    ].join(",");
    csvContent += row + "\n";
  });

  // Append Legend Code Key
  csvContent += "\n";
  csvContent += "Code Key Legend\n";
  csvContent += "Code,Description\n";
  csvContent += "CI-XX,Check In (Pocket XX)\n";
  csvContent += "COS,Check Out Standard\n";
  csvContent += "COA,Check Out All\n";
  csvContent += "COED,Check Out End of Day\n";
  csvContent += "BP-O,Bathroom Pass Out\n";
  csvContent += "BP-I,Bathroom Pass In\n";
  csvContent += "HP-O,Hall Pass Out\n";
  csvContent += "HP-I,Hall Pass In\n";

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Chelan_Pass_Log_${formatDate().replace(/\//g, '-')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Execute Authentication Check on Load
checkAuthentication();
