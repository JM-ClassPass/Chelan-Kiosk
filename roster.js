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
let editingRows = new Set(); // Tracks individual rows being edited
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
  renderTable();
});

// ==========================================
// 5. TABLE RENDERING & LOGIC
// ==========================================
function renderTable() {
  // Filter
  let filtered = rosterData.filter(s => 
    s.id.toLowerCase().includes(searchQuery) ||
    s.firstName.toLowerCase().includes(searchQuery) ||
    s.lastName.toLowerCase().includes(searchQuery)
  );

  // Sort
  filtered.sort((a, b) => {
    let valA = a[sortCol].toLowerCase();
    let valB = b[sortCol].toLowerCase();
    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  countEl.textContent = filtered.length;
  tableBody.innerHTML = '';

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-400">No students found.</td></tr>`;
    return;
  }

  filtered.forEach(student => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50/50 transition";
    
    // Check if THIS specific row, or ALL rows are being edited
    const isEditing = isEditAllMode || editingRows.has(student.id);

    if (isEditing) {
      tr.innerHTML = `
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
        <td class="py-3 px-3 border-t border-slate-100 font-mono text-slate-500">${student.id}</td>
        <td class="py-3 px-3 border-t border-slate-100">${student.firstName}</td>
        <td class="py-3 px-3 border-t border-slate-100">${student.lastName}</td>
        <td class="py-3 px-3 border-t border-slate-100 text-right space-x-1.5">
          <!-- Edit button always visible -->
          <button data-id="${student.id}" class="btn-edit text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg shadow-sm transition">
            <i class="fa-solid fa-pen"></i>
          </button>
          <!-- Delete button always visible -->
          <button data-id="${student.id}" class="btn-delete text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg shadow-sm transition">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;
    }
    tableBody.appendChild(tr);
  });
}

// Event Delegation for Table Actions
tableBody.addEventListener('click', async (e) => {
  const target = e.target.closest('button');
  if (!target) return;

  const id = target.getAttribute('data-id');

  // Delete Action
  if (target.classList.contains('btn-delete')) {
    if(confirm(`Are you sure you want to remove student ID ${id}?`)) {
      await remove(ref(db, `classroom_roster/${id}`));
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
      await update(ref(db, `classroom_roster/${id}`), { firstName: newFn, lastName: newLn });
      editingRows.delete(id); // Remove from active edit list
      // Note: Firebase real-time listener will auto-refresh the table visually
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
      sortDesc = !sortDesc; // Toggle direction
    } else {
      sortCol = col;
      sortDesc = false;
    }
    
    // Reset all icons
    document.querySelectorAll('[id^="sort-icon-"]').forEach(icon => {
      icon.textContent = '↑↓';
      icon.className = 'ml-0.5 text-slate-400';
    });

    // Update active icon
    const activeIcon = document.getElementById(`sort-icon-${col}`);
    activeIcon.textContent = sortDesc ? '↓' : '↑';
    activeIcon.className = 'ml-0.5 text-[#0B4F2C]';

    renderTable();
  });
});

// Enter "Edit All" Mode
btnEditAll.addEventListener('click', () => {
  isEditAllMode = true;
  editingRows.clear(); // Clear any individual edits so all rows flip
  btnEditAll.classList.add('hidden');
  btnSaveAll.classList.remove('hidden');
  btnCancelEdit.classList.remove('hidden');
  renderTable();
});

// Save All Inputs at Once
btnSaveAll.addEventListener('click', async () => {
  const updates = {};
  
  // Grab all inputs from the current table view
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
  
  // Send single bulk update to Firebase
  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
  
  // Reset modes
  isEditAllMode = false;
  editingRows.clear();
  btnSaveAll.classList.add('hidden');
  btnCancelEdit.classList.add('hidden');
  btnEditAll.classList.remove('hidden');
});

// Cancel Edits without saving
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
