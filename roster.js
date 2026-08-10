/**
 * roster.js - Chelan High Roster Management Logic
 * Version: 1.004
 */

// Global State
let currentRoster = [];
let sortColumn = 'lastName';
let sortAscending = true;
let pendingImportData = [];
let conflictResolutions = {};

// DOM Elements Container
let elements = {};

document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM Elements
    elements = {
        tbody: document.getElementById('roster-tbody'),
        count: document.getElementById('roster-count'),
        search: document.getElementById('search-roster'),
        quickAddForm: document.getElementById('quick-add-form'),
        addId: document.getElementById('add-id'),
        addFname: document.getElementById('add-fname'),
        addLname: document.getElementById('add-lname'),
        exportBtn: document.getElementById('export-csv-btn'),
        editAllBtn: document.getElementById('edit-all-btn'),
        processImportBtn: document.getElementById('process-import-btn'),
        dropZone: document.getElementById('drop-zone'),
        fileInput: document.getElementById('file-browse-input'),
        fileNameDisplay: document.getElementById('file-name-display'),
        csvUrlInput: document.getElementById('csv-url-input'),
        conflictModal: document.getElementById('conflict-modal'),
        conflictList: document.getElementById('conflict-list'),
        conflictCount: document.getElementById('conflict-count')
    };

    // Load Initial Data from LocalStorage (or Fallback Defaults)
    loadRoster();

    // Event Listeners
    setupEventListeners();
});

// ==========================================
// DATA MANAGEMENT & INITIALIZATION
// ==========================================

function loadRoster() {
    const saved = localStorage.getItem('chelan_roster');
    if (saved) {
        try {
            currentRoster = JSON.parse(saved);
        } catch (e) {
            console.error('Error parsing saved roster from localStorage:', e);
            currentRoster = getSampleData();
        }
    } else {
        currentRoster = getSampleData();
        saveRoster();
    }
    renderRoster();
}

function saveRoster() {
    localStorage.setItem('chelan_roster', JSON.stringify(currentRoster));
    renderRoster();
}

function getSampleData() {
    return [
        { id: "1001", firstName: "Alex", lastName: "Smith" },
        { id: "1002", firstName: "Jordan", lastName: "Baker" },
        { id: "1003", firstName: "Taylor", lastName: "Davis" }
    ];
}

// ==========================================
// TABLE RENDERING & SORTING
// ==========================================

function renderRoster() {
    if (!elements.tbody) return;

    let filtered = [...currentRoster];

    // Filter by Search Query
    const query = elements.search ? elements.search.value.trim().toLowerCase() : '';
    if (query) {
        filtered = filtered.filter(s => 
            s.id.toLowerCase().includes(query) ||
            s.firstName.toLowerCase().includes(query) ||
            s.lastName.toLowerCase().includes(query)
        );
    }

    // Sort Roster Data
    filtered.sort((a, b) => {
        let valA = (a[sortColumn] || '').toLowerCase();
        let valB = (b[sortColumn] || '').toLowerCase();

        if (valA < valB) return sortAscending ? -1 : 1;
        if (valA > valB) return sortAscending ? 1 : -1;
        return 0;
    });

    // Update Counter UI
    if (elements.count) {
        elements.count.textContent = `${filtered.length} Student${filtered.length === 1 ? '' : 's'}`;
    }

    // Render Rows
    if (filtered.length === 0) {
        elements.tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-8 text-center text-slate-400 font-medium">
                    No students found matching your criteria.
                </td>
            </tr>`;
        return;
    }

    elements.tbody.innerHTML = filtered.map(student => `
        <tr class="hover:bg-slate-50 transition-colors group border-b border-slate-100">
            <td class="p-3 font-mono font-bold text-slate-700 text-xs">${student.id}</td>
            <td class="p-3 font-semibold text-slate-800">${student.firstName}</td>
            <td class="p-3 font-semibold text-slate-800">${student.lastName}</td>
            <td class="p-3 text-right pr-4">
                <button onclick="editStudent('${student.id}')" class="text-xs text-amber-600 hover:text-amber-800 font-bold px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 transition-colors mr-1">
                    Edit
                </button>
                <button onclick="deleteStudent('${student.id}')" class="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 transition-colors">
                    Delete
                </button>
            </td>
        </tr>
    `).join('');

    updateSortIcons();
}

window.setSort = function(col) {
    if (sortColumn === col) {
        sortAscending = !sortAscending;
    } else {
        sortColumn = col;
        sortAscending = true;
    }
    renderRoster();
};

function updateSortIcons() {
    ['id', 'firstName', 'lastName'].forEach(col => {
        const iconEl = document.getElementById(`sort-icon-${col}`);
        if (iconEl) {
            if (sortColumn === col) {
                iconEl.textContent = sortAscending ? '↑' : '↓';
                iconEl.className = 'text-chelan font-bold';
            } else {
                iconEl.textContent = '↕';
                iconEl.className = 'text-slate-300';
            }
        }
    });
}

// ==========================================
// STUDENT CRUD OPERATIONS
// ==========================================

window.editStudent = function(id) {
    const student = currentRoster.find(s => s.id === id);
    if (!student) return;

    const newFname = prompt("Enter First Name:", student.firstName);
    if (newFname === null) return;

    const newLname = prompt("Enter Last Name:", student.lastName);
    if (newLname === null) return;

    student.firstName = newFname.trim() || student.firstName;
    student.lastName = newLname.trim() || student.lastName;
    saveRoster();
};

window.deleteStudent = function(id) {
    const student = currentRoster.find(s => s.id === id);
    if (!student) return;

    if (confirm(`Are you sure you want to delete ${student.firstName} ${student.lastName} (ID: ${student.id})?`)) {
        currentRoster = currentRoster.filter(s => s.id !== id);
        saveRoster();
    }
};

// ==========================================
// EVENT LISTENERS & HANDLERS
// ==========================================

function setupEventListeners() {
    // Search Bar Input
    if (elements.search) {
        elements.search.addEventListener('input', renderRoster);
    }

    // Quick Add Form
    if (elements.quickAddForm) {
        elements.quickAddForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = elements.addId.value.trim();
            const firstName = elements.addFname.value.trim();
            const lastName = elements.addLname.value.trim();

            if (!id || !firstName || !lastName) return;

            // Check if ID exists
            if (currentRoster.some(s => s.id === id)) {
                alert(`A student with ID ${id} already exists in the roster.`);
                return;
            }

            currentRoster.push({ id, firstName, lastName });
            saveRoster();

            elements.quickAddForm.reset();
            elements.addId.focus();
        });
    }

    // Export CSV
    if (elements.exportBtn) {
        elements.exportBtn.addEventListener('click', exportToCSV);
    }

    // Process Import Button
    if (elements.processImportBtn) {
        elements.processImportBtn.addEventListener('click', processImport);
    }

    // File Browse Handler
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                elements.fileNameDisplay.textContent = `Selected: ${e.target.files[0].name}`;
                elements.fileNameDisplay.classList.remove('hidden');
            }
        });
    }

    // Drag & Drop Handlers
    if (elements.dropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                elements.dropZone.classList.add('border-chelan', 'bg-emerald-100/50');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                elements.dropZone.classList.remove('border-chelan', 'bg-emerald-100/50');
            }, false);
        });

        elements.dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                elements.fileInput.files = files;
                elements.fileNameDisplay.textContent = `Selected: ${files[0].name}`;
                elements.fileNameDisplay.classList.remove('hidden');
            }
        });
    }
}

// ==========================================
// CSV EXPORT & IMPORT ENGINE
// ==========================================

function exportToCSV() {
    if (currentRoster.length === 0) {
        alert("No roster data available to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,ID,First Name,Last Name\n";
    currentRoster.forEach(s => {
        csvContent += `"${s.id}","${s.firstName}","${s.lastName}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Chelan_Roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function processImport() {
    const importMode = document.querySelector('input[name="import-mode"]:checked').value;
    const urlInput = elements.csvUrlInput ? elements.csvUrlInput.value.trim() : '';
    const file = elements.fileInput && elements.fileInput.files.length > 0 ? elements.fileInput.files[0] : null;

    if (urlInput) {
        fetch(urlInput)
            .then(res => res.text())
            .then(csvText => parseAndHandleCSV(csvText, importMode))
            .catch(err => alert("Error fetching Google Sheet CSV from URL. Verify publishing settings."));
    } else if (file) {
        const reader = new FileReader();
        reader.onload = (e) => parseAndHandleCSV(e.target.result, importMode);
        reader.readAsText(file);
    } else {
        alert("Please select a CSV file or provide a valid Google Sheet CSV URL.");
    }
}

function parseAndHandleCSV(text, mode) {
    const lines = text.split(/\r\n|\n/);
    const parsed = [];

    lines.forEach((line, index) => {
        if (!line.trim()) return;
        const cols = line.split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
        
        // Skip header row if present
        if (index === 0 && (cols[0].toLowerCase().includes('id') || cols[1].toLowerCase().includes('first'))) {
            return;
        }

        if (cols.length >= 3) {
            parsed.push({ id: cols[0], firstName: cols[1], lastName: cols[2] });
        }
    });

    if (parsed.length === 0) {
        alert("No valid student rows found in the imported file.");
        return;
    }

    if (mode === 'replace') {
        if (confirm(`Replace current roster (${currentRoster.length} students) with ${parsed.length} imported students?`)) {
            currentRoster = parsed;
            saveRoster();
            alert("Roster successfully replaced!");
        }
        return;
    }

    // Merge Mode - Check for conflicts
    const conflicts = [];
    pendingImportData = parsed;
    conflictResolutions = {};

    parsed.forEach(imported => {
        const existing = currentRoster.find(s => s.id === imported.id);
        if (existing && (existing.firstName !== imported.firstName || existing.lastName !== imported.lastName)) {
            conflicts.push({ existing, imported });
        }
    });

    if (conflicts.length > 0) {
        showConflictModal(conflicts);
    } else {
        // Direct merge without conflicts
        parsed.forEach(imported => {
            const index = currentRoster.findIndex(s => s.id === imported.id);
            if (index !== -1) {
                currentRoster[index] = imported;
            } else {
                currentRoster.push(imported);
            }
        });
        saveRoster();
        alert(`Successfully imported ${parsed.length} students.`);
    }
}

// ==========================================
// CONFLICT RESOLUTION MODAL LOGIC
// ==========================================

function showConflictModal(conflicts) {
    elements.conflictCount.textContent = conflicts.length;
    elements.conflictList.innerHTML = conflicts.map(item => `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
                <span class="font-mono font-bold text-chelan">[ID: ${item.existing.id}]</span>
                <span class="text-slate-500 line-through ml-1">${item.existing.firstName} ${item.existing.lastName}</span>
                <span class="text-slate-400">➔</span>
                <span class="font-bold text-slate-800">${item.imported.firstName} ${item.imported.lastName}</span>
            </div>
            <select onchange="conflictResolutions['${item.existing.id}'] = this.value" class="bg-white border border-slate-300 rounded px-2 py-1 font-semibold focus:outline-none focus:border-chelan">
                <option value="keep_import">Accept Imported</option>
                <option value="keep_original">Keep Original</option>
            </select>
        </div>
    `).join('');

    // Pre-populate resolution choices
    conflicts.forEach(c => conflictResolutions[c.existing.id] = 'keep_import');

    elements.conflictModal.classList.remove('hidden');
}

window.resolveAllConflicts = function(choice) {
    const selects = elements.conflictList.querySelectorAll('select');
    selects.forEach(sel => {
        sel.value = choice;
        sel.dispatchEvent(new Event('change'));
    });
};

window.finalizeImportWithResolutions = function() {
    pendingImportData.forEach(imported => {
        const existingIndex = currentRoster.findIndex(s => s.id === imported.id);
        if (existingIndex !== -1) {
            const resolution = conflictResolutions[imported.id] || 'keep_import';
            if (resolution === 'keep_import') {
                currentRoster[existingIndex] = imported;
            }
        } else {
            currentRoster.push(imported);
        }
    });

    saveRoster();
    elements.conflictModal.classList.add('hidden');
    alert("Import conflicts resolved and roster updated successfully!");
};
