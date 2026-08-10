/**
 * Chelan High School - Student Roster Engine (roster.js)
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
let searchQuery = "";
let selectedFile = null;

// Sorting State
let sortColumn = "lastName";
let sortDirection = "asc"; // "asc" | "desc"

// Bulk Edit State
let isEditAllMode = false;

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupAddForm();
  setupDragAndDrop();
  setupSearch();
  setupExport();
  setupSorting();
  setupEditAll();
  attachFirebaseListeners();
});

// Live Clock
function initClock() {
  const clockEl = document.getElementById("roster-clock");
  if (!clockEl) return;
  const updateClock = () => {
    clockEl.textContent = formatTime(new Date());
  };
  setInterval(updateClock, 1000);
  updateClock();
}

// Realtime Firebase Listener
function attachFirebaseListeners() {
  onValue(ref(db, "roster"), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
    renderRosterTable();
  });
}

// Setup Column Header Sorting
function setupSorting() {
  document.querySelectorAll(".sort-header").forEach(th => {
    th.onclick = () => {
      const col = th.getAttribute("data-sort");
      if (sortColumn === col) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortColumn = col;
        sortDirection = "asc";
      }
      updateSortIcons();
      renderRosterTable();
    };
  });
}

function updateSortIcons() {
  ["id", "firstName", "lastName"].forEach(col => {
    const icon = document.getElementById(`sort-icon-${col}`);
    if (!icon) return;
    if (col === sortColumn) {
      icon.textContent = sortDirection === "asc" ? "↑" : "↓";
      icon.className = "ml-0.5 text-[#0B4F2C] font-black";
    } else {
      icon.textContent = "↑↓";
      icon.className = "ml-0.5 text-slate-300";
    }
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

  // Sort Logic
  filtered.sort(([idA, studentA], [idB, studentB]) => {
    let valA = "";
    let valB = "";

    if (sortColumn === "id") {
      valA = idA.toLowerCase();
      valB = idB.toLowerCase();
    } else if (sortColumn === "firstName") {
      valA = (studentA.firstName || "").toLowerCase();
      valB = (studentB.firstName || "").toLowerCase();
    } else {
      valA = (studentA.lastName || "").toLowerCase();
      valB = (studentB.lastName || "").toLowerCase();
    }

    const comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    return sortDirection === "asc" ? comparison : -comparison;
  });

  // Render Rows based on mode (Normal vs Edit All)
  if (isEditAllMode) {
    tbody.innerHTML = filtered.map(([id, student]) => `
      <tr class="bg-amber-50/40 hover:bg-amber-100/40 transition border-b border-amber-100">
        <td class="py-2 px-3 font-mono text-[#0B4F2C] font-black">${id}</td>
        <td class="py-2 px-3">
          <input type="text" data-edit-id="${id}" data-field="firstName" value="${student.firstName || ''}" 
            class="w-full text-xs font-bold py-1 px-2 rounded-lg border border-amber-300 focus:border-[#0B4F2C] focus:outline-none bg-white">
        </td>
        <td class="py-2 px-3">
          <input type="text" data-edit-id="${id}" data-field="lastName" value="${student.lastName || ''}" 
            class="w-full text-xs font-bold py-1 px-2 rounded-lg border border-amber-300 focus:border-[#0B4F2C] focus:outline-none bg-white">
        </td>
        <td class="py-2 px-3 text-right">
          <button data-delete="${id}" class="btn-delete-student px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] transition">
            Delete
          </button>
        </td>
      </tr>
    `).join('');
  } else {
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
  }

  attachRowHandlers();
}

function attachRowHandlers() {
  // Delete Button
  document.querySelectorAll(".btn-delete-student").forEach(btn => {
    btn.onclick = async (e) => {
      const id = e.currentTarget.getAttribute("data-delete");
      const student = rosterData[id];
      if (id && confirm(`Delete ${student?.firstName || ''} ${student?.lastName || ''} (ID: ${id}) from the roster?`)) {
        await remove(ref(db, `roster/${id}`));
      }
    };
  });

  // Single Edit Button (When not in Edit All mode)
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

// Bulk Edit All Toggle & Save
function setupEditAll() {
  const btnEditAll = document.getElementById("btn-edit-all");
  const btnCancel = document.getElementById("btn-cancel-edit");
  if (!btnEditAll || !btnCancel) return;

  btnEditAll.onclick = async () => {
    if (!isEditAllMode) {
      // Enter Edit All Mode
      isEditAllMode = true;
      btnEditAll.className = "bg-[#0B4F2C] hover:bg-[#07381e] text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm";
      btnEditAll.innerHTML = `<i class="fa-solid fa-floppy-disk text-amber-300"></i> Save All`;
      btnCancel.classList.remove("hidden");
      renderRosterTable();
    } else {
      // Save All Mode Executed
      const updates = {};
      const inputs = document.querySelectorAll("input[data-edit-id]");
      
      inputs.forEach(input => {
        const id = input.getAttribute("data-edit-id");
        const field = input.getAttribute("data-field");
        const val = input.value.trim();

        if (!updates[`roster/${id}`]) {
          updates[`roster/${id}`] = { ...rosterData[id] };
        }
        updates[`roster/${id}`][field] = val;
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
      }

      // Exit Edit All Mode
      isEditAllMode = false;
      btnEditAll.className = "bg-amber-100 hover:bg-amber-200 text-amber-900 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm";
      btnEditAll.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit All`;
      btnCancel.classList.add("hidden");
      renderRosterTable();
    }
  };

  btnCancel.onclick = () => {
    isEditAllMode = false;
    btnEditAll.className = "bg-amber-100 hover:bg-amber-200 text-amber-900 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm";
    btnEditAll.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit All`;
    btnCancel.classList.add("hidden");
    renderRosterTable();
  };
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

// CSV Processing
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
