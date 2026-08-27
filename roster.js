import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, remove, get, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { APP_CONFIG, escapeHtml } from './config.js';

// ==========================================
// 1. FIREBASE INITIALIZATION & AUTH SETUP
// ==========================================
const app = initializeApp(APP_CONFIG.firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();

// Header Profile Elements
const userProfile = document.getElementById("user-profile");
const userEmailSpan = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

// Login Overlay Elements
const loginOverlay = document.getElementById("login-overlay");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

// ==========================================
// 2. AUTH GUARD & ALLOWLIST VERIFICATION
// ==========================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (loginError) loginError.textContent = "Verifying permissions...";

    const allowRef = ref(db, `allowed_teachers/${user.uid}`);
    const delays = [0, 500, 1200, 2500]; // a few attempts, backing off
    let snapshot = null;
    let lastErr = null;

    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise(resolve => setTimeout(resolve, delays[i]));
      try {
        snapshot = await get(allowRef);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`Allowlist check attempt ${i + 1} failed:`, err.code || err.message);
      }
    }

    if (lastErr) {
      console.error("Allowlist check failed after all retries:", lastErr.code || lastErr.message);
      if (loginError) loginError.textContent = "Couldn't verify your access — check your connection and try again.";
      if (loginOverlay) loginOverlay.classList.remove("hidden");
      if (userProfile) userProfile.classList.add("hidden");
      return; // do NOT sign out — this was a connection problem, not a denial
    }

    const isAllowed = snapshot.exists() && snapshot.val() === true;

    if (isAllowed) {
      if (loginOverlay) loginOverlay.classList.add("hidden");
      if (loginError) loginError.textContent = "";
      if (userEmailSpan) userEmailSpan.textContent = user.email;
      if (userProfile) userProfile.classList.remove("hidden");

      console.log(`Teacher authorized on Roster: ${user.email}`);
    } else {
      if (loginError) loginError.textContent = "Access Denied: this account isn't on the approved teacher list. Ask an admin to add your UID.";
      if (userProfile) userProfile.classList.add("hidden");
      signOut(auth);
    }
  } else {
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (userProfile) userProfile.classList.add("hidden");
    // DELETE OR COMMENT OUT THIS LINE BELOW:
    // if (loginError) loginError.textContent = "";
  }
});

if (loginBtn) {
  loginBtn.addEventListener("click", () => signInWithPopup(auth, provider));
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => signOut(auth));
}

// ==========================================
// 3. STATE VARIABLES
// ==========================================
let rosterData = [];
let sortCol = 'lastName';
let sortDesc = false;
let searchQuery = '';
let isEditAllMode = false;
let editingRows = new Set(); 
let selectedRows = new Set(); // Tracks rows checked for bulk deletion
let currentFilteredRoster = []; // Keeps track of what's currently visible
let csvFileToImport = null;

// ==========================================
// 4. UI ELEMENT REFERENCES
// ==========================================
const clockEl = document.getElementById('roster-clock');
const tableBody = document.getElementById('roster-table-body');
const countEl = document.getElementById('roster-count');
const searchInput = document.getElementById('search-input');
const btnEditAll = document.getElementById('btn-edit-all');
const btnSaveAll = document.getElementById('btn-save-all');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnExport = document.getElementById('btn-export-roster');
const btnBulkDelete = document.getElementById('btn-bulk-delete');
const bulkDeleteCount = document.getElementById('bulk-delete-count');
const cbSelectAll = document.getElementById('cb-select-all');
const formAddStudent = document.getElementById('form-add-student');

const dropZone = document.getElementById('drop-zone');
const dropZoneText = document.getElementById('drop-zone-text');
const csvInput = document.getElementById('csv-file-input');
const btnBrowse = document.getElementById('btn-browse-file');
const btnProcessImport = document.getElementById('btn-process-import');

// ==========================================
// 5. CLOCK & INITIALIZATION
// ==========================================
setInterval(() => {
  if (clockEl) {
    clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }
}, 1000);

// Load data in real-time
const rosterRef = ref(db, 'classroom_roster');
onValue(rosterRef, (snapshot) => {
  rosterData = [];
  if (snapshot.exists()) {
    const data = snapshot.val();
    for (const [id, info] of Object.entries(data)) {
      rosterData.push({ id, firstName: info.firstName, lastName: info.lastName });
    }
  }
  
  // Clean up selectedRows in case someone was deleted elsewhere
  const existingIds = new Set(rosterData.map(s => s.id));
  for (let id of selectedRows) {
    if (!existingIds.has(id)) selectedRows.delete(id);
  }
  
  renderTable();
});

// ==========================================
// 6. TABLE RENDERING & LOGIC
// ==========================================
function renderTable() {
  if (!tableBody) return;

  // Filter
  currentFilteredRoster = rosterData.filter(s => 
    s.id.toLowerCase().includes(searchQuery) ||
    s.firstName.toLowerCase().includes(searchQuery) ||
    s.lastName.toLowerCase().includes(searchQuery)
  );

  // Sort
  currentFilteredRoster.sort((a, b) => {
    let valA = a[sortCol].toLowerCase();
    let valB = b[sortCol].toLowerCase();
    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  if (countEl) countEl.textContent = currentFilteredRoster.length;
  tableBody.innerHTML = '';

  // Update Select All Checkbox state
  if (cbSelectAll) {
    cbSelectAll.checked = currentFilteredRoster.length > 0 && selectedRows.size === currentFilteredRoster.length;
  }

  updateBulkDeleteUI();

  if (currentFilteredRoster.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">No students found.</td></tr>`;
    return;
  }

  currentFilteredRoster.forEach(student => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50/50 transition";
    
    const isEditing = isEditAllMode || editingRows.has(student.id);
    const isSelected = selectedRows.has(student.id);
    
    const safeId = escapeHtml(student.id);
    const safeFirst = escapeHtml(student.firstName);
    const safeLast = escapeHtml(student.lastName);

    const checkboxHtml = `<td class="py-3 px-3 border-t border-slate-100 text-center"><input type="checkbox" class="row-checkbox accent-[#0B4F2C] w-4 h-4 rounded cursor-pointer" data-id="${student.id}" ${isSelected ? 'checked' : ''}></td>`;

    if (isEditing) {
      tr.innerHTML = `
        ${checkboxHtml}
        <td class="py-3 px-3 border-t border-slate-100 font-mono text-slate-500">${safeId}</td>
        <td class="py-3 px-3 border-t border-slate-100"><input type="text" value="${safeFirst}" class="edit-fn w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-[#0B4F2C] focus:outline-none" /></td>
        <td class="py-3 px-3 border-t border-slate-100"><input type="text" value="${safeLast}" class="edit-ln w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-[#0B4F2C] focus:outline-none" /></td>
        <td class="py-3 px-3 border-t border-slate-100 text-right">
          <button data-id="${student.id}" class="btn-save inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-bold transition shadow-sm text-xs">
            <i class="fa-solid fa-check"></i> Save
          </button>
        </td>
      `;
    } else {
      tr.innerHTML = `
        ${checkboxHtml}
        <td class="py-3 px-3 border-t border-slate-100 font-mono text-slate-500">${safeId}</td>
        <td class="py-3 px-3 border-t border-slate-100">${safeFirst}</td>
        <td class="py-3 px-3 border-t border-slate-100">${safeLast}</td>
        <td class="py-3 px-3 border-t border-slate-100 text-right space-x-1.5">
          <button data-id="${student.id}" class="btn-edit text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg shadow-sm transition">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button data-id="${student.id}" class="btn-delete text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg shadow-sm transition">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;
    }
    tableBody.appendChild(tr);
  });
}

function updateBulkDeleteUI() {
  if (!btnBulkDelete || !bulkDeleteCount) return;

  if (selectedRows.size > 0) {
    btnBulkDelete.classList.remove('hidden');
    btnBulkDelete.classList.add('inline-flex');
    bulkDeleteCount.textContent = selectedRows.size;
  } else {
    btnBulkDelete.classList.add('hidden');
    btnBulkDelete.classList.remove('inline-flex');
  }
}

// Event Delegation for Table Actions
if (tableBody) {
  tableBody.addEventListener('click', async (e) => {
    const target = e.target.closest('button');
    if (!target) return;

    const id = target.getAttribute('data-id');

    if (target.classList.contains('btn-delete')) {
      if(confirm(`Are you sure you want to remove student ID ${id}?`)) {
        await remove(ref(db, `classroom_roster/${id}`));
        selectedRows.delete(id);
      }
    }

    if (target.classList.contains('btn-edit')) {
      editingRows.add(id);
      renderTable();
    }

    if (target.classList.contains('btn-save')) {
      const tr = target.closest('tr');
      const newFn = tr.querySelector('.edit-fn').value.trim();
      const newLn = tr.querySelector('.edit-ln').value.trim();
      
      if(newFn && newLn) {
        try {
          await update(ref(db, `classroom_roster/${id}`), { firstName: newFn, lastName: newLn });
          editingRows.delete(id);
          renderTable(); 
        } catch (err) {
          alert("Error saving student data. Please check your connection.");
        }
      } else {
        alert("First and Last name cannot be blank.");
      }
    }
  });

  tableBody.addEventListener('change', (e) => {
    if (e.target.classList.contains('row-checkbox')) {
      const id = e.target.getAttribute('data-id');
      if (e.target.checked) {
        selectedRows.add(id);
      } else {
        selectedRows.delete(id);
      }
      renderTable();
    }
  });
}

if (cbSelectAll) {
  cbSelectAll.addEventListener('change', (e) => {
    if (e.target.checked) {
      currentFilteredRoster.forEach(student => selectedRows.add(student.id));
    } else {
      selectedRows.clear();
    }
    renderTable();
  });
}

if (btnBulkDelete) {
  btnBulkDelete.addEventListener('click', async () => {
    if (selectedRows.size === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedRows.size} selected students? This cannot be undone.`)) {
      const updates = {};
      selectedRows.forEach(id => {
        updates[`classroom_roster/${id}`] = null;
      });
      
      try {
        await update(ref(db), updates);
        selectedRows.clear();
        renderTable();
      } catch (err) {
        alert("Error deleting students.");
      }
    }
  });
}

// ==========================================
// 7. UI CONTROLS (Search, Sort, Edit Modes)
// ==========================================
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderTable();
  });
}

document.querySelectorAll('.sort-header').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.getAttribute('data-sort');
    if (sortCol === col) {
      sortDesc = !sortDesc;
    } else {
      sortCol = col;
      sortDesc = false;
    }
    
    document.querySelectorAll('[id^="sort-icon-"]').forEach(icon => {
      icon.textContent = '↑↓';
      icon.className = 'ml-0.5 text-slate-400';
    });

    const activeIcon = document.getElementById(`sort-icon-${col}`);
    if (activeIcon) {
      activeIcon.textContent = sortDesc ? '↓' : '↑';
      activeIcon.className = 'ml-0.5 text-[#0B4F2C]';
    }

    renderTable();
  });
});

if (btnEditAll) {
  btnEditAll.addEventListener('click', () => {
    isEditAllMode = true;
    editingRows.clear(); 
    btnEditAll.classList.add('hidden');
    if (btnSaveAll) btnSaveAll.classList.remove('hidden');
    if (btnCancelEdit) btnCancelEdit.classList.remove('hidden');
    renderTable();
  });
}

if (btnSaveAll) {
  btnSaveAll.addEventListener('click', async () => {
    const updates = {};
    
    document.querySelectorAll('#roster-table-body tr').forEach(tr => {
      const saveBtn = tr.querySelector('.btn-save');
      if (saveBtn) {
        const id = saveBtn.getAttribute('data-id');
        const fn = tr.querySelector('.edit-fn').value.trim();
        const ln = tr.querySelector('.edit-ln').value.trim();
        
        if (fn && ln) {
          updates[`classroom_roster/${id}/firstName`] = fn;
          updates[`classroom_roster/${id}/lastName`] = ln;
        }
      }
    });
    
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }
    
    isEditAllMode = false;
    editingRows.clear();
    btnSaveAll.classList.add('hidden');
    if (btnCancelEdit) btnCancelEdit.classList.add('hidden');
    if (btnEditAll) btnEditAll.classList.remove('hidden');
  });
}

if (btnCancelEdit) {
  btnCancelEdit.addEventListener('click', () => {
    isEditAllMode = false;
    editingRows.clear();
    if (btnSaveAll) btnSaveAll.classList.add('hidden');
    btnCancelEdit.classList.add('hidden');
    if (btnEditAll) btnEditAll.classList.remove('hidden');
    renderTable();
  });
}

// ==========================================
// 8. ADD SINGLE STUDENT
// ==========================================
if (formAddStudent) {
  formAddStudent.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const idInput = document.getElementById('input-id');
    const fnInput = document.getElementById('input-firstname');
    const lnInput = document.getElementById('input-lastname');
    
    const studentId = idInput.value.trim().replace(/[^a-zA-Z0-9]/g, '');
    const firstName = fnInput.value.trim();
    const lastName = lnInput.value.trim();

    if (!studentId || !firstName || !lastName) return;

    try {
      await set(ref(db, `classroom_roster/${studentId}`), { firstName, lastName });
      idInput.value = '';
      fnInput.value = '';
      lnInput.value = '';
      idInput.focus();
    } catch (error) {
      alert("Error adding student. Check permissions.");
    }
  });
}

// ==========================================
// 9. CSV IMPORT LOGIC
// ==========================================
if (btnBrowse && csvInput) {
  btnBrowse.addEventListener('click', () => csvInput.click());

  csvInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
        alert("Please select a .csv, .xlsx, or .xls file.");
        csvInput.value = '';
        return;
      }
      csvFileToImport = file;
      if (dropZoneText) {
        dropZoneText.textContent = `Selected: ${csvFileToImport.name}`;
        dropZoneText.classList.add('text-[#0B4F2C]');
      }
    }
  });
}

if (dropZone) {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('bg-emerald-100/50');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('bg-emerald-100/50');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('bg-emerald-100/50');
    
    if (e.dataTransfer.files.length > 0) {
      csvFileToImport = e.dataTransfer.files[0];
      if (/\.(csv|xlsx|xls)$/i.test(csvFileToImport.name)) {
        if (dropZoneText) {
          dropZoneText.textContent = `Ready: ${csvFileToImport.name}`;
          dropZoneText.classList.add('text-[#0B4F2C]');
        }
      } else {
        alert("Please upload a .csv, .xlsx, or .xls file.");
        csvFileToImport = null;
      }
    }
  });
}

if (btnProcessImport) {
  btnProcessImport.addEventListener('click', () => {
    if (!csvFileToImport) {
      return alert("Please select or drop a file first.");
    }

    const isSpreadsheet = /\.(xlsx|xls)$/i.test(csvFileToImport.name);

    const finishImport = async (rows) => {
      // rows: array of arrays, each like [id, firstName, lastName, ...],
      // NOT including the header row.
      const modeEl = document.querySelector('input[name="import-mode"]:checked');
      const mode = modeEl ? modeEl.value : 'append';

      if (mode === 'replace') {
        if (!confirm("WARNING: This will delete your entire existing roster before importing. Continue?")) return;
        await remove(ref(db, 'classroom_roster'));
      }

      // Build one multi-path update instead of writing each student
      // separately — for a real class-sized (or larger) roster, N
      // sequential awaited writes is slow with no way to show real
      // progress, and a page refresh mid-import would leave it half
      // done. A single atomic update avoids both problems.
      const updates = {};
      let importedCount = 0;

      for (const row of rows) {
        const sid = String(row[0] ?? '').replace(/[^a-zA-Z0-9]/g, '');
        const fn = String(row[1] ?? '').trim();
        const ln = String(row[2] ?? '').trim();

        if (sid && fn && ln) {
          updates[`classroom_roster/${sid}`] = { firstName: fn, lastName: ln };
          importedCount++;
        }
      }

      if (importedCount === 0) {
        alert("No valid rows found. Expected columns: ID, First Name, Last Name (with a header row).");
        return;
      }

      try {
        await update(ref(db), updates);
        alert(`Successfully processed ${importedCount} students!`);
      } catch (err) {
        console.error("Import failed:", err);
        alert("Import failed: " + err.message);
        return;
      }

      csvFileToImport = null;
      if (dropZoneText) {
        dropZoneText.textContent = "Drag & Drop CSV or Excel File Here";
        dropZoneText.classList.remove('text-[#0B4F2C]');
      }
      if (csvInput) csvInput.value = '';
    };

    if (isSpreadsheet) {
      if (typeof XLSX === 'undefined') {
        alert("Spreadsheet support failed to load — check your internet connection and try again, or use a .csv file instead.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const allRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          finishImport(allRows.slice(1)); // skip header row, same as the CSV path
        } catch (err) {
          console.error("Spreadsheet parse failed:", err);
          alert("Couldn't read that spreadsheet file: " + err.message);
        }
      };
      reader.readAsArrayBuffer(csvFileToImport);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const allRows = lines.map(line => line.split(',').map(p => p.trim()));
        finishImport(allRows.slice(1)); // skip header row
      };
      reader.readAsText(csvFileToImport);
    }
  });
}

// ==========================================
// 10. CSV EXPORT LOGIC
// ==========================================
if (btnExport) {
  btnExport.addEventListener('click', () => {
    if (rosterData.length === 0) return alert("Roster is empty.");
    
    let csvContent = "ID,First Name,Last Name\n";
    
    const exportData = [...rosterData].sort((a, b) => a.lastName.localeCompare(b.lastName));
    
    exportData.forEach(s => {
      csvContent += `"${s.id}","${s.firstName}","${s.lastName}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Chelan_Roster_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// ==========================================
// 11. VERSION TAG & MOBILE MENU
// ==========================================
function updateVersionTag() {
    const versionEl = document.getElementById('version');
    if (versionEl && typeof APP_CONFIG !== 'undefined') {
        versionEl.textContent = APP_CONFIG.version;
    }
}

function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuIcon = document.getElementById('mobile-menu-icon');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            if (menuIcon) {
                menuIcon.className = mobileMenu.classList.contains('hidden') ? "fa-solid fa-bars" : "fa-solid fa-xmark";
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateVersionTag();
        initMobileMenu();
    });
} else {
    updateVersionTag();
    initMobileMenu();
}
