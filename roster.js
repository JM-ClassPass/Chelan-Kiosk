/**
 * Chelan High School - Student Roster Engine (roster.js)
 */

import { APP_CONFIG, formatTime } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, remove 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// State
let rosterData = {};
let searchQuery = "";

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupAddForm();
  setupCSVImport();
  setupSearch();
  setupBulkActions();
  attachFirebaseListeners();
});

// Live Clock
function initClock() {
  const clockEl = document.getElementById("roster-clock");
  if (!clockEl) return;
  const update = () => {
    clockEl.textContent = formatTime(new Date());
  };
  setInterval(update, 1000);
  update();
}

// Realtime Listener
function attachFirebaseListeners() {
  onValue(ref(db, "roster"), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
    renderRosterTable();
  });
}

// Render Roster Table
function renderRosterTable() {
  const tbody = document.getElementById("roster-table-body");
  const countEl = document.getElementById("roster-count");
  if (!tbody) return;

  const entries = Object.entries(rosterData);
  if (countEl) countEl.textContent = entries.length;

  if (entries.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-12 text-slate-400 italic">
          No students currently in the roster. Add one or upload a CSV file.
        </td>
      </tr>
    `;
    return;
  }

  // Filter entries
  const filtered = entries.filter(([id, student]) => {
    const q = searchQuery.toLowerCase();
    const studentId = id.toString().toLowerCase();
    const first = (student.firstName || "").toLowerCase();
    const last = (student.lastName || "").toLowerCase();

    return studentId.includes(q) || first.includes(q) || last.includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-8 text-slate-400 italic">
          No students found matching "${searchQuery}".
        </td>
      </tr>
    `;
    return;
  }

  // Sort alphabetically by last name
  filtered.sort(([_, a], [__, b]) => (a.lastName || "").localeCompare(b.lastName || ""));

  tbody.innerHTML = filtered.map(([id, student]) => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-3 font-mono text-[#0B4F2C]">${id}</td>
      <td class="py-3 px-3 text-slate-900">${student.firstName || ''}</td>
      <td class="py-3 px-3 text-slate-900">${student.lastName || ''}</td>
      <td class="py-3 px-3 text-right">
        <button data-delete="${id}" class="btn-delete-student p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      </td>
    </tr>
  `).join('');

  // Attach delete buttons
  document.querySelectorAll(".btn-delete-student").forEach(btn => {
    btn.onclick = async (e) => {
      const id = e.currentTarget.getAttribute("data-delete");
      if (id && confirm(`Remove student ID ${id} (${rosterData[id]?.firstName} ${rosterData[id]?.lastName})?`)) {
        await remove(ref(db, `roster/${id}`));
      }
    };
  });
}

// Add Single Student
function setupAddForm() {
  const form = document.getElementById("form-add-student");
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();

    const idInput = document.getElementById("input-id");
    const firstInput = document.getElementById("input-firstname");
    const lastInput = document.getElementById("input-lastname");

    const id = idInput.value.trim();
    const firstName = firstInput.value.trim();
    const lastName = lastInput.value.trim();

    if (!id || !firstName || !lastName) return;

    await set(ref(db, `roster/${id}`), {
      firstName: firstName,
      lastName: lastName
    });

    idInput.value = "";
    firstInput.value = "";
    lastInput.value = "";
    idInput.focus();
  };
}

// CSV Bulk Import Setup
function setupCSVImport() {
  const triggerBtn = document.getElementById("btn-trigger-upload");
  const fileInput = document.getElementById("csv-file-input");

  if (triggerBtn && fileInput) {
    triggerBtn.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target.result;
        await parseAndImportCSV(text);
        fileInput.value = "";
      };
      reader.readAsText(file);
    };
  }
}

async function parseAndImportCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) {
    alert("CSV file appears to be empty or missing data lines.");
    return;
  }

  let importedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",").map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length >= 3) {
      const [id, firstName, lastName] = parts;
      if (id) {
        await set(ref(db, `roster/${id}`), {
          firstName: firstName || "Student",
          lastName: lastName || ""
        });
        importedCount++;
      }
    }
  }

  alert(`Successfully imported ${importedCount} student records into the roster!`);
}

// Search Filter
function setupSearch() {
  const searchInput = document.getElementById("search-input");
  if (!searchInput) return;

  searchInput.oninput = (e) => {
    searchQuery = e.target.value.trim();
    renderRosterTable();
  };
}

// Export & Clear Bulk Actions
function setupBulkActions() {
  const btnExport = document.getElementById("btn-export-roster");
  const btnClear = document.getElementById("btn-clear-roster");

  if (btnExport) {
    btnExport.onclick = () => {
      const entries = Object.entries(rosterData);
      if (entries.length === 0) {
        alert("No roster data available to export.");
        return;
      }

      let csv = "ID,FirstName,LastName\n";
      entries.forEach(([id, s]) => {
        csv += `"${id}","${s.firstName || ''}","${s.lastName || ''}"\n`;
      });

      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Chelan_Roster_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    };
  }

  if (btnClear) {
    btnClear.onclick = async () => {
      if (confirm("Are you sure you want to CLEAR THE ENTIRE ROSTER? This cannot be undone.")) {
        await remove(ref(db, "roster"));
      }
    };
  }
}
