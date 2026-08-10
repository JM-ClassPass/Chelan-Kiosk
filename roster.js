/**
 * Chelan High School - Roster Management Logic (v1.1.10)
 */

import { APP_CONFIG, formatTime } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, remove, update 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// State Variables
let rosterData = {};
let currentSortColumn = 'lastName'; // 'id', 'firstName', 'lastName'
let sortAscending = true;
let rosterSearchQuery = '';
let studentToDeleteId = null;
let editModeActive = false;

// Conflict resolution queue for CSV/Import
let importQueue = [];
let pendingConflict = null;

// DOM Elements
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authPasswordInput = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');

// Auth Check
function checkAuthentication() {
  if (sessionStorage.getItem('teacherAuthenticated') === 'true') {
    authModal.classList.add('hidden');
    initRoster();
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
    initRoster();
  } else {
    authError.classList.remove('hidden');
    authPasswordInput.value = '';
    authPasswordInput.focus();
  }
});

// Initialize Roster Page
function initRoster() {
  // Populate Header Info
  document.getElementById('roster-version').textContent = APP_CONFIG.version;
  document.getElementById('roster-room').textContent = APP_CONFIG.department;

  // Live Clock
  function updateClock() {
    document.getElementById('roster-clock').textContent = formatTime(new Date());
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Attach Table Header Sort Listeners
  document.getElementById('sort-id-btn').addEventListener('click', () => handleSort('id'));
  document.getElementById('sort-first-btn').addEventListener('click', () => handleSort('firstName'));
  document.getElementById('sort-last-btn').addEventListener('click', () => handleSort('lastName'));

  // Search Filter
  document.getElementById('roster-search-input').addEventListener('input', (e) => {
    rosterSearchQuery = e.target.value.toLowerCase().trim();
    renderRosterTable();
  });

  // Export Roster CSV
  document.getElementById('export-roster-csv-btn').addEventListener('click', handleExportRosterCSV);

  // Edit All Toggle
  document.getElementById('edit-all-btn').addEventListener('click', toggleEditAll);

  // Quick Add Form
  document.getElementById('quick-add-form').addEventListener('submit', handleQuickAdd);

  // File Upload Dropzone Setup
  setupDropzone();

  // Google Sheet Sync Setup
  document.getElementById('gsheet-fetch-btn').addEventListener('click', handleGSheetSync);

  // Delete Modal Setup
  document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-confirm-btn').addEventListener('click', confirmDeleteStudent);

  // Overwrite Confirm Modal Setup
  document.getElementById('replace-cancel-btn').addEventListener('click', () => {
    document.getElementById('replace-confirm-modal').classList.add('hidden');
  });

  // Conflict Modal Setup
  document.getElementById('conflict-use-new-btn').addEventListener('click', () => resolveConflict('new'));
  document.getElementById('conflict-keep-old-btn').addEventListener('click', () => resolveConflict('old'));
  document.getElementById('conflict-keep-both-btn').addEventListener('click', () => resolveConflict('both'));

  // Firebase Realtime Listener: Roster Data
  onValue(ref(db, 'roster'), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
    renderRosterTable();
  });
}

// Table Sorting Handler
function handleSort(column) {
  if (currentSortColumn === column) {
    sortAscending = !sortAscending;
  } else {
    currentSortColumn = column;
    sortAscending = true;
  }
  renderRosterTable();
}

// Render Roster Table
function renderRosterTable() {
  const tbody = document.getElementById('roster-tbody');
  const badge = document.getElementById('roster-count-badge');
  const studentsList = Object.values(rosterData);

  badge.textContent = `${studentsList.length} Students`;

  // Filter List
  const filteredList = studentsList.filter(s => {
    if (!rosterSearchQuery) return true;
    const matchId = (s.id || '').toLowerCase().includes(rosterSearchQuery);
    const matchFirst = (s.firstName || '').toLowerCase().includes(rosterSearchQuery);
    const matchLast = (s.lastName || '').toLowerCase().includes(rosterSearchQuery);
    return matchId || matchFirst || matchLast;
  });

  if (filteredList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-500 italic font-sans">No student records found matching search query.</td></tr>`;
    return;
  }

  // Sort List
  filteredList.sort((a, b) => {
    let valA = (a[currentSortColumn] || '').toString().toLowerCase();
    let valB = (b[currentSortColumn] || '').toString().toLowerCase();

    if (currentSortColumn === 'id') {
      const numA = parseInt(valA, 10);
      const numB = parseInt(valB, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return sortAscending ? numA - numB : numB - numA;
      }
    }

    if (valA < valB) return sortAscending ? -1 : 1;
    if (valA > valB) return sortAscending ? 1 : -1;
    return 0;
  });

  // Render Rows
  tbody.innerHTML = filteredList.map(s => {
    if (editModeActive) {
      return `
        <tr class="bg-slate-800/80">
          <td class="py-2 px-3">
            <input type="text" id="edit-id-${s.id}" value="${s.id}" class="bg-slate-900 border border-slate-700 text-amber-400 p-1 rounded w-full font-mono text-xs" readonly />
          </td>
          <td class="py-2 px-3">
            <input type="text" id="edit-first-${s.id}" value="${s.firstName || ''}" class="bg-slate-900 border border-slate-700 text-white p-1 rounded w-full font-sans text-xs" />
          </td>
          <td class="py-2 px-3">
            <input type="text" id="edit-last-${s.id}" value="${s.lastName || ''}" class="bg-slate-900 border border-slate-700 text-white p-1 rounded w-full font-sans text-xs" />
          </td>
          <td class="py-2 px-3 text-center">
            <button onclick="window.saveSingleRow('${s.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded transition mr-1">Save</button>
            <button onclick="window.openDeleteModal('${s.id}', '${s.firstName} ${s.lastName}')" class="text-rose-400 hover:text-rose-300 p-1 text-xs"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      `;
    }

    return `
      <tr class="hover:bg-slate-800/50 transition border-b border-slate-700/40">
        <td class="py-2.5 px-4 text-amber-400 font-bold">${s.id}</td>
        <td class="py-2.5 px-4 text-white font-sans">${s.firstName || ''}</td>
        <td class="py-2.5 px-4 text-white font-sans">${s.lastName || ''}</td>
        <td class="py-2.5 px-4 text-center">
          <button onclick="window.openDeleteModal('${s.id}', '${s.firstName} ${s.lastName}')" class="text-slate-400 hover:text-rose-400 p-1 transition" title="Delete Student">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Save Single Row Edit
window.saveSingleRow = async function(id) {
  const firstName = document.getElementById(`edit-first-${id}`).value.trim();
  const lastName = document.getElementById(`edit-last-${id}`).value.trim();

  if (!firstName || !lastName) {
    alert("First and Last name cannot be empty.");
    return;
  }

  await update(ref(db, `roster/${id}`), {
    firstName,
    lastName
  });
};

// Toggle Edit All Mode
function toggleEditAll() {
  editModeActive = !editModeActive;
  const btn = document.getElementById('edit-all-btn');
  if (editModeActive) {
    btn.className = "bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow transition flex items-center gap-1.5";
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Done Editing`;
  } else {
    btn.className = "bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg shadow transition flex items-center gap-1.5";
    btn.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit All`;
  }
  renderRosterTable();
}

// Quick Add Handler
async function handleQuickAdd() {
  const id = document.getElementById('qa-id').value.trim();
  const firstName = document.getElementById('qa-first').value.trim();
  const lastName = document.getElementById('qa-last').value.trim();

  if (!id || !firstName || !lastName) return;

  if (rosterData[id]) {
    if (!confirm(`Student ID ${id} already exists (${rosterData[id].firstName} ${rosterData[id].lastName}). Overwrite?`)) {
      return;
    }
  }

  await set(ref(db, `roster/${id}`), { id, firstName, lastName });

  document.getElementById('qa-id').value = '';
  document.getElementById('qa-first').value = '';
  document.getElementById('qa-last').value = '';
}

// Delete Student Modal Handlers
window.openDeleteModal = function(id, name) {
  studentToDeleteId = id;
  document.getElementById('delete-student-name').textContent = `Are you sure you want to remove ${name} (ID: ${id}) from the roster?`;
  document.getElementById('delete-confirm-modal').classList.remove('hidden');
};

function closeDeleteModal() {
  studentToDeleteId = null;
  document.getElementById('delete-confirm-modal').classList.add('hidden');
}

async function confirmDeleteStudent() {
  if (studentToDeleteId) {
    await remove(ref(db, `roster/${studentToDeleteId}`));
    closeDeleteModal();
  }
}

// CSV Dropzone Setup
function setupDropzone() {
  const dropzone = document.getElementById('csv-dropzone');
  const fileInput = document.getElementById('csv-file-input');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-amber-400', 'bg-slate-800');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-amber-400', 'bg-slate-800');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-amber-400', 'bg-slate-800');
    if (e.dataTransfer.files.length > 0) {
      parseCSVFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      parseCSVFile(e.target.files[0]);
    }
  });
}

// Parse CSV Text
function parseCSVText(csvText) {
  const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  const parsedRecords = [];

  lines.forEach((line, index) => {
    const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
    if (parts.length >= 3) {
      const id = parts[0];
      const firstName = parts[1];
      const lastName = parts[2];

      if (index === 0 && (id.toLowerCase().includes('id') || firstName.toLowerCase().includes('first'))) {
        return;
      }

      if (id && firstName && lastName) {
        parsedRecords.push({ id, firstName, lastName });
      }
    }
  });

  return parsedRecords;
}

// Parse CSV File Object
function parseCSVFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const records = parseCSVText(text);
    processImportRecords(records);
  };
  reader.readAsText(file);
}

// Sync Google Sheets CSV
async function handleGSheetSync() {
  const url = document.getElementById('gsheet-url-input').value.trim();
  if (!url) {
    alert("Please enter a valid published Google Sheet CSV URL.");
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch published CSV sheet.");
    const csvText = await response.text();
    const records = parseCSVText(csvText);
    processImportRecords(records);
  } catch (err) {
    alert(`Google Sheet Sync Error: ${err.message}`);
  }
}

// Process Import Records (Merge vs Replace Mode)
async function processImportRecords(records) {
  if (records.length === 0) {
    alert("No valid student records were found in the imported file.");
    return;
  }

  const isReplaceMode = document.getElementById('mode-replace').checked;

  if (isReplaceMode) {
    const modal = document.getElementById('replace-confirm-modal');
    modal.classList.remove('hidden');

    document.getElementById('replace-confirm-btn').onclick = async () => {
      modal.classList.add('hidden');
      const newRosterObj = {};
      records.forEach(r => {
        newRosterObj[r.id] = r;
      });
      await set(ref(db, 'roster'), newRosterObj);
      alert(`Roster successfully replaced with ${records.length} records!`);
    };
  } else {
    importQueue = [...records];
    processImportQueue();
  }
}

// Process Queue for Conflicts in Merge Mode
async function processImportQueue() {
  if (importQueue.length === 0) {
    alert("Bulk Roster Import completed successfully!");
    return;
  }

  const item = importQueue.shift();

  if (rosterData[item.id]) {
    const existing = rosterData[item.id];
    if (existing.firstName === item.firstName && existing.lastName === item.lastName) {
      await set(ref(db, `roster/${item.id}`), item);
      processImportQueue();
    } else {
      pendingConflict = { existing, imported: item };
      showConflictModal(existing, item);
    }
  } else {
    await set(ref(db, `roster/${item.id}`), item);
    processImportQueue();
  }
}

// Conflict Resolution Modal
function showConflictModal(existing, imported) {
  const info = document.getElementById('conflict-student-info');
  info.textContent = `ID: ${existing.id} | Existing: ${existing.firstName} ${existing.lastName} | Imported: ${imported.firstName} ${imported.lastName}`;
  document.getElementById('conflict-modal').classList.remove('hidden');
}

async function resolveConflict(choice) {
  document.getElementById('conflict-modal').classList.add('hidden');
  if (!pendingConflict) return;

  const { existing, imported } = pendingConflict;

  if (choice === 'new') {
    await set(ref(db, `roster/${imported.id}`), imported);
  } else if (choice === 'both') {
    const newId = `${imported.id}_1`;
    imported.id = newId;
    await set(ref(db, `roster/${newId}`), imported);
  }

  pendingConflict = null;
  processImportQueue();
}

// Export Roster CSV Handler
function handleExportRosterCSV() {
  const studentsList = Object.values(rosterData);
  if (studentsList.length === 0) {
    alert("No student records available to export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "ID,First Name,Last Name\n";

  studentsList.forEach(s => {
    csvContent += `"${s.id}","${s.firstName || ''}","${s.lastName || ''}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "Chelan_High_Roster.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Execute Authentication Check on Load
checkAuthentication();
