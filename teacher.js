/* Chelan High School - Teacher Dashboard Logic */

// --- Default State & Storage Initialization ---
const DEFAULT_ROSTER = [
  { id: '10482', fname: 'Alexander', lname: 'Wright', pocket: 1 },
  { id: '10495', fname: 'Brianna', lname: 'Martinez', pocket: 2 },
  { id: '10512', fname: 'Cameron', lname: 'Davis', pocket: 3 },
  { id: '10530', fname: 'Daniel', lname: 'Kim', pocket: 4 },
  { id: '10544', fname: 'Emma', lname: 'Thompson', pocket: 5 },
  { id: '10561', fname: 'Gabriel', lname: 'Garcia', pocket: 6 }
];

let roster = JSON.parse(localStorage.getItem('chelan_roster')) || DEFAULT_ROSTER;
let inRoom = JSON.parse(localStorage.getItem('chelan_in_room')) || [];
let bathroomPasses = JSON.parse(localStorage.getItem('chelan_bathroom')) || [];
let hallPasses = JSON.parse(localStorage.getItem('chelan_hallpass')) || [];
let logs = JSON.parse(localStorage.getItem('chelan_logs')) || [];
let pendingRequests = JSON.parse(localStorage.getItem('chelan_pending')) || [];

let sortMode = 'lname'; // 'fname', 'lname', 'pocket'
let logSort = { field: 'time', asc: false };
let rosterSort = { field: 'lname', asc: true };
let isEditAllMode = false;
let contextMenuTarget = null;
let pendingConfirmCallback = null;
let undoStack = [];

// --- Persistence Helpers ---
function saveState() {
  localStorage.setItem('chelan_roster', JSON.stringify(roster));
  localStorage.setItem('chelan_in_room', JSON.stringify(inRoom));
  localStorage.setItem('chelan_bathroom', JSON.stringify(bathroomPasses));
  localStorage.setItem('chelan_hallpass', JSON.stringify(hallPasses));
  localStorage.setItem('chelan_logs', JSON.stringify(logs));
  localStorage.setItem('chelan_pending', JSON.stringify(pendingRequests));
}

function pushUndoSnapshot() {
  undoStack.push(JSON.stringify({ roster, inRoom, bathroomPasses, hallPasses, logs }));
  if (undoStack.length > 20) undoStack.shift();
}

// Keyboard Ctrl+Z Undo Listener
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (undoStack.length > 0) {
      const lastState = JSON.parse(undoStack.pop());
      roster = lastState.roster;
      inRoom = lastState.inRoom;
      bathroomPasses = lastState.bathroomPasses;
      hallPasses = lastState.hallPasses;
      logs = lastState.logs;
      saveState();
      refreshData();
      renderRoster();
      showUndoToast();
    }
  }
});

function showUndoToast() {
  const toast = document.getElementById('undo-toast');
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

// --- Live Clock ---
function startClock() {
  const update = () => {
    const clockEl = document.getElementById('teacher-live-clock');
    if (clockEl) {
      const now = new Date();
      clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  };
  update();
  setInterval(update, 1000);
}

// --- Navigation Tabs ---
function switchTab(tab) {
  const viewDash = document.getElementById('view-dashboard');
  const viewRoster = document.getElementById('view-roster');
  const btnDash = document.getElementById('btn-dash');
  const btnRost = document.getElementById('btn-rost');

  if (tab === 'dashboard') {
    viewDash.classList.remove('hidden');
    viewRoster.classList.add('hidden');
    btnDash.className = "px-4 py-1.5 bg-white text-emerald-950 rounded-xl font-bold text-xs shadow-sm transition";
    btnRost.className = "px-4 py-1.5 bg-emerald-900/60 hover:bg-emerald-900 text-emerald-100 rounded-xl font-bold text-xs transition";
    refreshData();
  } else {
    viewDash.classList.add('hidden');
    viewRoster.classList.remove('hidden');
    btnRost.className = "px-4 py-1.5 bg-white text-emerald-950 rounded-xl font-bold text-xs shadow-sm transition";
    btnDash.className = "px-4 py-1.5 bg-emerald-900/60 hover:bg-emerald-900 text-emerald-100 rounded-xl font-bold text-xs transition";
    renderRoster();
  }
}

// --- Sort Controls ---
function setSortMode(mode) {
  sortMode = mode;
  ['fname', 'lname', 'pocket'].forEach(m => {
    const btn = document.getElementById(`sort-btn-${m}`);
    if (m === mode) {
      btn.className = "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all duration-150 chelan-primary-green text-white shadow-xs";
    } else {
      btn.className = "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all duration-150 text-slate-600 hover:text-slate-900";
    }
  });
  renderInRoomStudents();
}

// --- Main Data Rendering & Calculations ---
function refreshData() {
  renderInRoomStudents();
  renderPassCards();
  renderLogs();
  calculateSummaryMetrics();
  renderPendingRequests();
}

function calculateSummaryMetrics() {
  const inRoomBadge = document.getElementById('count-in-room-badge');
  const combinedTimeEl = document.getElementById('summary-combined-pass-time');
  const highestActivityEl = document.getElementById('summary-highest-activity');

  if (inRoomBadge) inRoomBadge.innerText = `${inRoom.length} Active`;

  // Calculate pass totals from logs
  let totalPassSeconds = 0;
  let maxPassSeconds = 0;

  logs.forEach(log => {
    if (log.durationSec) {
      totalPassSeconds += log.durationSec;
      if (log.durationSec > maxPassSeconds) {
        maxPassSeconds = log.durationSec;
      }
    }
  });

  if (combinedTimeEl) combinedTimeEl.innerText = formatDuration(totalPassSeconds);
  if (highestActivityEl) highestActivityEl.innerText = formatDuration(maxPassSeconds);
}

function formatDuration(sec) {
  if (!sec || sec <= 0) return '0m 0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

// Render Left Side: Students Currently in Class
function renderInRoomStudents() {
  const container = document.getElementById('in-room-container');
  if (!container) return;

  if (inRoom.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-400 italic col-span-2 text-center py-6">No students currently checked in.</p>`;
    return;
  }

  const sorted = [...inRoom].sort((a, b) => {
    if (sortMode === 'fname') return a.fname.localeCompare(b.fname);
    if (sortMode === 'lname') return a.lname.localeCompare(b.lname);
    if (sortMode === 'pocket') return (a.pocket || 99) - (b.pocket || 99);
    return 0;
  });

  container.innerHTML = sorted.map((st) => {
    const isBathroom = bathroomPasses.some(b => b.id === st.id);
    const isHall = hallPasses.some(h => h.id === st.id);

    return `
      <div oncontextmenu="openContextMenu(event, '${st.id}')" 
           class="bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 rounded-xl p-2.5 flex justify-between items-center transition select-none cursor-pointer">
        <div class="flex items-center gap-2 overflow-hidden">
          <span class="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
            #${st.pocket || '--'}
          </span>
          <span class="text-xs font-bold text-slate-800 truncate">
            ${st.fname} ${st.lname}
          </span>
        </div>
        <div class="flex items-center gap-1">
          ${isBathroom ? '<span class="text-xs" title="Bathroom Pass Active">🚻</span>' : ''}
          ${isHall ? '<span class="text-xs" title="Hall Pass Active">🎟️</span>' : ''}
          <button onclick="event.stopPropagation(); openContextMenu(event, '${st.id}')" class="text-slate-400 hover:text-slate-700 px-1 text-xs">
            ⋮
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Render Bathroom & Hall Pass Cards
function renderPassCards() {
  const bCount = document.getElementById('count-out-room');
  const bList = document.getElementById('active-passes');
  const hCount = document.getElementById('count-hall-pass');
  const hList = document.getElementById('active-hall-passes');

  // Bathroom
  if (bCount) bCount.innerText = `${bathroomPasses.length}/1`;
  if (bList) {
    if (bathroomPasses.length === 0) {
      bList.innerHTML = `<p class="text-xs text-slate-400 italic">No students out.</p>`;
    } else {
      bList.innerHTML = bathroomPasses.map(st => `
        <div class="bg-red-50 border border-red-200 rounded-xl p-2 flex justify-between items-center text-xs">
          <div>
            <span class="font-bold text-red-950 block">${st.fname} ${st.lname}</span>
            <span class="text-[10px] text-red-600 font-mono">${getElapsedMinutes(st.startTime)}</span>
          </div>
          <button onclick="returnBathroomPass('${st.id}')" class="px-2 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg text-[10px] font-bold">
            Return
          </button>
        </div>
      `).join('');
    }
  }

  // Hall Pass
  if (hCount) hCount.innerText = `${hallPasses.length} Out`;
  if (hList) {
    if (hallPasses.length === 0) {
      hList.innerHTML = `<p class="text-xs text-slate-400 italic">No students out.</p>`;
    } else {
      hList.innerHTML = hallPasses.map(st => `
        <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-2 flex justify-between items-center text-xs">
          <div>
            <span class="font-bold text-indigo-950 block">${st.fname} ${st.lname}</span>
            <span class="text-[10px] text-indigo-600 font-mono">${getElapsedMinutes(st.startTime)}</span>
          </div>
          <button onclick="returnHallPass('${st.id}')" class="px-2 py-1 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-[10px] font-bold">
            Return
          </button>
        </div>
      `).join('');
    }
  }
}

function getElapsedMinutes(startTimeStr) {
  if (!startTimeStr) return '0m';
  const start = new Date(startTimeStr);
  const now = new Date();
  const diffSec = Math.floor((now - start) / 1000);
  return formatDuration(diffSec);
}

// Render Running Logs
function renderLogs() {
  const table = document.getElementById('logs-table');
  const countEl = document.getElementById('log-count');
  const searchVal = (document.getElementById('search-log')?.value || '').toLowerCase();

  if (!table) return;

  let filtered = logs.filter(l => 
    l.studentName.toLowerCase().includes(searchVal) ||
    l.type.toLowerCase().includes(searchVal) ||
    (l.details || '').toLowerCase().includes(searchVal)
  );

  filtered.sort((a, b) => {
    let valA = a[logSort.field] || '';
    let valB = b[logSort.field] || '';
    if (logSort.field === 'time') {
      valA = new Date(a.rawTime || a.time);
      valB = new Date(b.rawTime || b.time);
    }
    if (valA < valB) return logSort.asc ? -1 : 1;
    if (valA > valB) return logSort.asc ? 1 : -1;
    return 0;
  });

  if (countEl) countEl.innerText = `${filtered.length} entries`;

  if (filtered.length === 0) {
    table.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">No activity logged yet.</td></tr>`;
    return;
  }

  table.innerHTML = filtered.map(l => `
    <tr class="hover:bg-slate-50 transition">
      <td class="p-2.5 font-mono text-slate-500 whitespace-nowrap">${l.time}</td>
      <td class="p-2.5 font-bold text-slate-800">${l.studentName}</td>
      <td class="p-2.5">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
          l.type === 'Phone Check-In' ? 'bg-emerald-100 text-emerald-800' :
          l.type === 'Bathroom Pass' ? 'bg-red-100 text-red-800' :
          l.type === 'Hall Pass' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
        }">${l.type}</span>
      </td>
      <td class="p-2.5 font-mono text-slate-600">${l.duration || '--'}</td>
      <td class="p-2.5 text-slate-600">${l.details || '--'}</td>
    </tr>
  `).join('');
}

function toggleLogSort(field) {
  if (logSort.field === field) {
    logSort.asc = !logSort.asc;
  } else {
    logSort.field = field;
    logSort.asc = true;
  }
  
  ['time', 'name', 'type', 'duration', 'details'].forEach(f => {
    const icon = document.getElementById(`sort-icon-log-${f}`);
    if (icon) {
      if (f === field) {
        icon.className = "text-[#0A4D2E] font-bold";
        icon.innerText = logSort.asc ? "↑" : "↓";
      } else {
        icon.className = "text-slate-400 font-normal";
        icon.innerText = "↕";
      }
    }
  });

  renderLogs();
}

// --- Roster Tab Functions ---
function renderRoster() {
  const table = document.getElementById('roster-table');
  const countEl = document.getElementById('roster-count');
  const searchVal = (document.getElementById('search-roster')?.value || '').toLowerCase();

  if (!table) return;

  let filtered = roster.filter(s => 
    s.id.toLowerCase().includes(searchVal) ||
    s.fname.toLowerCase().includes(searchVal) ||
    s.lname.toLowerCase().includes(searchVal)
  );

  filtered.sort((a, b) => {
    let valA = a[rosterSort.field] || '';
    let valB = b[rosterSort.field] || '';
    if (valA < valB) return rosterSort.asc ? -1 : 1;
    if (valA > valB) return rosterSort.asc ? 1 : -1;
    return 0;
  });

  if (countEl) countEl.innerText = roster.length;

  if (filtered.length === 0) {
    table.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400 italic">No students in roster.</td></tr>`;
    return;
  }

  table.innerHTML = filtered.map(st => `
    <tr class="hover:bg-slate-50 transition">
      <td class="p-3 font-mono font-semibold text-slate-700">
        ${isEditAllMode ? `<input type="text" data-id="${st.id}" data-field="id" value="${st.id}" class="w-full px-2 py-1 border rounded text-xs font-mono">` : st.id}
      </td>
      <td class="p-3 font-semibold text-slate-800">
        ${isEditAllMode ? `<input type="text" data-id="${st.id}" data-field="fname" value="${st.fname}" class="w-full px-2 py-1 border rounded text-xs">` : st.fname}
      </td>
      <td class="p-3 font-semibold text-slate-800">
        ${isEditAllMode ? `<input type="text" data-id="${st.id}" data-field="lname" value="${st.lname}" class="w-full px-2 py-1 border rounded text-xs">` : st.lname}
      </td>
      <td class="p-3 text-right">
        <button onclick="removeRosterStudent('${st.id}')" class="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-bold transition">
          🗑️ Delete
        </button>
      </td>
    </tr>
  `).join('');
}

function toggleRosterSort(field) {
  if (rosterSort.field === field) {
    rosterSort.asc = !rosterSort.asc;
  } else {
    rosterSort.field = field;
    rosterSort.asc = true;
  }

  ['id', 'fname', 'lname'].forEach(f => {
    const icon = document.getElementById(`sort-icon-roster-${f}`);
    if (icon) {
      if (f === field) {
        icon.className = "text-[#0A4D2E] font-bold";
        icon.innerText = rosterSort.asc ? "↑" : "↓";
      } else {
        icon.className = "text-slate-400 font-normal";
        icon.innerText = "↕";
      }
    }
  });

  renderRoster();
}

function enableEditAll() {
  isEditAllMode = true;
  document.getElementById('btn-edit-all').classList.add('hidden');
  document.getElementById('btn-save-all').classList.remove('hidden');
  renderRoster();
}

function saveEditAll() {
  pushUndoSnapshot();
  const inputs = document.querySelectorAll('#roster-table input');
  const tempMap = {};

  inputs.forEach(input => {
    const origId = input.getAttribute('data-id');
    const field = input.getAttribute('data-field');
    if (!tempMap[origId]) tempMap[origId] = { id: origId };
    tempMap[origId][field] = input.value.trim();
  });

  roster = Object.values(tempMap).filter(s => s.id && s.fname && s.lname);
  saveState();

  isEditAllMode = false;
  document.getElementById('btn-edit-all').classList.remove('hidden');
  document.getElementById('btn-save-all').classList.add('hidden');

  const saveToast = document.getElementById('global-save-toast');
  if (saveToast) {
    saveToast.classList.remove('hidden');
    setTimeout(() => saveToast.classList.add('hidden'), 2000);
  }

  renderRoster();
}

// --- Quick Add Forms ---
function addStudent(e) {
  e.preventDefault();
  pushUndoSnapshot();
  const idInput = document.getElementById('r-id');
  const fnameInput = document.getElementById('r-fname');
  const lnameInput = document.getElementById('r-lname');

  const id = idInput.value.trim();
  const fname = fnameInput.value.trim();
  const lname = lnameInput.value.trim();

  if (!id || !fname || !lname) return;

  let existing = roster.find(s => s.id === id);
  if (!existing) {
    existing = { id, fname, lname, pocket: roster.length + 1 };
    roster.push(existing);
  }

  if (!inRoom.some(s => s.id === id)) {
    inRoom.push(existing);
    addLogEntry(existing.fname + ' ' + existing.lname, 'Phone Check-In', '--', 'Manual Check-in');
  }

  idInput.value = '';
  fnameInput.value = '';
  lnameInput.value = '';

  saveState();
  refreshData();
}

function addRosterStudentTab(e) {
  e.preventDefault();
  pushUndoSnapshot();
  const id = document.getElementById('roster-tab-id').value.trim();
  const fname = document.getElementById('roster-tab-fname').value.trim();
  const lname = document.getElementById('roster-tab-lname').value.trim();

  if (!id || !fname || !lname) return;

  if (roster.some(s => s.id === id)) {
    alert('Student ID already exists in roster.');
    return;
  }

  roster.push({ id, fname, lname, pocket: roster.length + 1 });
  saveState();
  renderRoster();

  document.getElementById('roster-tab-id').value = '';
  document.getElementById('roster-tab-fname').value = '';
  document.getElementById('roster-tab-lname').value = '';
}

function removeRosterStudent(id) {
  showConfirmModal("Delete Student?", "Remove this student permanently from class roster?", "🗑️", () => {
    pushUndoSnapshot();
    roster = roster.filter(s => s.id !== id);
    inRoom = inRoom.filter(s => s.id !== id);
    bathroomPasses = bathroomPasses.filter(s => s.id !== id);
    hallPasses = hallPasses.filter(s => s.id !== id);
    saveState();
    refreshData();
    renderRoster();
  });
}

// --- Google Sheet Sync ---
async function processGoogleSheet() {
  const urlInput = document.getElementById('sheet-url');
  const url = urlInput.value.trim();
  if (!url) {
    alert('Please enter a published Google Sheet CSV URL.');
    return;
  }

  const syncMode = document.querySelector('input[name="sync-mode"]:checked')?.value || 'replace';

  try {
    const res = await fetch(url);
    const csvText = await res.text();
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    pushUndoSnapshot();
    const newStudents = [];

    lines.forEach((line, idx) => {
      if (idx === 0 && line.toLowerCase().includes('id')) return; // skip header
      const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
      if (parts.length >= 3) {
        newStudents.push({
          id: parts[0],
          fname: parts[1],
          lname: parts[2],
          pocket: newStudents.length + 1
        });
      }
    });

    if (newStudents.length > 0) {
      if (syncMode === 'replace') {
        roster = newStudents;
      } else {
        newStudents.forEach(st => {
          if (!roster.some(s => s.id === st.id)) roster.push(st);
        });
      }
      saveState();
      renderRoster();
      alert(`Successfully processed ${newStudents.length} student records!`);
    } else {
      alert('No valid student rows found in CSV data.');
    }
  } catch (err) {
    alert('Failed to fetch Google Sheet CSV. Check URL permissions.');
  }
}

// --- Context Menu & Actions ---
function openContextMenu(e, studentId) {
  e.preventDefault();
  e.stopPropagation();

  const student = roster.find(s => s.id === studentId) || inRoom.find(s => s.id === studentId);
  if (!student) return;

  contextMenuTarget = student;
  const menu = document.getElementById('student-context-menu');
  document.getElementById('ctx-student-name').innerText = `${student.fname} ${student.lname}`;
  document.getElementById('ctx-student-id').innerText = `ID: ${student.id}`;

  const isPhone = inRoom.some(s => s.id === student.id);
  const isBathroom = bathroomPasses.some(s => s.id === student.id);
  const isHall = hallPasses.some(s => s.id === student.id);

  document.getElementById('ctx-lbl-phone').innerText = isPhone ? 'Checked In' : 'Checked Out';
  document.getElementById('ctx-lbl-bathroom').innerText = isBathroom ? 'Active' : 'Off';
  document.getElementById('ctx-lbl-hallpass').innerText = isHall ? 'Active' : 'Off';

  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 180)}px`;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 240)}px`;
  menu.classList.remove('hidden');
}

function closeContextMenu() {
  const menu = document.getElementById('student-context-menu');
  if (menu) menu.classList.add('hidden');
}

function menuTogglePhone() {
  if (!contextMenuTarget) return;
  pushUndoSnapshot();

  const idx = inRoom.findIndex(s => s.id === contextMenuTarget.id);
  if (idx >= 0) {
    inRoom.splice(idx, 1);
    addLogEntry(`${contextMenuTarget.fname} ${contextMenuTarget.lname}`, 'Phone Check-Out', '--', 'Manual Check-out');
  } else {
    inRoom.push(contextMenuTarget);
    addLogEntry(`${contextMenuTarget.fname} ${contextMenuTarget.lname}`, 'Phone Check-In', '--', 'Manual Check-in');
  }

  saveState();
  refreshData();
  closeContextMenu();
}

function menuToggleBathroom() {
  if (!contextMenuTarget) return;

  const isBathroom = bathroomPasses.some(s => s.id === contextMenuTarget.id);
  if (isBathroom) {
    returnBathroomPass(contextMenuTarget.id);
  } else {
    if (bathroomPasses.length >= 1) {
      alert('Bathroom pass limit reached (1/1 active).');
      return;
    }
    pushUndoSnapshot();
    bathroomPasses.push({ ...contextMenuTarget, startTime: new Date().toISOString() });
    addLogEntry(`${contextMenuTarget.fname} ${contextMenuTarget.lname}`, 'Bathroom Pass', 'Active', 'Pass Issued');
  }

  saveState();
  refreshData();
  closeContextMenu();
}

function menuToggleHallPass() {
  if (!contextMenuTarget) return;

  const isHall = hallPasses.some(s => s.id === contextMenuTarget.id);
  if (isHall) {
    returnHallPass(contextMenuTarget.id);
  } else {
    pushUndoSnapshot();
    hallPasses.push({ ...contextMenuTarget, startTime: new Date().toISOString() });
    addLogEntry(`${contextMenuTarget.fname} ${contextMenuTarget.lname}`, 'Hall Pass', 'Active', 'Pass Issued');
  }

  saveState();
  refreshData();
  closeContextMenu();
}

function returnBathroomPass(id) {
  pushUndoSnapshot();
  const pass = bathroomPasses.find(s => s.id === id);
  if (pass) {
    const durationSec = Math.floor((new Date() - new Date(pass.startTime)) / 1000);
    const durationStr = formatDuration(durationSec);
    addLogEntry(`${pass.fname} ${pass.lname}`, 'Bathroom Pass', durationStr, 'Returned to class', durationSec);
    bathroomPasses = bathroomPasses.filter(s => s.id !== id);
    saveState();
    refreshData();
  }
}

function returnHallPass(id) {
  pushUndoSnapshot();
  const pass = hallPasses.find(s => s.id === id);
  if (pass) {
    const durationSec = Math.floor((new Date() - new Date(pass.startTime)) / 1000);
    const durationStr = formatDuration(durationSec);
    addLogEntry(`${pass.fname} ${pass.lname}`, 'Hall Pass', durationStr, 'Returned to class', durationSec);
    hallPasses = hallPasses.filter(s => s.id !== id);
    saveState();
    refreshData();
  }
}

function checkOutAll(mode) {
  showConfirmModal("Check Out All?", "Check out all phones, bathroom passes, and hall passes for active students?", "🚪", () => {
    pushUndoSnapshot();
    inRoom.forEach(st => {
      addLogEntry(`${st.fname} ${st.lname}`, 'Check-Out All', '--', 'Mass Check-Out');
    });
    inRoom = [];
    bathroomPasses = [];
    hallPasses = [];
    saveState();
    refreshData();
  });
}

// Log Helper
function addLogEntry(studentName, type, duration, details, durationSec = 0) {
  const now = new Date();
  logs.unshift({
    rawTime: now.toISOString(),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    studentName,
    type,
    duration,
    details,
    durationSec
  });
}

// --- Pending Roster Requests Banner ---
function renderPendingRequests() {
  const banner = document.getElementById('pending-requests-banner');
  const count = document.getElementById('pending-requests-count');
  const list = document.getElementById('pending-requests-list');

  if (!banner || !list) return;

  if (pendingRequests.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  if (count) count.innerText = pendingRequests.length;

  list.innerHTML = pendingRequests.map((req, idx) => `
    <div class="bg-white p-3 rounded-xl border border-amber-200 flex justify-between items-center text-xs shadow-xs">
      <div>
        <span class="font-bold text-slate-800 block">${req.fname} ${req.lname}</span>
        <span class="text-[10px] text-slate-400 font-mono">ID: ${req.id} • ${req.time || 'Just now'}</span>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="approveRequest(${idx})" class="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-[10px]">
          Approve
        </button>
        <button onclick="rejectRequest(${idx})" class="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-[10px]">
          Reject
        </button>
      </div>
    </div>
  `).join('');
}

function approveRequest(idx) {
  pushUndoSnapshot();
  const req = pendingRequests[idx];
  if (req) {
    if (!roster.some(s => s.id === req.id)) {
      roster.push({ id: req.id, fname: req.fname, lname: req.lname, pocket: roster.length + 1 });
    }
    pendingRequests.splice(idx, 1);
    saveState();
    refreshData();
    renderRoster();
  }
}

function rejectRequest(idx) {
  pushUndoSnapshot();
  pendingRequests.splice(idx, 1);
  saveState();
  refreshData();
}

// --- CSV Exports ---
function exportCSV() {
  if (logs.length === 0) {
    alert('No activity logs to export.');
    return;
  }
  let csv = 'Timestamp,Student Name,Type,Duration,Details\n';
  logs.forEach(l => {
    csv += `"${l.time}","${l.studentName}","${l.type}","${l.duration}","${l.details}"\n`;
  });
  downloadFile(csv, `chelan_activity_log_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

function exportRosterCSV() {
  if (roster.length === 0) {
    alert('No roster data to export.');
    return;
  }
  let csv = 'ID,First Name,Last Name,Pocket Number\n';
  roster.forEach(s => {
    csv += `"${s.id}","${s.fname}","${s.lname}","${s.pocket || ''}"\n`;
  });
  downloadFile(csv, `chelan_roster_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Session Clears ---
function promptClearCSV() {
  showConfirmModal("Clear Activity Logs?", "This will wipe all currently recorded log entries.", "🧹", () => {
    pushUndoSnapshot();
    logs = [];
    saveState();
    refreshData();
  });
}

function promptResetSession() {
  showConfirmModal("Reset Entire Session?", "Reset all active passes, currently checked-in students, and activity logs?", "🗑️", () => {
    pushUndoSnapshot();
    inRoom = [];
    bathroomPasses = [];
    hallPasses = [];
    logs = [];
    saveState();
    refreshData();
  });
}

// --- Modals ---
function showConfirmModal(title, msg, icon, onConfirm) {
  document.getElementById('confirm-title').innerText = title;
  document.getElementById('confirm-message').innerText = msg;
  document.getElementById('confirm-icon').innerText = icon || '⚠️';

  pendingConfirmCallback = onConfirm;
  const modal = document.getElementById('confirm-modal');
  const confirmBtn = document.getElementById('confirm-action-btn');

  confirmBtn.onclick = () => {
    if (pendingConfirmCallback) pendingConfirmCallback();
    closeConfirmModal();
  };

  modal.classList.remove('hidden');
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.add('hidden');
  pendingConfirmCallback = null;
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  refreshData();
});
