let sortMode = 'lname'; 
let logSortColumn = 'time'; 
let logSortOrder = 'desc'; 

let rosterSortColumn = 'lname'; 
let rosterSortOrder = 'asc'; 

let isEditAllMode = false;
let editingStudentId = null;
let lastAutoCheckDate = null;
let pendingConfirmAction = null;
let contextStudentId = null;

let roster = JSON.parse(localStorage.getItem('classroom_roster')) || {};
let logs = JSON.parse(localStorage.getItem('classroom_logs')) || [];
let activePasses = JSON.parse(localStorage.getItem('active_bathroom_passes')) || {};
let activeHallPasses = JSON.parse(localStorage.getItem('active_hall_passes')) || {};
let activePhonesInClass = JSON.parse(localStorage.getItem('active_phones_in_class')) || {};
let pendingRequests = JSON.parse(localStorage.getItem('pending_roster_requests')) || [];

let historyStack = [];

function saveSnapshot() {
  historyStack.push(JSON.stringify({
    logs: logs,
    activePasses: activePasses,
    activeHallPasses: activeHallPasses,
    activePhonesInClass: activePhonesInClass,
    pendingRequests: pendingRequests
  }));
  if (historyStack.length > 20) historyStack.shift();
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    performUndo();
  }
});

function performUndo() {
  if (historyStack.length === 0) return;
  let snapshot = JSON.parse(historyStack.pop());
  
  logs = snapshot.logs || [];
  activePasses = snapshot.activePasses || {};
  activeHallPasses = snapshot.activeHallPasses || {};
  activePhonesInClass = snapshot.activePhonesInClass || {};
  pendingRequests = snapshot.pendingRequests || [];

  localStorage.setItem('classroom_logs', JSON.stringify(logs));
  localStorage.setItem('active_bathroom_passes', JSON.stringify(activePasses));
  localStorage.setItem('active_hall_passes', JSON.stringify(activeHallPasses));
  localStorage.setItem('active_phones_in_class', JSON.stringify(activePhonesInClass));
  localStorage.setItem('pending_roster_requests', JSON.stringify(pendingRequests));

  refreshData();

  const toast = document.getElementById('undo-toast');
  if (toast) {
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 1800);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateTeacherClock();
  setInterval(updateTeacherClock, 1000);
  setInterval(refreshData, 1000);
  setInterval(checkAutoCheckout, 5000);
  refreshData();
});

function updateTeacherClock() {
  const now = new Date();
  const elem = document.getElementById('teacher-live-clock');
  if (elem) {
    elem.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

function switchTab(tab) {
  if (tab === 'dashboard') {
    document.getElementById('view-dashboard').classList.remove('hidden');
    document.getElementById('view-roster').classList.add('hidden');
    document.getElementById('btn-dash').className = 'px-4 py-1.5 bg-white text-emerald-950 rounded-xl font-bold text-xs shadow-sm transition';
    document.getElementById('btn-rost').className = 'px-4 py-1.5 hover:bg-emerald-900/80 text-emerald-100 rounded-xl font-bold text-xs transition';
  } else {
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-roster').classList.remove('hidden');
    document.getElementById('btn-rost').className = 'px-4 py-1.5 bg-white text-emerald-950 rounded-xl font-bold text-xs shadow-sm transition';
    document.getElementById('btn-dash').className = 'px-4 py-1.5 hover:bg-emerald-900/80 text-emerald-100 rounded-xl font-bold text-xs transition';
    renderRoster();
  }
}

function getReadableDetails(code) {
  if (!code || code === '--') return 'Activity Recorded';
  if (code.startsWith('CI-')) {
    let pocketNum = code.replace('CI-', '');
    return `Phone Check-In (Pocket #${pocketNum})`;
  }
  if (code === 'COA') return 'Phone Check-Out All (Teacher)';
  if (code === 'COS') return 'Phone Check-Out (Kiosk)';
  if (code === 'COED') return 'Phone Check-Out (End of Day)';
  if (code === 'BP-O') return 'Bathroom Pass Departure';
  if (code === 'BP-I') return 'Bathroom Pass Return';
  if (code === 'HP-O') return 'Hall Pass Departure';
  if (code === 'HP-I') return 'Hall Pass Return';
  return code;
}

function parseDurationToMs(durStr) {
  if (!durStr || durStr === '--' || durStr === 'Active') return 0;
  let totalMs = 0;
  let m = durStr.match(/(\d+)\s*m/);
  if (m) totalMs += parseInt(m[1]) * 60000;
  let s = durStr.match(/(\d+)\s*s/);
  if (s) totalMs += parseInt(s[1]) * 1000;
  return totalMs;
}

function approvePendingRequest(index) {
  saveSnapshot();
  pendingRequests = JSON.parse(localStorage.getItem('pending_roster_requests')) || [];
  let req = pendingRequests[index];
  if (!req) return;

  roster[req.id] = { firstName: req.firstName, lastName: req.lastName };
  localStorage.setItem('classroom_roster', JSON.stringify(roster));

  const now = new Date();
  const studentName = `${req.firstName} ${req.lastName}`;

  if (req.mode === 'phone') {
    let slotStr = `CI-${String(req.slot || 1).padStart(2, '0')}`;
    activePhonesInClass[req.id] = { slot: req.slot || 1, timestamp: Date.now() };
    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: req.id,
      name: studentName,
      type: 'Phone',
      duration: '--',
      details: slotStr
    });
    localStorage.setItem('active_phones_in_class', JSON.stringify(activePhonesInClass));
  } else if (req.mode === 'bathroom') {
    if (!activePhonesInClass[req.id]) {
      alert(`${studentName} must have their phone checked in before taking a bathroom pass.`);
      return;
    }
    activePasses[req.id] = Date.now();
    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: req.id,
      name: studentName,
      type: 'Bathroom',
      duration: 'Active',
      details: 'BP-O'
    });
    localStorage.setItem('active_bathroom_passes', JSON.stringify(activePasses));
  } else if (req.mode === 'hallpass') {
    if (!activePhonesInClass[req.id]) {
      alert(`${studentName} must have their phone checked in before taking a hall pass.`);
      return;
    }
    activeHallPasses[req.id] = Date.now();
    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: req.id,
      name: studentName,
      type: 'Hall Pass',
      duration: 'Active',
      details: 'HP-O'
    });
    localStorage.setItem('active_hall_passes', JSON.stringify(activeHallPasses));
  }

  localStorage.setItem('classroom_logs', JSON.stringify(logs));
  pendingRequests.splice(index, 1);
  localStorage.setItem('pending_roster_requests', JSON.stringify(pendingRequests));

  renderRoster();
  refreshData();
}

function dismissPendingRequest(index) {
  saveSnapshot();
  pendingRequests = JSON.parse(localStorage.getItem('pending_roster_requests')) || [];
  pendingRequests.splice(index, 1);
  localStorage.setItem('pending_roster_requests', JSON.stringify(pendingRequests));
  refreshData();
}

function openContextMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  contextStudentId = id;

  const menu = document.getElementById('student-context-menu');
  const nameElem = document.getElementById('ctx-student-name');
  const idElem = document.getElementById('ctx-student-id');
  const stName = getStandardDisplayName(roster[id]) || id;

  nameElem.textContent = stName;
  idElem.textContent = `ID: ${id}`;

  const lblPhone = document.getElementById('ctx-lbl-phone');
  const lblBathroom = document.getElementById('ctx-lbl-bathroom');
  const lblHall = document.getElementById('ctx-lbl-hallpass');

  lblPhone.textContent = activePhonesInClass[id] ? "Checked In" : "Checked Out";
  lblBathroom.textContent = activePasses[id] ? "OUT (Bathroom Pass)" : "In Room";
  lblHall.textContent = activeHallPasses[id] ? "OUT (Hall Pass)" : "In Room";

  menu.style.top = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;
  menu.classList.remove('hidden');
}

function closeContextMenu() {
  document.getElementById('student-context-menu').classList.add('hidden');
  contextStudentId = null;
}

function menuTogglePhone() {
  if (!contextStudentId) return;
  saveSnapshot();
  const id = contextStudentId;
  const now = new Date();
  const studentName = getStandardDisplayName(roster[id]) || id;

  if (activePhonesInClass[id]) {
    let checkInTime = activePhonesInClass[id].timestamp || Date.now();
    let phoneDuration = formatDuration(Date.now() - checkInTime);
    delete activePhonesInClass[id];

    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: studentName,
      type: 'Phone',
      duration: phoneDuration,
      details: 'COA'
    });
  } else {
    activePhonesInClass[id] = { slot: 1, timestamp: Date.now() };
    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: studentName,
      type: 'Phone',
      duration: '--',
      details: 'CI-01'
    });
  }

  localStorage.setItem('active_phones_in_class', JSON.stringify(activePhonesInClass));
  localStorage.setItem('classroom_logs', JSON.stringify(logs));
  closeContextMenu();
  refreshData();
}

function menuToggleBathroom() {
  if (!contextStudentId) return;
  const id = contextStudentId;
  const studentName = getStandardDisplayName(roster[id]) || id;

  if (!activePasses[id] && !activePhonesInClass[id]) {
    alert(`${studentName} must have their phone checked in before taking a bathroom pass.`);
    closeContextMenu();
    return;
  }

  saveSnapshot();
  const now = new Date();

  if (activePasses[id]) {
    let durationMs = Date.now() - activePasses[id];
    let formattedDur = formatDuration(durationMs);
    delete activePasses[id];

    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: studentName,
      type: 'Bathroom',
      duration: formattedDur,
      details: 'BP-I'
    });
  } else {
    delete activeHallPasses[id];
    activePasses[id] = Date.now();

    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: studentName,
      type: 'Bathroom',
      duration: 'Active',
      details: 'BP-O'
    });
  }

  localStorage.setItem('active_bathroom_passes', JSON.stringify(activePasses));
  localStorage.setItem('active_hall_passes', JSON.stringify(activeHallPasses));
  localStorage.setItem('classroom_logs', JSON.stringify(logs));
  closeContextMenu();
  refreshData();
}

function menuToggleHallPass() {
  if (!contextStudentId) return;
  const id = contextStudentId;
  const studentName = getStandardDisplayName(roster[id]) || id;

  if (!activeHallPasses[id] && !activePhonesInClass[id]) {
    alert(`${studentName} must have their phone checked in before taking a hall pass.`);
    closeContextMenu();
    return;
  }

  saveSnapshot();
  const now = new Date();

  if (activeHallPasses[id]) {
    let durationMs = Date.now() - activeHallPasses[id];
    let formattedDur = formatDuration(durationMs);
    delete activeHallPasses[id];

    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: studentName,
      type: 'Hall Pass',
      duration: formattedDur,
      details: 'HP-I'
    });
  } else {
    delete activePasses[id];
    activeHallPasses[id] = Date.now();

    logs.unshift({
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: studentName,
      type: 'Hall Pass',
      duration: 'Active',
      details: 'HP-O'
    });
  }

  localStorage.setItem('active_bathroom_passes', JSON.stringify(activePasses));
  localStorage.setItem('active_hall_passes', JSON.stringify(activeHallPasses));
  localStorage.setItem('classroom_logs', JSON.stringify(logs));
  closeContextMenu();
  refreshData();
}

function setSortMode(mode) {
  sortMode = mode;
  const btnFname = document.getElementById('sort-btn-fname');
  const btnLname = document.getElementById('sort-btn-lname');
  const btnPocket = document.getElementById('sort-btn-pocket');

  btnFname.className = "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all duration-150 text-slate-600 hover:text-slate-900";
  btnLname.className = "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all duration-150 text-slate-600 hover:text-slate-900";
  btnPocket.className = "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all duration-150 text-slate-600 hover:text-slate-900";

  if (mode === 'fname') {
    btnFname.className = "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all duration-150 chelan-primary-green text-white shadow-xs";
  } else if (mode === 'lname') {
    btnLname.className = "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all duration-150 chelan-primary-green text-white shadow-xs";
  } else {
    btnPocket.className = "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all duration-150 chelan-primary-green text-white shadow-xs";
  }
  refreshData();
}

function toggleLogSort(column) {
  if (logSortColumn === column) {
    logSortOrder = logSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    logSortColumn = column;
    logSortOrder = 'asc';
  }
  updateLogSortHeaderIcons();
  refreshData();
}

function updateLogSortHeaderIcons() {
  const cols = ['time', 'name', 'type', 'duration', 'details'];
  cols.forEach(c => {
    const iconElem = document.getElementById(`sort-icon-log-${c}`);
    if (iconElem) {
      if (c === logSortColumn) {
        iconElem.textContent = logSortOrder === 'asc' ? '↑' : '↓';
        iconElem.className = 'text-[#0A4D2E] font-bold';
      } else {
        iconElem.textContent = '↕';
        iconElem.className = 'text-slate-400 font-normal';
      }
    }
  });
}

function toggleRosterSort(column) {
  if (rosterSortColumn === column) {
    rosterSortOrder = rosterSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    rosterSortColumn = column;
    rosterSortOrder = 'asc';
  }
  updateRosterSortHeaderIcons();
  renderRoster();
}

function updateRosterSortHeaderIcons() {
  const cols = ['id', 'fname', 'lname'];
  cols.forEach(c => {
    const iconElem = document.getElementById(`sort-icon-roster-${c}`);
    if (iconElem) {
      if (c === rosterSortColumn) {
        iconElem.textContent = rosterSortOrder === 'asc' ? '↑' : '↓';
        iconElem.className = 'text-[#0A4D2E] font-bold';
      } else {
        iconElem.textContent = '↕';
        iconElem.className = 'text-slate-400 font-normal';
      }
    }
  });
}

function getStandardDisplayName(studentObj) {
  if (!studentObj) return "Unknown Student";
  if (typeof studentObj === 'string') return studentObj;
  if (studentObj.firstName || studentObj.lastName) {
    return `${studentObj.firstName || ''} ${studentObj.lastName || ''}`.trim();
  }
  return "Unknown Student";
}

function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) return '0m 0s';
  let totalSeconds = Math.floor(ms / 1000);
  let mins = Math.floor(totalSeconds / 60);
  let secs = totalSeconds % 60;
  return `${mins}m ${secs}s`;
}

function checkOutAll(codeType = 'COA') {
  activePhonesInClass = JSON.parse(localStorage.getItem('active_phones_in_class')) || {};
  activePasses = JSON.parse(localStorage.getItem('active_bathroom_passes')) || {};
  activeHallPasses = JSON.parse(localStorage.getItem('active_hall_passes')) || {};

  let phoneIds = Object.keys(activePhonesInClass);
  let passIds = Object.keys(activePasses);
  let hallIds = Object.keys(activeHallPasses);

  if (phoneIds.length === 0 && passIds.length === 0 && hallIds.length === 0) {
    if (codeType === 'COA') alert("No active check-ins or departures to check out.");
    return;
  }

  saveSnapshot();
  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  phoneIds.forEach(id => {
    let name = getStandardDisplayName(roster[id]) || id;
    let checkInTime = activePhonesInClass[id].timestamp || Date.now();
    let phoneDuration = formatDuration(Date.now() - checkInTime);

    logs.unshift({
      timestamp: timeString,
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: name,
      type: 'Phone',
      duration: phoneDuration,
      details: codeType
    });
  });

  passIds.forEach(id => {
    let name = getStandardDisplayName(roster[id]) || id;
    let durationMs = Date.now() - activePasses[id];
    let formattedDur = formatDuration(durationMs);

    logs.unshift({
      timestamp: timeString,
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: name,
      type: 'Bathroom',
      duration: formattedDur,
      details: 'BP-I'
    });
  });

  hallIds.forEach(id => {
    let name = getStandardDisplayName(roster[id]) || id;
    let durationMs = Date.now() - activeHallPasses[id];
    let formattedDur = formatDuration(durationMs);

    logs.unshift({
      timestamp: timeString,
      dateStamp: now.toLocaleDateString(),
      id: id,
      name: name,
      type: 'Hall Pass',
      duration: formattedDur,
      details: 'HP-I'
    });
  });

  localStorage.setItem('active_phones_in_class', JSON.stringify({}));
  localStorage.setItem('active_bathroom_passes', JSON.stringify({}));
  localStorage.setItem('active_hall_passes', JSON.stringify({}));
  localStorage.setItem('classroom_logs', JSON.stringify(logs));
  refreshData();
}

function checkAutoCheckout() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const todayStr = now.toLocaleDateString();

  if (hours === 15 && minutes === 15 && lastAutoCheckDate !== todayStr) {
    lastAutoCheckDate = todayStr;
    checkOutAll('COED');
  }
}

async function processGoogleSheet() {
  const url = document.getElementById('sheet-url').value.trim();
  if (!url) { alert("Please paste a valid Google Sheet CSV URL."); return; }

  const syncMode = document.querySelector('input[name="sync-mode"]:checked')?.value || 'replace';

  try {
    const response = await fetch(url);
    const csvText = await response.text();
    const rows = csvText.split('\n');
    
    let parsedRoster = {};
    rows.forEach(row => {
      const cols = row.split(',').map(c => c.replace(/^["'](.+(?=["']))["']$/, '$1').trim());
      if (cols.length >= 2 && cols[0] && cols[1]) {
        let fullName = cols[1];
        let parts = fullName.split(' ');
        let firstName = parts[0] || '';
        let lastName = parts.slice(1).join(' ') || '';
        parsedRoster[cols[0]] = { firstName, lastName };
      }
    });

    let parsedCount = Object.keys(parsedRoster).length;
    if (parsedCount > 0) {
      if (syncMode === 'replace') {
        roster = parsedRoster;
      } else {
        roster = { ...roster, ...parsedRoster };
      }

      localStorage.setItem('classroom_roster', JSON.stringify(roster));
      renderRoster();
      refreshData();
      
      const actionText = syncMode === 'replace' ? 'replaced entire roster with' : 'added students to roster from';
      alert(`Successfully ${actionText} sheet (${parsedCount} students processed)!`);
    } else {
      alert("Could not parse data. Ensure Column A is ID and Column B is Name.");
    }
  } catch (err) {
    alert("Failed to fetch Google Sheet. Make sure the sheet is published to the web as CSV.");
  }
}

function refreshData() {
  logs = JSON.parse(localStorage.getItem('classroom_logs')) || [];
  activePasses = JSON.parse(localStorage.getItem('active_bathroom_passes')) || {};
  activeHallPasses = JSON.parse(localStorage.getItem('active_hall_passes')) || {};
  activePhonesInClass = JSON.parse(localStorage.getItem('active_phones_in_class')) || {};
  roster = JSON.parse(localStorage.getItem('classroom_roster')) || roster;
  pendingRequests = JSON.parse(localStorage.getItem('pending_roster_requests')) || [];

  const todayDateStr = new Date().toLocaleDateString();

  let totalPassMsToday = 0;
  let highestActivityMsToday = 0;

  logs.forEach(l => {
    let lDate = l.dateStamp || todayDateStr;
    if (lDate === todayDateStr) {
      let durMs = parseDurationToMs(l.duration);
      if (l.type === 'Bathroom' || l.type === 'Hall Pass') {
        totalPassMsToday += durMs;
      }
      if (durMs > highestActivityMsToday) {
        highestActivityMsToday = durMs;
      }
    }
  });

  Object.keys(activePasses).forEach(id => {
    let passMs = Date.now() - activePasses[id];
    totalPassMsToday += passMs;
    if (passMs > highestActivityMsToday) highestActivityMsToday = passMs;
  });
  Object.keys(activeHallPasses).forEach(id => {
    let passMs = Date.now() - activeHallPasses[id];
    totalPassMsToday += passMs;
    if (passMs > highestActivityMsToday) highestActivityMsToday = passMs;
  });

  const elemCombined = document.getElementById('summary-combined-pass-time');
  const elemHighest = document.getElementById('summary-highest-activity');
  if (elemCombined) elemCombined.textContent = formatDuration(totalPassMsToday);
  if (elemHighest) elemHighest.textContent = formatDuration(highestActivityMsToday);

  const reqBanner = document.getElementById('pending-requests-banner');
  const reqList = document.getElementById('pending-requests-list');
  const reqCount = document.getElementById('pending-requests-count');

  if (pendingRequests.length > 0) {
    reqCount.textContent = pendingRequests.length;
    reqList.innerHTML = pendingRequests.map((r, idx) => `
      <div class="bg-white p-3.5 rounded-xl border border-amber-300 shadow-xs flex flex-col justify-between space-y-2">
        <div class="space-y-1">
          <div class="flex justify-between items-start">
            <span class="font-bold text-slate-800 text-sm">${r.firstName} ${r.lastName}</span>
            <span class="font-mono text-[10px] text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded font-bold">ID: ${r.id}</span>
          </div>
          <div class="text-[11px] text-slate-600 space-y-0.5">
            <p><strong>Requested Action:</strong> <span class="uppercase font-bold text-amber-900">${r.mode}</span></p>
            <p><strong>Time Submitted:</strong> ${r.timestamp}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-amber-100">
          <button onclick="approvePendingRequest(${idx})" class="py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg text-[11px] transition shadow-xs">
            ✅ Approve & Add
          </button>
          <button onclick="dismissPendingRequest(${idx})" class="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition">
            ❌ Dismiss
          </button>
        </div>
      </div>
    `).join('');
    reqBanner.classList.remove('hidden');
  } else {
    reqBanner.classList.add('hidden');
  }

  const inRoomContainer = document.getElementById('in-room-container');
  const phoneKeys = Object.keys(activePhonesInClass);
  const countBadge = document.getElementById('count-in-room-badge');
  if (countBadge) countBadge.textContent = `${phoneKeys.length} Active`;

  if (phoneKeys.length === 0) {
    inRoomContainer.innerHTML = `<p class="text-sm text-slate-400 italic col-span-2 text-center py-6">No students currently checked in.</p>`;
  } else {
    let studentList = phoneKeys.map(id => {
      let st = roster[id];
      let phoneData = activePhonesInClass[id];
      let checkInTimestamp = phoneData.timestamp || Date.now();
      let inRoomDuration = formatDuration(Date.now() - checkInTimestamp);

      return {
        id: id,
        displayName: getStandardDisplayName(st) || id,
        firstName: (st && st.firstName) ? st.firstName : '',
        lastName: (st && st.lastName) ? st.lastName : '',
        slot: Number(phoneData.slot),
        inRoomDuration: inRoomDuration,
        hasBathroomPass: !!activePasses[id],
        hasHallPass: !!activeHallPasses[id]
      };
    });

    if (sortMode === 'fname') {
      studentList.sort((a, b) => a.firstName.localeCompare(b.firstName));
    } else if (sortMode === 'lname') {
      studentList.sort((a, b) => a.lastName.localeCompare(b.lastName));
    } else {
      studentList.sort((a, b) => a.slot - b.slot);
    }

    inRoomContainer.innerHTML = studentList.map(item => {
      let slotPadded = String(item.slot).padStart(2, '0');
      let borderBgClass = "bg-emerald-50/90 border-emerald-300 hover:border-emerald-500 shadow-2xs";
      let badgeClass = "bg-emerald-800 text-white";
      let statusLabel = `In: ${item.inRoomDuration} (#${slotPadded})`;

      if (item.hasBathroomPass) {
        borderBgClass = "bg-red-100 border-red-500 shadow-xs animate-pulse hover:border-red-700";
        badgeClass = "bg-red-700 text-white font-black";
        statusLabel = `BP-O (#${slotPadded})`;
      } else if (item.hasHallPass) {
        borderBgClass = "bg-indigo-100 border-indigo-500 shadow-xs hover:border-indigo-700";
        badgeClass = "bg-indigo-700 text-white font-black";
        statusLabel = `HP-O (#${slotPadded})`;
      }

      return `
        <div oncontextmenu="openContextMenu(event, '${item.id}')" 
             title="Right-click to manually adjust status"
             class="flex justify-between items-center p-2.5 border rounded-xl transition-all cursor-context-menu select-none ${borderBgClass}">
          <div class="truncate pr-1">
            <span class="font-bold text-slate-900 text-xs block truncate">${item.displayName}</span>
          </div>
          <span class="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${badgeClass}">${statusLabel}</span>
        </div>`;
    }).join('');
  }

  const activeContainer = document.getElementById('active-passes');
  const passKeys = Object.keys(activePasses);
  document.getElementById('count-out-room').textContent = `${passKeys.length}/1`;

  if (passKeys.length === 0) {
    activeContainer.innerHTML = `<p class="text-xs text-slate-400 italic">No students out.</p>`;
  } else {
    activeContainer.innerHTML = passKeys.map(id => {
      let elapsedMs = Date.now() - activePasses[id];
      let formattedTime = formatDuration(elapsedMs);
      let stName = getStandardDisplayName(roster[id]) || id;
      return `<div class="flex justify-between items-center p-2 bg-red-50 border border-red-200 rounded-xl">
        <span class="font-bold text-red-950 text-xs truncate">${stName}</span>
        <span class="text-red-800 font-mono font-semibold text-[10px] bg-red-100 px-1.5 py-0.5 rounded-md ml-1">${formattedTime}</span>
      </div>`;
    }).join('');
  }

  const hallContainer = document.getElementById('active-hall-passes');
  const hallKeys = Object.keys(activeHallPasses);
  document.getElementById('count-hall-pass').textContent = `${hallKeys.length} Out`;

  if (hallKeys.length === 0) {
    hallContainer.innerHTML = `<p class="text-xs text-slate-400 italic">No students out.</p>`;
  } else {
    hallContainer.innerHTML = hallKeys.map(id => {
      let elapsedMs = Date.now() - activeHallPasses[id];
      let formattedTime = formatDuration(elapsedMs);
      let stName = getStandardDisplayName(roster[id]) || id;
      return `<div class="flex justify-between items-center p-2 bg-indigo-50 border border-indigo-200 rounded-xl">
        <span class="font-bold text-indigo-950 text-xs truncate">${stName}</span>
        <span class="text-indigo-800 font-mono font-semibold text-[10px] bg-indigo-100 px-1.5 py-0.5 rounded-md ml-1">${formattedTime}</span>
      </div>`;
    }).join('');
  }

  const searchQuery = (document.getElementById('search-log')?.value || '').toLowerCase().trim();
  let filteredLogs = logs.filter(l => {
    if (!searchQuery) return true;
    let readableDesc = getReadableDetails(l.details).toLowerCase();
    return (
      (l.name || '').toLowerCase().includes(searchQuery) ||
      (l.timestamp || '').toLowerCase().includes(searchQuery) ||
      (l.type || '').toLowerCase().includes(searchQuery) ||
      (l.duration || '').toLowerCase().includes(searchQuery) ||
      readableDesc.includes(searchQuery)
    );
  });

  let reverse = logSortOrder === 'desc';
  filteredLogs.sort((a, b) => {
    let valA = '', valB = '';

    if (logSortColumn === 'time') {
      valA = (a.dateStamp || '') + ' ' + (a.timestamp || '');
      valB = (b.dateStamp || '') + ' ' + (b.timestamp || '');
    } else if (logSortColumn === 'name') {
      valA = (a.name || '').toLowerCase();
      valB = (b.name || '').toLowerCase();
    } else if (logSortColumn === 'type') {
      valA = (a.type || '').toLowerCase();
      valB = (b.type || '').toLowerCase();
    } else if (logSortColumn === 'duration') {
      valA = parseDurationToMs(a.duration);
      valB = parseDurationToMs(b.duration);
    } else if (logSortColumn === 'details') {
      valA = getReadableDetails(a.details).toLowerCase();
      valB = getReadableDetails(b.details).toLowerCase();
    }

    if (valA < valB) return reverse ? 1 : -1;
    if (valA > valB) return reverse ? -1 : 1;
    return 0;
  });

  const logTable = document.getElementById('logs-table');
  document.getElementById('log-count').textContent = `${filteredLogs.length} entries`;
  if (filteredLogs.length === 0) {
    logTable.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">No matching log entries found.</td></tr>`;
  } else {
    logTable.innerHTML = filteredLogs.map(l => {
      let typeBadgeClass = 'bg-emerald-100 text-emerald-900 border border-emerald-200';
      if (l.type === 'Bathroom') typeBadgeClass = 'bg-red-100 text-red-900 border border-red-200';
      if (l.type === 'Hall Pass') typeBadgeClass = 'bg-indigo-100 text-indigo-900 border border-indigo-200';

      let readableDetailText = getReadableDetails(l.details);

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="p-2.5 font-mono text-xs text-slate-600">${l.timestamp}</td>
          <td class="p-2.5 font-bold text-slate-800 text-xs">${l.name}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 text-[10px] rounded-md font-bold ${typeBadgeClass}">${l.type}</span></td>
          <td class="p-2.5 font-mono text-xs font-bold text-slate-700">${l.duration || '--'}</td>
          <td class="p-2.5 text-xs text-slate-700 font-medium">${readableDetailText}</td>
        </tr>`;
    }).join('');
  }
}

function addStudent(event) {
  event.preventDefault();
  const id = document.getElementById('r-id').value.trim();
  const fname = document.getElementById('r-fname').value.trim();
  const lname = document.getElementById('r-lname').value.trim();

  if (roster[id]) {
    let existingName = `${roster[id].firstName} ${roster[id].lastName}`;
    alert(`Student ID "${id}" already exists in the roster for ${existingName}. Duplicate IDs are not allowed.`);
    return;
  }

  roster[id] = { firstName: fname, lastName: lname };
  localStorage.setItem('classroom_roster', JSON.stringify(roster));
  document.getElementById('r-id').value = '';
  document.getElementById('r-fname').value = '';
  document.getElementById('r-lname').value = '';
  renderRoster();
  
  const toast = document.getElementById('global-save-toast');
  if (toast) {
    toast.textContent = "Student Added ✓";
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 1800);
  }
}

function addRosterStudentTab(event) {
  event.preventDefault();
  const id = document.getElementById('roster-tab-id').value.trim();
  const fname = document.getElementById('roster-tab-fname').value.trim();
  const lname = document.getElementById('roster-tab-lname').value.trim();

  if (roster[id]) {
    let existingName = `${roster[id].firstName} ${roster[id].lastName}`;
    alert(`Student ID "${id}" already exists in the roster for ${existingName}. Duplicate IDs are not allowed.`);
    return;
  }

  roster[id] = { firstName: fname, lastName: lname };
  localStorage.setItem('classroom_roster', JSON.stringify(roster));
  document.getElementById('roster-tab-id').value = '';
  document.getElementById('roster-tab-fname').value = '';
  document.getElementById('roster-tab-lname').value = '';
  renderRoster();
  
  const toast = document.getElementById('global-save-toast');
  if (toast) {
    toast.textContent = "Student Added ✓";
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 1800);
  }
}

function editStudent(id) {
  editingStudentId = id;
  renderRoster();
}

function autoSaveStudentRow(oldId) {
  const idElem = document.getElementById(`edit-id-${oldId}`);
  const fnameElem = document.getElementById(`edit-fname-${oldId}`);
  const lnameElem = document.getElementById(`edit-lname-${oldId}`);

  if (!idElem || !fnameElem || !lnameElem) return;

  const newId = idElem.value.trim();
  const newFname = fnameElem.value.trim();
  const newLname = lnameElem.value.trim();

  if (!newId || !newFname || !newLname) return;

  if (newId !== oldId && roster[newId]) {
    alert(`Cannot change ID to "${newId}". That ID already belongs to ${roster[newId].firstName} ${roster[newId].lastName}.`);
    idElem.value = oldId;
    return;
  }

  if (newId !== oldId) {
    delete roster[oldId];
  }

  roster[newId] = { firstName: newFname, lastName: newLname };
  localStorage.setItem('classroom_roster', JSON.stringify(roster));
  
  const toast = document.getElementById(`saved-toast-${oldId}`);
  if (toast) {
    toast.classList.remove('hidden');
    setTimeout(() => { if (toast) toast.classList.add('hidden'); }, 1200);
  }

  refreshData();
}

function enableEditAll() {
  isEditAllMode = true;
  document.getElementById('btn-edit-all').classList.add('hidden');
  document.getElementById('btn-save-all').classList.remove('hidden');
  renderRoster();
}

function saveEditAll() {
  let newRoster = {};
  const entries = Object.keys(roster);

  for (let oldId of entries) {
    const idElem = document.getElementById(`edit-id-${oldId}`);
    const fnameElem = document.getElementById(`edit-fname-${oldId}`);
    const lnameElem = document.getElementById(`edit-lname-${oldId}`);

    if (idElem && fnameElem && lnameElem) {
      const nid = idElem.value.trim() || oldId;
      const nfn = fnameElem.value.trim();
      const nln = lnameElem.value.trim();

      if (nid !== oldId && newRoster[nid]) {
        alert(`Duplicate ID detected (${nid}). Changes canceled.`);
        return;
      }
      newRoster[nid] = { firstName: nfn, lastName: nln };
    } else {
      newRoster[oldId] = roster[oldId];
    }
  }

  roster = newRoster;
  localStorage.setItem('classroom_roster', JSON.stringify(roster));

  isEditAllMode = false;
  editingStudentId = null;
  document.getElementById('btn-edit-all').classList.remove('hidden');
  document.getElementById('btn-save-all').classList.add('hidden');

  renderRoster();
  refreshData();

  const toast = document.getElementById('global-save-toast');
  if (toast) {
    toast.textContent = "All Changes Saved ✓";
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 2000);
  }
}

function deleteStudent(id) {
  if (confirm("Delete this student from roster?")) {
    delete roster[id];
    localStorage.setItem('classroom_roster', JSON.stringify(roster));
    renderRoster();
  }
}

function renderRoster() {
  const tbody = document.getElementById('roster-table');
  const searchQuery = (document.getElementById('search-roster')?.value || '').toLowerCase().trim();
  let entries = Object.entries(roster);

  if (searchQuery) {
    entries = entries.filter(([id, st]) => {
      let fname = (typeof st === 'object' ? st.firstName : st).toLowerCase();
      let lname = (typeof st === 'object' ? st.lastName : '').toLowerCase();
      let sid = id.toLowerCase();
      return sid.includes(searchQuery) || fname.includes(searchQuery) || lname.includes(searchQuery);
    });
  }

  let reverse = rosterSortOrder === 'desc';
  entries.sort((a, b) => {
    let idA = a[0], stA = a[1];
    let idB = b[0], stB = b[1];

    let valA = '', valB = '';
    if (rosterSortColumn === 'id') {
      valA = idA.toLowerCase();
      valB = idB.toLowerCase();
    } else if (rosterSortColumn === 'fname') {
      valA = (typeof stA === 'object' ? stA.firstName : stA).toLowerCase();
      valB = (typeof stB === 'object' ? stB.firstName : stB).toLowerCase();
    } else if (rosterSortColumn === 'lname') {
      valA = (typeof stA === 'object' ? stA.lastName : '').toLowerCase();
      valB = (typeof stB === 'object' ? stB.lastName : '').toLowerCase();
    }

    if (valA < valB) return reverse ? 1 : -1;
    if (valA > valB) return reverse ? -1 : 1;
    return 0;
  });

  document.getElementById('roster-count').textContent = entries.length;
  
  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400 italic">No matching students found in roster.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(([id, st]) => {
    let fname = typeof st === 'object' ? st.firstName : st;
    let lname = typeof st === 'object' ? st.lastName : '';

    if (isEditAllMode || editingStudentId === id) {
      return `
        <tr class="bg-emerald-50/60">
          <td class="p-2">
            <input type="text" id="edit-id-${id}" value="${id}" 
                   onblur="autoSaveStudentRow('${id}')" 
                   class="w-full px-2 py-1 border rounded text-xs font-mono focus:bg-white focus:border-[#0A4D2E]">
          </td>
          <td class="p-2">
            <input type="text" id="edit-fname-${id}" value="${fname}" 
                   onblur="autoSaveStudentRow('${id}')" 
                   class="w-full px-2 py-1 border rounded text-xs focus:bg-white focus:border-[#0A4D2E]">
          </td>
          <td class="p-2">
            <input type="text" id="edit-lname-${id}" value="${lname}" 
                   onblur="autoSaveStudentRow('${id}')" 
                   class="w-full px-2 py-1 border rounded text-xs focus:bg-white focus:border-[#0A4D2E]">
          </td>
          <td class="p-2 text-right">
            <span id="saved-toast-${id}" class="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded hidden transition">Saved ✓</span>
          </td>
        </tr>`;
    }

    return `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-mono text-xs">${id}</td>
        <td class="p-3 font-medium">${fname}</td>
        <td class="p-3 font-medium">${lname}</td>
        <td class="p-3 text-right space-x-1">
          <button onclick="editStudent('${id}')" class="px-2.5 py-1 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-xs font-bold rounded-lg transition">Edit</button>
          <button onclick="deleteStudent('${id}')" class="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold rounded-lg transition">Delete</button>
        </td>
      </tr>`;
  }).join('');
}

function promptClearCSV() {
  showConfirmModal(
    '🧹',
    'Clear CSV Log History?',
    'This will wipe all historical activity entries from the export list. Active check-ins in the room will remain active.',
    'Clear CSV Logs',
    'bg-amber-600 hover:bg-amber-700',
    executeClearCSV
  );
}

function promptResetSession() {
  showConfirmModal(
    '🗑️',
    'Reset Current Session Completely?',
    'This will clear all running logs AND reset all active student check-ins and bathroom/hall passes.',
    'Reset Session',
    'bg-red-700 hover:bg-red-800',
    executeResetSession
  );
}

function showConfirmModal(icon, title, message, btnText, btnColorClass, callback) {
  document.getElementById('confirm-icon').textContent = icon;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  
  const btn = document.getElementById('confirm-action-btn');
  btn.textContent = btnText;
  btn.className = `py-2.5 ${btnColorClass} text-white font-bold rounded-xl text-xs transition shadow`;
  
  pendingConfirmAction = callback;
  document.getElementById('confirm-action-btn').onclick = function() {
    if (pendingConfirmAction) pendingConfirmAction();
    closeConfirmModal();
  };

  document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.add('hidden');
  pendingConfirmAction = null;
}

function executeClearCSV() {
  saveSnapshot();
  localStorage.removeItem('classroom_logs');
  refreshData();
}

function executeResetSession() {
  saveSnapshot();
  localStorage.removeItem('classroom_logs');
  localStorage.removeItem('active_bathroom_passes');
  localStorage.removeItem('active_hall_passes');
  localStorage.removeItem('active_phones_in_class');
  localStorage.removeItem('pending_roster_requests');
  refreshData();
}

function exportCSV() {
  logs = JSON.parse(localStorage.getItem('classroom_logs')) || [];
  if (logs.length === 0) { alert("No logs to export!"); return; }
  
  const legendKey = [
    ['CODE KEY', 'DESCRIPTION'],
    ['Phone Check-In (Pocket #XX)', 'Student checked phone into pocket slot XX'],
    ['Phone Check-Out All (Teacher)', 'Teacher executed Check Out All command'],
    ['Phone Check-Out (Kiosk)', 'Student checked phone out via kiosk'],
    ['Bathroom Pass Departure / Return', 'Bathroom pass duration logged'],
    ['Hall Pass Departure / Return', 'Hall pass duration logged']
  ];

  let csvRows = ["Date,Time,ID,Name,Type,Duration,Description / Details,,,CODE KEY,DESCRIPTION"];
  
  let maxRows = Math.max(logs.length, legendKey.length - 1);

  for (let i = 0; i < maxRows; i++) {
    let logCol = ',"","","","","",""';
    if (i < logs.length) {
      let l = logs[i];
      let d = l.dateStamp || new Date().toLocaleDateString();
      let t = l.timestamp || '';
      let id = l.id || '';
      let name = l.name || '';
      let type = l.type || '';
      let dur = l.duration || '--';
      let readableDetails = getReadableDetails(l.details);
      logCol = `"${d}","${t}","${id}","${name.replace(/"/g, '""')}","${type}","${dur}","${readableDetails.replace(/"/g, '""')}"`;
    }

    let keyCol = ',"",""';
    let keyIndex = i + 1;
    if (keyIndex < legendKey.length) {
      keyCol = `,,"${legendKey[keyIndex][0]}","${legendKey[keyIndex][1]}"`;
    }

    csvRows.push(`${logCol}${keyCol}`);
  }

  const csvData = csvRows.join("\n");
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `classroom_export_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportRosterCSV() {
  const entries = Object.entries(roster);
  if (entries.length === 0) { alert("Roster is currently empty!"); return; }

  let csvRows = ["ID Code,First Name,Last Name"];
  entries.forEach(([id, st]) => {
    let fname = typeof st === 'object' ? st.firstName : st;
    let lname = typeof st === 'object' ? st.lastName : '';
    csvRows.push(`"${id}","${fname.replace(/"/g, '""')}","${lname.replace(/"/g, '""')}"`);
  });

  const csvData = csvRows.join("\n");
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `classroom_roster_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
