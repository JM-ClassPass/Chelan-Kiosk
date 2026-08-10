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
let selectedFile = null;

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupAddForm();
  setupDragAndDrop();
  setupSearch();
  setupExport();
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

// Realtime Firebase Listener
function attachFirebaseListeners() {
  onValue(ref(db, "roster"), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
    renderRosterTable();
  });
}

// Render Table
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
          No students currently in roster. Add one using Roster Tools on the left.
        </td>
      </tr>
    `;
    return;
  }

  // Filter Search
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

  // Sort by Last Name
  filtered.sort(([_, a], [__, b]) => (a.lastName || "").localeCompare(b.lastName || ""));

  tbody.innerHTML = filtered.map(([id, student]) => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-3 font-mono text-[#0B4F2C] font-black">${id}</td>
      <td class="py-3 px-3 text-slate-800">${student.firstName || ''}</td>
      <td class="py-3 px-3 text-slate-800">${student.lastName || ''}</td>
      <td class="py-3 px-3 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button data-edit="${id}" class="btn-edit-student px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] transition">
            Edit
          </button>
          <button data-delete="${id}" class="btn-delete-student px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] transition">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Attach Handlers
  attachRowHandlers();
}

function attachRowHandlers() {
  // Delete Button
  document.querySelectorAll(".btn-delete-student").forEach(btn => {
    btn.onclick = async (e) => {
      const id = e.currentTarget.getAttribute("data-delete");
      const student = rosterData[id];
      if (id && confirm(`Delete ${student?.firstName} ${student?.lastName} (ID: ${id}) from the roster?`)) {
        await remove(ref(db, `roster/${id}`));
      }
    };
  });

  // Edit Button
  document.querySelectorAll(".btn-edit-student").forEach(btn => {
    btn.onclick = async (e) => {
      const id = e.currentTarget.getAttribute("data-edit");
      const student = rosterData[id];
      if (!id || !student) return;

      const newFirst = prompt("Edit First Name:", student.firstName);
      if (newFirst === null) return;

      const newLast = prompt("Edit Last Name:", student.lastName);
      if (newLast === null) return;

      await set(ref(db, `roster/${id}`), {
        firstName: newFirst.trim() || student.firstName,
        lastName: newLast.trim() || student.lastName
      });
    };
  });
}

// Quick Add Student
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

// Drag & Drop CSV Uploader
function setupDragAndDrop() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("csv-file-input");
  const browseBtn = document.getElementById("btn-browse-file");
  const processBtn = document.getElementById("btn-process-import");
  const dropText = document.getElementById("drop-zone-text");

  if (!dropZone || !fileInput) return;

  browseBtn.onclick = (e) => {
    e.stopPropagation();
    fileInput.click();
  };

  dropZone.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
      selectedFile = e.target.files[0];
      dropText.textContent = `Selected: ${selectedFile.name}`;
      dropZone.classList.add("bg-emerald-100/50", "border-emerald-600");
    }
  };

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("bg-emerald-100/60", "border-emerald-600");
  });

  dropZone.addEventListener("dragleave", () => {
    if (!selectedFile) {
      dropZone.classList.remove("bg-emerald-100/60", "border-emerald-600");
    }
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      selectedFile = e.dataTransfer.files[0];
      fileInput.files = e.dataTransfer.files;
      dropText.textContent = `Selected: ${selectedFile.name}`;
      dropZone.classList.add("bg-emerald-100/50", "border-emerald-600");
    }
  });

  processBtn.onclick = () => {
    if (!selectedFile) {
      alert("Please select or drop a CSV file first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      await processCSV(evt.target.result);
      selectedFile = null;
      fileInput.value = "";
      dropText.textContent = "Drag & Drop CSV File Here";
      dropZone.classList.remove("bg-emerald-100/50", "border-emerald-600");
    };
    reader.readAsText(selectedFile);
  };
}

// CSV Processing (Supports Merge & Replace Mode)
async function processCSV(csvContent) {
  const mode = document.querySelector('input[name="import-mode"]:checked')?.value || "merge";
  const lines = csvContent.split(/\r?\n/);

  if (lines.length < 2) {
    alert("CSV file is empty or missing data.");
    return;
  }

  if (mode === "replace") {
    if (!confirm("Warning: REPLACE ENTIRE ROSTER will erase all current roster entries. Continue?")) {
      return;
    }
    await remove(ref(db, "roster"));
  }

  let count = 0;

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
        count++;
      }
    }
  }

  alert(`Imported ${count} student records into the roster!`);
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

// Export CSV
function setupExport() {
  const btnExport = document.getElementById("btn-export-roster");
  if (!btnExport) return;

  btnExport.onclick = () => {
    const entries = Object.entries(rosterData);
    if (entries.length === 0) {
      alert("No roster entries to export.");
      return;
    }

    let csv = "ID Code,First Name,Last Name\n";
    entries.forEach(([id, s]) => {
      csv += `"${id}","${s.firstName || ''}","${s.lastName || ''}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Chelan_Class_Roster_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };
}
