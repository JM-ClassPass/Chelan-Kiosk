import { APP_CONFIG } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, get, update } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDOqjLMzMydaR31WWUA35sr1FrNLfHPxuI",
  authDomain: "chelan-classroom-pass-a811e.firebaseapp.com",
  databaseURL: "https://chelan-classroom-pass-a811e-default-rtdb.firebaseio.com",
  projectId: "chelan-classroom-pass-a811e",
  storageBucket: "chelan-classroom-pass-a811e.firebasestorage.app",
  messagingSenderId: "645480807479",
  appId: "1:645480807479:web:d280d4ef38e8754a9953b2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 2. STATE VARIABLES
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
// 3. UI ELEMENT REFERENCES
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
// 4. CLOCK & INITIALIZATION
// ==========================================
setInterval(() => {
  clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
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
// 5. TABLE RENDERING & LOGIC
// ==========================================
function renderTable() {
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

  countEl.textContent = currentFilteredRoster.length;
  tableBody.innerHTML = '';

  // Update Select All Checkbox state
  if (currentFilteredRoster.length > 0 && selectedRows.size === currentFilteredRoster.length) {
    cbSelectAll.checked = true;
  } else {
    cbSelectAll.checked = false;
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
    
    // The checkbox HTML
    const checkboxHtml = `<td class="py-3 px-3 border-t border-slate-100 text-center"><input type="checkbox" class="row-checkbox accent-[#0B4F2C] w-4 h-4 rounded cursor-pointer" data-id="${student.id}" ${isSelected ? 'checked' : ''}></td>`;

    if (isEditing) {
      tr.innerHTML = `
        ${checkboxHtml}
        <td class="py-3 px-3 border-t border-slate-100 font-mono text-slate-500">${student.id}</td>
        <td class="py-3 px-3 border-t border-slate-100"><input type="text" value="${student.firstName}" class="edit-fn w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-[#0B4F2C] focus:outline-none" /></td>
        <td class="py-3 px-3 border-t border-slate-100"><input type="text" value="${student.lastName}" class="edit-ln w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-[#0B4F2C] focus:outline-none" /></td>
        <td class="py-3 px-3 border-t border-slate-100 text-right">
          <button data-id="${student.id}" class="btn-save inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-bold transition shadow-sm text-xs">
            <i class="fa-solid fa-check"></i> Save
          </button>
        </td>
      `;
    } else {
      tr.innerHTML = `
        ${checkboxHtml}
        <td class="py-3 px-3 border-t border-slate-100 font-mono text-slate-500">${student.id}</td>
        <td class="py-3 px-3 border-t border-slate-100">${student.firstName}</td>
        <td class="py-3 px-3 border-t border-slate-100">${student.lastName}</td>
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
  if (selectedRows.size > 0) {
    btnBulkDelete.classList.remove('hidden');
    btnBulkDelete.classList.add('inline-flex');
    bulkDeleteCount.textContent = selectedRows.size;
  } else {
    btnBulkDelete.classList.add('hidden');
    btnBulkDelete.classList.remove('inline-flex');
  }
}

// Event Delegation for Table Actions (Clicks & Changes)
tableBody.addEventListener('click', async (e) => {
  const target = e.target.closest('button');
  if (!target) return;

  const id = target.getAttribute('data-id');

  // Single Delete Action
  if (target.classList.contains('btn-delete')) {
    if(confirm(`Are you sure you want to remove student ID ${id}?`)) {
      await remove(ref(db, `classroom_roster/${id}`));
      selectedRows.delete(id);
    }
  }

  // Individual Row Edit Action
  if (target.classList.contains('btn-edit')) {
    editingRows.add(id);
    renderTable();
  }

  // Save Inline Edit Action
  if (target.classList.contains('btn-save')) {
    const tr = target.closest('tr');
    const newFn = tr.querySelector('.edit-fn').value.trim();
    const newLn = tr.querySelector('.edit-ln').value.trim();
    
    if(newFn && newLn) {
      try {
        // 1. Send update to Firebase
        await update(ref(db, `classroom_roster/${id}`), { firstName: newFn, lastName: newLn });
        
        // 2. Remove from active edit list
        editingRows.delete(id);
        
        // 3. Force the table to re-render immediately to show the saved text
        renderTable(); 
      } catch (err) {
        alert("Error saving student data. Please check your connection.");
      }
    } else {
      alert("First and Last name cannot be blank.");
    }
  }
});

// Handle Checkbox Toggles
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

cbSelectAll.addEventListener('change', (e) => {
  if (e.target.checked) {
    currentFilteredRoster.forEach(student => selectedRows.add(student.id));
  } else {
    selectedRows.clear();
  }
  renderTable();
});

// Bulk Delete Action
btnBulkDelete.addEventListener('click', async () => {
  if (selectedRows.size === 0) return;
  
  if (confirm(`Are you sure you want to delete ${selectedRows.size} selected students? This cannot be undone.`)) {
    const updates = {};
    selectedRows.forEach(id => {
      updates[`classroom_roster/${id}`] = null; // null deletes the node
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

// ==========================================
// 6. UI CONTROLS (Search, Sort, Edit Modes)
// ==========================================
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase();
  renderTable();
});

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
    activeIcon.textContent = sortDesc ? '↓' : '↑';
    activeIcon.className = 'ml-0.5 text-[#0B4F2C]';

    renderTable();
  });
});

btnEditAll.addEventListener('click', () => {
  isEditAllMode = true;
  editingRows.clear(); 
  btnEditAll.classList.add('hidden');
  btnSaveAll.classList.remove('hidden');
  btnCancelEdit.classList.remove('hidden');
  renderTable();
});

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
  btnCancelEdit.classList.add('hidden');
  btnEditAll.classList.remove('hidden');
});

btnCancelEdit.addEventListener('click', () => {
  isEditAllMode = false;
  editingRows.clear();
  btnSaveAll.classList.add('hidden');
  btnCancelEdit.classList.add('hidden');
  btnEditAll.classList.remove('hidden');
  renderTable();
});

// ==========================================
// 7. ADD SINGLE STUDENT
// ==========================================
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

// ==========================================
// 8. CSV IMPORT LOGIC
// ==========================================
btnBrowse.addEventListener('click', () => csvInput.click());

csvInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    csvFileToImport = e.target.files[0];
    dropZoneText.textContent = `Selected: ${csvFileToImport.name}`;
    dropZoneText.classList.add('text-[#0B4F2C]');
  }
});

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
    if (csvFileToImport.name.endsWith('.csv')) {
      dropZoneText.textContent = `Ready: ${csvFileToImport.name}`;
      dropZoneText.classList.add('text-[#0B4F2C]');
    } else {
      alert("Please upload a valid .csv file.");
      csvFileToImport = null;
    }
  }
});

btnProcessImport.addEventListener('click', () => {
  if (!csvFileToImport) {
    return alert("Please select or drop a CSV file first.");
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split('\n').filter(line => line.trim() !== '');
    
    const mode = document.querySelector('input[name="import-mode"]:checked').value;
    
    if (mode === 'replace') {
      if(!confirm("WARNING: This will delete your entire existing roster before importing. Continue?")) return;
      await remove(ref(db, 'classroom_roster'));
    }

    let importedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      if (parts.length >= 3) {
        const sid = parts[0].replace(/[^a-zA-Z0-9]/g, '');
        const fn = parts[1];
        const ln = parts[2];
        
        if (sid && fn && ln) {
          await set(ref(db, `classroom_roster/${sid}`), { firstName: fn, lastName: ln });
          importedCount++;
        }
      }
    }
    
    alert(`Successfully processed ${importedCount} students!`);
    csvFileToImport = null;
    dropZoneText.textContent = "Drag & Drop CSV File Here";
    dropZoneText.classList.remove('text-[#0B4F2C]');
    csvInput.value = ''; 
  };
  
  reader.readAsText(csvFileToImport);
});

// ==========================================
// 9. CSV EXPORT LOGIC
// ==========================================
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

// ==========================================
// CONFIG VERSION UPDATE
// ==========================================
function updateVersionTag() {
    const versionEl = document.getElementById('version');
    if (versionEl && typeof APP_CONFIG !== 'undefined') {
        versionEl.textContent = APP_CONFIG.version;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateVersionTag);
} else {
    updateVersionTag();
}

// ==========================================
// MOBILE MENU TOGGLE LOGIC
// ==========================================
function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuIcon = document.getElementById('mobile-menu-icon');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            
            if (menuIcon) {
                if (mobileMenu.classList.contains('hidden')) {
                    menuIcon.className = "fa-solid fa-bars";
                } else {
                    menuIcon.className = "fa-solid fa-xmark";
                }
            }
        });
    }
}

// Ensure event listener connects whether the page is loading or already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
    initMobileMenu();
}
